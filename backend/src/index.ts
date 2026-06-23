import http from "node:http";
import express from "express";
import cors from "cors";
import { getDb } from "./db";
import { latestRelease, bumpVisits } from "./release";
import { compile, buildQueueState } from "./compile";
import { systemCatalog, compileSystem } from "./system";
import { startAuth, authCallback, requireAuth, me, devToken } from "./auth";
import { projectsList, projectGet, projectPut, projectDelete, currentGet, currentPut, shareCreate, shareList, shareRevoke, shareResolve } from "./projects";
import { importRepo, exportGist } from "./github";
import { attachCollab } from "./collab";
import { requireAdmin, adminMetrics, adminHistory, adminIncidents } from "./admin";
import { startMetricsSampler } from "./metrics";
import { assertBootConfig, corsOptions } from "./security";
import { rateLimit } from "./ratelimit";
import { readinessSnapshot, installGracefulShutdown } from "./lifecycle";
import { log } from "./log";

// Refuse to start in production with an insecure config (weak SESSION_SECRET, etc.).
assertBootConfig();

const app = express();

// Behind a load balancer, set TRUST_PROXY so req.ip reflects the real client (X-Forwarded-For) for CORS +
// rate-limit keying. Off by default (direct connections).
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || true);
}

app.use(cors(corsOptions()));
app.use(express.json({ limit: "1mb" }));

const num = (v: string | undefined, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

// Rate limits (per-IP, per minute). Generous global ceiling + strict caps on the expensive / abusable routes.
const apiLimiter = rateLimit({ windowMs: 60_000, limit: num(process.env.RL_API, 600) });
const compileLimiter = rateLimit({ windowMs: 60_000, limit: num(process.env.RL_COMPILE, 12) });
const authLimiter = rateLimit({ windowMs: 60_000, limit: num(process.env.RL_AUTH, 30) });
const shareLimiter = rateLimit({ windowMs: 60_000, limit: num(process.env.RL_SHARE, 30) });
const githubLimiter = rateLimit({ windowMs: 60_000, limit: num(process.env.RL_GITHUB, 10) });

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);

// Wrap an async handler so a rejection becomes a 500 (not a process crash).
type Handler = (req: express.Request, res: express.Response) => unknown;
const wrap = (fn: Handler) => (req: express.Request, res: express.Response): void => {
  Promise.resolve(fn(req, res)).catch((e) => {
    log.error("api handler failed", { method: req.method, path: req.path, error: String((e as Error)?.message ?? e) });
    if (!res.headersSent) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
};

// Liveness — the process is up (always 200). Readiness — can it serve durably (Mongo up): 200 / 503.
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/ready", (_req, res) => {
  const r = readinessSnapshot();
  res.status(r.ready ? 200 : 503).json(r);
});

// Browser IDE: compile a qpi.h contract to wasm (the frontend runs it in-page via @qinit/engine).
app.post("/api/compile", compileLimiter, async (req, res) => {
  const { source, name, slot, skipVerify, callees } = req.body ?? {};
  if (typeof source !== "string" || !source.trim()) {
    res.status(400).json({ ok: false, diagnostics: [], error: "missing `source`" });
    return;
  }

  try {
    res.json(await compile({ source, name, slot, skipVerify, callees }));
  } catch (e) {
    res.status(500).json({ ok: false, diagnostics: [], error: (e as Error).message });
  }
});

// Build-pool snapshot — the IDE polls this while a compile is pending to show "waiting for a build slot".
app.get("/api/compile/queue", (_req, res) => res.json(buildQueueState()));

// Built-in system contracts for the IDE's in-browser virtual node: the catalog (picker) + compile-by-name
// (the browser can't compile, so it asks the backend; result is cached server-side and deployed in-page).
app.get("/api/system-contracts", (_req, res) => res.json({ contracts: systemCatalog() }));
app.post("/api/compile-system", compileLimiter, async (req, res) => {
  const name = req.body?.name;
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ ok: false, diagnostics: [], error: "missing `name`" });
    return;
  }
  try {
    res.json(await compileSystem(name));
  } catch (e) {
    res.status(500).json({ ok: false, diagnostics: [], error: (e as Error).message });
  }
});

// Auth (Google / GitHub OAuth) + the authed user. The dev mint must precede the :provider route.
app.get("/api/auth/dev", wrap(devToken)); // dev-only token mint (QINIT_DEV_AUTH=1)
app.get("/api/auth/:provider", startAuth);
app.get("/api/auth/:provider/callback", wrap(authCallback));
app.get("/api/me", requireAuth, wrap(me));

// Cloud projects — per-account, behind auth. The client owns the document; PUT upserts by id.
// The `current` (last-opened) routes must precede `:id` or "current" is parsed as a project id.
app.get("/api/projects", requireAuth, wrap(projectsList));
app.get("/api/projects/current", requireAuth, wrap(currentGet));
app.put("/api/projects/current", requireAuth, wrap(currentPut));
app.get("/api/projects/:id", requireAuth, wrap(projectGet));
app.put("/api/projects/:id", requireAuth, wrap(projectPut));
app.delete("/api/projects/:id", requireAuth, wrap(projectDelete));

// Share links — owner mints/lists/revokes; the resolve route is public (the link is the credential).
app.post("/api/projects/:id/share", shareLimiter, requireAuth, wrap(shareCreate));
app.get("/api/projects/:id/shares", requireAuth, wrap(shareList));
app.delete("/api/projects/:id/share/:linkId", requireAuth, wrap(shareRevoke));
app.get("/api/s/:linkId", wrap(shareResolve));

// GitHub: import a public repo's files, export the workspace as a Gist. Authed + tightly rate-limited since
// each call fans out to the GitHub API.
app.post("/api/github/import", githubLimiter, requireAuth, wrap(importRepo));
app.post("/api/github/gist", githubLimiter, requireAuth, wrap(exportGist));

// Admin dashboard — system health + overload metrics, behind the shared ADMIN_TOKEN gate.
app.get("/api/admin/metrics", requireAdmin, wrap(adminMetrics));
app.get("/api/admin/history", requireAdmin, wrap(adminHistory));
app.get("/api/admin/incidents", requireAdmin, wrap(adminIncidents));

app.get("/api/release/latest", async (_req, res) => {
  try { res.json(await latestRelease()); }
  catch (e) { res.status(502).json({ error: (e as Error).message }); }
});

app.get("/api/stats", async (_req, res) => {
  try { res.json(await bumpVisits()); }
  catch { res.json({ visits: 0 }); }
});

const port = Number(process.env.PORT ?? 8787);
// Explicit http.Server so the collab WebSocket can attach to the upgrade event alongside Express.
const server = http.createServer(app);
attachCollab(server);
installGracefulShutdown(server);

// Warm the DB first: in production a failed Mongo connect throws (db.ts), so we abort the boot rather than
// serve with silent, non-durable storage. Dev tolerates it (in-memory fallback).
getDb()
  .then(() => {
    startMetricsSampler();
    server.listen(port, () => log.info("api listening", { port }));
  })
  .catch((e) => {
    log.error("boot failed", { error: (e as Error).message });
    process.exit(1);
  });

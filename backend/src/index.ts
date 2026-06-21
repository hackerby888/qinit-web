import http from "node:http";
import express from "express";
import cors from "cors";
import { getDb } from "./db";
import { latestRelease, bumpVisits } from "./release";
import { compile, buildQueueState } from "./compile";
import { startAuth, authCallback, requireAuth, me, devToken } from "./auth";
import { projectsList, projectGet, projectPut, projectDelete, currentGet, currentPut, shareCreate, shareList, shareRevoke, shareResolve } from "./projects";
import { attachCollab } from "./collab";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Wrap an async handler so a rejection becomes a 500 (not a process crash).
type Handler = (req: express.Request, res: express.Response) => unknown;
const wrap = (fn: Handler) => (req: express.Request, res: express.Response): void => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error("[api]", e);
    if (!res.headersSent) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
};

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Browser IDE: compile a qpi.h contract to wasm (the frontend runs it in-page via @qinit/engine).
app.post("/api/compile", async (req, res) => {
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
app.post("/api/projects/:id/share", requireAuth, wrap(shareCreate));
app.get("/api/projects/:id/shares", requireAuth, wrap(shareList));
app.delete("/api/projects/:id/share/:linkId", requireAuth, wrap(shareRevoke));
app.get("/api/s/:linkId", wrap(shareResolve));

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
// Warm the DB connection (optional), then listen regardless.
getDb().finally(() => server.listen(port, () => console.log(`[qinit-web] api listening on :${port}`)));

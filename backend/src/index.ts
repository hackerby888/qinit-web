import express from "express";
import cors from "cors";
import { getDb } from "./db";
import { latestRelease, bumpVisits } from "./release";
import { compile } from "./compile";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Browser IDE: compile a qpi.h contract to wasm (the frontend runs it in-page via @qinit/engine).
app.post("/api/compile", async (req, res) => {
  const { source, name, slot, skipVerify } = req.body ?? {};
  if (typeof source !== "string" || !source.trim()) {
    res.status(400).json({ ok: false, diagnostics: [], error: "missing `source`" });
    return;
  }

  try {
    res.json(await compile({ source, name, slot, skipVerify }));
  } catch (e) {
    res.status(500).json({ ok: false, diagnostics: [], error: (e as Error).message });
  }
});

app.get("/api/release/latest", async (_req, res) => {
  try { res.json(await latestRelease()); }
  catch (e) { res.status(502).json({ error: (e as Error).message }); }
});

app.get("/api/stats", async (_req, res) => {
  try { res.json(await bumpVisits()); }
  catch { res.json({ visits: 0 }); }
});

const port = Number(process.env.PORT ?? 8787);
// Warm the DB connection (optional), then listen regardless.
getDb().finally(() => app.listen(port, () => console.log(`[qinit-web] api listening on :${port}`)));

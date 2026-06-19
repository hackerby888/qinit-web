import express from "express";
import cors from "cors";
import { getDb } from "./db";
import { latestRelease, bumpVisits } from "./release";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

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

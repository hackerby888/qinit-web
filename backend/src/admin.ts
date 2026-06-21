// Admin surface: a shared-token gate + the metrics endpoint behind it. The token is ADMIN_TOKEN (env); when
// it's unset the admin area is disabled (503) rather than open. The dashboard sends it as the X-Admin-Token
// header (or a ?token query param for quick checks).
import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { metricsReport, historySeries, listIncidents, bucketFor, parseRange } from "./metrics";

// Constant-time token check. Locked (false) when no server token is configured or the lengths differ — only a
// configured, exactly-matching token passes.
export function adminTokenOk(provided: string | undefined | null, expected: string | undefined | null): boolean {
  if (!expected || !provided) {
    return false;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

function presentedToken(req: Request): string | undefined {
  const header = req.headers["x-admin-token"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }

  const q = req.query.token;
  return typeof q === "string" ? q : undefined;
}

// Express middleware — require the shared admin token.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "admin not configured — set ADMIN_TOKEN" });
    return;
  }

  if (!adminTokenOk(presentedToken(req), expected)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  next();
}

// GET /api/admin/metrics — the dashboard's snapshot + history + alerts.
export async function adminMetrics(_req: Request, res: Response): Promise<void> {
  res.json(await metricsReport());
}

// GET /api/admin/history?range=24h — a downsampled metric series for the range charts (default 24h).
export async function adminHistory(req: Request, res: Response): Promise<void> {
  const rangeMs = parseRange(req.query.range as string | undefined, "24h");
  const points = await historySeries(rangeMs);

  res.json({ rangeMs, bucketMs: bucketFor(rangeMs), points });
}

// GET /api/admin/incidents?range=7d — the outage / high-load timeline for the range (default 7d).
export async function adminIncidents(req: Request, res: Response): Promise<void> {
  const rangeMs = parseRange(req.query.range as string | undefined, "7d");
  const incidents = await listIncidents(rangeMs);

  res.json({ rangeMs, incidents });
}

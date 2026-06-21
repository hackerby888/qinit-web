// Admin dashboard API client. The admin area is gated by a shared token (server's ADMIN_TOKEN), entered once
// and kept in localStorage; it's sent as the X-Admin-Token header. Types mirror backend/src/metrics.ts.
const ADMIN_TOKEN_KEY = "qinit.admin.token";

export type HealthStatus = "ok" | "warn" | "crit";

export interface MetricSample {
  ts: number;
  uptimeSec: number;
  proc: { rssMB: number; heapUsedMB: number; heapTotalMB: number; cpuPercent: number };
  sys: { memUsedPercent: number; totalMemMB: number; freeMemMB: number; load1: number; cpuCount: number; loadPercent: number };
  build: { active: number; queued: number; limit: number; utilizationPercent: number; cached: number };
  collab: { rooms: number; connections: number };
  deps: { mongo: boolean; redis: boolean };
  status?: HealthStatus;
}

export interface Alert {
  level: "info" | "warn" | "crit";
  key: string;
  message: string;
}

export interface AdminMetricsResponse {
  current: MetricSample;
  alerts: Alert[];
  status: HealthStatus;
  history: MetricSample[];
}

export interface HistoryPoint {
  ts: number;
  loadMax: number;
  loadAvg: number;
  memMax: number;
  memAvg: number;
  queueMax: number;
  queuedMax: number;
  status: HealthStatus;
}

export interface HistoryResponse {
  rangeMs: number;
  bucketMs: number;
  points: HistoryPoint[];
}

export type IncidentLevel = "warn" | "crit" | "outage";

export interface Incident {
  startTs: number;
  endTs?: number;
  level: IncidentLevel;
  durationSec?: number;
  peak: { loadPercent: number; memUsedPercent: number; queued: number };
  keys: string[];
}

export interface IncidentsResponse {
  rangeMs: number;
  incidents: Incident[];
}

export type RangeKey = "1h" | "24h" | "7d";

export type AdminErrorCode = "unconfigured" | "forbidden" | "network";

export class AdminError extends Error {
  code: AdminErrorCode;

  constructor(code: AdminErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(t: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, t);
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

// GET an admin endpoint with the token. Throws an AdminError tagged with why (so the UI can show the right
// gate): 503 → "unconfigured" (server has no ADMIN_TOKEN), 403 → "forbidden" (wrong token), else "network".
async function adminGet<T>(path: string, token: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { headers: { "X-Admin-Token": token } });
  } catch {
    throw new AdminError("network", "could not reach the server");
  }

  if (r.status === 503) {
    throw new AdminError("unconfigured", "admin is not configured on the server");
  }

  if (r.status === 403) {
    throw new AdminError("forbidden", "invalid admin token");
  }

  if (!r.ok) {
    throw new AdminError("network", `admin API ${r.status}`);
  }

  return (await r.json()) as T;
}

export function fetchAdminMetrics(token: string): Promise<AdminMetricsResponse> {
  return adminGet<AdminMetricsResponse>("/api/admin/metrics", token);
}

export function fetchHistory(token: string, range: string): Promise<HistoryResponse> {
  return adminGet<HistoryResponse>(`/api/admin/history?range=${encodeURIComponent(range)}`, token);
}

export function fetchIncidents(token: string, range: string): Promise<IncidentsResponse> {
  return adminGet<IncidentsResponse>(`/api/admin/incidents?range=${encodeURIComponent(range)}`, token);
}

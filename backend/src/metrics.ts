// System-health metrics for the admin dashboard. Samples process + OS + build-pool + collab footprint, keeps
// a short in-memory ring for sparklines, and (when Mongo is up) persists a coarser series so trends survive a
// restart. computeAlerts() turns a sample into overload warnings; it's pure so the thresholds are unit-tested.
import { totalmem, freemem, loadavg, cpus } from "node:os";
import { getDb } from "./db";
import { redisUrl } from "./redis";
import { buildQueueState, buildCacheSize } from "./compile";
import { collabMetrics } from "./collab";

export interface MetricSample {
  ts: number;
  uptimeSec: number;
  proc: { rssMB: number; heapUsedMB: number; heapTotalMB: number; cpuPercent: number };
  sys: { memUsedPercent: number; totalMemMB: number; freeMemMB: number; load1: number; cpuCount: number; loadPercent: number };
  build: { active: number; queued: number; limit: number; utilizationPercent: number; cached: number };
  collab: { rooms: number; connections: number };
  deps: { mongo: boolean; redis: boolean };
  status?: HealthStatus; // set when recorded by the sampler (drives incidents + bucket coloring)
}

export type IncidentLevel = "warn" | "crit" | "outage";

// A recorded period of trouble — an overload stretch (warn/crit) or a server-down gap (outage). Persisted to
// the `incidents` collection so the dashboard can answer "which hour/day did we have an outage / high load?".
export interface Incident {
  startTs: number;
  endTs?: number; // undefined while ongoing
  level: IncidentLevel;
  durationSec?: number;
  peak: { loadPercent: number; memUsedPercent: number; queued: number };
  keys: string[]; // which metrics tripped (build / mem / load), or ["outage"]
}

// One point of a downsampled history series — either a raw ring sample or a Mongo time-bucket aggregate.
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

export interface Alert {
  level: "info" | "warn" | "crit";
  key: string;
  message: string;
}

export type HealthStatus = "ok" | "warn" | "crit";

export interface Thresholds {
  memWarn: number;
  memCrit: number;
  loadWarn: number;
  loadCrit: number;
}

export interface MetricsReport {
  current: MetricSample;
  alerts: Alert[];
  status: HealthStatus;
  history: MetricSample[];
}

const RING_CAP = 240;          // ~1h of 15s samples
const PERSIST_EVERY_MS = Number(process.env.QINIT_METRICS_PERSIST_MS) || 60_000;
const HISTORY_WINDOW_MS = 60 * 60 * 1000;
const GAP_FACTOR = 3;          // a sample gap > GAP_FACTOR × interval counts as a downtime/outage

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Allowed history/incident ranges (whitelist — caps how far back a query can reach).
const RANGES: Record<string, number> = {
  "1h": HOUR_MS,
  "6h": 6 * HOUR_MS,
  "24h": 24 * HOUR_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};

const num = (v: string | undefined, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

const mb = (bytes: number): number => Math.round((bytes / (1024 * 1024)) * 10) / 10;

export function loadThresholds(): Thresholds {
  return {
    memWarn: num(process.env.QINIT_MEM_WARN, 85),
    memCrit: num(process.env.QINIT_MEM_CRIT, 95),
    loadWarn: num(process.env.QINIT_LOAD_WARN, 100),
    loadCrit: num(process.env.QINIT_LOAD_CRIT, 200),
  };
}

// ---- CPU delta (process share of the whole machine, 0..100) ----

let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();

function cpuPercentSinceLast(): number {
  const now = Date.now();
  const wallMs = now - lastCpuAt;
  const usage = process.cpuUsage(lastCpu); // delta since lastCpu, in microseconds
  lastCpu = process.cpuUsage();
  lastCpuAt = now;

  if (wallMs <= 0) {
    return 0;
  }

  const cpuMs = (usage.user + usage.system) / 1000;
  const cores = Math.max(1, cpus()?.length ?? 1);
  const pct = (cpuMs / wallMs) * 100 / cores;

  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

// ---- snapshot ----

export async function liveSnapshot(): Promise<MetricSample> {
  const mem = process.memoryUsage();
  const total = totalmem();
  const free = freemem();
  const cpuCount = Math.max(1, cpus()?.length ?? 1);
  const load1 = loadavg()[0] ?? 0;

  const q = buildQueueState();
  const collab = collabMetrics();
  const mongo = (await getDb()) !== null;

  return {
    ts: Date.now(),
    uptimeSec: Math.round(process.uptime()),
    proc: {
      rssMB: mb(mem.rss),
      heapUsedMB: mb(mem.heapUsed),
      heapTotalMB: mb(mem.heapTotal),
      cpuPercent: cpuPercentSinceLast(),
    },
    sys: {
      memUsedPercent: Math.round(((total - free) / total) * 1000) / 10,
      totalMemMB: mb(total),
      freeMemMB: mb(free),
      load1: Math.round(load1 * 100) / 100,
      cpuCount,
      loadPercent: Math.round((load1 / cpuCount) * 1000) / 10,
    },
    build: {
      active: q.active,
      queued: q.queued,
      limit: q.limit,
      utilizationPercent: Math.round((q.active / Math.max(1, q.limit)) * 100),
      cached: buildCacheSize(),
    },
    collab,
    deps: { mongo, redis: redisUrl() !== null },
  };
}

// ---- alerts (pure) ----

export function computeAlerts(s: MetricSample, t: Thresholds): Alert[] {
  const alerts: Alert[] = [];

  // A build only queues once every slot is busy, so any backlog means users are waiting (bad UX) — crit. A
  // full pool that's still draining (no backlog) is a heads-up — warn.
  if (s.build.queued > 0) {
    alerts.push({ level: "crit", key: "build", message: `build queue saturated — ${s.build.active} active / ${s.build.queued} queued` });
  } else if (s.build.active >= s.build.limit) {
    alerts.push({ level: "warn", key: "build", message: `build pool at capacity — ${s.build.active}/${s.build.limit} slots busy` });
  }

  if (s.sys.memUsedPercent >= t.memCrit) {
    alerts.push({ level: "crit", key: "mem", message: `system memory ${s.sys.memUsedPercent}% used` });
  } else if (s.sys.memUsedPercent >= t.memWarn) {
    alerts.push({ level: "warn", key: "mem", message: `system memory ${s.sys.memUsedPercent}% used` });
  }

  if (s.sys.loadPercent >= t.loadCrit) {
    alerts.push({ level: "crit", key: "load", message: `CPU load ${s.sys.loadPercent}% of ${s.sys.cpuCount} cores` });
  } else if (s.sys.loadPercent >= t.loadWarn) {
    alerts.push({ level: "warn", key: "load", message: `CPU load ${s.sys.loadPercent}% of ${s.sys.cpuCount} cores` });
  }

  if (!s.deps.mongo) {
    alerts.push({ level: "info", key: "mongo", message: "mongo unavailable — metrics history not persisted" });
  }

  if (!s.deps.redis) {
    alerts.push({ level: "info", key: "redis", message: "redis off — collab running single-instance" });
  }

  return alerts;
}

export function statusFrom(alerts: Alert[]): HealthStatus {
  if (alerts.some((a) => a.level === "crit")) {
    return "crit";
  }
  if (alerts.some((a) => a.level === "warn")) {
    return "warn";
  }
  return "ok";
}

// ---- history/incident pure helpers (unit-tested) ----

// Map a range string to milliseconds, falling back to a default for anything off the whitelist.
export function parseRange(s: string | undefined, dflt: string = "24h"): number {
  if (s && RANGES[s] !== undefined) {
    return RANGES[s];
  }
  return RANGES[dflt];
}

// Downsample bucket width for a range: raw ring under an hour, 5-minute buckets to a day, hourly beyond.
export function bucketFor(rangeMs: number): number {
  if (rangeMs <= HOUR_MS) {
    return 0;
  }
  if (rangeMs <= DAY_MS) {
    return 5 * 60 * 1000;
  }
  return HOUR_MS;
}

// Worst status implied by a bucket's peaks. Build saturation (any queued) and the crit cutoffs dominate.
export function bucketStatus(m: { queuedMax: number; memMax: number; loadMax: number }, t: Thresholds): HealthStatus {
  if (m.queuedMax > 0 || m.memMax >= t.memCrit || m.loadMax >= t.loadCrit) {
    return "crit";
  }
  if (m.memMax >= t.memWarn || m.loadMax >= t.loadWarn) {
    return "warn";
  }
  return "ok";
}

// Incident state machine. Fold a sample into the open incident (if any): open one on the first warn/crit,
// escalate + merge peaks while it persists, and close it (emitting the finished record) on the next ok.
export function stepIncident(open: Incident | null, sample: MetricSample, alerts: Alert[], status: HealthStatus): { open: Incident | null; closed: Incident | null } {
  if (status === "warn" || status === "crit") {
    const level: IncidentLevel = status === "crit" || open?.level === "crit" ? "crit" : "warn";
    const keys = [...new Set(alerts.filter((a) => a.level !== "info").map((a) => a.key))];
    const here = { loadPercent: sample.sys.loadPercent, memUsedPercent: sample.sys.memUsedPercent, queued: sample.build.queued };

    if (!open) {
      return { open: { startTs: sample.ts, level, peak: here, keys }, closed: null };
    }

    const merged: Incident = {
      ...open,
      level,
      peak: {
        loadPercent: Math.max(open.peak.loadPercent, here.loadPercent),
        memUsedPercent: Math.max(open.peak.memUsedPercent, here.memUsedPercent),
        queued: Math.max(open.peak.queued, here.queued),
      },
      keys: [...new Set([...open.keys, ...keys])],
    };
    return { open: merged, closed: null };
  }

  if (open) {
    const closed: Incident = { ...open, endTs: sample.ts, durationSec: Math.round((sample.ts - open.startTs) / 1000) };
    return { open: null, closed };
  }

  return { open: null, closed: null };
}

// A downtime/outage incident when the gap between the last sample and now is too large (server was down).
export function detectGap(lastTs: number, now: number, intervalMs: number): Incident | null {
  const gap = now - lastTs;
  if (lastTs <= 0 || gap <= intervalMs * GAP_FACTOR) {
    return null;
  }

  return {
    startTs: lastTs,
    endTs: now,
    level: "outage",
    durationSec: Math.round(gap / 1000),
    peak: { loadPercent: 0, memUsedPercent: 0, queued: 0 },
    keys: ["outage"],
  };
}

// ---- ring + persistence ----

const ring: MetricSample[] = [];
let indexEnsured = false;
let lastPersistAt = 0;
let openIncident: Incident | null = null;

function pushRing(s: MetricSample): void {
  ring.push(s);

  while (ring.length > RING_CAP) {
    ring.shift();
  }
}

async function ensureIndex(): Promise<void> {
  if (indexEnsured) {
    return;
  }
  indexEnsured = true;

  const db = await getDb();
  if (!db) {
    return;
  }

  const ttlDays = num(process.env.QINIT_METRICS_TTL_DAYS, 7);
  await db.collection("metrics").createIndex({ at: 1 }, { expireAfterSeconds: Math.round(ttlDays * 24 * 60 * 60) }).catch(() => {});

  // Incidents are tiny and the whole point is long lookback, so they get their own (longer) retention. The
  // unique startTs lets the sampler upsert an ongoing incident in place as it escalates.
  const incidentDays = num(process.env.QINIT_INCIDENT_TTL_DAYS, 90);
  await db.collection("incidents").createIndex({ at: 1 }, { expireAfterSeconds: Math.round(incidentDays * 24 * 60 * 60) }).catch(() => {});
  await db.collection("incidents").createIndex({ startTs: 1 }, { unique: true }).catch(() => {});
}

async function upsertIncident(inc: Incident): Promise<void> {
  const db = await getDb();
  if (!db) {
    return;
  }

  await ensureIndex();
  await db.collection("incidents").updateOne(
    { startTs: inc.startTs },
    { $set: { ...inc, at: new Date(inc.endTs ?? inc.startTs) } },
    { upsert: true },
  ).catch(() => {});
}

async function persist(s: MetricSample): Promise<void> {
  const db = await getDb();
  if (!db) {
    return;
  }

  await ensureIndex();
  await db.collection("metrics").insertOne({ ...s, at: new Date(s.ts) }).catch(() => {});
}

async function backfillRing(): Promise<void> {
  const db = await getDb();
  if (!db) {
    return;
  }

  const cutoff = new Date(Date.now() - HISTORY_WINDOW_MS);
  const rows = await db.collection("metrics")
    .find({ at: { $gte: cutoff } }, { projection: { _id: 0, at: 0 } })
    .sort({ ts: 1 })
    .limit(RING_CAP)
    .toArray()
    .catch(() => [] as MetricSample[]);

  for (const r of rows) {
    ring.push(r as unknown as MetricSample);
  }

  while (ring.length > RING_CAP) {
    ring.shift();
  }
}

async function recordSample(): Promise<void> {
  const s = await liveSnapshot();
  const alerts = computeAlerts(s, loadThresholds());
  s.status = statusFrom(alerts);
  pushRing(s);

  // Fold this sample into the incident timeline before any debounce — an overload that lasts only a few
  // seconds still opens + closes an incident.
  const step = stepIncident(openIncident, s, alerts, s.status);
  openIncident = step.open;

  if (s.ts - lastPersistAt >= PERSIST_EVERY_MS) {
    lastPersistAt = s.ts;
    await persist(s);
  }

  if (step.open) {
    await upsertIncident(step.open);
  }
  if (step.closed) {
    await upsertIncident(step.closed);
  }
}

// On boot, a large gap since the last persisted sample means the server was down for that window — record it.
async function detectBootGap(): Promise<void> {
  const db = await getDb();
  if (!db) {
    return;
  }

  const last = await db.collection("metrics").find({}, { projection: { _id: 0, ts: 1 } }).sort({ ts: -1 }).limit(1).toArray().catch(() => [] as { ts: number }[]);
  const lastTs = last[0]?.ts ?? 0;

  // Compare against the persist cadence, not the (finer) sample interval — persisted samples are the only
  // record of "the server was alive then", so a clean restart inside that window isn't an outage.
  const gap = detectGap(lastTs, Date.now(), PERSIST_EVERY_MS);

  if (gap) {
    await upsertIncident(gap);
  }
}

let started = false;

// Start the background sampler. Called once from index.ts (never at import, so unit tests stay side-effect
// free). Best-effort throughout — a metrics failure must never disturb the API.
export function startMetricsSampler(): void {
  if (started) {
    return;
  }
  started = true;

  const interval = num(process.env.QINIT_METRICS_INTERVAL, 15_000);

  void (async () => {
    await backfillRing().catch(() => {});
    await detectBootGap().catch(() => {});
    await recordSample().catch(() => {});

    const timer = setInterval(() => {
      void recordSample().catch(() => {});
    }, interval);
    timer.unref?.();
  })();
}

// ---- report (endpoint) ----

async function loadHistory(): Promise<MetricSample[]> {
  const db = await getDb();
  if (!db) {
    return [...ring];
  }

  const cutoff = new Date(Date.now() - HISTORY_WINDOW_MS);
  const rows = await db.collection("metrics")
    .find({ at: { $gte: cutoff } }, { projection: { _id: 0, at: 0 } })
    .sort({ ts: 1 })
    .limit(500)
    .toArray()
    .catch(() => null);

  if (!rows || rows.length === 0) {
    return [...ring];
  }

  return rows as unknown as MetricSample[];
}

export async function metricsReport(): Promise<MetricsReport> {
  const current = await liveSnapshot();
  const alerts = computeAlerts(current, loadThresholds());
  const history = await loadHistory();

  return { current, alerts, status: statusFrom(alerts), history };
}

// ---- ranged history + incident timeline (endpoints) ----

const round1 = (n: number): number => Math.round((n ?? 0) * 10) / 10;

function ringToPoint(s: MetricSample, t: Thresholds): HistoryPoint {
  const queue = s.build.active + s.build.queued;
  const status = s.status ?? bucketStatus({ queuedMax: s.build.queued, memMax: s.sys.memUsedPercent, loadMax: s.sys.loadPercent }, t);

  return {
    ts: s.ts,
    loadMax: s.sys.loadPercent,
    loadAvg: s.sys.loadPercent,
    memMax: s.sys.memUsedPercent,
    memAvg: s.sys.memUsedPercent,
    queueMax: queue,
    queuedMax: s.build.queued,
    status,
  };
}

function ringSince(cutoff: number, t: Thresholds): HistoryPoint[] {
  return ring.filter((s) => s.ts >= cutoff).map((s) => ringToPoint(s, t));
}

// Downsampled series for a range. Sub-hour ranges (or no Mongo) use the raw in-memory ring; longer ranges are
// time-bucketed in Mongo so a week of samples returns a chartable number of points.
export async function historySeries(rangeMs: number): Promise<HistoryPoint[]> {
  const t = loadThresholds();
  const cutoff = Date.now() - rangeMs;
  const bucketMs = bucketFor(rangeMs);
  const db = await getDb();

  if (bucketMs === 0 || !db) {
    return ringSince(cutoff, t);
  }

  const rows = await db.collection("metrics").aggregate([
    { $match: { at: { $gte: new Date(cutoff) } } },
    {
      $group: {
        _id: { $subtract: [{ $toLong: "$at" }, { $mod: [{ $toLong: "$at" }, bucketMs] }] },
        loadMax: { $max: "$sys.loadPercent" },
        loadAvg: { $avg: "$sys.loadPercent" },
        memMax: { $max: "$sys.memUsedPercent" },
        memAvg: { $avg: "$sys.memUsedPercent" },
        queueMax: { $max: { $add: ["$build.active", "$build.queued"] } },
        queuedMax: { $max: "$build.queued" },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray().catch(() => null);

  if (!rows || rows.length === 0) {
    return ringSince(cutoff, t);
  }

  return rows.map((r) => ({
    ts: r._id as number,
    loadMax: round1(r.loadMax),
    loadAvg: round1(r.loadAvg),
    memMax: round1(r.memMax),
    memAvg: round1(r.memAvg),
    queueMax: r.queueMax ?? 0,
    queuedMax: r.queuedMax ?? 0,
    status: bucketStatus({ queuedMax: r.queuedMax ?? 0, memMax: r.memMax ?? 0, loadMax: r.loadMax ?? 0 }, t),
  }));
}

// The incident timeline for a range (newest first). Empty when Mongo is down (incidents aren't kept in memory).
export async function listIncidents(rangeMs: number): Promise<Incident[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  const cutoff = new Date(Date.now() - rangeMs);
  const rows = await db.collection("incidents")
    .find({ at: { $gte: cutoff } }, { projection: { _id: 0, at: 0 } })
    .sort({ startTs: -1 })
    .limit(200)
    .toArray()
    .catch(() => [] as Incident[]);

  return rows as unknown as Incident[];
}

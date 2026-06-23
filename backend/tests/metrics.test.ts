// Unit test for the overload-detection logic. computeAlerts is pure: a sample + thresholds in, alerts out.
// statusFrom collapses alerts to a single banner status (info never raises it above ok).
import { test, expect, describe } from "bun:test";
import {
  computeAlerts,
  statusFrom,
  stepIncident,
  detectGap,
  bucketFor,
  parseRange,
  bucketStatus,
  type Alert,
  type Incident,
  type MetricSample,
  type Thresholds,
} from "../src/metrics";

const THRESHOLDS: Thresholds = { memWarn: 85, memCrit: 95, loadWarn: 100, loadCrit: 200 };

// A healthy baseline sample; tests override only the field under test.
function sample(over: Partial<MetricSample> = {}): MetricSample {
  return {
    ts: 1_000,
    uptimeSec: 10,
    proc: { rssMB: 100, heapUsedMB: 40, heapTotalMB: 60, cpuPercent: 5 },
    sys: { memUsedPercent: 50, totalMemMB: 16000, freeMemMB: 8000, load1: 1, cpuCount: 8, loadPercent: 12 },
    build: { active: 0, queued: 0, limit: 8, utilizationPercent: 0, cached: 3 },
    collab: { rooms: 0, connections: 0 },
    deps: { mongo: true, redis: true },
    ...over,
  };
}

describe("computeAlerts", () => {
  test("a healthy sample raises no alerts", () => {
    expect(computeAlerts(sample(), THRESHOLDS)).toEqual([]);
  });

  test("a full pool with no backlog is a warning (at capacity)", () => {
    const alerts = computeAlerts(sample({ build: { active: 8, queued: 0, limit: 8, utilizationPercent: 100, cached: 0 } }), THRESHOLDS);
    const build = alerts.find((a) => a.key === "build");

    expect(build?.level).toBe("warn");
  });

  test("any backlog is critical (saturated — users waiting)", () => {
    const alerts = computeAlerts(sample({ build: { active: 8, queued: 5, limit: 8, utilizationPercent: 100, cached: 0 } }), THRESHOLDS);
    const build = alerts.find((a) => a.key === "build");

    expect(build?.level).toBe("crit");
    expect(build?.message).toContain("saturated");
  });

  test("memory crosses warn then crit thresholds", () => {
    expect(computeAlerts(sample({ sys: { ...sample().sys, memUsedPercent: 88 } }), THRESHOLDS).find((a) => a.key === "mem")?.level).toBe("warn");
    expect(computeAlerts(sample({ sys: { ...sample().sys, memUsedPercent: 97 } }), THRESHOLDS).find((a) => a.key === "mem")?.level).toBe("crit");
  });

  test("CPU load crosses warn then crit thresholds", () => {
    expect(computeAlerts(sample({ sys: { ...sample().sys, loadPercent: 140 } }), THRESHOLDS).find((a) => a.key === "load")?.level).toBe("warn");
    expect(computeAlerts(sample({ sys: { ...sample().sys, loadPercent: 250 } }), THRESHOLDS).find((a) => a.key === "load")?.level).toBe("crit");
  });

  test("missing optional infra surfaces info-level notes", () => {
    const alerts = computeAlerts(sample({ deps: { mongo: false, redis: false } }), THRESHOLDS);
    const keys = alerts.filter((a) => a.level === "info").map((a) => a.key).sort();

    expect(keys).toEqual(["mongo", "redis"]);
  });
});

describe("statusFrom", () => {
  test("ok with no alerts or only info", () => {
    expect(statusFrom([])).toBe("ok");
    expect(statusFrom([{ level: "info", key: "redis", message: "" }])).toBe("ok");
  });

  test("warn when a warning is present", () => {
    expect(statusFrom([{ level: "warn", key: "mem", message: "" }, { level: "info", key: "redis", message: "" }])).toBe("warn");
  });

  test("crit dominates", () => {
    expect(statusFrom([{ level: "warn", key: "mem", message: "" }, { level: "crit", key: "build", message: "" }])).toBe("crit");
  });
});

// Build a sample at a given time with specific overload values, for the incident-machine tests.
function loaded(ts: number, loadPercent: number, memUsedPercent: number, queued: number): MetricSample {
  const s = sample();
  return { ...s, ts, sys: { ...s.sys, loadPercent, memUsedPercent }, build: { ...s.build, queued, active: 8 } };
}

const warnAlert: Alert[] = [{ level: "warn", key: "mem", message: "" }];
const critAlert: Alert[] = [{ level: "crit", key: "build", message: "" }];

describe("stepIncident", () => {
  test("ok→warn→crit→ok yields one closed incident with escalated level, peak maxima, and duration", () => {
    let open: Incident | null = null;
    let closed: Incident | null = null;

    ({ open, closed } = stepIncident(open, loaded(1_000, 150, 80, 0), warnAlert, "warn"));
    expect(open?.level).toBe("warn");
    expect(closed).toBeNull();

    ({ open, closed } = stepIncident(open, loaded(4_000, 220, 96, 5), critAlert, "crit"));
    expect(open?.level).toBe("crit");
    expect(closed).toBeNull();

    ({ open, closed } = stepIncident(open, loaded(9_000, 10, 40, 0), [], "ok"));
    expect(open).toBeNull();
    expect(closed?.level).toBe("crit");
    expect(closed?.durationSec).toBe(8); // (9000 - 1000) / 1000
    expect(closed?.peak).toEqual({ loadPercent: 220, memUsedPercent: 96, queued: 5 });
    expect(closed?.keys.sort()).toEqual(["build", "mem"]);
  });

  test("staying ok never opens an incident", () => {
    const r = stepIncident(null, loaded(1_000, 10, 30, 0), [], "ok");
    expect(r.open).toBeNull();
    expect(r.closed).toBeNull();
  });

  test("an ongoing overload stays open with nothing emitted", () => {
    const r1 = stepIncident(null, loaded(1_000, 150, 80, 0), warnAlert, "warn");
    const r2 = stepIncident(r1.open, loaded(2_000, 160, 82, 0), warnAlert, "warn");
    expect(r2.open).not.toBeNull();
    expect(r2.closed).toBeNull();
  });
});

describe("detectGap", () => {
  const now = 1_000_000;

  test("a small gap is not an outage", () => {
    expect(detectGap(now - 10_000, now, 15_000)).toBeNull();
  });

  test("no prior sample (lastTs 0) is not an outage", () => {
    expect(detectGap(0, now, 15_000)).toBeNull();
  });

  test("a gap beyond 3× the interval is an outage incident with the right duration", () => {
    const gap = detectGap(now - 200_000, now, 15_000);
    expect(gap?.level).toBe("outage");
    expect(gap?.durationSec).toBe(200);
    expect(gap?.keys).toEqual(["outage"]);
  });
});

describe("bucketFor / parseRange / bucketStatus", () => {
  test("bucketFor widens with the range", () => {
    expect(bucketFor(parseRange("1h"))).toBe(0);
    expect(bucketFor(parseRange("24h"))).toBe(5 * 60 * 1000);
    expect(bucketFor(parseRange("7d"))).toBe(60 * 60 * 1000);
  });

  test("parseRange whitelists known ranges and falls back to the default", () => {
    expect(parseRange("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseRange(undefined)).toBe(24 * 60 * 60 * 1000);
    expect(parseRange("bogus")).toBe(24 * 60 * 60 * 1000);
    expect(parseRange("bogus", "7d")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("bucketStatus reflects the worst peak in the bucket", () => {
    expect(bucketStatus({ queuedMax: 1, memMax: 10, loadMax: 10 }, THRESHOLDS)).toBe("crit");
    expect(bucketStatus({ queuedMax: 0, memMax: 97, loadMax: 10 }, THRESHOLDS)).toBe("crit");
    expect(bucketStatus({ queuedMax: 0, memMax: 10, loadMax: 250 }, THRESHOLDS)).toBe("crit");
    expect(bucketStatus({ queuedMax: 0, memMax: 88, loadMax: 10 }, THRESHOLDS)).toBe("warn");
    expect(bucketStatus({ queuedMax: 0, memMax: 10, loadMax: 140 }, THRESHOLDS)).toBe("warn");
    expect(bucketStatus({ queuedMax: 0, memMax: 50, loadMax: 50 }, THRESHOLDS)).toBe("ok");
  });
});

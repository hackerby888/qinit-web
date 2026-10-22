// Admin dashboard (/admin) — live system health + overload detection. Gated by the shared admin token; once
// unlocked it polls /api/admin/metrics every 2s and renders process/OS/collab tiles with sparklines and
// an alert banner. Same neo-brutalist chrome as the IDE (Card/NeoBtn + tokens).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { color, font } from "../ui/tokens";
import { Card, NeoBtn } from "../ui/modals";
import {
  AdminError,
  clearAdminToken,
  fetchAdminMetrics,
  fetchHistory,
  fetchIncidents,
  getAdminToken,
  setAdminToken,
  type AdminMetricsResponse,
  type HealthStatus,
  type HistoryResponse,
  type Incident,
  type RangeKey,
} from "./admin-api";

const CRIT = "#f85149";
const POLL_MS = 2000;

const STATUS_COLOR: Record<HealthStatus, string> = {
  ok: color.ok,
  warn: color.yellow,
  crit: CRIT,
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  ok: "healthy",
  warn: "degraded",
  crit: "overloaded",
};

function levelColor(level: "info" | "warn" | "crit"): string {
  if (level === "crit") {
    return CRIT;
  }
  if (level === "warn") {
    return color.yellow;
  }
  return color.textFaintDk;
}

// A value's tone given warn/crit cutoffs — drives a tile's frame + number color (neutral below warn).
function tone(value: number, warnAt: number, critAt: number): string | undefined {
  if (value >= critAt) {
    return CRIT;
  }
  if (value >= warnAt) {
    return color.yellow;
  }
  return undefined;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);

  if (d > 0) {
    return `${d}d ${h}h`;
  }
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m ${sec % 60}s`;
}

function fmtDur(sec: number | undefined): string {
  if (sec === undefined) {
    return "ongoing";
  }
  if (sec < 60) {
    return `${sec}s`;
  }
  if (sec < 3600) {
    return `${Math.round(sec / 60)}m`;
  }
  return `${Math.round((sec / 3600) * 10) / 10}h`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const CHART_RANGES: RangeKey[] = ["1h", "24h", "7d"];
const INCIDENT_RANGES = ["7d", "30d", "90d"] as const;

function incidentColor(level: Incident["level"]): string {
  if (level === "outage") {
    return color.textMutedDk;
  }
  if (level === "crit") {
    return CRIT;
  }
  return color.yellow;
}

// ---- tiny inline-SVG sparkline (no chart dep) ----

function Spark({ values, max, stroke, width = 150, height = 30 }: {
  values: number[];
  max: number;
  stroke: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <div style={{ height, fontFamily: font.mono, fontSize: 10, color: color.textGhostDk, display: "flex", alignItems: "center" }}>collecting…</div>;
  }

  const ceil = Math.max(max, ...values, 1);
  const n = values.length;
  const pts = values
    .map((v, i) => {
      const x = (i / (n - 1)) * width;
      const y = height - (Math.min(Math.max(v, 0), ceil) / ceil) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---- a metric tile ----

function Tile({ label, value, unit, sub, accent, children }: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <Card frame={accent ?? color.hair2} shadow={4}>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: color.textFaintDk }}>{label}</span>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: font.display, fontSize: 30, lineHeight: 1, color: accent ?? color.textLightHi }}>{value}</span>
          {unit && <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textFaintDk }}>{unit}</span>}
        </div>

        {sub && <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>{sub}</span>}
        {children}
      </div>
    </Card>
  );
}

function Dot({ on, label }: { on: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 9, height: 9, flex: "none", borderRadius: "50%", background: on ? color.accent : CRIT }} />
      <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textLight }}>{label}</span>
      <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11, color: on ? color.accent : CRIT }}>{on ? "up" : "down"}</span>
    </div>
  );
}

// ---- the dashboard grid ----

interface ChartSeries {
  load: number[];
  mem: number[];
}

function Dashboard({ data, series, chartRange, onChartRange, incidents, incidentRange, onIncidentRange, onLock }: {
  data: AdminMetricsResponse;
  series: ChartSeries;
  chartRange: RangeKey;
  onChartRange: (r: RangeKey) => void;
  incidents: Incident[] | null;
  incidentRange: string;
  onIncidentRange: (r: string) => void;
  onLock: () => void;
}) {
  const s = data.current;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      <StatusBanner status={data.status} alerts={data.alerts} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: color.textFaintDk }}>charts</span>
        {CHART_RANGES.map((r) => (
          <NeoBtn key={r} active={r === chartRange} onClick={() => onChartRange(r)} title={`Show the last ${r}`}>{r}</NeoBtn>
        ))}
        <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textGhostDk }}>{chartRange === "1h" ? "live · 15s" : "peak per bucket"}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
        <Tile
          label="CPU load"
          value={s.sys.loadPercent}
          unit={`% · ${s.proc.cpuPercent}% proc`}
          sub={`load ${s.sys.load1} over ${s.sys.cpuCount} cores`}
          accent={tone(s.sys.loadPercent, 100, 200)}
        >
          <Spark values={series.load} max={100} stroke={tone(s.sys.loadPercent, 100, 200) ?? color.accent} />
        </Tile>

        <Tile
          label="System memory"
          value={s.sys.memUsedPercent}
          unit="%"
          sub={`${Math.round((s.sys.totalMemMB - s.sys.freeMemMB) / 1024 * 10) / 10} / ${Math.round(s.sys.totalMemMB / 1024 * 10) / 10} GB`}
          accent={tone(s.sys.memUsedPercent, 85, 95)}
        >
          <Spark values={series.mem} max={100} stroke={tone(s.sys.memUsedPercent, 85, 95) ?? color.accent} />
        </Tile>

        <Tile
          label="Process memory"
          value={s.proc.rssMB}
          unit="MB rss"
          sub={`heap ${s.proc.heapUsedMB} / ${s.proc.heapTotalMB} MB`}
        />

        <Tile
          label="Collab"
          value={s.collab.rooms}
          unit={s.collab.rooms === 1 ? "room" : "rooms"}
          sub={`${s.collab.connections} live connection${s.collab.connections === 1 ? "" : "s"}`}
        />

        <Tile label="Dependencies" value={<span style={{ fontSize: 18 }}>infra</span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 2 }}>
            <Dot on={s.deps.mongo} label="MongoDB" />
            <Dot on={s.deps.redis} label="Redis" />
          </div>
        </Tile>
      </div>

      <IncidentsPanel incidents={incidents} range={incidentRange} onRange={onIncidentRange} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>
        <span>uptime {fmtUptime(s.uptimeSec)}</span>
        <span>·</span>
        <span>{data.history.length} live samples</span>
        <div style={{ flex: 1 }} />
        <NeoBtn onClick={onLock} title="Forget the admin token on this device" accent={CRIT}>lock</NeoBtn>
      </div>
    </div>
  );
}

// ---- incident timeline ----

function IncidentRow({ inc }: { inc: Incident }) {
  const c = incidentColor(inc.level);
  const when = `${fmtTime(inc.startTs)}${inc.endTs ? ` – ${fmtTime(inc.endTs)}` : ""}`;
  const detail = inc.level === "outage"
    ? "server unreachable"
    : `peak mem ${inc.peak.memUsedPercent}% · load ${inc.peak.loadPercent}%`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${color.hair}` }}>
      <span style={{ width: 8, height: 8, flex: "none", background: c }} />
      <span style={{ fontFamily: font.mono, fontSize: 11, color: c, textTransform: "uppercase", width: 52, flex: "none" }}>{inc.level}</span>
      <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLight, flex: "none" }}>{when}</span>
      <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textGhostDk, flex: "none" }}>({fmtDur(inc.durationSec)})</span>
      <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11, color: color.textFaintDk, textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>
    </div>
  );
}

function IncidentsPanel({ incidents, range, onRange }: {
  incidents: Incident[] | null;
  range: string;
  onRange: (r: string) => void;
}) {
  return (
    <Card frame={color.hair2} shadow={4}>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, flex: "none", background: color.secondary }} />
          <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>Incident history</span>
          <div style={{ flex: 1 }} />
          {INCIDENT_RANGES.map((r) => (
            <NeoBtn key={r} active={r === range} onClick={() => onRange(r)} accent={color.secondary} title={`Incidents over the last ${r}`}>{r}</NeoBtn>
          ))}
        </div>

        {incidents === null ? (
          <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textGhostDk }}>loading…</span>
        ) : incidents.length === 0 ? (
          <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textGhostDk }}>No outages or overload in the last {range}. Clear skies.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {incidents.map((inc) => (
              <IncidentRow key={inc.startTs} inc={inc} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function StatusBanner({ status, alerts }: { status: HealthStatus; alerts: AdminMetricsResponse["alerts"]; }) {
  const accent = STATUS_COLOR[status];

  return (
    <Card frame={accent} shadow={5}>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 12, height: 12, flex: "none", borderRadius: "50%", background: accent }} />
          <span style={{ fontFamily: font.display, fontSize: 18, color: color.textLightHi }}>System {STATUS_LABEL[status]}</span>
          <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11, color: accent, textTransform: "uppercase", letterSpacing: ".1em" }}>{status}</span>
        </div>

        {alerts.length === 0 ? (
          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk }}>No alerts. All systems nominal.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alerts.map((a) => (
              <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, flex: "none", background: levelColor(a.level) }} />
                <span style={{ fontFamily: font.mono, fontSize: 11.5, color: levelColor(a.level), textTransform: "uppercase", width: 38, flex: "none" }}>{a.level}</span>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textLight }}>{a.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- token gate ----

function Gate({ message, onUnlock }: { message: string | null; onUnlock: (token: string) => void; }) {
  const [value, setValue] = useState("");

  const submit = () => {
    const t = value.trim();
    if (t) {
      onUnlock(t);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: color.void, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 360, maxWidth: "100%" }}>
        <Card frame={color.accentDeep} shadow={6}>
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 11, height: 11, flex: "none", background: color.accent }} />
              <span style={{ fontFamily: font.display, fontSize: 18, color: color.textLightHi }}>Admin dashboard</span>
            </div>

            <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk }}>Enter the admin token to view system health.</span>

            <input
              type="password"
              value={value}
              autoFocus
              placeholder="admin token"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  submit();
                }
              }}
              style={{ background: color.void, border: `1px solid ${color.accentDeep}`, color: color.textLight, fontFamily: font.mono, fontSize: 13, padding: "7px 9px", outline: "none" }}
            />

            {message && <span style={{ fontFamily: font.mono, fontSize: 11, color: CRIT }}>{message}</span>}

            <NeoBtn onClick={submit} active title="Unlock the dashboard">unlock →</NeoBtn>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---- top-level page ----

export default function Admin() {
  const [token, setTokenState] = useState<string | null>(getAdminToken());
  const [data, setData] = useState<AdminMetricsResponse | null>(null);
  const [gateMsg, setGateMsg] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [chartRange, setChartRange] = useState<RangeKey>("1h");
  const [incidentRange, setIncidentRange] = useState<string>("7d");
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    if (!token) {
      return;
    }

    aliveRef.current = true;

    const tick = async () => {
      try {
        const r = await fetchAdminMetrics(token);
        if (!aliveRef.current) {
          return;
        }
        setData(r);
        setStale(false);
        setGateMsg(null);
        setAdminToken(token);
      } catch (e) {
        if (!aliveRef.current) {
          return;
        }
        if (e instanceof AdminError && (e.code === "forbidden" || e.code === "unconfigured")) {
          clearAdminToken();
          setData(null);
          setTokenState(null);
          setGateMsg(e.message);
          return;
        }
        setStale(true); // transient network blip — keep showing the last good data
      }
    };

    void tick();
    const iv = setInterval(() => void tick(), POLL_MS);

    return () => {
      aliveRef.current = false;
      clearInterval(iv);
    };
  }, [token]);

  // Ranged history for the charts — only for 24h/7d (1h uses the live ring carried on the metrics report).
  // Refreshed lazily (30s); a bad token is handled by the metrics poll above, so failures here just no-op.
  useEffect(() => {
    if (!token || chartRange === "1h") {
      setHistory(null);
      return;
    }

    let alive = true;

    const tick = async () => {
      try {
        const r = await fetchHistory(token, chartRange);
        if (alive) {
          setHistory(r);
        }
      } catch {
        // transient / auth — the metrics poll owns the gate transition
      }
    };

    void tick();
    const iv = setInterval(() => void tick(), 30_000);

    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [token, chartRange]);

  // The incident timeline — independent of the chart range, refreshed every 30s.
  useEffect(() => {
    if (!token) {
      return;
    }

    let alive = true;

    const tick = async () => {
      try {
        const r = await fetchIncidents(token, incidentRange);
        if (alive) {
          setIncidents(r.incidents);
        }
      } catch {
        // transient / auth — handled by the metrics poll
      }
    };

    void tick();
    const iv = setInterval(() => void tick(), 30_000);

    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [token, incidentRange]);

  const series = useMemo<ChartSeries>(() => {
    if (chartRange === "1h") {
      const h = data?.history ?? [];
      return {
        load: h.map((x) => x.sys.loadPercent),
        mem: h.map((x) => x.sys.memUsedPercent),
      };
    }

    const pts = history?.points ?? [];
    return {
      load: pts.map((p) => p.loadMax),
      mem: pts.map((p) => p.memMax),
    };
  }, [chartRange, data, history]);

  const unlock = (t: string) => {
    setGateMsg(null);
    setTokenState(t);
  };

  const lock = () => {
    clearAdminToken();
    setData(null);
    setHistory(null);
    setIncidents(null);
    setTokenState(null);
  };

  if (!token) {
    return <Gate message={gateMsg} onUnlock={unlock} />;
  }

  const page: CSSProperties = { minHeight: "100vh", background: color.void, padding: "28px 20px 60px" };

  return (
    <div style={page}>
      <div style={{ maxWidth: 1100, margin: "0 auto 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: font.display, fontSize: 15, letterSpacing: ".04em", color: color.textLightHi }}>QINIT · SYSTEM HEALTH</span>
        {stale && <span style={{ fontFamily: font.mono, fontSize: 11, color: color.yellow }}>· reconnecting…</span>}
        <a href="/ide" style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11, color: color.textGhostDk, textDecoration: "none" }}>← back to IDE</a>
      </div>

      {data ? (
        <Dashboard
          data={data}
          series={series}
          chartRange={chartRange}
          onChartRange={setChartRange}
          incidents={incidents}
          incidentRange={incidentRange}
          onIncidentRange={setIncidentRange}
          onLock={lock}
        />
      ) : (
        <div style={{ textAlign: "center", fontFamily: font.mono, fontSize: 12, color: color.textGhostDk, marginTop: 60 }}>loading metrics…</div>
      )}
    </div>
  );
}

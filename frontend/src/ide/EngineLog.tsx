// Engine log — a popup view of the in-process virtual engine's diagnostic stream (tick + epoch boundaries,
// deploys, applied txs, contract faults, dormant skips, the oversized-state digest skip, mempool drops). The
// engine emits these via onLog; the IDE buffers them and shows them here. Distinct from the TxExplorer/Debugger,
// which carry the heavy per-tx call detail — this is the lifecycle/activity timeline.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { color, font } from "../landing/tokens";
import { Card } from "./ui";
import type { EngineLogEvent } from "./engine";

const line: CSSProperties = { fontFamily: font.mono, fontSize: 11.5 };

const RANK: Record<EngineLogEvent["level"], number> = { debug: 0, info: 1, warn: 2, error: 3 };

// Filter presets — the minimum level shown. Default hides the per-tick "debug" chatter.
const FILTERS: { key: string; label: string; min: number }[] = [
  { key: "all", label: "all", min: 0 },
  { key: "info", label: "info+", min: 1 },
  { key: "warn", label: "warn+", min: 2 },
];

const levelColor = (level: EngineLogEvent["level"]): string => {
  if (level === "error") {
    return "#f85149";
  }
  if (level === "warn") {
    return color.yellow;
  }
  if (level === "info") {
    return color.textMutedDk;
  }
  return color.textGhostDk;
};

export function EngineLog({ log, onClose, onClear }: { log: EngineLogEvent[]; onClose: () => void; onClear: () => void }) {
  const [min, setMin] = useState(1); // default: info and above
  const bodyRef = useRef<HTMLDivElement>(null);
  // Stick-to-bottom: only auto-scroll when the user is already pinned to the newest line. If they scrolled up
  // to read an older event, new appends must NOT yank them back down. Updated on every scroll; starts pinned.
  const stick = useRef(true);
  const shown = log.filter((e) => RANK[e.level] >= min);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-scroll to the newest line as the stream grows — but ONLY while pinned to the bottom (stick.current).
  // A user who scrolled up keeps their position; new events accrue below without moving the viewport.
  useEffect(() => {
    const el = bodyRef.current;
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [shown.length]);

  // Track whether the viewport is pinned to the bottom (within a small slack), recomputed on each scroll.
  const onScroll = () => {
    const el = bodyRef.current;
    if (el) {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(820px, 96vw)" }}>
        <Card frame={color.accentDeep} shadow={6} faceStyle={{ display: "flex", flexDirection: "column", maxHeight: "86vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${color.hair}`, flex: "none" }}>
            <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
            <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>ENGINE LOG</span>
            <span style={{ ...line, color: color.textGhostDk }}>{shown.length}/{log.length}</span>

            <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setMin(f.min)}
                  style={{ ...line, fontSize: 10.5, padding: "2px 7px", cursor: "pointer", border: `1px solid ${min === f.min ? color.accent : color.hair2}`, background: min === f.min ? `${color.accent}14` : color.void, color: min === f.min ? color.accent : color.textGhostDk }}
                >
                  {f.label}
                </button>
              ))}
            </span>
            {log.length > 0 && (
              <button onClick={onClear} style={{ ...line, fontSize: 10, letterSpacing: ".1em", border: "none", background: "transparent", color: color.textGhostDk, cursor: "pointer" }}>CLEAR</button>
            )}
            <button onClick={onClose} style={{ border: `1px solid ${color.hair2}`, background: color.void, color: color.textLight, ...line, padding: "2px 8px", cursor: "pointer" }}>✕</button>
          </div>

          <div ref={bodyRef} onScroll={onScroll} style={{ overflowY: "auto", padding: "8px 14px 12px", lineHeight: 1.7 }}>
            {shown.length === 0 ? (
              <div style={{ ...line, color: color.textGhostDk }}>— no engine events at this level — run the chain, or widen the filter —</div>
            ) : (
              shown.map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, wordBreak: "break-word" }}>
                  <span style={{ ...line, color: color.textGhostDk, flex: "none", width: 52, textAlign: "right" }}>t{e.tick}</span>
                  <span style={{ ...line, color: color.textGhostDk, flex: "none", width: 56 }}>{e.cat}</span>
                  <span style={{ ...line, color: levelColor(e.level) }}>{e.msg}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

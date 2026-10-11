// Tx / tick explorer — a block-explorer view of the in-process chain this session. Every processed
// transaction, newest first, grouped under its tick: which contract.procedure ran, the caller, whether
// money moved, and a one-glance state-diff count. Click a row to step through it in the debugger.
import { useEffect, type CSSProperties } from "react";
import { color, font } from "../ui/tokens";
import { Card } from "../ui/modals";
import type { TxDetail, DebugStep } from "./engine";

export interface TxRow {
  key: string;
  name: string;
  tick: number;
  moneyFlew: boolean;
  executed: boolean;
  contract: string;
  detail?: TxDetail;
}

const shortId = (id: string): string => (id && id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id || "—");

const line: CSSProperties = { fontFamily: font.mono, fontSize: 11.5 };

export function TxExplorer({ txs, onClose, onDebug }: { txs: TxRow[]; onClose: () => void; onDebug: (steps: DebugStep[], title: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Group newest-first by tick, preserving the incoming (newest-first) order of rows within a tick.
  const ticks: number[] = [];
  const byTick = new Map<number, TxRow[]>();
  for (const t of txs) {
    if (!byTick.has(t.tick)) {
      byTick.set(t.tick, []);
      ticks.push(t.tick);
    }
    byTick.get(t.tick)!.push(t);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 96vw)" }}>
        <Card frame={color.accentDeep} shadow={6} faceStyle={{ display: "flex", flexDirection: "column", maxHeight: "86vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${color.hair}`, flex: "none" }}>
            <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
            <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>TX EXPLORER</span>
            <span style={{ ...line, color: color.textGhostDk }}>{txs.length} tx{txs.length === 1 ? "" : "s"}</span>
            <button onClick={onClose} style={{ marginLeft: "auto", border: `1px solid ${color.hair2}`, background: color.void, color: color.textLight, ...line, padding: "2px 8px", cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ overflowY: "auto", padding: "8px 0" }}>
            {txs.length === 0 && (
              <div style={{ ...line, color: color.textGhostDk, padding: "10px 16px" }}>no transactions yet — run a procedure to include it in the next tick.</div>
            )}

            {ticks.map((tick) => (
              <div key={tick} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 16px" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".06em", color: color.textGhostDk }}>TICK {tick}</span>
                  <span style={{ flex: 1, height: 1, background: color.hair }} />
                </div>

                {byTick.get(tick)!.map((t) => {
                  const steps = t.detail?.steps ?? [];
                  const diffN = t.detail?.diff.length ?? 0;
                  return (
                    <div
                      key={t.key}
                      onClick={() => steps.length && onDebug(steps, `${t.name}()`)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 16px", cursor: steps.length ? "pointer" : "default", borderLeft: `3px solid ${t.executed ? color.accent : "#f85149"}` }}
                    >
                      <span style={{ ...line, color: color.textLight, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.contract}.{t.name}</span>
                      <span style={{ ...line, color: color.textGhostDk, flex: "none" }}>{shortId(t.detail?.caller ?? "")}</span>
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                        {diffN > 0 && <span style={{ ...line, color: color.secondary }}>Δ{diffN}</span>}
                        {t.executed
                          ? <span style={{ ...line, color: t.moneyFlew ? color.accent : color.textGhostDk }}>{t.moneyFlew ? "qu moved" : "no qu moved"}</span>
                          : <span style={{ ...line, color: "#f85149" }}>not executed</span>}
                        {steps.length > 0 && <span style={{ ...line, color: color.accent }}>🐞</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

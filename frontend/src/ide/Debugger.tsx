// Step debugger overlay — walks a transaction's recorded call sequence (engine.debugTrace decoded into
// DebugStep[]). Each step is one invocation (user procedure, inter-contract call, or system procedure);
// stepping ◀ ▶ shows that step's decoded in/out, caller, StateData diff (before → after), host-event
// timeline and logs. Qubic SC runs wasm to completion per entry, so the granularity is per-invocation /
// per-effect, not per-source-line.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { color, font } from "../landing/tokens";
import { Card } from "./ui";
import type { DebugStep } from "./engine";

const line: CSSProperties = { fontFamily: font.mono, fontSize: 11.5, lineHeight: 1.6, wordBreak: "break-all" };

function Field({ label, val }: { label: string; val: string }) {
  if (!val || val === "(none)") {
    return null;
  }
  return (
    <div style={{ display: "flex", gap: 8, ...line }}>
      <span style={{ color: color.textGhostDk, minWidth: 44, flex: "none" }}>{label}</span>
      <span style={{ color: color.textMutedDk }}>{val}</span>
    </div>
  );
}

function Group({ title, accent, empty, children }: { title: string; accent: string; empty: boolean; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 7, height: 7, flex: "none", background: empty ? color.hair2 : accent }} />
        <span style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk }}>{title}</span>
      </div>
      {empty ? <div style={{ ...line, color: color.textGhostDk, paddingLeft: 14 }}>—</div> : <div style={{ paddingLeft: 14, display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>}
    </div>
  );
}

export function Debugger({ steps, title, onClose, onJump, onBack }: { steps: DebugStep[]; title?: string; onClose: () => void; onJump?: (step: DebugStep) => void; onBack?: () => void }) {
  const [i, setI] = useState(0);

  // Built per render so a live theme swap recolors the nav buttons.
  const navBtn: CSSProperties = {
    border: `1px solid ${color.hair2}`,
    background: color.void,
    color: color.textLight,
    fontFamily: font.mono,
    fontSize: 11,
    padding: "2px 8px",
    cursor: "pointer",
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        setI((x) => Math.min(steps.length - 1, x + 1));
      } else if (e.key === "ArrowLeft") {
        setI((x) => Math.max(0, x - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length, onClose]);

  const cur = steps[i];
  if (!cur) {
    return null;
  }

  const kindColor = cur.kind === 1 ? color.secondary : cur.kind === 0 ? color.accent : color.yellow;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(880px, 96vw)" }}>
        <Card frame={color.accentDeep} shadow={6} faceStyle={{ display: "flex", flexDirection: "column", maxHeight: "86vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${color.hair}`, flex: "none" }}>
            {onBack && <button onClick={onBack} title="Back to tx explorer" style={{ ...navBtn, color: color.accent }}>← txs</button>}
            <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
            <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>DEBUGGER</span>
            {title && <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textMutedDk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>
              <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} style={navBtn}>◀</button>
              <span>step {i + 1}/{steps.length}</span>
              <button onClick={() => setI((x) => Math.min(steps.length - 1, x + 1))} disabled={i === steps.length - 1} style={navBtn}>▶</button>
              <button onClick={onClose} style={{ ...navBtn, marginLeft: 6 }}>✕</button>
            </span>
          </div>

          <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
            <div style={{ width: 232, flex: "none", borderRight: `1px solid ${color.hair}`, overflowY: "auto", padding: 6, background: color.panelDeep }}>
              {steps.map((s, idx) => {
                const on = idx === i;
                return (
                  <div
                    key={s.seq}
                    onClick={() => setI(idx)}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", cursor: "pointer", borderLeft: `3px solid ${on ? color.accent : "transparent"}`, background: on ? `${color.accent}14` : "transparent", fontFamily: font.mono, fontSize: 11 }}
                  >
                    <span style={{ color: color.textGhostDk, width: 16, flex: "none" }}>{idx + 1}</span>
                    <span style={{ color: on ? color.textLight : color.textMutedDk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.contract}.{s.label}</span>
                    <span style={{ marginLeft: "auto", flex: "none", color: s.ok ? color.accent : "#f85149" }}>{s.ok ? "✓" : "✗"}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, flex: "none", background: kindColor }} />
                <span style={{ fontFamily: font.mono, fontSize: 13, color: color.textLight }}>{cur.contract}.{cur.label}</span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>slot {cur.slot}</span>
                {onJump && (cur.kind === 0 || cur.kind === 1) && (
                  <button
                    onClick={() => onJump(cur)}
                    title={`Jump to ${cur.contract}.${cur.label} in the editor`}
                    style={{ ...navBtn, marginLeft: "auto", color: color.accent, borderColor: color.hair2 }}
                  >
                    ↪ source
                  </button>
                )}
                <span style={{ marginLeft: onJump && (cur.kind === 0 || cur.kind === 1) ? 0 : "auto", fontFamily: font.mono, fontSize: 11, color: cur.ok ? color.accent : "#f85149" }}>{cur.ok ? "ok" : "trapped"}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Field label="caller" val={cur.caller} />
                <Field label="in" val={cur.in} />
                <Field label="out" val={cur.out} />
              </div>

              <Group title="STATE DIFF" accent={color.secondary} empty={cur.diff.length === 0}>
                {cur.diff.map((d, k) => (
                  <div key={k} style={line}>
                    <span style={{ color: color.secondary }}>{d.label}</span> <span style={{ color: color.textGhostDk }}>{d.before}</span> <span style={{ color: color.textGhostDk }}>→</span> <span style={{ color: color.accent }}>{d.after}</span>
                  </div>
                ))}
              </Group>

              <Group title="HOST EVENTS" accent={color.accent} empty={cur.hostCalls.length === 0}>
                {cur.hostCalls.map((h, k) => (
                  <div key={k} style={{ ...line, color: color.textMutedDk }}>• {h}</div>
                ))}
              </Group>

              <Group title="LOGS" accent={color.yellow} empty={cur.logs.length === 0}>
                {cur.logs.map((l, k) => (
                  <div key={k} style={{ ...line, color: color.secondary }}>{l}</div>
                ))}
              </Group>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

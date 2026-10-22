// Results overlay for the in-IDE .ts test runner — a pass/fail summary, then each test with its error and
// captured console output.
import { useEffect, type CSSProperties } from "react";
import { color, font } from "../../ui/tokens";
import { Card } from "../../ui/modals";
import type { TestResult } from "./runner";

const mono: CSSProperties = { fontFamily: font.mono, fontSize: 11.5 };

export function TestPanel({ results, running, title, onClose, onRerun, onStop }: {
  results: TestResult[];
  running: boolean;
  title?: string;
  onClose: () => void;
  onRerun: () => void;
  onStop: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pass = results.filter((r) => r.ok).length;
  const total = results.length;
  const allOk = total > 0 && pass === total;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(720px, 96vw)" }}>
        <Card frame={color.accentDeep} shadow={6} faceStyle={{ display: "flex", flexDirection: "column", maxHeight: "86vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${color.hair}`, flex: "none" }}>
            <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
            <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>TESTS</span>
            {title && <span style={{ ...mono, color: color.textMutedDk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>}
            {!running && total > 0 && (
              <span style={{ ...mono, color: allOk ? color.ok : "#f85149" }}>{allOk ? "✓" : "✗"} {pass}/{total} passed</span>
            )}
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {running
                ? <button onClick={onStop} title="Stop this run — the test in flight is reported as stopped" style={{ border: "1px solid #f85149", background: color.void, color: "#f85149", ...mono, padding: "2px 10px", cursor: "pointer" }}>■ stop</button>
                : <button onClick={onRerun} style={{ border: `1px solid ${color.hair2}`, background: color.void, color: color.accent, ...mono, padding: "2px 10px", cursor: "pointer" }}>▶ re-run</button>}
              <button onClick={onClose} style={{ border: `1px solid ${color.hair2}`, background: color.void, color: color.textLight, ...mono, padding: "2px 8px", cursor: "pointer" }}>✕</button>
            </span>
          </div>

          <div style={{ overflowY: "auto", padding: "8px 0" }}>
            {running && (
              <div style={{ ...mono, color: color.textGhostDk, padding: "10px 16px" }}>running on the in-page engine{results.length ? ` — ${results.length} done` : ""}…</div>
            )}

            {results.map((r, i) => (
              <div key={i} style={{ padding: "7px 16px", borderLeft: `3px solid ${r.ok ? color.ok : "#f85149"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...mono, color: r.ok ? color.ok : "#f85149" }}>{r.ok ? "✓" : "✗"}</span>
                  <span style={{ ...mono, color: color.textLight }}>{r.name}</span>
                  <span style={{ marginLeft: "auto", ...mono, fontSize: 10, color: color.textGhostDk }}>{r.ms}ms</span>
                </div>
                {r.error && <div style={{ ...mono, color: "#f85149", paddingLeft: 18, paddingTop: 3, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.error}</div>}
                {r.logs.map((l, k) => (
                  <div key={k} style={{ ...mono, fontSize: 10.5, color: color.textGhostDk, paddingLeft: 18 }}>› {l}</div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

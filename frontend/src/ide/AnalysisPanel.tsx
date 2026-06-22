// Workspace static-analysis results, grouped by category. Each row jumps to the offending file/line. The
// findings are computed by ./qpi/analyze (pure) and passed in; this component is presentation only.
import { Fragment } from "react";
import { color, font } from "../landing/tokens";
import type { AnalysisFinding } from "./qpi/analyze";

// Fixed display order — determinism + state first (the Qubic-specific invariants), then the rest.
const ORDER = ["Determinism", "State", "Types", "Memory", "Language", "Registration", "Interface", "Other"];

const sevColor = (s: AnalysisFinding["severity"]): string => (s === "error" ? "#FF8B7E" : s === "warn" ? color.yellow : color.textMutedDk);
const sevIcon = (s: AnalysisFinding["severity"]): string => (s === "error" ? "⊘" : s === "warn" ? "⚠" : "ⓘ");
const sevRank = (s: AnalysisFinding["severity"]): number => (s === "error" ? 0 : s === "warn" ? 1 : 2);

export function AnalysisPanel({ findings, onJump }: {
  findings: AnalysisFinding[];
  onJump: (file: string, line: number, col: number) => void;
}) {
  if (findings.length === 0) {
    return (
      <div style={{ padding: "6px 14px", fontFamily: font.mono, fontSize: 11.5, color: color.accent }}>
        ✓ No issues in your other contract files. (The file you're editing is covered by Problems.)
      </div>
    );
  }

  const byCat = new Map<string, AnalysisFinding[]>();
  for (const f of findings) {
    const list = byCat.get(f.category) ?? [];
    list.push(f);
    byCat.set(f.category, list);
  }

  const cats = [...byCat.keys()].sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia < 0 ? ORDER.length : ia) - (ib < 0 ? ORDER.length : ib) || a.localeCompare(b);
  });

  return (
    <div style={{ padding: "2px 0 8px" }}>
      {cats.map((cat) => {
        const rows = byCat.get(cat)!.slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.file.localeCompare(b.file) || a.line - b.line);
        return (
          <Fragment key={cat}>
            <div style={{ position: "sticky", top: 0, background: color.panel, padding: "4px 14px", fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".06em", color: color.textGhostDk, borderBottom: `1px solid ${color.hair}` }}>
              {cat.toUpperCase()} <span style={{ color: color.textFaintDk }}>· {rows.length}</span>
            </div>
            {rows.map((f, i) => (
              <div
                key={`${cat}:${i}`}
                onClick={() => onJump(f.file, f.line, f.col)}
                className="pix-problem-row"
                title={f.rule}
                style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 14px", cursor: "pointer", fontFamily: font.mono, fontSize: 11, lineHeight: 1.5 }}
              >
                <span style={{ flex: "none", color: sevColor(f.severity) }}>{sevIcon(f.severity)}</span>
                <span style={{ color: color.textMutedDk, wordBreak: "break-word" }}>{f.message}</span>
                <span style={{ marginLeft: "auto", flex: "none", color: color.textGhostDk, whiteSpace: "nowrap" }}>{f.file} · {f.line}:{f.col}</span>
              </div>
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}

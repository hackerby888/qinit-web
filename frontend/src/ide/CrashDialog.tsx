// The crash popup and the root error boundary. A thin renderer over ./crash — all the logic (dedupe,
// redaction, report assembly) lives there so it can be unit-tested without a DOM.
//
// CrashOverlay is mounted as a SIBLING ABOVE CrashBoundary, never inside it: a boundary swaps its children
// for the fallback, so a dialog nested under it would be unmounted by the very crash it exists to report.
import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { color, font } from "../landing/tokens";
import { Card, NeoBtn } from "./ui";
import { buildReportText, currentCrash, dismissCrash, reportCrash, sensitiveKeys, subscribeCrash, type CrashReport } from "./crash";

const ERROR_RED = "#f85149";

// Contract source can contain a triple backtick, so fence the paste with four.
const fenced = (text: string): string => `\`\`\`\`\n${text}\n\`\`\`\``;

export function CrashOverlay(): JSX.Element | null {
  const [report, setReport] = useState<CrashReport | null>(currentCrash);
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeCrash(setReport), []);

  useEffect(() => {
    if (!report) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissCrash();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report]);

  // Rebuilt whenever the report changes or the opt-in flips; buildReportText reads live store state, so the
  // count stays true even after the emit throttle stops re-rendering.
  const text = useMemo(() => (report ? buildReportText(includeSensitive) : ""), [report, includeSensitive]);

  if (!report) {
    return null;
  }

  const sensitive = sensitiveKeys();

  const copy = () => {
    navigator.clipboard.writeText(fenced(text)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {
        // Clipboard blocked (permissions, insecure origin) — the report is on screen to select by hand.
      },
    );
  };

  const close = () => {
    setIncludeSensitive(false);
    dismissCrash();
  };

  return (
    <div
      onClick={close}
      style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 96vw)" }}>
        <Card frame={ERROR_RED} shadow={6} faceStyle={{ display: "flex", flexDirection: "column", maxHeight: "88vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${color.hair}`, flex: "none" }}>
            <span style={{ width: 9, height: 9, flex: "none", background: ERROR_RED }} />
            <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>Unexpected error</span>
            {report.count > 1 && (
              <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textGhostDk }}>×{report.count}</span>
            )}
            <button
              onClick={close}
              title="Dismiss (this message won't pop up again this session)"
              style={{ marginLeft: "auto", border: `1px solid ${color.hair2}`, background: color.void, color: color.textLight, fontFamily: font.mono, fontSize: 11, padding: "2px 8px", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          <div style={{ padding: "10px 14px", fontFamily: font.body, fontSize: 12.5, color: color.textLight, flex: "none" }}>
            The IDE hit an error it didn't expect. Copy the report below and share it so this can be fixed.
          </div>

          <pre
            style={{
              margin: 0,
              padding: "10px 14px",
              overflow: "auto",
              flex: 1,
              minHeight: 0,
              fontFamily: font.mono,
              fontSize: 11,
              lineHeight: 1.5,
              color: color.textLight,
              background: color.void,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {text}
          </pre>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${color.hair}`, flex: "none", flexWrap: "wrap" }}>
            {sensitive.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font.mono, fontSize: 11, color: color.textMutedDk, cursor: "pointer" }}>
                <input type="checkbox" checked={includeSensitive} onChange={(e) => setIncludeSensitive(e.target.checked)} />
                include {sensitive.join(", ")}
              </label>
            )}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <NeoBtn onClick={copy} title="Copy the report to the clipboard">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? "copied" : "copy report"}
                </span>
              </NeoBtn>
              <NeoBtn onClick={close} accent={ERROR_RED}>
                dismiss
              </NeoBtn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// A class component is React's requirement — getDerivedStateFromError/componentDidCatch have no hook form.
export class CrashBoundary extends React.Component<{ children: ReactNode }, { dead: boolean }> {
  state = { dead: false };

  static getDerivedStateFromError(): { dead: boolean } {
    return { dead: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    reportCrash(error, "react", info?.componentStack ?? undefined);
  }

  render(): ReactNode {
    if (!this.state.dead) {
      return this.props.children;
    }
    // Deliberately not a second copy of the report UI — CrashOverlay is already on top of this. It stays
    // after the dialog is dismissed so there is still a way out.
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: color.void }}>
        <div style={{ width: "min(420px, 96vw)" }}>
          <Card frame={ERROR_RED} shadow={6}>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>The app hit an unexpected error.</span>
              <span style={{ fontFamily: font.body, fontSize: 12.5, color: color.textLight }}>Reloading usually recovers. Your saved projects are not affected.</span>
              <div>
                <NeoBtn onClick={() => location.reload()}>reload page</NeoBtn>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }
}

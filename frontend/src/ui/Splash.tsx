// Branded loading screen for real project/IDE startup work. Its parent owns readiness; there is no minimum
// display time or completion timer, so a cached editor passes through immediately while a cold load stays
// visible until the corresponding project, Monaco, compiler and engine tasks settle.
import type { CSSProperties } from "react";
import { QMark } from "./primitives";
import { color, font } from "./tokens";

const CSS = `
@keyframes splashMark { 0%,100%{opacity:.45;transform:scale(.96)} 50%{opacity:1;transform:none} }
@keyframes splashBar { from{transform:translateX(-120%)} to{transform:translateX(360%)} }
@keyframes splashCaret { 0%,49%{opacity:1} 50%,100%{opacity:0} }
`;

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 300,
  background: color.void,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 22,
};

function AnimatedMark({ size = 72 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", animation: "splashMark 1.6s ease-in-out infinite" }}>
      <QMark size={size} />
    </span>
  );
}

export type SplashStepStatus = "pending" | "loading" | "done" | "error";

export interface SplashStep {
  label: string;
  status: SplashStepStatus;
}

export function SplashScreen({ label, steps }: {
  label: string;
  steps: SplashStep[];
}) {
  const active = steps.some((step) => step.status === "loading");

  return (
    <div style={overlay}>
      <style>{CSS}</style>

      <AnimatedMark />

      <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
        <span style={{ fontFamily: font.display, fontSize: 30, letterSpacing: ".06em", color: color.textLightHi }}>qinit</span>
        <span style={{ width: 11, height: 24, marginLeft: 4, background: color.accent, display: "inline-block", animation: "splashCaret 1s steps(1) infinite" }} />
      </div>

      <span style={{ fontFamily: font.mono, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: color.textGhostDk }}>{label}</span>

      <div role="log" aria-live="polite" style={{ width: 260, minHeight: 92, display: "flex", flexDirection: "column", gap: 7 }}>
        {steps.map((step) => {
          const marker = step.status === "done" ? "✓" : step.status === "error" ? "!" : step.status === "loading" ? "›" : "·";
          const stepColor = step.status === "done"
            ? color.ok
            : step.status === "error"
              ? "#f85149"
              : step.status === "loading"
                ? color.textLightHi
                : color.textFaintDk;
          return (
            <div key={step.label} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, alignItems: "baseline", color: stepColor, fontFamily: font.mono, fontSize: 12 }}>
              <span aria-hidden="true">{marker}</span>
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>

      <div style={{ width: 190, height: 4, background: color.hair2, overflow: "hidden" }}>
        {active && <div style={{ width: "38%", height: "100%", background: color.accent, animation: "splashBar 1.1s ease-in-out infinite" }} />}
      </div>
    </div>
  );
}

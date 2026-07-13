// Branded loading screen for real project/IDE startup work. Its parent owns readiness; there is no minimum
// display time or completion timer, so a cached editor passes through immediately while a cold load stays
// visible until the corresponding project, Monaco, compiler and engine tasks settle.
import type { CSSProperties } from "react";
import { color, font } from "../landing/tokens";

// The qinit logo as a 5×7 pixel map (same mark as landing's PixelQMark). Value 2 = the accent deploy node.
const Q_MAP = [
  0, 1, 1, 1, 0,
  1, 0, 0, 1, 0,
  1, 0, 0, 1, 0,
  1, 0, 0, 1, 0,
  0, 1, 1, 1, 0,
  0, 0, 0, 2, 0,
  0, 0, 0, 2, 2,
];

const CSS = `
@keyframes splashPix { 0%{opacity:.12;transform:translateY(-3px)} 45%{opacity:1;transform:none} 100%{opacity:.12;transform:translateY(-3px)} }
@keyframes splashSeed { 0%,100%{opacity:.35} 50%{opacity:1} }
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

function AnimatedMark({ size = 88 }: { size?: number }) {
  const cells: { x: number; y: number; seed: boolean; order: number }[] = [];
  let order = 0;

  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      const v = Q_MAP[r * 5 + c];
      if (v) {
        cells.push({ x: c * 10, y: r * 10, seed: v === 2, order: order++ });
      }
    }
  }

  return (
    <svg viewBox="0 0 50 70" width={size} height={size * 1.4} fill="none" style={{ shapeRendering: "crispEdges", filter: `drop-shadow(5px 5px 0 ${color.accentShadow})` }}>
      {cells.map((p) => (
        <rect
          key={p.order}
          x={p.x}
          y={p.y}
          width="10"
          height="10"
          fill={p.seed ? color.accent : color.textLightHi}
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: p.seed
              ? "splashSeed 1s ease-in-out infinite"
              : `splashPix 1.4s ease-in-out ${p.order * 70}ms infinite`,
          }}
        />
      ))}
    </svg>
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
            ? color.accent
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

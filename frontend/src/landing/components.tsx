// qinit core components (from the official handoff) — the two signature primitives are
// <NotchBox> and <PixelButton>; almost every surface is a NotchBox, every CTA a PixelButton.
import React, { type CSSProperties, type ReactNode } from "react";
import { color, font, NOTCH, hardShadow } from "./tokens";

const clip: CSSProperties = { clipPath: NOTCH, WebkitClipPath: NOTCH };

type NotchBoxProps = {
  children?: ReactNode;
  face?: string;
  frame?: string;
  shadow?: number;
  lift?: boolean;
  style?: CSSProperties;
  faceStyle?: CSSProperties;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style">;

// The bitten-corner card with a hard offset shadow (ink frame wrapping a face).
export function NotchBox({ children, face = color.white, frame = color.ink, shadow = 6, lift = true, style = {}, faceStyle = {}, ...rest }: NotchBoxProps) {
  const [hover, setHover] = React.useState(false);
  const off = hover && lift ? shadow + 3 : shadow;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: frame,
        padding: 3,
        ...clip,
        filter: shadow ? hardShadow(off, off, frame) : "none",
        transform: hover && lift ? "translate(-2px,-2px)" : "none",
        transition: "transform .12s steps(2), filter .12s steps(2)",
        ...style,
      }}
      {...rest}
    >
      <div style={{ background: face, ...clip, ...faceStyle }}>{children}</div>
    </div>
  );
}

type PixelButtonProps = {
  children?: ReactNode;
  variant?: "accent" | "dark" | "light";
  onDark?: boolean;
  href?: string;
  style?: CSSProperties;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "style">;

// Chunky notched button that physically "presses" down on hover/active.
export function PixelButton({ children, variant = "accent", onDark = false, href, style = {}, ...rest }: PixelButtonProps) {
  const faces = {
    accent: { bg: color.accent, fg: color.void },
    dark: { bg: color.panel, fg: color.textLight },
    light: { bg: color.white, fg: color.ink },
  }[variant];
  const frame = onDark ? color.accentDeep : color.ink;
  const shadowC = onDark ? color.accentShadow : color.ink;
  const [press, setPress] = React.useState(0); // 0 rest, 1 hover, 2 active
  const off = press === 2 ? 0 : press === 1 ? 3 : 5;
  const shift = press === 2 ? 5 : press === 1 ? 2 : 0;

  return (
    <a
      href={href}
      onMouseEnter={() => setPress(1)}
      onMouseLeave={() => setPress(0)}
      onMouseDown={() => setPress(2)}
      onMouseUp={() => setPress(1)}
      style={{
        textDecoration: "none",
        border: "none",
        cursor: "pointer",
        background: frame,
        padding: 3,
        ...clip,
        filter: hardShadow(off, off, shadowC),
        transform: `translate(${shift}px,${shift}px)`,
        transition: "transform .1s steps(2), filter .1s steps(2)",
        display: "inline-block",
        ...style,
      }}
      {...rest}
    >
      <span style={{ display: "block", background: faces.bg, color: faces.fg, ...clip, fontFamily: font.display, fontSize: 18, padding: "13px 24px" }}>
        {children}
      </span>
    </a>
  );
}

type ChipProps = { children?: ReactNode; tone?: "yellow" | "outlineDark" | "panel"; style?: CSSProperties };

// Small mono label.
export function Chip({ children, tone = "yellow", style = {} }: ChipProps) {
  const tones = {
    yellow: { background: color.yellow, color: color.ink, border: `2px solid ${color.ink}` },
    outlineDark: { background: "transparent", color: color.textMutedDk, border: `1px solid ${color.hair2}` },
    panel: { background: color.panel, color: color.textLight, border: `3px solid ${color.hair}`, boxShadow: `4px 4px 0 ${color.accentDeep}` },
  }[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: font.mono, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", padding: "6px 12px", ...tones, ...style }}>
      {children}
    </span>
  );
}

// The small square colored tile holding a glyph (feature/pillar/path cards).
export function GlyphBadge({ glyph, tint = color.accent, size = 48 }: { glyph: ReactNode; tint?: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, background: tint, border: `3px solid ${color.ink}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.display, fontWeight: 700, fontSize: size * 0.46, color: color.ink, flex: "none" }}>
      {glyph}
    </div>
  );
}

// The qinit logo, drawn from a 5×7 pixel map. The tail seed (value 2) is the accent "deploy node".
const Q_MAP = [
  0, 1, 1, 1, 0,
  1, 0, 0, 1, 0,
  1, 0, 0, 1, 0,
  1, 0, 0, 1, 0,
  0, 1, 1, 1, 0,
  0, 0, 0, 2, 0,
  0, 0, 0, 2, 2,
];
export function PixelQMark({ size = 28, fillInk = color.textLightHi, seed = color.accent }: { size?: number; fillInk?: string; seed?: string }) {
  const px: ReactNode[] = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      const v = Q_MAP[r * 5 + c];
      if (!v) continue;
      px.push(<rect key={`${r}-${c}`} x={c * 10} y={r * 10} width="10" height="10" fill={v === 2 ? seed : fillInk} />);
    }
  }
  return (
    <svg viewBox="0 0 50 70" width={size} height={size * 1.4} fill="none" style={{ shapeRendering: "crispEdges" }}>
      {px}
    </svg>
  );
}

// Inject once at app root — React inline styles can't declare @keyframes.
export const KEYFRAMES = `
@keyframes qblink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
@keyframes bob    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
@keyframes twk    { 0%,100%{transform:rotate(45deg) scale(1)} 50%{transform:rotate(45deg) scale(1.4)} }
@keyframes nodePulse { 0%,100%{opacity:.2} 50%{opacity:1} }
@keyframes voteIn { 0%,40%{opacity:.12} 55%,100%{opacity:1} }
`;

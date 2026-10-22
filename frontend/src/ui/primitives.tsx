import { color, font } from "./tokens";

// The qinit mark: a rounded tile with the q, the same mark the landing and the docs use.
export function QMark({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: color.textLightHi, color: color.void, fontFamily: font.mono, fontWeight: 900, fontSize: Math.round(size * 0.64), lineHeight: 1, display: "inline-grid", placeItems: "center", flex: "none" }}
    >
      q
    </span>
  );
}

// Inject once at app root — React inline styles can't declare @keyframes.
export const KEYFRAMES = `
@keyframes nodePulse { 0%,100%{opacity:.2} 50%{opacity:1} }
`;

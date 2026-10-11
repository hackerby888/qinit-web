// inline-style and label helpers shared by the shell and the panels it composes. the border and input
// styles are functions so a live theme swap (neo 3px ↔ flat 1px) takes effect on the next render.
import type { CSSProperties } from "react";
import { color, font, themeFlags } from "../ui/tokens";

// structural borders: 3px in neo, 1px in flat, read at render so a theme swap needs no reload.
export const frame = (): string => `${themeFlags.flat ? 1 : 3}px solid ${color.ink}`;
export const hair = (): string => `${themeFlags.flat ? 1 : 3}px solid ${color.hair}`;

// a box with a heavier left edge, one explicit border per side: mixing `border` with `borderLeftWidth` made React warn on every rerender.
export const edged = (edge: string, frameColor: string): CSSProperties => ({
  borderTop: `1px solid ${frameColor}`,
  borderRight: `1px solid ${frameColor}`,
  borderBottom: `1px solid ${frameColor}`,
  borderLeft: `3px solid ${edge}`,
});

export const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

export const fmtQus = (b?: string): string => (b === undefined ? "…" : BigInt(b).toLocaleString("en-US"));

export function infoPopoverStyle(width: number): CSSProperties {
  return {
    position: "absolute", zIndex: 200, top: "calc(100% + 9px)", right: 0, width,
    flexDirection: "column", gap: 7, padding: "11px 12px",
    border: `1px solid ${color.hair2}`, background: color.panelDeep, boxShadow: "0 10px 28px #0009",
    color: color.textMutedDk, fontFamily: font.mono, fontSize: 10.5, lineHeight: 1.45,
  };
}

// Built per render (a function, not a const) so a live theme swap recolors the input — the same reason
// the structural border helpers above are functions. Consumed by sibling components (CallRow, AccountsBar).
export const fieldInput = (): CSSProperties => ({
  flex: 1,
  minWidth: 0,
  background: color.void,
  border: `1px solid ${color.hair2}`,
  color: color.textLight,
  fontFamily: font.mono,
  fontSize: 11.5,
  padding: "4px 7px",
  outline: "none",
});

export const selectStyle = (): CSSProperties => ({
  flex: 1,
  minWidth: 0,
  background: color.void,
  color: color.textLight,
  border: `1px solid ${color.hair2}`,
  fontFamily: font.mono,
  fontSize: 11.5,
  padding: "4px 7px",
  outline: "none",
});

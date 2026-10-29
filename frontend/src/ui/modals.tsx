// Shared IDE chrome — the bordered card, the section header, and the compact control button. Tuned for a
// dense dark dashboard: static cards, hairline borders, no hover lift.
import { useState, type CSSProperties, type ReactNode } from "react";
import { color, font } from "./tokens";

// A bordered surface. `shadow` / `shadowColor` are accepted for the callers that still pass them and ignored.
export function Card({ children, frame = color.hair2, face = color.panel, borderWidth, style, faceStyle }: {
  children: ReactNode;
  frame?: string;
  face?: string;
  shadow?: number;
  shadowColor?: string;
  borderWidth?: number; // override the frame thickness; unset = 1px
  style?: CSSProperties;
  faceStyle?: CSSProperties;
}) {
  return <div style={{ border: `${borderWidth ?? 1}px solid ${frame}`, background: face, ...style, ...faceStyle }}>{children}</div>;
}

// Tile + label + a hairline rule filling the row — the IDE's recurring machine label.
export function SectionHead({ label, accent = color.accent, right }: { label: string; accent?: string; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 9, height: 9, flex: "none", background: accent }} />
      <span style={{ fontFamily: font.display, fontSize: 13, fontWeight: 600, letterSpacing: ".02em", color: color.textLightHi }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: color.hair }} />
      {right}
    </div>
  );
}

// A collapsible bordered section — the frame color is the section's identity; the header toggles it open.
// One consistent wrapper for the engine panel's sections (the inner panels render content only).
export function Section({ label, accent = color.accent, open, onToggle, right, borderWidth, children }: {
  label: string;
  accent?: string;
  open: boolean;
  onToggle: () => void;
  right?: ReactNode;
  borderWidth?: number;
  children: ReactNode;
}) {
  return (
    <Card frame={accent} borderWidth={borderWidth} faceStyle={{ display: "flex", flexDirection: "column" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer", userSelect: "none" }}>
        <span style={{ width: 9, height: 9, flex: "none", background: accent }} />
        <span style={{ fontFamily: font.display, fontSize: 13, fontWeight: 600, letterSpacing: ".02em", color: color.textLightHi }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: color.hair }} />
        {right && <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", flex: "none" }}>{right}</span>}
        <span style={{ flex: "none", color: color.textGhostDk, fontFamily: font.mono, fontSize: 11, width: 12, textAlign: "center" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && <div style={{ padding: "0 10px 10px" }}>{children}</div>}
    </Card>
  );
}

// Compact control button; `active` fills it with the accent, hovering lights its edge.
export function NeoBtn({ children, onClick, title, disabled = false, active = false, accent = color.accent }: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  accent?: string;
}) {
  const [hover, setHover] = useState(false);
  const lit = hover && !disabled && !active;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      disabled={disabled}
      style={{
        border: `1px solid ${active ? accent : lit ? color.textMutedDk : color.hair2}`,
        background: active ? accent : color.void,
        color: active ? color.void : disabled ? color.textFaintDk : lit ? color.textLightHi : color.textLight,
        fontFamily: font.mono,
        fontSize: 11,
        padding: "3px 8px",
        cursor: disabled ? "default" : "pointer",
        flex: "none",
      }}
    >
      {children}
    </button>
  );
}

// in-app confirm for a destructive action — the IDE's own look in place of the browser's window.confirm. Enter (the
// focused confirm button) confirms, Esc or a backdrop click cancels.
export function ConfirmModal({ message, confirmLabel = "Delete", onYes, onCancel }: { message: string; confirmLabel?: string; onYes: () => void; onCancel: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "#000000A0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <div
        role="alertdialog"
        aria-label={message}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") { onCancel(); } }}
        style={{ width: 330, maxWidth: "90%", background: color.panelDeep, border: `1px solid ${color.hair2}`, boxShadow: "6px 6px 0 #000", padding: 18, display: "flex", flexDirection: "column", gap: 16 }}
      >
        <span style={{ fontFamily: font.mono, fontSize: 13, color: color.textLight, lineHeight: 1.5 }}>{message}</span>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel} style={{ border: `1px solid ${color.hair2}`, background: "transparent", color: color.textLight, fontFamily: font.mono, fontSize: 12, padding: "6px 14px", cursor: "pointer" }}>Cancel</button>
          <button autoFocus onClick={onYes} style={{ border: "1px solid #f85149", background: "#f85149", color: color.void, fontFamily: font.mono, fontSize: 12, padding: "6px 14px", cursor: "pointer" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

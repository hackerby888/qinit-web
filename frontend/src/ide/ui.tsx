// Shared neo-brutalist IDE chrome — the bitten-corner card, the pixel section header, and the chunky
// pressable button. Same visual language as the landing (tokens.NOTCH + hardShadow), tuned for a dense
// dark dashboard: static cards (no hover lift), compact buttons.
import { useState, type CSSProperties, type ReactNode } from "react";
import { color, font, NOTCH, hardShadow } from "../landing/tokens";

export const clipNotch: CSSProperties = { clipPath: NOTCH, WebkitClipPath: NOTCH };

// A bitten-corner card (ink-ish frame wrapping a dark face) with a hard offset shadow.
export function Card({ children, frame = color.hair2, face = color.panel, shadow = 4, shadowColor = "#000000", style, faceStyle }: {
  children: ReactNode;
  frame?: string;
  face?: string;
  shadow?: number;
  shadowColor?: string;
  style?: CSSProperties;
  faceStyle?: CSSProperties;
}) {
  return (
    <div style={{ background: frame, padding: 2, ...clipNotch, filter: hardShadow(shadow, shadow, shadowColor), ...style }}>
      <div style={{ background: face, ...clipNotch, ...faceStyle }}>{children}</div>
    </div>
  );
}

// Accent tile + pixel-font label + a hairline rule filling the row — the IDE's recurring machine label.
export function SectionHead({ label, accent = color.accent, right }: { label: string; accent?: string; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 9, height: 9, flex: "none", background: accent }} />
      <span style={{ fontFamily: font.display, fontSize: 13, letterSpacing: ".02em", color: color.textLightHi }}>{label}</span>
      <span style={{ flex: 1, height: 2, background: color.hair }} />
      {right}
    </div>
  );
}

// Chunky control button that physically presses (its hard shadow collapses on click).
export function NeoBtn({ children, onClick, title, disabled = false, active = false, accent = color.accent }: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  accent?: string;
}) {
  const [press, setPress] = useState(false);
  const off = disabled ? 0 : press ? 0 : 2;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      onMouseLeave={() => setPress(false)}
      title={title}
      disabled={disabled}
      style={{
        border: `1px solid ${active ? accent : color.hair2}`,
        background: active ? accent : color.void,
        color: active ? color.void : disabled ? color.textFaintDk : color.textLight,
        fontFamily: font.mono,
        fontSize: 11,
        padding: "3px 8px",
        cursor: disabled ? "default" : "pointer",
        flex: "none",
        filter: `drop-shadow(${off}px ${off}px 0 ${active ? color.accentShadow : "#000"})`,
        transform: `translate(${2 - off}px,${2 - off}px)`,
        transition: "transform .08s steps(2), filter .08s steps(2)",
      }}
    >
      {children}
    </button>
  );
}

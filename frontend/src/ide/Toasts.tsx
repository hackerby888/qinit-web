// The on-screen toast stack — top-right, above everything. Subscribes to the global notify store. Errors
// stay long (10s) and are red; warnings/info fade faster. Each row owns its own auto-dismiss timer so a new
// toast doesn't reset the others. Click × to dismiss now.
import { useEffect, useState } from "react";
import { color, font } from "../landing/tokens";
import { subscribeToasts, dismissToast, type Toast, type ToastKind } from "./notify";

const KIND_COLOR: Record<ToastKind, string> = {
  error: "#FF8B7E",
  warn: color.yellow,
  info: color.accent,
};

const KIND_ICON: Record<ToastKind, string> = {
  error: "⊘",
  warn: "⚠",
  info: "ⓘ",
};

const TTL: Record<ToastKind, number> = {
  error: 10000,
  warn: 6000,
  info: 4000,
};

function ToastRow({ t }: { t: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(t.id), TTL[t.kind]);
    return () => clearTimeout(timer);
  }, [t.id, t.kind]);

  const c = KIND_COLOR[t.kind];
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 11px", background: color.panelDeep, border: `1px solid ${c}`, borderLeft: `4px solid ${c}`, boxShadow: "4px 4px 0 #000", fontFamily: font.mono, fontSize: 12, color: color.textLight, pointerEvents: "auto" }}>
      <span style={{ flex: "none", color: c, fontSize: 13, lineHeight: "16px" }}>{KIND_ICON[t.kind]}</span>
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.5, wordBreak: "break-word" }}>{t.message}</span>
      <button
        onClick={() => dismissToast(t.id)}
        title="Dismiss"
        style={{ flex: "none", border: "none", background: "transparent", color: color.textGhostDk, cursor: "pointer", fontFamily: font.mono, fontSize: 14, lineHeight: "16px", padding: 0 }}
      >
        ×
      </button>
    </div>
  );
}

export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div style={{ position: "fixed", top: 14, right: 14, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, width: 360, maxWidth: "90vw", pointerEvents: "none" }}>
      {toasts.map((t) => (
        <ToastRow key={t.id} t={t} />
      ))}
    </div>
  );
}

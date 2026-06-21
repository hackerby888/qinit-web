// Workspace-wide search overlay (Ctrl+Shift+F). Searches every file's in-memory source (plain or regex, case
// toggle), lists matches grouped by file, and jumps the editor to a result. Navigate with ↑/↓ + Enter (or
// click); mouse hover syncs the selection. Search state is owned by the parent so it persists across opens.
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { color, font } from "../landing/tokens";
import { searchWorkspace } from "./search";

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#000000A0",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: 70,
  zIndex: 200,
};

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{ width: 26, height: 24, flex: "none", border: `1px solid ${on ? color.accent : color.hair2}`, background: on ? color.accent : color.void, color: on ? color.void : color.textFaintDk, fontFamily: font.mono, fontSize: 11, cursor: "pointer" }}
    >
      {label}
    </button>
  );
}

export function SearchPanel({ files, query, caseSensitive, regex, onQuery, onCase, onRegex, onJump, onClose }: {
  files: { name: string; source: string }[];
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  onQuery: (v: string) => void;
  onCase: (v: boolean) => void;
  onRegex: (v: boolean) => void;
  onJump: (name: string, line: number, col: number) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selRef = useRef<HTMLButtonElement>(null);
  const [sel, setSel] = useState(0);

  const results = useMemo(() => searchWorkspace(files, query.trim(), { caseSensitive, regex }), [files, query, caseSensitive, regex]);
  const flat = useMemo(() => results.flatMap((r) => r.matches.map((m) => ({ name: r.name, line: m.line, col: m.col, preview: m.preview }))), [results]);
  const counts = useMemo(() => new Map(results.map((r) => [r.name, r.matches.length])), [results]);
  const total = flat.length;

  // Reset the highlight whenever the result set changes.
  useEffect(() => {
    setSel(0);
  }, [flat]);

  // Keep the highlighted row visible as it moves.
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // ↑/↓ move the selection, Enter jumps to it, Esc closes — handled on the panel so it works whatever has focus.
  const onPanelKey = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(flat.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flat[sel];
      if (it) {
        onJump(it.name, it.line, it.col);
      }
    }
  };

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} onKeyDown={onPanelKey} style={{ width: 560, maxWidth: "94%", maxHeight: "76vh", display: "flex", flexDirection: "column", background: color.panelDeep, border: `1px solid ${color.hair2}`, boxShadow: "6px 6px 0 #000" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderBottom: `1px solid ${color.hair}` }}>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk, flex: "none" }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="Search across files…"
            onChange={(e) => onQuery(e.target.value)}
            style={{ flex: 1, minWidth: 0, background: color.void, border: `1px solid ${color.hair2}`, color: color.textLight, fontFamily: font.mono, fontSize: 13, padding: "6px 8px", outline: "none" }}
          />
          <Toggle on={caseSensitive} label="Aa" onClick={() => onCase(!caseSensitive)} />
          <Toggle on={regex} label=".*" onClick={() => onRegex(!regex)} />
        </div>

        <div style={{ padding: "5px 12px", fontFamily: font.mono, fontSize: 10.5, color: color.textGhostDk, borderBottom: `1px solid ${color.hair}` }}>
          {query.trim() ? `${total} match${total === 1 ? "" : "es"} in ${results.length} file${results.length === 1 ? "" : "s"} · ↑↓ Enter` : "type to search the workspace"}
        </div>

        <div style={{ overflowY: "auto", minHeight: 0 }}>
          {flat.map((it, idx) => {
            const header = idx === 0 || flat[idx - 1].name !== it.name;
            const active = idx === sel;
            return (
              <Fragment key={idx}>
                {header && (
                  <div style={{ position: "sticky", top: 0, background: color.panel, padding: "5px 12px", fontFamily: font.mono, fontSize: 11.5, color: color.textLightHi, borderBottom: `1px solid ${color.hair}` }}>
                    <span style={{ color: color.accent }}>{it.name}</span> <span style={{ color: color.textGhostDk }}>· {counts.get(it.name)}</span>
                  </div>
                )}
                <button
                  ref={active ? selRef : undefined}
                  onClick={() => onJump(it.name, it.line, it.col)}
                  onMouseEnter={() => setSel(idx)}
                  style={{ display: "flex", gap: 10, width: "100%", border: "none", borderLeft: `2px solid ${active ? color.accent : "transparent"}`, borderBottom: `1px solid ${color.hair}`, background: active ? "#ffffff14" : "transparent", color: active ? color.textLightHi : color.textLight, fontFamily: font.mono, fontSize: 11.5, padding: "5px 12px 5px 18px", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ flex: "none", width: 44, color: color.textGhostDk }}>{it.line}:{it.col}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.preview}</span>
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

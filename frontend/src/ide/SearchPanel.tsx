// Workspace-wide search overlay (Ctrl+Shift+F). Searches every file's in-memory source (plain or regex,
// case toggle), lists matches grouped by file, and jumps the editor to a result on click.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { color, font } from "../landing/tokens";
import { searchWorkspace, type FileResult } from "./search";

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

export function SearchPanel({ files, onJump, onClose }: {
  files: { name: string; source: string }[];
  onJump: (name: string, line: number, col: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results: FileResult[] = useMemo(() => searchWorkspace(files, query.trim(), { caseSensitive, regex }), [files, query, caseSensitive, regex]);
  const total = results.reduce((n, r) => n + r.matches.length, 0);

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "94%", maxHeight: "76vh", display: "flex", flexDirection: "column", background: color.panelDeep, border: `1px solid ${color.hair2}`, boxShadow: "6px 6px 0 #000" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderBottom: `1px solid ${color.hair}` }}>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk, flex: "none" }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="Search across files…"
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 0, background: color.void, border: `1px solid ${color.hair2}`, color: color.textLight, fontFamily: font.mono, fontSize: 13, padding: "6px 8px", outline: "none" }}
          />
          <Toggle on={caseSensitive} label="Aa" onClick={() => setCaseSensitive((v) => !v)} />
          <Toggle on={regex} label=".*" onClick={() => setRegex((v) => !v)} />
        </div>

        <div style={{ padding: "5px 12px", fontFamily: font.mono, fontSize: 10.5, color: color.textGhostDk, borderBottom: `1px solid ${color.hair}` }}>
          {query.trim() ? `${total} match${total === 1 ? "" : "es"} in ${results.length} file${results.length === 1 ? "" : "s"}` : "type to search the workspace"}
        </div>

        <div style={{ overflowY: "auto", minHeight: 0 }}>
          {results.map((r) => (
            <div key={r.name}>
              <div style={{ position: "sticky", top: 0, background: color.panel, padding: "5px 12px", fontFamily: font.mono, fontSize: 11.5, color: color.textLightHi, borderBottom: `1px solid ${color.hair}` }}>
                <span style={{ color: color.accent }}>{r.name}</span> <span style={{ color: color.textGhostDk }}>· {r.matches.length}</span>
              </div>
              {r.matches.map((m, i) => (
                <button
                  key={i}
                  onClick={() => onJump(r.name, m.line, m.col)}
                  style={{ display: "flex", gap: 10, width: "100%", border: "none", borderBottom: `1px solid ${color.hair}`, background: "transparent", color: color.textLight, fontFamily: font.mono, fontSize: 11.5, padding: "5px 12px 5px 20px", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ flex: "none", width: 44, color: color.textGhostDk }}>{m.line}:{m.col}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.preview}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

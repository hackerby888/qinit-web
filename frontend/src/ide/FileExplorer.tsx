// Workspace file explorer: switch / create / rename / delete contract files. Create + rename use inline
// inputs (no blocking prompts); delete asks once. Names are normalised to a `.h` file.
import { useState, type CSSProperties } from "react";
import { color, font } from "../landing/tokens";
import type { WorkspaceFile } from "./workspace";

const HAIR = `3px solid ${color.hair}`;

const normalize = (raw: string): string => {
  const n = raw.trim().replace(/[^\w.\-]/g, "");
  if (!n) {
    return "";
  }
  return /\.[A-Za-z0-9]+$/.test(n) ? n : `${n}.h`;
};

const inlineInput: CSSProperties = {
  width: "calc(100% - 28px)",
  margin: "2px 14px",
  background: color.void,
  border: `1px solid ${color.accentDeep}`,
  color: color.textLight,
  fontFamily: font.mono,
  fontSize: 12,
  padding: "4px 7px",
  outline: "none",
};

const iconBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: color.textGhostDk,
  cursor: "pointer",
  fontFamily: font.mono,
  fontSize: 12,
  padding: "0 3px",
  lineHeight: 1,
};

export function FileExplorer({ files, active, onSelect, onCreate, onRename, onDelete }: {
  files: WorkspaceFile[];
  active: string;
  onSelect: (name: string) => void;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const taken = (n: string, except?: string) => files.some((f) => f.name === n && f.name !== except);

  const commitNew = () => {
    const n = normalize(draft);
    if (n && !taken(n)) {
      onCreate(n);
    }
    setAdding(false);
    setDraft("");
  };

  const commitRename = (old: string) => {
    const n = normalize(renameDraft);
    if (n && !taken(n, old) && n !== old) {
      onRename(old, n);
    }
    setRenaming(null);
  };

  const del = (name: string) => {
    if (window.confirm(`Delete ${name}?`)) {
      onDelete(name);
    }
  };

  return (
    <div style={{ borderRight: HAIR, background: color.panelDeep, padding: "14px 0", fontFamily: font.mono, fontSize: 12.5, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 10px" }}>
        <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
        <span style={{ fontFamily: font.display, fontSize: 13, letterSpacing: ".02em", color: color.textLightHi }}>EXPLORER</span>
        <button onClick={() => { setAdding(true); setDraft(""); }} title="New file" style={{ ...iconBtn, marginLeft: "auto", fontSize: 16, color: color.accent }}>+</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px", color: color.textMutedDk }}>
        <span style={{ width: 8, height: 8, background: color.textGhostDk, flex: "none" }} />my-contract
      </div>
      <div style={{ paddingLeft: 26, color: color.textGhostDk, fontSize: 11, paddingBottom: 2 }}>contracts</div>

      {files.map((f) => {
        if (renaming === f.name) {
          return (
            <input
              key={f.name}
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => commitRename(f.name)}
              onKeyDown={(e) => { if (e.key === "Enter") { commitRename(f.name); } if (e.key === "Escape") { setRenaming(null); } }}
              style={inlineInput}
            />
          );
        }
        const on = f.name === active;
        return (
          <div
            key={f.name}
            onClick={() => onSelect(f.name)}
            onDoubleClick={() => { setRenaming(f.name); setRenameDraft(f.name); }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 37px", cursor: "pointer", borderLeft: `3px solid ${on ? color.accent : "transparent"}`, background: on ? `${color.accent}1a` : "transparent", color: on ? color.accent : color.textMutedDk }}
          >
            <span style={{ width: 8, height: 8, background: on ? color.accent : color.textGhostDk, flex: "none" }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            <button onClick={(e) => { e.stopPropagation(); setRenaming(f.name); setRenameDraft(f.name); }} title="Rename" style={iconBtn}>✎</button>
            {files.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); del(f.name); }} title="Delete" style={iconBtn}>×</button>
            )}
          </div>
        );
      })}

      {adding && (
        <input
          autoFocus
          value={draft}
          placeholder="NewContract.h"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitNew}
          onKeyDown={(e) => { if (e.key === "Enter") { commitNew(); } if (e.key === "Escape") { setAdding(false); } }}
          style={inlineInput}
        />
      )}
    </div>
  );
}

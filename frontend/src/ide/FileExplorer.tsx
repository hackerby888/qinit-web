// Workspace file explorer: switch / create / rename / delete files and folders. Create + rename use inline
// inputs (no blocking prompts); delete asks via an in-app confirm. Names are normalised to a `.h` file;
// folders are virtual (a path prefix), with a hidden `.keep` placeholder holding empty ones open.
import { useState, type CSSProperties, type ReactElement } from "react";
import { color, font, themeFlags } from "../landing/tokens";
import { PixelQMark } from "../landing/components";
import type { WorkspaceFile } from "./workspace";
import { buildFileTree, normalizePath, normalizeDir, fileLabel, KEEP_FILE, type TreeNode } from "./filetree";
import { parseOutline } from "./outline";

export function FileExplorer({ files, active, source, onSelect, onCreate, onRename, onDelete, onCreateFolder, onDeleteFolder, onJump }: {
  files: WorkspaceFile[];
  active: string;
  source: string;
  onSelect: (name: string) => void;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onCreateFolder: (dir: string) => void;
  onDeleteFolder: (dir: string) => void;
  onJump: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [addPrefix, setAddPrefix] = useState(""); // folder the new file lands in ("" = root)
  const [draft, setDraft] = useState("");
  const [mkdir, setMkdir] = useState(false);
  const [dirDraft, setDirDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ message: string; onYes: () => void } | null>(null);

  // Built per render so a live theme swap recolors the explorer (and thins the divider in flat).
  const HAIR = `${themeFlags.flat ? 1 : 3}px solid ${color.hair}`;

  // Inline rename / new-name field. Sits inside a flex row (so flex:1 fills horizontally, not vertically) with
  // a fixed height — otherwise, as a direct child of the column it stretches to fill and looks oversized.
  const inlineInput: CSSProperties = {
    flex: 1,
    minWidth: 0,
    height: 23,
    boxSizing: "border-box",
    background: color.void,
    border: `1px solid ${color.accentDeep}`,
    color: color.textLight,
    fontFamily: font.mono,
    fontSize: 12,
    padding: "0 7px",
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

  const taken = (n: string, except?: string) => files.some((f) => f.name === n && f.name !== except);

  const startAdd = (prefix: string) => {
    setMkdir(false);
    setAddPrefix(prefix);
    setAdding(true);
    setDraft("");
  };

  const commitNew = () => {
    const n = normalizePath(addPrefix ? `${addPrefix}/${draft}` : draft);
    if (n && !taken(n)) {
      onCreate(n);
    }
    setAdding(false);
    setDraft("");
  };

  const startMkdir = () => {
    setAdding(false);
    setMkdir(true);
    setDirDraft("");
  };

  const commitDir = () => {
    const d = normalizeDir(dirDraft);
    if (d && !files.some((f) => f.name === `${d}/${KEEP_FILE}` || f.name.startsWith(`${d}/`))) {
      onCreateFolder(d);
    }
    setMkdir(false);
    setDirDraft("");
  };

  const commitRename = (old: string) => {
    const n = normalizePath(renameDraft);
    if (n && !taken(n, old) && n !== old) {
      onRename(old, n);
    }
    setRenaming(null);
  };

  // Real files under a folder (the `.keep` placeholder doesn't count) — for the delete-folder confirm message.
  const filesUnder = (dir: string): number =>
    files.filter((f) => f.name.startsWith(`${dir}/`) && fileLabel(f.name) !== KEEP_FILE).length;

  const del = (name: string) => {
    setConfirm({ message: `Delete ${name}?`, onYes: () => onDelete(name) });
  };

  const delFolder = (dir: string) => {
    const n = filesUnder(dir);
    const message = n > 0 ? `Delete folder "${dir}" and its ${n} file${n === 1 ? "" : "s"}?` : `Delete empty folder "${dir}"?`;
    setConfirm({ message, onYes: () => onDeleteFolder(dir) });
  };

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const tree = buildFileTree(files.map((f) => f.name));
  const indent = (depth: number): number => 14 + depth * 14;

  // A naming input wrapped in a fixed-height row so it aligns with file rows and never stretches vertically.
  const inputRow = (key: string, depth: number, node: ReactElement): ReactElement => (
    <div key={key} style={{ display: "flex", padding: "1px 14px 1px 0", paddingLeft: indent(depth) + 9 }}>
      {node}
    </div>
  );

  const addInput = (
    <input
      autoFocus
      value={draft}
      placeholder="NewContract.h"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitNew}
      onKeyDown={(e) => { if (e.key === "Enter") { commitNew(); } if (e.key === "Escape") { setAdding(false); } }}
      style={inlineInput}
    />
  );

  const dirInput = (
    <input
      autoFocus
      value={dirDraft}
      placeholder="folder-name"
      onChange={(e) => setDirDraft(e.target.value)}
      onBlur={commitDir}
      onKeyDown={(e) => { if (e.key === "Enter") { commitDir(); } if (e.key === "Escape") { setMkdir(false); } }}
      style={inlineInput}
    />
  );

  // Folders render before files (buildFileTree sorts that way); each level indents one more step. Rename and
  // the per-folder "new file" input slot into their position in the tree so they read in place.
  const renderNodes = (nodes: TreeNode[], depth: number): ReactElement[] =>
    nodes.flatMap((node): ReactElement[] => {
      if (node.kind === "dir") {
        const open = !collapsed.has(node.path);
        return [
          <div
            key={`d:${node.path}`}
            onClick={() => toggle(node.path)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", paddingLeft: indent(depth), cursor: "pointer", color: color.textMutedDk }}
          >
            <span style={{ width: 10, flex: "none", color: color.textGhostDk, fontSize: 10 }}>{open ? "▾" : "▸"}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label}</span>
            <button onClick={(e) => { e.stopPropagation(); if (!open) { toggle(node.path); } startAdd(node.path); }} title={`New file in ${node.path}`} style={iconBtn}>+</button>
            {files.some((f) => !f.name.startsWith(`${node.path}/`)) && (
              <button onClick={(e) => { e.stopPropagation(); delFolder(node.path); }} title={`Delete folder ${node.path}`} style={iconBtn}>×</button>
            )}
          </div>,
          ...(open ? renderNodes(node.children, depth + 1) : []),
          ...(open && adding && addPrefix === node.path
            ? [inputRow(`a:${node.path}`, depth + 1, addInput)]
            : []),
        ];
      }

      if (renaming === node.path) {
        return [
          inputRow(`r:${node.path}`, depth, (
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => commitRename(node.path)}
              onKeyDown={(e) => { if (e.key === "Enter") { commitRename(node.path); } if (e.key === "Escape") { setRenaming(null); } }}
              style={inlineInput}
            />
          )),
        ];
      }

      const on = node.path === active;
      return [
        <div
          key={`f:${node.path}`}
          onClick={() => onSelect(node.path)}
          onDoubleClick={() => { setRenaming(node.path); setRenameDraft(node.path); }}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", paddingLeft: indent(depth) + 9, cursor: "pointer", borderLeft: `3px solid ${on ? color.accent : "transparent"}`, background: on ? `${color.accent}1a` : "transparent", color: on ? color.accent : color.textMutedDk }}
        >
          <span style={{ width: 8, height: 8, background: on ? color.accent : color.textGhostDk, flex: "none" }} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label}</span>
          <button onClick={(e) => { e.stopPropagation(); setRenaming(node.path); setRenameDraft(node.path); }} title="Rename" style={iconBtn}>✎</button>
          {files.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); del(node.path); }} title="Delete" style={iconBtn}>×</button>
          )}
        </div>,
      ];
    });

  return (
    <div style={{ borderRight: HAIR, background: color.panelDeep, fontFamily: font.mono, fontSize: 12.5, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 0", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 10px" }}>
        <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
        <span style={{ fontFamily: font.display, fontSize: 13, letterSpacing: ".02em", color: color.textLightHi }}>EXPLORER</span>
        <button onClick={startMkdir} title="New folder" style={{ ...iconBtn, marginLeft: "auto", fontSize: 14, color: color.accent }}>⊞</button>
        <button onClick={() => startAdd("")} title="New file" style={{ ...iconBtn, fontSize: 16, color: color.accent }}>+</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 6px", color: color.textMutedDk }}>
        <span style={{ width: 8, height: 8, background: color.textGhostDk, flex: "none" }} />my-contract
      </div>

      {mkdir && inputRow("mkdir", 0, dirInput)}
      {renderNodes(tree, 0)}
      {adding && addPrefix === "" && inputRow("add-root", 0, addInput)}

      <Outline source={source} onJump={onJump} />
      </div>

      <AdSlot />

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onYes={() => { confirm.onYes(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// In-app delete confirm — replaces the browser's window.confirm so it matches the IDE's look. Enter (the
// focused Delete button) confirms, Esc or a backdrop click cancels.
function ConfirmDialog({ message, onYes, onCancel }: { message: string; onYes: () => void; onCancel: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "#000000A0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") { onCancel(); } }}
        style={{ width: 330, maxWidth: "90%", background: color.panelDeep, border: `1px solid ${color.hair2}`, boxShadow: "6px 6px 0 #000", padding: 18, display: "flex", flexDirection: "column", gap: 16 }}
      >
        <span style={{ fontFamily: font.mono, fontSize: 13, color: color.textLight, lineHeight: 1.5 }}>{message}</span>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel} style={{ border: `1px solid ${color.hair2}`, background: "transparent", color: color.textLight, fontFamily: font.mono, fontSize: 12, padding: "6px 14px", cursor: "pointer" }}>Cancel</button>
          <button autoFocus onClick={onYes} style={{ border: "1px solid #ff6b6b", background: "#ff6b6b", color: color.void, fontFamily: font.mono, fontSize: 12, padding: "6px 14px", cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// The active contract's symbol tree (StateData fields, functions, procedures) — click a symbol to jump to
// its declaration in the editor. Parsed from the live buffer, so it updates as you type.
function Outline({ source, onJump }: { source: string; onJump: (name: string) => void }) {
  const ol = parseOutline(source);
  const groups: { label: string; dot: string; names: string[] }[] = [
    { label: "STATE", dot: color.secondary, names: ol.state },
    { label: "FUNCTIONS", dot: color.accent, names: ol.functions },
    { label: "PROCEDURES", dot: color.yellow, names: ol.procedures },
  ];

  if (!ol.state.length && !ol.functions.length && !ol.procedures.length) {
    return null;
  }

  return (
    <div style={{ marginTop: 14, borderTop: `${themeFlags.flat ? 1 : 2}px solid ${color.hair}`, paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 6px" }}>
        <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
        <span style={{ fontFamily: font.display, fontSize: 13, letterSpacing: ".02em", color: color.textLightHi }}>OUTLINE</span>
      </div>

      {groups.map((g) =>
        g.names.length === 0 ? null : (
          <div key={g.label} style={{ paddingBottom: 4 }}>
            <div style={{ paddingLeft: 14, color: color.textGhostDk, fontSize: 10.5, letterSpacing: ".08em", paddingBottom: 2 }}>{g.label}</div>
            {g.names.map((name) => (
              <div
                key={g.label + name}
                onClick={() => onJump(name)}
                title={`Jump to ${name}`}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 10px 3px 26px", cursor: "pointer", color: color.textMutedDk }}
              >
                <span style={{ width: 6, height: 6, flex: "none", background: g.dot }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// Reserved sponsor slot pinned at the bottom of the explorer — a square placement. Placeholder for now:
// the Qubic mark + wordmark; later this becomes a real ad unit.
function AdSlot() {
  return (
    <div style={{ flex: "none", borderTop: `${themeFlags.flat ? 1 : 2}px solid ${color.hair}`, padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: font.mono, fontSize: 8.5, letterSpacing: ".18em", color: color.textGhostDk }}>SPONSORED</span>
      <a
        href="https://qubic.org"
        target="_blank"
        rel="noreferrer"
        title="Qubic"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, width: "66%", alignSelf: "center", aspectRatio: "1 / 1", border: `1px solid ${color.hair2}`, background: color.void, textDecoration: "none" }}
      >
        <PixelQMark size={30} />
        <span style={{ fontFamily: font.display, fontSize: 14, letterSpacing: ".02em", color: color.textLightHi }}>Qubic</span>
      </a>
    </div>
  );
}

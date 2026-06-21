// Workspace file explorer: switch / create / rename / delete files and folders. Create + rename use inline
// inputs (no blocking prompts); delete asks via an in-app confirm. Names are normalised to a `.h` file;
// folders are virtual (a path prefix), with a hidden `.keep` placeholder holding empty ones open.
import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type MouseEvent as ReactMouseEvent } from "react";
import { color, font, themeFlags } from "../landing/tokens";
import { PixelQMark } from "../landing/components";
import type { WorkspaceFile } from "./workspace";
import { buildFileTree, normalizePath, normalizeDir, fileLabel, dirOf, KEEP_FILE, type TreeNode } from "./filetree";
import { parseOutline } from "./outline";

interface MenuItem {
  label?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  sep?: boolean;
}

export function FileExplorer({ files, active, source, onSelect, onCreate, onRename, onDelete, onCreateFolder, onDeleteFolder, onRenameFolder, onDuplicate, onJump }: {
  files: WorkspaceFile[];
  active: string;
  source: string;
  onSelect: (name: string) => void;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onCreateFolder: (dir: string) => void;
  onDeleteFolder: (dir: string) => void;
  onRenameFolder: (oldDir: string, newDir: string) => void;
  onDuplicate: (name: string) => void;
  onJump: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [addPrefix, setAddPrefix] = useState(""); // folder the new file lands in ("" = root)
  const [draft, setDraft] = useState("");
  const [mkdir, setMkdir] = useState(false);
  const [mkdirPrefix, setMkdirPrefix] = useState(""); // parent folder the new folder lands in ("" = root)
  const [dirDraft, setDirDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingDir, setRenamingDir] = useState<string | null>(null);
  const [renameDirDraft, setRenameDirDraft] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ message: string; onYes: () => void } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [contextDir, setContextDir] = useState(""); // where the toolbar New File/Folder lands (selected folder; "" = root)
  const [hover, setHover] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // folder currently under a dragged file

  // Built per render so a live theme swap recolors the explorer (and thins the divider in flat).
  const HAIR = `${themeFlags.flat ? 1 : 3}px solid ${color.hair}`;
  const HOVER = "#ffffff10";
  const DROP = `${color.accent}33`;

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

  // Move a dragged file into a folder ("" = root) by renaming it to the new path. No-op on collision or self.
  const moveTo = (path: string, targetDir: string) => {
    const dest = targetDir ? `${targetDir}/${fileLabel(path)}` : fileLabel(path);
    if (dest !== path && !taken(dest)) {
      onRename(path, dest);
    }
  };

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

  const startMkdir = (prefix: string) => {
    setAdding(false);
    setMkdirPrefix(prefix);
    setMkdir(true);
    setDirDraft("");
  };

  const commitDir = () => {
    const seg = normalizeDir(dirDraft);
    const full = mkdirPrefix ? `${mkdirPrefix}/${seg}` : seg;
    if (seg && !files.some((f) => f.name === `${full}/${KEEP_FILE}` || f.name.startsWith(`${full}/`))) {
      onCreateFolder(full);
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

  const startRenameDir = (dir: string) => {
    setRenamingDir(dir);
    setRenameDirDraft(fileLabel(dir)); // edit just the last segment, like VSCode
  };

  const commitRenameDir = (oldDir: string) => {
    const seg = normalizeDir(renameDirDraft);
    const parent = dirOf(oldDir);
    const full = parent ? `${parent}/${seg}` : seg;
    if (seg && full !== oldDir && !files.some((f) => f.name.startsWith(`${full}/`))) {
      onRenameFolder(oldDir, full);
    }
    setRenamingDir(null);
  };

  const expand = (path: string) => {
    setCollapsed((prev) => {
      if (!prev.has(path)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
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

  // Right-click menus (VSCode-style). Items reuse the same actions as the toolbar/inline affordances.
  const openMenu = (e: ReactMouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const fileMenu = (path: string): MenuItem[] => [
    { label: "Open", onClick: () => onSelect(path) },
    { label: "Rename", onClick: () => { setRenaming(path); setRenameDraft(path); } },
    { label: "Duplicate", onClick: () => onDuplicate(path) },
    { label: "Copy Path", onClick: () => void navigator.clipboard.writeText(path) },
    { sep: true },
    { label: "New File…", onClick: () => startAdd(dirOf(path)) },
    { label: "New Folder…", onClick: () => startMkdir(dirOf(path)) },
    { sep: true },
    { label: "Delete", danger: true, disabled: files.length <= 1, onClick: () => del(path) },
  ];

  const dirMenu = (dir: string): MenuItem[] => [
    { label: "New File…", onClick: () => { expand(dir); startAdd(dir); } },
    { label: "New Folder…", onClick: () => { expand(dir); startMkdir(dir); } },
    { sep: true },
    { label: "Rename", onClick: () => startRenameDir(dir) },
    { label: "Delete", danger: true, disabled: !files.some((f) => !f.name.startsWith(`${dir}/`)), onClick: () => delFolder(dir) },
    { sep: true },
    { label: collapsed.has(dir) ? "Expand" : "Collapse", onClick: () => toggle(dir) },
  ];

  const rootMenu = (): MenuItem[] => [
    { label: "New File…", onClick: () => startAdd("") },
    { label: "New Folder…", onClick: () => startMkdir("") },
  ];

  // Folders render before files (buildFileTree sorts that way); each level indents one more step. Rename and
  // the per-folder "new file" input slot into their position in the tree so they read in place.
  const renderNodes = (nodes: TreeNode[], depth: number): ReactElement[] =>
    nodes.flatMap((node): ReactElement[] => {
      if (node.kind === "dir") {
        const open = !collapsed.has(node.path);
        const header = renamingDir === node.path
          ? inputRow(`rd:${node.path}`, depth, (
              <input
                autoFocus
                value={renameDirDraft}
                onChange={(e) => setRenameDirDraft(e.target.value)}
                onBlur={() => commitRenameDir(node.path)}
                onKeyDown={(e) => { if (e.key === "Enter") { commitRenameDir(node.path); } if (e.key === "Escape") { setRenamingDir(null); } }}
                style={inlineInput}
              />
            ))
          : (
            <div
              key={`d:${node.path}`}
              onClick={() => { setContextDir(node.path); toggle(node.path); }}
              onContextMenu={(e) => openMenu(e, dirMenu(node.path))}
              onMouseEnter={() => setHover(node.path)}
              onMouseLeave={() => setHover((h) => (h === node.path ? null : h))}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(node.path); }}
              onDragLeave={() => setDragOver((d) => (d === node.path ? null : d))}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const p = e.dataTransfer.getData("text/plain"); if (p) { moveTo(p, node.path); } setDragOver(null); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", paddingLeft: indent(depth), cursor: "pointer", color: color.textMutedDk, background: dragOver === node.path ? DROP : hover === node.path ? HOVER : "transparent" }}
            >
              <span style={{ width: 10, flex: "none", color: color.textGhostDk, fontSize: 10 }}>{open ? "▾" : "▸"}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label}</span>
              {hover === node.path && (
                <button onClick={(e) => { e.stopPropagation(); if (!open) { toggle(node.path); } startAdd(node.path); }} title={`New file in ${node.path}`} style={iconBtn}>+</button>
              )}
              {hover === node.path && (
                <button onClick={(e) => { e.stopPropagation(); if (!open) { toggle(node.path); } startMkdir(node.path); }} title={`New folder in ${node.path}`} style={{ ...iconBtn, fontSize: 11 }}>⊞</button>
              )}
              {hover === node.path && files.some((f) => !f.name.startsWith(`${node.path}/`)) && (
                <button onClick={(e) => { e.stopPropagation(); delFolder(node.path); }} title={`Delete folder ${node.path}`} style={iconBtn}>×</button>
              )}
            </div>
          );
        return [
          header,
          ...(open ? renderNodes(node.children, depth + 1) : []),
          ...(open && adding && addPrefix === node.path
            ? [inputRow(`a:${node.path}`, depth + 1, addInput)]
            : []),
          ...(open && mkdir && mkdirPrefix === node.path
            ? [inputRow(`m:${node.path}`, depth + 1, dirInput)]
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
          draggable
          onDragStart={(e) => { e.dataTransfer.setData("text/plain", node.path); e.dataTransfer.effectAllowed = "move"; }}
          onClick={() => { setContextDir(dirOf(node.path)); onSelect(node.path); }}
          onDoubleClick={() => { setRenaming(node.path); setRenameDraft(node.path); }}
          onContextMenu={(e) => openMenu(e, fileMenu(node.path))}
          onMouseEnter={() => setHover(node.path)}
          onMouseLeave={() => setHover((h) => (h === node.path ? null : h))}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", paddingLeft: indent(depth) + 9, cursor: "pointer", borderLeft: `3px solid ${on ? color.accent : "transparent"}`, background: on ? `${color.accent}1a` : hover === node.path ? HOVER : "transparent", color: on ? color.accent : color.textMutedDk }}
        >
          <span style={{ width: 8, height: 8, background: on ? color.accent : color.textGhostDk, flex: "none" }} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label}</span>
          {(on || hover === node.path) && (
            <button onClick={(e) => { e.stopPropagation(); setRenaming(node.path); setRenameDraft(node.path); }} title="Rename" style={iconBtn}>✎</button>
          )}
          {(on || hover === node.path) && files.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); del(node.path); }} title="Delete" style={iconBtn}>×</button>
          )}
        </div>,
      ];
    });

  return (
    <div style={{ borderRight: HAIR, background: color.panelDeep, fontFamily: font.mono, fontSize: 12.5, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        onContextMenu={(e) => openMenu(e, rootMenu())}
        onClick={(e) => { if (e.target === e.currentTarget) { setContextDir(""); } }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => { e.preventDefault(); const p = e.dataTransfer.getData("text/plain"); if (p) { moveTo(p, ""); } setDragOver(null); }}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 0", display: "flex", flexDirection: "column" }}
      >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 10px" }}>
        <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
        <span style={{ fontFamily: font.display, fontSize: 13, letterSpacing: ".02em", color: color.textLightHi }}>EXPLORER</span>
        <button onClick={() => { expand(contextDir); startMkdir(contextDir); }} title={`New folder in ${contextDir || "root"}`} style={{ ...iconBtn, marginLeft: "auto", fontSize: 14, color: color.accent }}>⊞</button>
        <button onClick={() => { expand(contextDir); startAdd(contextDir); }} title={`New file in ${contextDir || "root"}`} style={{ ...iconBtn, fontSize: 16, color: color.accent }}>+</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 6px", color: color.textMutedDk }}>
        <span style={{ width: 8, height: 8, background: color.textGhostDk, flex: "none" }} />my-contract
      </div>

      {mkdir && mkdirPrefix === "" && inputRow("mkdir", 0, dirInput)}
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

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

// VSCode-style right-click menu. Renders at the cursor (clamped to the viewport), closes on item click, an
// outside click, scroll, or Escape.
function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const left = Math.min(x, window.innerWidth - r.width - 6);
      const top = Math.min(y, window.innerHeight - r.height - 6);
      setPos({ left: Math.max(6, left), top: Math.max(6, top) });
    }

    const close = () => onClose();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [x, y, onClose]);

  return (
    <div onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 400 }}>
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", left: pos.left, top: pos.top, minWidth: 180, background: color.panelDeep, border: `1px solid ${color.hair2}`, boxShadow: "5px 5px 0 #000", padding: "4px 0", fontFamily: font.mono, fontSize: 12.5 }}
      >
        {items.map((it, i) =>
          it.sep ? (
            <div key={`s${i}`} style={{ height: 1, background: color.hair, margin: "4px 0" }} />
          ) : (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={() => { if (!it.disabled) { it.onClick?.(); onClose(); } }}
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: it.disabled ? color.textGhostDk : it.danger ? "#ff6b6b" : color.textLight, fontFamily: font.mono, fontSize: 12.5, padding: "5px 14px", cursor: it.disabled ? "default" : "pointer", opacity: it.disabled ? 0.5 : 1 }}
              onMouseEnter={(e) => { if (!it.disabled) { e.currentTarget.style.background = "#ffffff12"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {it.label}
            </button>
          ),
        )}
      </div>
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
    // Stop the explorer's right-click menu from firing over the outline — these are symbols, not files.
    <div onContextMenu={(e) => e.stopPropagation()} style={{ marginTop: 14, borderTop: `${themeFlags.flat ? 1 : 2}px solid ${color.hair}`, paddingTop: 10 }}>
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

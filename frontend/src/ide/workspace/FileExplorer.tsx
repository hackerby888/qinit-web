// Workspace file explorer: switch / create / rename / delete files and folders. Create + rename use inline
// inputs (no blocking prompts); delete asks via an in-app confirm. Names are normalised to a `.h` file;
// folders are virtual (a path prefix), with a hidden `.keep` placeholder holding empty ones open.
import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type MouseEvent as ReactMouseEvent } from "react";
import { Crosshair, ChevronsDownUp, ChevronRight, ChevronDown, Folder, FolderOpen, FolderPlus, FileCode, FilePlus, Pencil, Trash2 } from "lucide-react";
import { color, font } from "../../ui/tokens";
import { QMark } from "../../ui/primitives";
import type { WorkspaceFile } from "./workspace";
import { ConfirmModal } from "../../ui/modals";
import { buildFileTree, newFileName, normalizeDir, fileLabel, dirOf, KEEP_FILE, type TreeNode } from "./filetree";
import { parseOutline } from "./outline";

interface MenuItem {
  label?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  sep?: boolean;
}

export function FileExplorer({ files, active, source, newFileSignal, projectName, onSelect, onCreate, onRename, onDelete, onCreateFolder, onDeleteFolder, onRenameFolder, onDuplicate, onMovePaths, onCopyPaths, onDeletePaths, onJump }: {
  files: WorkspaceFile[];
  active: string;
  source: string;
  // bumped by the shell to open the new-file input from outside (the command palette's "New file…").
  newFileSignal?: number;
  projectName?: string;
  onSelect: (name: string) => void;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onCreateFolder: (dir: string) => void;
  onDeleteFolder: (dir: string) => void;
  onRenameFolder: (oldDir: string, newDir: string) => void;
  onDuplicate: (name: string) => void;
  onMovePaths: (paths: string[], targetDir: string) => void;
  onCopyPaths: (paths: string[], targetDir: string) => void;
  onDeletePaths: (paths: string[]) => void;
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
  const [dragOver, setDragOver] = useState<string | null>(null); // folder currently under a drag ("" = root)
  const [notice, setNotice] = useState(""); // transient "already exists" / "moved as …" message
  const [revealSeq, setRevealSeq] = useState(0); // bump to scroll the active file into view
  const [selected, setSelected] = useState<Set<string>>(new Set()); // multi-select (ctrl/shift click)
  const [anchor, setAnchor] = useState<string | null>(null); // shift-range anchor
  const [clip, setClip] = useState<{ paths: string[]; mode: "copy" | "cut" } | null>(null);
  const dragItem = useRef<string[]>([]); // paths being dragged (the selection, or just the grabbed row)
  const activeRowRef = useRef<HTMLDivElement>(null);

  // Auto-clear the notice a few seconds after it appears.
  useEffect(() => {
    if (!notice) {
      return;
    }
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // Scroll the active file into view after a "reveal" (its ancestors were expanded in the same tick).
  useEffect(() => {
    if (revealSeq > 0) {
      activeRowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [revealSeq]);

  // Built per render so a live theme swap recolors the explorer (and thins the divider in flat).
  const HAIR = `1px solid ${color.hair}`;
  const HOVER = "#ffffff10";
  const SEL = "#ffffff1f"; // multi-select highlight
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
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: color.textGhostDk,
    cursor: "pointer",
    fontFamily: font.mono,
    fontSize: 12,
    padding: "0 3px",
    lineHeight: 1,
  };


  // The flat, render-order list of visible rows (respecting collapse) — used for shift-range selection.
  const visibleOrder = (): string[] => {
    const out: string[] = [];
    const walk = (nodes: TreeNode[]): void => {
      for (const n of nodes) {
        out.push(n.path);
        if (n.kind === "dir" && !collapsed.has(n.path)) {
          walk(n.children);
        }
      }
    };
    walk(buildFileTree(files.map((f) => f.name)));
    return out;
  };

  // Row click with selection semantics: shift = range from the anchor, ctrl/cmd = toggle, plain = single
  // select (and open a file / toggle a folder).
  const rowClick = (node: TreeNode, e: ReactMouseEvent): void => {
    const path = node.path;
    if (e.shiftKey && anchor) {
      const order = visibleOrder();
      const a = order.indexOf(anchor);
      const b = order.indexOf(path);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected(new Set(order.slice(lo, hi + 1)));
      }
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(path) ? next.delete(path) : next.add(path);
        return next;
      });
      setAnchor(path);
      return;
    }

    setSelected(new Set([path]));
    setAnchor(path);
    setContextDir(node.kind === "dir" ? path : dirOf(path));
    if (node.kind === "dir") {
      toggle(path);
    } else {
      onSelect(path);
    }
  };

  // Begin a drag: carry the whole selection if the grabbed row is part of it, else just that row.
  const startRowDrag = (path: string, dt: DataTransfer): void => {
    if (!selected.has(path)) {
      setSelected(new Set([path]));
      setAnchor(path);
    }
    dragItem.current = selected.has(path) && selected.size > 1 ? [...selected] : [path];
    dt.setData("text/plain", path);
    dt.effectAllowed = "move";
  };

  const handleDrop = (targetDir: string): void => {
    const paths = dragItem.current;
    dragItem.current = [];
    setDragOver(null);
    if (paths.length > 0) {
      onMovePaths(paths, targetDir);
    }
  };

  // The paths a context action applies to: the multi-selection if the row is part of it, else just the row.
  const actionPaths = (path: string): string[] => (selected.has(path) && selected.size > 1 ? [...selected] : [path]);

  const doCopy = (path: string): void => {
    setClip({ paths: actionPaths(path), mode: "copy" });
  };

  const doCut = (path: string): void => {
    setClip({ paths: actionPaths(path), mode: "cut" });
  };

  const doPaste = (targetDir: string): void => {
    if (!clip) {
      return;
    }
    if (clip.mode === "copy") {
      onCopyPaths(clip.paths, targetDir);
    } else {
      onMovePaths(clip.paths, targetDir);
      setClip(null);
    }
    setSelected(new Set());
  };

  const doDelete = (path: string): void => {
    const paths = actionPaths(path);
    const label = paths.length > 1 ? `${paths.length} items` : paths[0];
    setConfirm({ message: `Delete ${label}?`, onYes: () => { onDeletePaths(paths); setSelected(new Set()); } });
  };

  const startAdd = (prefix: string) => {
    setNotice("");
    setMkdir(false);
    setAddPrefix(prefix);
    setAdding(true);
    setDraft("");
  };

  // Typed create/rename: on a name clash, show a notice and keep the input open (return false) so the user can
  // fix it; an empty name just cancels. Drag-moves auto-suffix instead (moveTo / moveDir).
  const commitNew = (): boolean => {
    if (!draft.trim()) {
      setAdding(false);
      setDraft("");
      return true;
    }
    const named = newFileName(addPrefix ? `${addPrefix}/${draft}` : draft, files.map((f) => f.name));
    if (named.error) {
      setNotice(named.error);
      return false;
    }
    setNotice(named.note ?? "");
    onCreate(named.path);
    setAdding(false);
    setDraft("");
    return true;
  };

  // the shell asks for a new file (command palette): open the same input the toolbar button opens.
  useEffect(() => {
    if (newFileSignal) {
      startAdd("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on the signal alone
  }, [newFileSignal]);

  const startMkdir = (prefix: string) => {
    setNotice("");
    setAdding(false);
    setMkdirPrefix(prefix);
    setMkdir(true);
    setDirDraft("");
  };

  const commitDir = (): boolean => {
    const seg = normalizeDir(dirDraft);
    const full = mkdirPrefix ? `${mkdirPrefix}/${seg}` : seg;
    if (!seg) {
      setMkdir(false);
      setDirDraft("");
      return true;
    }
    if (files.some((f) => f.name === `${full}/${KEEP_FILE}` || f.name.startsWith(`${full}/`))) {
      setNotice(`folder "${fileLabel(full)}" already exists`);
      return false;
    }
    onCreateFolder(full);
    setMkdir(false);
    setDirDraft("");
    return true;
  };

  const commitRename = (old: string): boolean => {
    if (!renameDraft.trim()) {
      setRenaming(null);
      return true;
    }
    const named = newFileName(renameDraft, files.map((f) => f.name), old);
    if (named.path === old) {
      setRenaming(null);
      return true;
    }
    if (named.error) {
      setNotice(named.error);
      return false;
    }
    setNotice(named.note ?? "");
    onRename(old, named.path);
    setRenaming(null);
    return true;
  };

  const startRenameDir = (dir: string) => {
    setNotice("");
    setRenamingDir(dir);
    setRenameDirDraft(fileLabel(dir)); // edit just the last segment, like VSCode
  };

  const commitRenameDir = (oldDir: string): boolean => {
    const seg = normalizeDir(renameDirDraft);
    const parent = dirOf(oldDir);
    const full = parent ? `${parent}/${seg}` : seg;
    if (!seg || full === oldDir) {
      setRenamingDir(null);
      return true;
    }
    if (files.some((f) => f.name.startsWith(`${full}/`))) {
      setNotice(`folder "${fileLabel(full)}" already exists`);
      return false;
    }
    onRenameFolder(oldDir, full);
    setRenamingDir(null);
    return true;
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

  // Every folder path the workspace contains (each dir prefix of every file).
  const folderPaths = (): string[] => {
    const dirs = new Set<string>();
    for (const f of files) {
      const parts = f.name.split("/");
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join("/"));
      }
    }
    return [...dirs];
  };

  // Collapse every folder; if everything is already collapsed, expand all instead (one toggle button).
  const collapseAll = () => {
    const all = folderPaths();
    setCollapsed((prev) => (all.every((d) => prev.has(d)) ? new Set() : new Set(all)));
  };

  // Expand the active file's ancestors and scroll it into view.
  const revealActive = () => {
    const parts = active.split("/");
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (let i = 1; i < parts.length; i++) {
        next.delete(parts.slice(0, i).join("/"));
      }
      return next;
    });
    setRevealSeq((s) => s + 1);
  };

  const tree = buildFileTree(files.map((f) => f.name));

  // Tree indentation + VSCode-style indent guides. Each row sits at PAD0 + depth*STEP; a faint vertical line
  // is drawn at each ancestor level so the nesting is traceable (the active file's own branch turns accent).
  const STEP = 16;
  const PAD0 = 12;
  const GUIDE = color.hair;
  const rowPad = (depth: number): number => PAD0 + depth * STEP;
  const guideLines = (depth: number, active: boolean): ReactElement[] =>
    Array.from({ length: depth }, (_, i) => (
      <span
        key={`g${i}`}
        style={{ position: "absolute", left: PAD0 + i * STEP + 7, top: 0, bottom: 0, width: 1, background: active && i === depth - 1 ? color.accent : GUIDE, pointerEvents: "none" }}
      />
    ));

  // A naming input wrapped in a fixed-height row so it aligns with file rows and never stretches vertically.
  const inputRow = (key: string, depth: number, node: ReactElement): ReactElement => (
    <div key={key} style={{ display: "flex", padding: "1px 14px 1px 0", paddingLeft: rowPad(depth) + 16 }}>
      {node}
    </div>
  );

  const addInput = (
    <input
      autoFocus
      value={draft}
      placeholder="NewContract.h"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (!commitNew()) { setAdding(false); setDraft(""); } }}
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
      onBlur={() => { if (!commitDir()) { setMkdir(false); setDirDraft(""); } }}
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

  const fileMenu = (path: string): MenuItem[] => {
    const multi = selected.has(path) && selected.size > 1;
    if (multi) {
      return [
        { label: "Cut", onClick: () => doCut(path) },
        { label: "Copy", onClick: () => doCopy(path) },
        { sep: true },
        { label: `Delete ${selected.size} items`, danger: true, onClick: () => doDelete(path) },
      ];
    }
    return [
      { label: "Open", onClick: () => onSelect(path) },
      { label: "Rename", onClick: () => { setRenaming(path); setRenameDraft(path); } },
      { label: "Duplicate", onClick: () => onDuplicate(path) },
      { sep: true },
      { label: "Cut", onClick: () => doCut(path) },
      { label: "Copy", onClick: () => doCopy(path) },
      { label: "Copy Path", onClick: () => void navigator.clipboard.writeText(path) },
      { sep: true },
      { label: "New File…", onClick: () => startAdd(dirOf(path)) },
      { label: "New Folder…", onClick: () => startMkdir(dirOf(path)) },
      { sep: true },
      { label: "Delete", danger: true, disabled: files.length <= 1, onClick: () => doDelete(path) },
    ];
  };

  const dirMenu = (dir: string): MenuItem[] => {
    const multi = selected.has(dir) && selected.size > 1;
    if (multi) {
      return [
        { label: "Cut", onClick: () => doCut(dir) },
        { label: "Copy", onClick: () => doCopy(dir) },
        { label: "Paste", disabled: !clip, onClick: () => doPaste(dir) },
        { sep: true },
        { label: `Delete ${selected.size} items`, danger: true, onClick: () => doDelete(dir) },
      ];
    }
    return [
      { label: "New File…", onClick: () => { expand(dir); startAdd(dir); } },
      { label: "New Folder…", onClick: () => { expand(dir); startMkdir(dir); } },
      { sep: true },
      { label: "Cut", onClick: () => doCut(dir) },
      { label: "Copy", onClick: () => doCopy(dir) },
      { label: "Paste", disabled: !clip, onClick: () => doPaste(dir) },
      { sep: true },
      { label: "Rename", onClick: () => startRenameDir(dir) },
      { label: "Delete", danger: true, disabled: !files.some((f) => !f.name.startsWith(`${dir}/`)), onClick: () => doDelete(dir) },
      { sep: true },
      { label: collapsed.has(dir) ? "Expand" : "Collapse", onClick: () => toggle(dir) },
    ];
  };

  const rootMenu = (): MenuItem[] => [
    { label: "New File…", onClick: () => startAdd("") },
    { label: "New Folder…", onClick: () => startMkdir("") },
    { sep: true },
    { label: "Paste", disabled: !clip, onClick: () => doPaste("") },
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
                onBlur={() => { if (!commitRenameDir(node.path)) { setRenamingDir(null); } }}
                onKeyDown={(e) => { if (e.key === "Enter") { commitRenameDir(node.path); } if (e.key === "Escape") { setRenamingDir(null); } }}
                style={inlineInput}
              />
            ))
          : (
            <div
              key={`d:${node.path}`}
              draggable
              onDragStart={(e) => startRowDrag(node.path, e.dataTransfer)}
              onClick={(e) => rowClick(node, e)}
              onContextMenu={(e) => openMenu(e, dirMenu(node.path))}
              onMouseEnter={() => setHover(node.path)}
              onMouseLeave={() => setHover((h) => (h === node.path ? null : h))}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(node.path); }}
              onDragLeave={() => setDragOver((d) => (d === node.path ? null : d))}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(node.path); }}
              style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", paddingLeft: rowPad(depth), cursor: "pointer", opacity: clip?.mode === "cut" && clip.paths.includes(node.path) ? 0.5 : 1, color: color.textMutedDk, background: dragOver === node.path ? DROP : selected.has(node.path) ? SEL : hover === node.path ? HOVER : "transparent" }}
            >
              {guideLines(depth, false)}
              <span style={{ width: 12, flex: "none", display: "inline-flex", alignItems: "center", color: color.textGhostDk }}>{open ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronRight size={12} strokeWidth={2} />}</span>
              <span style={{ flex: "none", display: "inline-flex", alignItems: "center", color: hover === node.path ? color.action : color.textGhostDk }}>{open ? <FolderOpen size={14} strokeWidth={2} /> : <Folder size={14} strokeWidth={2} />}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label}</span>
              {hover === node.path && (
                <button onClick={(e) => { e.stopPropagation(); if (!open) { toggle(node.path); } startAdd(node.path); }} title={`New file in ${node.path}`} style={iconBtn}><FilePlus size={13} strokeWidth={2} /></button>
              )}
              {hover === node.path && (
                <button onClick={(e) => { e.stopPropagation(); if (!open) { toggle(node.path); } startMkdir(node.path); }} title={`New folder in ${node.path}`} style={iconBtn}><FolderPlus size={13} strokeWidth={2} /></button>
              )}
              {hover === node.path && files.some((f) => !f.name.startsWith(`${node.path}/`)) && (
                <button onClick={(e) => { e.stopPropagation(); delFolder(node.path); }} title={`Delete folder ${node.path}`} style={iconBtn}><Trash2 size={13} strokeWidth={2} /></button>
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
              onBlur={() => { if (!commitRename(node.path)) { setRenaming(null); } }}
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
          ref={on ? activeRowRef : undefined}
          draggable
          onDragStart={(e) => startRowDrag(node.path, e.dataTransfer)}
          onClick={(e) => rowClick(node, e)}
          onDoubleClick={() => { setRenaming(node.path); setRenameDraft(node.path); }}
          onContextMenu={(e) => openMenu(e, fileMenu(node.path))}
          onMouseEnter={() => setHover(node.path)}
          onMouseLeave={() => setHover((h) => (h === node.path ? null : h))}
          style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", paddingLeft: rowPad(depth), cursor: "pointer", opacity: clip?.mode === "cut" && clip.paths.includes(node.path) ? 0.5 : 1, borderLeft: `3px solid ${on ? color.accent : "transparent"}`, background: on ? `${color.accent}1a` : selected.has(node.path) ? SEL : hover === node.path ? HOVER : "transparent", color: on ? color.accent : color.textMutedDk }}
        >
          {guideLines(depth, on)}
          <span style={{ width: 10, flex: "none" }} />
          <span style={{ flex: "none", display: "inline-flex", alignItems: "center", color: on ? color.accent : color.textGhostDk }}><FileCode size={14} strokeWidth={2} /></span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label}</span>
          {(on || hover === node.path) && (
            <button onClick={(e) => { e.stopPropagation(); setRenaming(node.path); setRenameDraft(node.path); }} title="Rename" style={iconBtn}><Pencil size={13} strokeWidth={2} /></button>
          )}
          {(on || hover === node.path) && files.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); del(node.path); }} title="Delete" style={iconBtn}><Trash2 size={13} strokeWidth={2} /></button>
          )}
        </div>,
      ];
    });

  return (
    <div style={{ borderRight: HAIR, background: color.panelDeep, fontFamily: font.mono, fontSize: 12.5, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        onContextMenu={(e) => openMenu(e, rootMenu())}
        onClick={(e) => { if (e.target === e.currentTarget) { setContextDir(""); setSelected(new Set()); } }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => { e.preventDefault(); handleDrop(""); }}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 0", display: "flex", flexDirection: "column" }}
      >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 10px" }}>
        <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
        <span style={{ fontFamily: font.display, fontSize: 13, letterSpacing: ".02em", color: color.textLightHi }}>EXPLORER</span>
        <button onClick={revealActive} title="Reveal active file" style={{ ...iconBtn, marginLeft: "auto" }}><Crosshair size={14} strokeWidth={2} /></button>
        <button onClick={collapseAll} title="Collapse all folders" style={iconBtn}><ChevronsDownUp size={14} strokeWidth={2} /></button>
        <button onClick={() => { expand(contextDir); startMkdir(contextDir); }} title={`New folder in ${contextDir || "root"}`} style={{ ...iconBtn, color: color.accent }}><FolderPlus size={15} strokeWidth={2} /></button>
        <button onClick={() => { expand(contextDir); startAdd(contextDir); }} title={`New file in ${contextDir || "root"}`} style={{ ...iconBtn, color: color.accent }}><FilePlus size={15} strokeWidth={2} /></button>
      </div>

      {notice && (
        <div style={{ padding: "0 14px 8px", color: "#f85149", fontFamily: font.mono, fontSize: 10.5, lineHeight: 1.4 }}>{notice}</div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(""); }}
        onDragLeave={() => setDragOver((d) => (d === "" ? null : d))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(""); }}
        title="Drop here to move to the project root"
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 6px", color: color.textMutedDk, background: dragOver === "" ? DROP : "transparent" }}
      >
        <span style={{ width: 8, height: 8, background: color.textGhostDk, flex: "none" }} />{projectName || "project"}
      </div>

      {mkdir && mkdirPrefix === "" && inputRow("mkdir", 0, dirInput)}
      {renderNodes(tree, 0)}
      {adding && addPrefix === "" && inputRow("add-root", 0, addInput)}

      <Outline source={source} onJump={onJump} />
      </div>

      {SHOW_SPONSOR_SLOT && <AdSlot />}

      {confirm && (
        <ConfirmModal
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
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: it.disabled ? color.textGhostDk : it.danger ? "#f85149" : color.textLight, fontFamily: font.mono, fontSize: 12.5, padding: "5px 14px", cursor: it.disabled ? "default" : "pointer", opacity: it.disabled ? 0.5 : 1 }}
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
    <div onContextMenu={(e) => e.stopPropagation()} style={{ marginTop: 14, borderTop: `1px solid ${color.hair}`, paddingTop: 10 }}>
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
// the Qubic mark + wordmark; later this becomes a real ad unit. Hidden until there is a real placement.
const SHOW_SPONSOR_SLOT: boolean = false;

function AdSlot() {
  return (
    <div style={{ flex: "none", borderTop: `1px solid ${color.hair}`, padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: font.mono, fontSize: 8.5, letterSpacing: ".18em", color: color.textGhostDk }}>SPONSORED</span>
      <a
        href="https://qubic.org"
        target="_blank"
        rel="noreferrer"
        title="Qubic"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, width: "66%", alignSelf: "center", aspectRatio: "1 / 1", border: `1px solid ${color.hair2}`, background: color.void, textDecoration: "none" }}
      >
        <QMark size={30} />
        <span style={{ fontFamily: font.display, fontSize: 14, letterSpacing: ".02em", color: color.textLightHi }}>Qubic</span>
      </a>
    </div>
  );
}

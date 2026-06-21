// Folder support for the workspace. Files stay a flat list keyed by `name`, but a `/` in the name marks a
// folder path (e.g. "lib/utils.h" lives in folder "lib"). These pure helpers derive the nested tree the
// explorer renders, label a path, and normalise a typed path so it can't escape the workspace. Keeping the
// data model flat means search, collab, persistence, and the engine keep working unchanged — only the
// explorer (and tab labels) need to understand the path.

export interface TreeFile {
  kind: "file";
  label: string; // last segment, e.g. "utils.h"
  path: string; // full name/key, e.g. "lib/utils.h"
}

export interface TreeDir {
  kind: "dir";
  label: string; // folder segment, e.g. "lib"
  path: string; // full folder path, e.g. "lib" or "lib/net"
  children: TreeNode[];
}

export type TreeNode = TreeFile | TreeDir;

// A hidden, empty placeholder file that keeps an otherwise-empty folder on disk (folders are virtual, derived
// from paths — a folder with no files would simply vanish). Never shown in the tree.
export const KEEP_FILE = ".keep";

// The display label of a path — the segment after the final slash.
export const fileLabel = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

// The folder a path lives in ("" for a root-level file).
export const dirOf = (path: string): string => {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
};

// Sanitise a typed folder path — same per-segment cleaning and traversal guards as a file path, but without
// forcing an extension (folders have none). Returns "" when nothing usable remains.
export function normalizeDir(raw: string): string {
  return raw
    .split("/")
    .map((s) => s.trim().replace(/[^\w.\-]/g, ""))
    .filter((s) => s.length > 0 && s !== "." && s !== "..")
    .join("/");
}

// Sanitise a typed path into a safe workspace key: clean each segment (only word chars, dot, hyphen), drop
// empty / "." / ".." segments so a path can't traverse out, and default the filename to a `.h` extension.
// Returns "" when nothing usable remains.
export function normalizePath(raw: string): string {
  const segments = raw
    .split("/")
    .map((s) => s.trim().replace(/[^\w.\-]/g, ""))
    .filter((s) => s.length > 0 && s !== "." && s !== "..");
  if (segments.length === 0) {
    return "";
  }

  const last = segments[segments.length - 1];
  segments[segments.length - 1] = /\.[A-Za-z0-9]+$/.test(last) ? last : `${last}.h`;
  return segments.join("/");
}

// Build the nested tree from a flat list of paths. Folders sort before files, both alphabetically, at every
// level. Empty / duplicate segments are ignored so a malformed name can't break the render.
export function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeDir = { kind: "dir", label: "", path: "", children: [] };

  for (const path of paths) {
    const parts = path.split("/").filter((p) => p.length > 0);
    if (parts.length === 0) {
      continue;
    }

    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      const sub = dir.path ? `${dir.path}/${seg}` : seg;
      let child = dir.children.find((c): c is TreeDir => c.kind === "dir" && c.label === seg);
      if (!child) {
        child = { kind: "dir", label: seg, path: sub, children: [] };
        dir.children.push(child);
      }
      dir = child;
    }

    const label = parts[parts.length - 1];
    if (label === KEEP_FILE) {
      continue; // structural placeholder that keeps an otherwise-empty folder visible; its dir already exists
    }
    if (!dir.children.some((c) => c.kind === "file" && c.path === path)) {
      dir.children.push({ kind: "file", label, path });
    }
  }

  sortNodes(root.children);
  return root.children;
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "dir" ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
  });

  for (const n of nodes) {
    if (n.kind === "dir") {
      sortNodes(n.children);
    }
  }
}

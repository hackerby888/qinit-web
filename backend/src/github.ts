// GitHub integration. Two operations, both proxied server-side (to attach a User-Agent, dodge browser CORS,
// and keep our limits in one place):
//   - import: pull a *public* repo's source files into the workspace. Unauthenticated — subject to GitHub's
//     anonymous rate limit unless a server-side GITHUB_TOKEN is configured to raise it.
//   - export: write the workspace to a Gist using a *user-supplied* personal access token. The token is read
//     from the request body, used once, and never stored or logged.
import type { Request, Response } from "express";
import { log } from "./log";

const API = "https://api.github.com";
const UA = "qinit-web";

const MAX_FILES = 100;
const MAX_FILE_BYTES = 256 * 1024; // 256 KB per file
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB per import

const TEXT_EXT = new Set(["h", "hpp", "cpp", "cc", "cxx", "c", "ts", "tsx", "js", "jsx", "mjs", "json", "md", "txt"]);

export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string; // branch / tag / commit; resolved to the default branch when absent
  subdir: string; // "" = repo root
}

export interface ImportedFile {
  name: string;
  source: string;
}

// Parse the many shapes a user might paste: "owner/repo", "owner/repo/sub/dir", "owner/repo@ref", a full
// github.com URL, or a ".../tree/<ref>/<subdir>" browse URL. Returns null when it isn't an owner/repo pair.
export function parseRepoRef(raw: string): RepoRef | null {
  let s = raw.trim();
  if (!s) {
    return null;
  }

  s = s.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");

  const tree = s.match(/^([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.*))?$/);
  if (tree) {
    return { owner: tree[1], repo: tree[2], ref: tree[3], subdir: (tree[4] ?? "").replace(/\/+$/, "") };
  }

  let ref: string | undefined;
  const at = s.match(/@([^/@]+)$/);
  if (at) {
    ref = at[1];
    s = s.slice(0, s.length - at[0].length);
  }

  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const [owner, repo, ...rest] = parts;
  return { owner, repo, ref, subdir: rest.join("/") };
}

// Only pull files we can sensibly show in the editor — skip binaries, images, lockfiles, etc.
export function isTextFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) {
    return false;
  }
  return TEXT_EXT.has(path.slice(dot + 1).toLowerCase());
}

// Strip the chosen subdir prefix so imported files land relative to it ("src/lib/a.h" under subdir "src"
// becomes "lib/a.h"). Returns null for paths outside the subdir.
export function relativeName(path: string, subdir: string): string | null {
  if (!subdir) {
    return path;
  }
  const prefix = `${subdir.replace(/\/+$/, "")}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

async function ghJson(url: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { "User-Agent": UA, Accept: "application/vnd.github+json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const r = await fetch(url, { headers });
  if (!r.ok) {
    if (r.status === 404) {
      throw new Error("repository, branch, or path not found");
    }
    if (r.status === 403) {
      throw new Error("GitHub rate limit reached — try again later");
    }
    throw new Error(`GitHub request failed (${r.status})`);
  }
  return r.json();
}

// Resolve the files under a repo (optionally a subdir/ref) into {name, source} pairs, honouring the size and
// count caps. Uses the git-trees API (one request for the whole tree) then fetches each text blob.
export async function fetchRepoFiles(ref: RepoRef): Promise<ImportedFile[]> {
  const token = process.env.GITHUB_TOKEN; // optional server token, only to raise the anon rate limit
  const base = `${API}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;

  let branch = ref.ref;
  if (!branch) {
    const meta = (await ghJson(base, token)) as { default_branch?: string };
    branch = meta.default_branch ?? "main";
  }

  const tree = (await ghJson(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token)) as {
    tree?: { path: string; type: string; size?: number; sha: string }[];
    truncated?: boolean;
  };

  const blobs = (tree.tree ?? []).filter(
    (e) => e.type === "blob" && isTextFile(e.path) && relativeName(e.path, ref.subdir) !== null && (e.size ?? 0) <= MAX_FILE_BYTES,
  );

  if (blobs.length === 0) {
    throw new Error("no importable source files found in that repo/path");
  }

  const picked = blobs.slice(0, MAX_FILES);
  const out: ImportedFile[] = [];
  let total = 0;

  for (const b of picked) {
    const blob = (await ghJson(`${base}/git/blobs/${b.sha}`, token)) as { content?: string; encoding?: string };
    const source = blob.encoding === "base64" && blob.content ? Buffer.from(blob.content, "base64").toString("utf8") : (blob.content ?? "");

    total += Buffer.byteLength(source);
    if (total > MAX_TOTAL_BYTES) {
      break;
    }

    out.push({ name: relativeName(b.path, ref.subdir) as string, source });
  }

  return out;
}

// Create a Gist from the workspace files. Gists are flat, so folder paths are flattened ("lib/a.h" ->
// "lib__a.h"). The PAT needs the `gist` scope.
export async function createGist(token: string, files: ImportedFile[], description: string, isPublic: boolean): Promise<{ url: string; id: string }> {
  const gistFiles: Record<string, { content: string }> = {};
  for (const f of files) {
    const key = (f.name || "file").replace(/\//g, "__");
    gistFiles[key] = { content: f.source.length > 0 ? f.source : " " }; // gist rejects empty content
  }

  const r = await fetch(`${API}/gists`, {
    method: "POST",
    headers: { "User-Agent": UA, Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ description, public: isPublic, files: gistFiles }),
  });

  if (!r.ok) {
    if (r.status === 401) {
      throw new Error("invalid GitHub token");
    }
    if (r.status === 403) {
      throw new Error("token is missing the 'gist' scope");
    }
    throw new Error(`GitHub request failed (${r.status})`);
  }

  const g = (await r.json()) as { html_url?: string; id?: string };
  return { url: g.html_url ?? "", id: g.id ?? "" };
}

// POST /api/github/import { ref } -> { files }. Public repos only; no GitHub auth from the user.
export async function importRepo(req: Request, res: Response): Promise<void> {
  const raw = (req.body as { ref?: unknown })?.ref;
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "missing repo reference" });
    return;
  }

  const ref = parseRepoRef(raw);
  if (!ref) {
    res.status(400).json({ error: "expected owner/repo (optionally /subdir or @ref)" });
    return;
  }

  const files = await fetchRepoFiles(ref);
  log.info("github import", { owner: ref.owner, repo: ref.repo, files: files.length });
  res.json({ files });
}

// POST /api/github/gist { token, files, description, public } -> { url, id }. Token used once, never stored.
export async function exportGist(req: Request, res: Response): Promise<void> {
  const body = req.body as { token?: unknown; files?: unknown; description?: unknown; public?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const files = Array.isArray(body.files) ? (body.files as ImportedFile[]).filter((f) => f && typeof f.name === "string" && typeof f.source === "string") : [];

  if (!token) {
    res.status(400).json({ error: "missing GitHub token" });
    return;
  }
  if (files.length === 0) {
    res.status(400).json({ error: "no files to export" });
    return;
  }

  const description = typeof body.description === "string" ? body.description.slice(0, 200) : "Qubic contract — exported from qinit";
  const result = await createGist(token, files, description, body.public === true);
  log.info("github gist export", { files: files.length, id: result.id });
  res.json(result);
}

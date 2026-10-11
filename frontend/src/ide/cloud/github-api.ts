// GitHub import/export client. Both endpoints are owner-authed (the server proxies the GitHub API). On
// failure we surface the server's `error` message verbatim (e.g. "repository not found") rather than a bare
// status, so the dialog can show something actionable.
import { authHeaders, handleUnauthorized } from "./auth";

export interface RepoFile {
  name: string;
  source: string;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    if (r.status === 401) {
      handleUnauthorized();
    }
    let msg = `${r.status} ${r.statusText}`;
    try {
      const j = (await r.json()) as { error?: string };
      if (j?.error) {
        msg = j.error;
      }
    } catch {
      // non-JSON error body — keep the status line
    }
    throw new Error(msg);
  }

  return (await r.json()) as T;
}

// Pull a public repo's source files. `ref` accepts owner/repo, owner/repo/subdir, owner/repo@branch, or a
// github.com URL.
export function importRepo(ref: string): Promise<{ files: RepoFile[] }> {
  return call("/api/github/import", { ref });
}

// Write the given files to a new Gist using the user's personal access token (gist scope). The token is sent
// once and never stored server-side.
export function exportGist(input: { token: string; files: RepoFile[]; description: string; public: boolean }): Promise<{ url: string; id: string }> {
  return call("/api/github/gist", input);
}

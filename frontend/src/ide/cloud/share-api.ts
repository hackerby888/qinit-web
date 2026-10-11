// Share-link API: owner-authed create/list/revoke, plus a public resolve for opening a link. Mirrors the
// cloud-store fetch style (authHeaders + 401 → handleUnauthorized).
import { authHeaders, handleUnauthorized } from "./auth";

export type ShareMode = "view" | "edit";

export interface ShareLink {
  linkId: string;
  mode: ShareMode;
  url: string; // path "/ide/s/<linkId>"
  createdAt?: number;
  expiresAt?: number;
}

export interface ResolvedShare {
  mode: ShareMode;
  name: string;
  room: string;
  files?: { name: string; source: string }[]; // present for view links (read-only snapshot)
}

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (!r.ok) {
    if (r.status === 401) {
      handleUnauthorized();
    }
    throw new Error(`share API ${r.status} ${r.statusText}`);
  }
  return r;
}

export async function createShareLink(projectId: string, mode: ShareMode, ttlMs?: number): Promise<ShareLink> {
  const r = await authed(`/api/projects/${projectId}/share`, { method: "POST", body: JSON.stringify({ mode, ttlMs }) });
  return (await r.json()) as ShareLink;
}

export async function listShareLinks(projectId: string): Promise<ShareLink[]> {
  const r = await authed(`/api/projects/${projectId}/shares`);
  return (await r.json()) as ShareLink[];
}

export async function revokeShareLink(projectId: string, linkId: string): Promise<void> {
  await authed(`/api/projects/${projectId}/share/${linkId}`, { method: "DELETE" });
}

// Public — no auth. Returns null if the link is missing/expired or the request fails (never throws).
export async function resolveShare(linkId: string): Promise<ResolvedShare | null> {
  try {
    const r = await fetch(`/api/s/${linkId}`);
    if (!r.ok) {
      return null;
    }
    return (await r.json()) as ResolvedShare;
  } catch {
    return null;
  }
}

export function shareUrlFor(linkId: string): string {
  return `${location.origin}/ide/s/${linkId}`;
}

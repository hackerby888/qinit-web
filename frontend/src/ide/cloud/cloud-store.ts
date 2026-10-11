// Cloud project storage — the same ProjectStore interface over the backend's /api/projects (per-account,
// Bearer-authed). The server owns persistence; the client owns the document shape. The "current project id"
// stays a client-side UI pref (which project to reopen), so no extra endpoint is needed.
import type { WorkspaceFile } from "../workspace/workspace";
import { EXAMPLES } from "../workspace/examples";
import { PROJECT_SCHEMA_VERSION, type Project, type ProjectMeta } from "../projects/types";
import type { ProjectStore } from "../projects/store";
import { authHeaders, handleUnauthorized } from "./auth";

const CURRENT_KEY = "ide.project.current";
const uid = (): string => Math.random().toString(36).slice(2, 10);
const now = (): number => Date.now();

function seedFor(name: string, seedFiles?: WorkspaceFile[]): Project {
  const files: WorkspaceFile[] = seedFiles?.length ? seedFiles : EXAMPLES.map((e) => ({ name: e.file, source: e.source }));
  return {
    id: uid(),
    name,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    createdAt: now(),
    updatedAt: now(),
    files,
    active: files[0]?.name ?? "Counter.h",
    openTabs: files[0] ? [files[0].name] : [],
    scenarios: [],
  };
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`/api/projects${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (!r.ok) {
    if (r.status === 401) {
      handleUnauthorized();
    }
    throw new Error(`projects API ${r.status} ${r.statusText}`);
  }
  return r;
}

export class CloudProjectStore implements ProjectStore {
  async list(): Promise<ProjectMeta[]> {
    return (await (await req("")).json()) as ProjectMeta[];
  }

  async load(id: string): Promise<Project | null> {
    const r = await fetch(`/api/projects/${id}`, { headers: authHeaders() });
    if (!r.ok) {
      return null;
    }
    return (await r.json()) as Project;
  }

  async save(p: Project): Promise<void> {
    p.updatedAt = now();
    await req(`/${p.id}`, { method: "PUT", body: JSON.stringify(p) });
  }

  async create(name: string, seedFiles?: WorkspaceFile[]): Promise<Project> {
    const p = seedFor(name, seedFiles);
    await this.save(p);
    await this.setCurrentId(p.id);
    return p;
  }

  async rename(id: string, name: string): Promise<void> {
    const p = await this.load(id);
    if (!p) {
      return;
    }
    p.name = name;
    await this.save(p);
  }

  async remove(id: string): Promise<void> {
    await req(`/${id}`, { method: "DELETE" });
  }

  async duplicate(id: string, name?: string): Promise<Project> {
    const p = await this.load(id);
    if (!p) {
      throw new Error("project not found");
    }
    const copy: Project = { ...p, id: uid(), name: name ?? `${p.name} copy`, createdAt: now(), updatedAt: now() };
    await this.save(copy);
    return copy;
  }

  // Synced per account so another device reopens the same project; localStorage is a cache/offline fallback.
  async getCurrentId(): Promise<string | null> {
    try {
      const r = await fetch("/api/projects/current", { headers: authHeaders() });
      if (r.ok) {
        const j = (await r.json()) as { id?: string | null };
        if (j.id) {
          localStorage.setItem(CURRENT_KEY, j.id);
          return j.id;
        }
      }
    } catch {
      // offline — fall back to the local cache below
    }
    return localStorage.getItem(CURRENT_KEY);
  }

  async setCurrentId(id: string): Promise<void> {
    localStorage.setItem(CURRENT_KEY, id);
    try {
      await req("/current", { method: "PUT", body: JSON.stringify({ id }) });
    } catch {
      // best-effort sync; the local cache already holds it
    }
  }
}

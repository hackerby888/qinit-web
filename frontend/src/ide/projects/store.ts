// Project persistence behind one async interface. The IDE only ever talks to `ProjectStore`, so the local
// backend here can later be swapped for a cloud one (REST over the existing Mongo backend, `/api/projects`)
// with zero changes at the call sites — the methods are already async and modelled document-per-project.
import type { WorkspaceFile } from "../workspace/workspace";
import { EXAMPLES } from "../workspace/examples";
import type { Scenario } from "../calls/scenarios";
import { PROJECT_SCHEMA_VERSION, metaOf, type Project, type ProjectMeta } from "./types";
import { getToken } from "../cloud/auth";
import { CloudProjectStore } from "../cloud/cloud-store";

const INDEX_KEY = "ide.projects.index";
const CURRENT_KEY = "ide.project.current";
const PROJECT_PREFIX = "ide.project.";
const projectKey = (id: string): string => `${PROJECT_PREFIX}${id}`;

// the storage key a project lives under, for a tab that watches it change in another tab.
export const projectStorageKey = projectKey;

// a save was refused because the stored project is newer than the copy being saved: another tab wrote it.
// Saving anyway would silently drop that tab's work; `stored` is what it wrote.
export class StaleProjectError extends Error {
  constructor(readonly stored: Project) {
    super("this project was changed in another tab");
    this.name = "StaleProjectError";
  }
}

// Legacy single-workspace keys — migrated into a default project the first time the gallery loads.
const LEGACY_WS = "qinit-ide-workspace.v1";
const LEGACY_SCENARIOS = "ide.scenarios.v1";
const LEGACY_TABS = "ide.openTabs";

const uid = (): string => Math.random().toString(36).slice(2, 10);
const now = (): number => Date.now();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export interface ProjectStore {
  list(): Promise<ProjectMeta[]>;
  load(id: string): Promise<Project | null>;
  save(p: Project): Promise<void>;
  create(name: string, seedFiles?: WorkspaceFile[]): Promise<Project>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  duplicate(id: string, name?: string): Promise<Project>;
  getCurrentId(): Promise<string | null>;
  setCurrentId(id: string): Promise<void>;
}

// A new project's starter contracts — the example set (Counter, Adder, Bank, Token).
function seedFor(name: string): Project {
  const files: WorkspaceFile[] = EXAMPLES.map((e) => ({ name: e.file, source: e.source }));
  return {
    id: uid(),
    name,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    createdAt: now(),
    updatedAt: now(),
    files,
    active: files[0].name,
    openTabs: [files[0].name],
    scenarios: [],
  };
}

class LocalProjectStore implements ProjectStore {
  private readIndex(): ProjectMeta[] {
    try {
      const a = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
      if (Array.isArray(a)) {
        return a as ProjectMeta[];
      }
    } catch {
      // damaged — rebuilt below
    }
    return this.rebuildIndex();
  }

  // the index is derived: every row comes from a project record. A damaged index once showed "0 projects" over records that were all still there.
  private rebuildIndex(): ProjectMeta[] {
    const metas: ProjectMeta[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PROJECT_PREFIX) || key === CURRENT_KEY) {
        continue;
      }
      try {
        const p = JSON.parse(localStorage.getItem(key) ?? "") as Project;
        if (p && typeof p.id === "string" && Array.isArray(p.files)) {
          metas.push(metaOf(p));
        }
      } catch {
        // an unreadable record is not a project
      }
    }
    this.writeIndex(metas);
    return metas;
  }

  private writeIndex(metas: ProjectMeta[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(metas));
  }

  private upsertMeta(p: Project): void {
    const rest = this.readIndex().filter((m) => m.id !== p.id);
    this.writeIndex([...rest, metaOf(p)]);
  }

  // One-time lift of the old single workspace (+ its scenarios/tabs) into a "My Project" document.
  private migrate(): void {
    if (this.readIndex().length) {
      return;
    }
    const legacy = localStorage.getItem(LEGACY_WS);
    if (!legacy) {
      return;
    }
    try {
      const ws = JSON.parse(legacy) as { files?: WorkspaceFile[]; active?: string };
      if (!Array.isArray(ws.files) || !ws.files.length) {
        return;
      }
      let scenarios: Scenario[] = [];
      try {
        const s = JSON.parse(localStorage.getItem(LEGACY_SCENARIOS) ?? "[]");
        scenarios = Array.isArray(s) ? (s as Scenario[]) : [];
      } catch {
        scenarios = [];
      }
      let openTabs: string[] = [];
      try {
        const t = JSON.parse(localStorage.getItem(LEGACY_TABS) ?? "[]");
        openTabs = Array.isArray(t) ? (t as string[]) : [];
      } catch {
        openTabs = [];
      }

      const active = ws.active && ws.files.some((f) => f.name === ws.active) ? ws.active : ws.files[0].name;
      const p: Project = {
        id: uid(),
        name: "My Project",
        schemaVersion: PROJECT_SCHEMA_VERSION,
        createdAt: now(),
        updatedAt: now(),
        files: ws.files,
        active,
        openTabs: openTabs.length ? openTabs : [active],
        scenarios,
      };

      localStorage.setItem(projectKey(p.id), JSON.stringify(p));
      this.writeIndex([metaOf(p)]);
      localStorage.setItem(CURRENT_KEY, p.id);
    } catch {
      // corrupt legacy data — skip migration, start clean
    }
  }

  async list(): Promise<ProjectMeta[]> {
    this.migrate();
    return this.readIndex().slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async load(id: string): Promise<Project | null> {
    const raw = localStorage.getItem(projectKey(id));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as Project;
    } catch {
      return null;
    }
  }

  // `p.updatedAt` is when this copy was read or last saved. A stored record newer than that was written by another tab.
  async save(p: Project): Promise<void> {
    const stored = await this.load(p.id);
    if (stored && stored.updatedAt > p.updatedAt) {
      throw new StaleProjectError(stored);
    }
    p.updatedAt = Math.max(now(), (stored?.updatedAt ?? 0) + 1);
    localStorage.setItem(projectKey(p.id), JSON.stringify(p));
    this.upsertMeta(p);
  }

  async create(name: string, seedFiles?: WorkspaceFile[]): Promise<Project> {
    const p = seedFor(name);
    if (seedFiles && seedFiles.length) {
      p.files = seedFiles;
      p.active = seedFiles[0].name;
      p.openTabs = [seedFiles[0].name];
    }
    await this.save(p);
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
    localStorage.removeItem(projectKey(id));
    this.writeIndex(this.readIndex().filter((m) => m.id !== id));
    if (localStorage.getItem(CURRENT_KEY) === id) {
      localStorage.removeItem(CURRENT_KEY);
    }
  }

  async duplicate(id: string, name?: string): Promise<Project> {
    const src = await this.load(id);
    if (!src) {
      throw new Error("project not found");
    }
    const copy = clone(src);
    copy.id = uid();
    copy.name = name ?? `${src.name} copy`;
    copy.createdAt = now();
    copy.updatedAt = now();
    await this.save(copy);
    return copy;
  }

  async getCurrentId(): Promise<string | null> {
    return localStorage.getItem(CURRENT_KEY);
  }

  async setCurrentId(id: string): Promise<void> {
    localStorage.setItem(CURRENT_KEY, id);
  }
}

let localInstance: ProjectStore | null = null;
let cloudInstance: ProjectStore | null = null;

// The IDE's single entry point for project storage: the cloud backend when signed in (a Bearer token is
// present), the local backend otherwise. Lazily imports CloudProjectStore to avoid a load-time cycle.
export function getStore(): ProjectStore {
  if (getToken()) {
    return (cloudInstance ??= new CloudProjectStore());
  }
  return (localInstance ??= new LocalProjectStore());
}

// The local store regardless of auth — used to copy local projects into a cloud account on first login.
export function getLocalStore(): ProjectStore {
  return (localInstance ??= new LocalProjectStore());
}

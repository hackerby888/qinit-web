// Project persistence behind one async interface. The IDE only ever talks to `ProjectStore`, so the local
// backend here can later be swapped for a cloud one (REST over the existing Mongo backend, `/api/projects`)
// with zero changes at the call sites — the methods are already async and modelled document-per-project.
import type { WorkspaceFile } from "../workspace";
import { EXAMPLES } from "../examples";
import type { Scenario } from "../scenarios";
import { PROJECT_SCHEMA_VERSION, metaOf, type Project, type ProjectMeta } from "./types";

const INDEX_KEY = "ide.projects.index";
const CURRENT_KEY = "ide.project.current";
const projectKey = (id: string): string => `ide.project.${id}`;

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
      return Array.isArray(a) ? (a as ProjectMeta[]) : [];
    } catch {
      return [];
    }
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

  async save(p: Project): Promise<void> {
    p.updatedAt = now();
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

let instance: ProjectStore | null = null;

// The IDE's single entry point for project storage. Returns the local backend today; later this is where a
// CloudProjectStore (same interface) is chosen once a user is signed in.
export function getStore(): ProjectStore {
  if (!instance) {
    instance = new LocalProjectStore();
  }
  return instance;
}

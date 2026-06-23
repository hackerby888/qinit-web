// A project is the unit the IDE creates / manages — a self-contained, syncable document holding the
// contract files plus its session state (open tabs + saved test scenarios). Kept deliberately flat and
// JSON-serializable so the same shape round-trips through localStorage now and a cloud API later.
import type { WorkspaceFile } from "../workspace";
import type { Scenario } from "../scenarios";

export const PROJECT_SCHEMA_VERSION = 1;

export interface Project {
  id: string;
  name: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  files: WorkspaceFile[];
  active: string; // active file name
  openTabs: string[]; // editor tabs (file names)
  scenarios: Scenario[]; // saved contract tests
  systemContracts?: string[]; // built-in system contracts (QX, …) seeded onto the in-browser virtual node
}

// The lightweight row the gallery lists — never pulls a project's file contents (cheap to list, maps to a
// cloud `GET /api/projects` later).
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fileCount: number;
}

export function metaOf(p: Project): ProjectMeta {
  return { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, fileCount: p.files.length };
}

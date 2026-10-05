// Export / import a project as a .json file — a local backup + share format. The envelope is exactly the
// project document (minus volatile ids/timestamps), so it's also the payload a future cloud API ingests.
import { getStore } from "./store";
import { PROJECT_SCHEMA_VERSION, type Project } from "./types";
import type { WorkspaceFile } from "../workspace";
import type { Scenario } from "../scenarios";
import { freeFilePath, normalizePath, occupiedNames } from "../filetree";

interface ProjectExport {
  format: "qinit-project";
  schemaVersion: number;
  project: Pick<Project, "name" | "files" | "active" | "openTabs" | "scenarios">;
}

export function exportProject(p: Project): void {
  const payload: ProjectExport = {
    format: "qinit-project",
    schemaVersion: PROJECT_SCHEMA_VERSION,
    project: { name: p.name, files: p.files, active: p.active, openTabs: p.openTabs, scenarios: p.scenarios },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${exportName(p.name)}.qinit.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// A download name from a project name: letters and digits of any script stay; a name of only symbols falls back.
export function exportName(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}.\-_]+/gu, "_").replace(/^_+|_+$/g, "") || "project";
}

const isScenario = (value: unknown): value is Scenario => {
  const s = value as Partial<Scenario> | null;
  return !!s && typeof s.id === "string" && typeof s.name === "string" && typeof s.contract === "string" && Array.isArray(s.calls) && Array.isArray(s.asserts);
};

// The files, tabs and scenarios of an import as a project can hold them. An import is someone else's text: its file
// names are cleaned the way a typed name is, a name already taken (or a second contract of one stem) gets a free one,
// and the active file and tabs follow the renames. `renamed` maps each original name to the one it got.
export function cleanImport(src: { files?: unknown; active?: unknown; openTabs?: unknown; scenarios?: unknown }): { files: WorkspaceFile[]; active: string; openTabs: string[]; scenarios: Scenario[] } {
  const incoming = Array.isArray(src.files) ? src.files.filter((f): f is WorkspaceFile => !!f && typeof f.name === "string" && typeof f.source === "string") : [];
  const files: WorkspaceFile[] = [];
  const renamed = new Map<string, string>();
  for (const file of incoming) {
    const wanted = normalizePath(file.name);
    if (!wanted) {
      continue; // a name with nothing usable in it
    }
    const names = files.map((f) => f.name);
    const path = freeFilePath(occupiedNames(names), names, wanted);
    files.push({ name: path, source: file.source });
    if (!renamed.has(file.name)) {
      renamed.set(file.name, path);
    }
  }
  if (!files.length) {
    throw new Error("not a valid qinit project file");
  }

  const kept = (name: unknown): string | undefined => (typeof name === "string" ? renamed.get(name) : undefined);
  const active = kept(src.active) ?? files[0].name;
  const openTabs = Array.isArray(src.openTabs) ? [...new Set(src.openTabs.map(kept).filter((name): name is string => !!name))] : [];
  return { files, active, openTabs: openTabs.length ? openTabs : [active], scenarios: Array.isArray(src.scenarios) ? src.scenarios.filter(isScenario) : [] };
}

// Read a .qinit.json (our envelope, or a bare project-ish object) and add it as a NEW project (fresh id).
export async function importProjectFile(file: File): Promise<Project> {
  let data: Partial<ProjectExport> & Partial<ProjectExport["project"]>;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("the file is not JSON — expected a .qinit.json project export");
  }
  const src = ((data && data.project) ?? data ?? {}) as Partial<ProjectExport["project"]>;
  const cleaned = cleanImport(src);

  const name = typeof src.name === "string" && src.name.trim() ? src.name.trim() : "Imported project";
  const created = await getStore().create(name, cleaned.files);
  Object.assign(created, { active: cleaned.active, openTabs: cleaned.openTabs, scenarios: cleaned.scenarios });

  await getStore().save(created);
  return created;
}

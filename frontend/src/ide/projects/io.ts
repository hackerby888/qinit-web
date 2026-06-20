// Export / import a project as a .json file — a local backup + share format. The envelope is exactly the
// project document (minus volatile ids/timestamps), so it's also the payload a future cloud API ingests.
import { getStore } from "./store";
import { PROJECT_SCHEMA_VERSION, type Project } from "./types";
import type { WorkspaceFile } from "../workspace";
import type { Scenario } from "../scenarios";

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
  a.download = `${(p.name || "project").replace(/[^\w.\-]+/g, "_")}.qinit.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Read a .qinit.json (our envelope, or a bare project-ish object) and add it as a NEW project (fresh id).
export async function importProjectFile(file: File): Promise<Project> {
  const data = JSON.parse(await file.text()) as Partial<ProjectExport> & Partial<ProjectExport["project"]>;
  const src = (data.project ?? data) as Partial<ProjectExport["project"]>;

  const files: WorkspaceFile[] = Array.isArray(src.files)
    ? src.files.filter((f): f is WorkspaceFile => !!f && typeof f.name === "string" && typeof f.source === "string")
    : [];
  if (!files.length) {
    throw new Error("not a valid qinit project file");
  }

  const name = typeof src.name === "string" && src.name.trim() ? src.name : "Imported project";
  const created = await getStore().create(name, files);

  created.active = typeof src.active === "string" && files.some((f) => f.name === src.active) ? src.active : files[0].name;
  created.openTabs = Array.isArray(src.openTabs) ? src.openTabs.filter((t) => files.some((f) => f.name === t)) : [];
  if (!created.openTabs.length) {
    created.openTabs = [created.active];
  }
  created.scenarios = Array.isArray(src.scenarios) ? (src.scenarios as Scenario[]) : [];

  await getStore().save(created);
  return created;
}

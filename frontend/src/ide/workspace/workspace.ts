// IDE workspace: the set of contract files + the active one, persisted to localStorage and shareable
// via a URL hash. A file's contract name is its basename (Counter.h -> Counter); slot defaults to 28.
import { EXAMPLES } from "./examples";

export interface WorkspaceFile {
  name: string; // file name incl. extension, e.g. "Counter.h"
  source: string;
}

export interface Workspace {
  files: WorkspaceFile[];
  active: string; // active file name
}

const KEY = "qinit-ide-workspace.v1";

// A file's contract name is its stem — the filename without its folder prefix or extension
// ("lib/Counter.h" -> "Counter"). Folder-agnostic so a contract resolves by type name wherever it lives.
export const baseName = (file: string): string => file.replace(/^.*\//, "").replace(/\.[^.]+$/, "");

// what a file is to the IDE, by extension: only a header builds as a contract, a .ts file is a test, a .cpp is
// a gtest the CLI runs, and anything else is plain text.
export type FileKind = "contract" | "test" | "gtest" | "other";

export function fileKind(path: string): FileKind {
  if (/\.(h|hh|hpp)$/i.test(path)) return "contract";
  if (/\.tsx?$/i.test(path)) return "test";
  if (/\.(cpp|cc|cxx)$/i.test(path)) return "gtest";
  return "other";
}

// the file that defines contract `name`: a contract is known by its header's stem, whatever folder it is in.
export const contractFile = <T extends { name: string }>(files: readonly T[], name: string): T | undefined =>
  files.find((file) => fileKind(file.name) === "contract" && baseName(file.name) === name);

export const NEW_TEST = `import { test, expect } from "bun:test";

// Build a contract with ▶ Compile & Run, then import its client from "./.qinit" and call it here.
test("it works", async () => {
  expect(1 + 1).toBe(2);
});
`;

// what a new file starts with: a contract skeleton for a header, a test skeleton for a .ts file, nothing otherwise.
export const newFileSource = (path: string): string => {
  const kind = fileKind(path);
  return kind === "contract" ? NEW_CONTRACT : kind === "test" ? NEW_TEST : "";
};

export const NEW_CONTRACT = `using namespace QPI;

struct CONTRACT_STATE2_TYPE
{
};

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData
    {
        uint64 value;
    };

    struct Set_input { uint64 value; };
    struct Set_output {};
    struct Get_input {};
    struct Get_output { uint64 value; };

    PUBLIC_PROCEDURE(Set)
    {
        state.mut().value = input.value;
    }

    PUBLIC_FUNCTION(Get)
    {
        output.value = state.get().value;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Set, 1);
        REGISTER_USER_FUNCTION(Get, 1);
    }
};
`;

function seed(): Workspace {
  const files = EXAMPLES.map((e) => ({ name: e.file, source: e.source }));
  return { files, active: files[0]?.name ?? "Counter.h" };
}

function sanitize(raw: unknown): Workspace | null {
  const ws = raw as Workspace | undefined;
  if (!ws || !Array.isArray(ws.files)) {
    return null;
  }
  const files = ws.files
    .filter((f) => f && typeof f.name === "string" && typeof f.source === "string")
    .map((f) => ({ name: f.name, source: f.source }));
  if (!files.length) {
    return null;
  }
  const active = typeof ws.active === "string" && files.some((f) => f.name === ws.active) ? ws.active : files[0].name;
  return { files, active };
}

export function loadWorkspace(): Workspace {
  const shared = decodeShareFromLocation();
  if (shared) {
    saveWorkspace(shared);
    clearShareFromLocation();
    return shared;
  }

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const ws = sanitize(JSON.parse(raw));
      if (ws) {
        return ws;
      }
    }
  } catch {
    // corrupt storage — fall through to the seed
  }

  return seed();
}

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    // private mode / quota — best-effort
  }
}

export function resetWorkspace(): Workspace {
  const ws = seed();
  saveWorkspace(ws);
  return ws;
}

// utf8-safe base64 (sources may contain non-ASCII comment glyphs)
const toB64 = (s: string): string => btoa(unescape(encodeURIComponent(s)));
const fromB64 = (b: string): string => decodeURIComponent(escape(atob(b)));

export function shareUrl(ws: Workspace): string {
  return `${location.origin}/ide#p=${toB64(JSON.stringify(ws))}`;
}

function decodeShareFromLocation(): Workspace | null {
  const m = location.hash.match(/[#&]p=([^&]+)/);
  if (!m) {
    return null;
  }
  try {
    return sanitize(JSON.parse(fromB64(m[1])));
  } catch {
    return null;
  }
}

function clearShareFromLocation(): void {
  history.replaceState(null, "", location.pathname + location.search);
}

// A shared workspace from a `#p=` URL, consumed by the projects gallery (which imports it as a new
// project). Clears the hash so a reload doesn't re-import.
export function decodeSharedWorkspace(): Workspace | null {
  const ws = decodeShareFromLocation();
  if (ws || sharedLinkPresent()) {
    clearShareFromLocation();
  }
  return ws;
}

// whether the address carries a share link at all — one that then fails to decode is damaged, and the gallery says so.
export const sharedLinkPresent = (): boolean => /[#&]p=/.test(location.hash);

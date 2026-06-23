// Test-only helpers (bun test). Not imported by the IDE.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// A `|` in a fixture marks the cursor. Returns the source with the marker removed, the cursor's source
// offset, and the line text up to the cursor (what the providers compute from model + position).
export function at(withCursor: string): { src: string; offset: number; line: string } {
  const offset = withCursor.indexOf("|");
  if (offset < 0) {
    throw new Error("fixture has no | cursor marker");
  }
  const src = withCursor.slice(0, offset) + withCursor.slice(offset + 1);
  const lineStart = src.lastIndexOf("\n", offset - 1) + 1;
  return { src, offset, line: src.slice(lineStart, offset) };
}

// The core-lite contracts directory (the real system-contract corpus), resolved the way the backend does
// (QINIT_CORE env, else ~/.cache/qinit/current.json). Null when no snapshot is present — the corpus suite
// skips in that case.
export function coreContractsDir(): string | null {
  const candidates: string[] = [];
  if (process.env.QINIT_CORE) {
    candidates.push(process.env.QINIT_CORE);
  }
  try {
    const cur = JSON.parse(readFileSync(join(homedir(), ".cache/qinit/current.json"), "utf8"));
    if (cur.coreHeaders) {
      candidates.push(cur.coreHeaders);
    }
  } catch {
    // no synced snapshot
  }

  for (const c of candidates) {
    const dir = join(c, "src", "contracts");
    if (existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

export function listContracts(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".h") && f !== "qpi.h" && !f.includes("_lib"));
}

export function readFile(dir: string, name: string): string {
  return readFileSync(join(dir, name), "utf8");
}

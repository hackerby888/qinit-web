// Built-in system contracts (QX, QEARN, …) for the IDE's in-browser virtual node. The backend only serves
// the catalog and the contract source — the browser compiles it with the in-page TS compiler and deploys the
// wasm itself. The CLI reads the same contracts through @qinit/build's catalog, so the indices/sources match.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { systemContracts } from "@qinit/build";

// QINIT_CORE, else the snapshot `qinit up` synced (~/.cache/qinit/current.json).
function corePath(): string | null {
  const env = process.env.QINIT_CORE;
  if (env && existsSync(env)) {
    return env;
  }
  try {
    const cur = JSON.parse(readFileSync(join(process.env.HOME ?? "", ".cache/qinit/current.json"), "utf8"));
    if (cur.coreHeaders && existsSync(cur.coreHeaders)) {
      return cur.coreHeaders;
    }
  } catch {
    // no synced snapshot
  }
  return null;
}

export interface SystemCatalogEntry { index: number; name: string; stateType: string; idl: unknown }

// The pick-list: index + name + state-struct type (what the compiler compiles by) + IDL (drives the
// call forms), no source — that comes from systemSource.
export function systemCatalog(): SystemCatalogEntry[] {
  const core = corePath();
  if (!core) {
    return [];
  }
  return systemContracts(core).map((c) => ({ index: c.index, name: c.name, stateType: c.stateType, idl: c.idl }));
}

export type SystemSourceResult =
  | { ok: true; name: string; stateType: string; index: number; source: string }
  | { ok: false; status: number; error: string };

// The source of a named system contract, for the browser to compile at its canonical slot index.
export function systemSource(name: string): SystemSourceResult {
  const core = corePath();
  if (!core) {
    return { ok: false, status: 503, error: "core headers not found — set QINIT_CORE or run `qinit node run`." };
  }

  const c = systemContracts(core).find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) {
    return { ok: false, status: 404, error: `unknown system contract '${name}'` };
  }

  return { ok: true, name: c.name, stateType: c.stateType, index: c.index, source: c.source };
}

// Every system contract's source, for the browser's callee retry: an inter-contract call needs the
// lower-index callees compiled alongside the target.
export function systemSources(): { ok: true; contracts: Array<{ name: string; stateType: string; index: number; source: string }> } | { ok: false; status: number; error: string } {
  const core = corePath();
  if (!core) {
    return { ok: false, status: 503, error: "core headers not found — set QINIT_CORE or run `qinit node run`." };
  }
  return { ok: true, contracts: systemContracts(core).map((c) => ({ name: c.name, stateType: c.stateType, index: c.index, source: c.source })) };
}

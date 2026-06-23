// Built-in system contracts (QX, QEARN, …) for the IDE's in-browser virtual node. The browser can't compile
// (no wasi-sdk), so it asks the backend: GET the catalog, then POST a name to compile it. Compilation reuses the
// regular compile() path (sandboxed build + sha256 cache), so a system contract is built once and served from
// cache to every user thereafter. The CLI compiles the same contracts locally; both go through @qinit/build's
// catalog so the indices/sources match.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { systemContracts } from "@qinit/build";
import { compile } from "./compile";
import type { CompileResponse } from "./buildtypes";

// Same resolution as buildcore: QINIT_CORE, else the snapshot `qinit up` synced (~/.cache/qinit/current.json).
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

export interface SystemCatalogEntry { index: number; name: string; idl: unknown }

// The pick-list: index + name + IDL (drives the call forms), no source/wasm — those come from compileSystem.
export function systemCatalog(): SystemCatalogEntry[] {
  const core = corePath();
  if (!core) {
    return [];
  }
  return systemContracts(core).map((c) => ({ index: c.index, name: c.name, idl: c.idl }));
}

// Compile a named system contract to wasm (cached). Returns the standard CompileResponse so the frontend reuses
// its existing compile -> base64ToBytes -> engine.deploy path unchanged.
export async function compileSystem(name: string): Promise<CompileResponse & { index?: number }> {
  const core = corePath();
  if (!core) {
    return { ok: false, diagnostics: [], error: "core headers not found — set QINIT_CORE or run `qinit node run`." };
  }
  const c = systemContracts(core).find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) {
    return { ok: false, diagnostics: [], error: `unknown system contract '${name}'` };
  }
  const res = await compile({ source: c.source, name: c.name, slot: c.index, skipVerify: true });
  return { ...res, index: c.index };
}

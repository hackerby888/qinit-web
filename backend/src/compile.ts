// /api/compile — compile a qpi.h dynamic contract to wasm with the qinit toolchain (@qinit/build's
// buildContract: native clang via the synced wasi-sdk + the core-lite header snapshot). The browser IDE
// POSTs the editor source here and runs the returned wasm in-page via @qinit/engine's InProcessEngine,
// byte-identical to the node. Builds are serialized (clang is heavy) and memoized by a hash of the input.
import { createHash } from "node:crypto";
import { withSlot, cacheGet, cacheSet } from "./buildpool";
import { runSandboxedBuild } from "./sandbox";
import type { CompileRequest, CompileResponse } from "./buildtypes";

// The pool stats live in buildpool.ts (sibling-free) so metrics can read them without importing this module.
export { buildQueueState, buildCacheSize } from "./buildpool";
export type { CompileCallee, CompileRequest, CompileDiagnostic, CompileResponse } from "./buildtypes";

// Compile untrusted source in a sandboxed child by default (timeout + rlimits — see sandbox.ts). QINIT_BUILD_INPROC=1
// runs the build in-process instead (dev convenience / hosts without bash); it skips the isolation, so never in prod.
async function runBuild(req: CompileRequest): Promise<CompileResponse> {
  if (process.env.QINIT_BUILD_INPROC === "1") {
    const { runBuild: inproc } = await import("./buildcore");
    return inproc(req);
  }

  return runSandboxedBuild(req);
}

export async function compile(req: CompileRequest): Promise<CompileResponse> {
  const key = createHash("sha256")
    .update(`${req.slot ?? 28}\0${req.name ?? ""}\0${req.skipVerify ? 1 : 0}\0${JSON.stringify(req.callees ?? [])}\0${req.source}`)
    .digest("hex");

  const hit = cacheGet<CompileResponse>(key);
  if (hit) {
    return hit;
  }

  return withSlot(async () => {
    // Re-check: an identical build may have finished (and cached) while this one waited for a slot.
    const queuedHit = cacheGet<CompileResponse>(key);
    if (queuedHit) {
      return queuedHit;
    }

    const res = await runBuild(req);
    if (res.ok) {
      cacheSet(key, res);
    }
    return res;
  });
}

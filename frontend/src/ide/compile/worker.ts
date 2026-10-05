// In-browser compile worker. Runs @qinit/compiler (via the /browser entry — QPI header snapshot
// embedded, no backend round-trip) off the main thread and posts the wasm back as a transferable
// ArrayBuffer. The compiler-owned v3 IDL is adapted once to the view shape the IDE consumes.
//
// Inter-contract callees are compiled first for their ABI metadata (inputType/sizes), mirroring
// the qinit CLI's local-compile flow; their source also rides along so the caller can read the
// callee's nested output types.
/// <reference lib="webworker" />
import { COMPILER_PROTOCOL_VERSION, compilerInfo } from "@qinit/compiler/browser";
import { buildContract } from "./build";
import type { WorkerCompileResponse, WorkerRequest } from "./protocol";

// A failed reply (DataCloneError on an already-detached buffer) rejects inside the worker, where
// Worker.onerror never fires — the caller just waits out its timeout. Turn it into a normal error reply.
const post = (res: WorkerCompileResponse, transfer: Transferable[]): void => {
  try {
    self.postMessage(res, transfer);
  } catch (error) {
    self.postMessage({ id: res.id, kind: res.kind, ok: false, diagnostics: [], error: `worker reply failed: ${error instanceof Error ? error.message : String(error)}` });
  }
};

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  if (e.data.kind === "hello") {
    self.postMessage({ id: e.data.id, kind: "hello", protocolVersion: COMPILER_PROTOCOL_VERSION, compilerInfo });
    return;
  }
  void buildContract(e.data).then(({ res, transfer }) => post(res, transfer));
};

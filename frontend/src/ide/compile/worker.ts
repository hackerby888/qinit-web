// In-browser compile worker. Runs @qinit/compiler (via the /browser entry — QPI header snapshot
// embedded, no backend round-trip) off the main thread and posts the wasm back as a transferable
// ArrayBuffer. The compiler-owned v3 IDL is adapted once to the view shape the IDE consumes.
//
// Inter-contract callees are compiled first for their ABI metadata (inputType/sizes), mirroring
// the qinit CLI's local-compile flow; their source also rides along so the caller can read the
// callee's nested output types.
/// <reference lib="webworker" />
import { compileContract, compileGtest, COMPILER_PROTOCOL_VERSION, compilerInfo } from "@qinit/compiler/browser";
import type { ContractIdl, CompileDiagnostic } from "@qinit/compiler/browser";
import { initK12, k12Sync } from "@qinit/core";
import { toContractIdlView } from "../idl-view";
import type { WorkerCompileRequest, WorkerCompileResponse, WorkerGtestRequest, WorkerGtestResponse, WorkerRequest } from "./protocol";

// Matches the backend's browser default (LITE_WASM_ARENA_SZ) — the 1 GiB compiler default would
// make every deployed module reserve far more memory than a browser tab should.
const ARENA_SIZE_BYTES = 64 * 1024 * 1024;

const toHex = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
};

const mapDiagnostics = (ds: CompileDiagnostic[]) =>
  ds.map((d) => ({ severity: d.severity, line: d.span.line, column: d.span.column, message: d.message }));

async function handle(req: WorkerCompileRequest): Promise<{ res: WorkerCompileResponse; transfer: Transferable[] }> {
  const started = performance.now();
  const fail = (partial: Partial<WorkerCompileResponse>): { res: WorkerCompileResponse; transfer: Transferable[] } => ({
    res: { id: req.id, kind: "compiled", ok: false, diagnostics: [], ms: performance.now() - started, ...partial },
    transfer: [],
  });

  try {
    // Slot order matters: a callee may itself invoke a lower-index contract (QSWAP → QUTIL → QX),
    // so each callee compiles with every already-compiled lower callee cascaded in.
    const callees: ContractIdl[] = [];
    const calleeSources: Array<{ name: string; source: string; slot: number }> = [];
    for (const c of [...(req.callees ?? [])].sort((a, b) => a.slot - b.slot)) {
      const cr = await compileContract({
        source: c.source,
        contractName: c.name,
        slot: c.slot,
        arenaSizeBytes: ARENA_SIZE_BYTES,
        callees: callees.length ? callees : undefined,
        calleeSources: calleeSources.length ? calleeSources : undefined,
      });
      if (cr.diagnostics.some((d) => d.severity === "error")) {
        return fail({ diagnostics: mapDiagnostics(cr.diagnostics), error: `callee ${c.name} failed to compile` });
      }
      if (!cr.idl || cr.wasm.byteLength === 0) {
        return fail({ error: `callee ${c.name} did not produce a deployable artifact` });
      }
      callees.push(cr.idl);
      calleeSources.push({ name: c.name, source: c.source, slot: c.slot });
    }

    const r = await compileContract({
      source: req.source,
      contractName: req.name,
      slot: req.slot,
      arenaSizeBytes: ARENA_SIZE_BYTES,
      callees: callees.length ? callees : undefined,
      calleeSources: calleeSources.length ? calleeSources : undefined,
    });

    const errors = r.diagnostics.filter((d) => d.severity === "error");
    if (errors.length || r.wasm.byteLength === 0) {
      return fail({ diagnostics: mapDiagnostics(r.diagnostics) });
    }
    if (!r.idl) {
      return fail({ diagnostics: mapDiagnostics(r.diagnostics), error: "compiler did not produce IDL" });
    }

    const idl = toContractIdlView(r.idl);

    await initK12();
    const hash = toHex(k12Sync(r.wasm));

    const buf = r.wasm.buffer.slice(r.wasm.byteOffset, r.wasm.byteOffset + r.wasm.byteLength) as ArrayBuffer;
    return {
      res: {
        id: req.id,
        kind: "compiled",
        ok: true,
        wasm: buf,
        size: r.wasm.byteLength,
        hash,
        idl,
        diagnostics: mapDiagnostics(r.diagnostics),
        ms: performance.now() - started,
      },
      transfer: [buf],
    };
  } catch (e) {
    return fail({ error: e instanceof Error ? e.message : String(e) });
  }
}

async function handleGtest(req: WorkerGtestRequest): Promise<WorkerGtestResponse> {
  const started = performance.now();
  try {
    const result = await compileGtest({ source: req.source, testSource: req.testSource, contractName: req.name, slot: req.slot });
    const errors = result.diagnostics.filter((item) => item.severity === "error");
    return {
      id: req.id,
      kind: "gtest-compiled",
      ok: errors.length === 0 && !!result.program,
      program: result.program,
      wasm: result.wasm,
      diagnostics: mapDiagnostics(result.diagnostics),
      ms: performance.now() - started,
    };
  } catch (error) {
    return {
      id: req.id,
      kind: "gtest-compiled",
      ok: false,
      diagnostics: [],
      error: error instanceof Error ? error.message : String(error),
      ms: performance.now() - started,
    };
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  if (e.data.kind === "hello") {
    self.postMessage({ id: e.data.id, kind: "hello", protocolVersion: COMPILER_PROTOCOL_VERSION, compilerInfo });
    return;
  }
  if (e.data.kind === "compile-gtest") {
    void handleGtest(e.data).then((response) => self.postMessage(response, response.wasm ? [response.wasm.buffer] : []));
    return;
  }
  void handle(e.data).then(({ res, transfer }) => self.postMessage(res, transfer));
};

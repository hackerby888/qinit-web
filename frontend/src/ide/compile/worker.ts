// In-browser compile worker. Runs @qinit/compile (via the /browser entry — QPI header snapshot
// embedded, no backend round-trip) off the main thread, derives the same rich IDL the backend
// returns (extractIdl), and posts the wasm back as a transferable ArrayBuffer.
//
// Inter-contract callees are compiled first for their ABI metadata (inputType/sizes), mirroring
// the qinit CLI's local-compile flow; their source also rides along so the caller can read the
// callee's nested output types.
/// <reference lib="webworker" />
import { compileContract, COMPILER_PROTOCOL_VERSION, compilerInfo } from "@qinit/compile/browser";
import type { CalleeIdl, CompileDiagnostic } from "@qinit/compile/browser";
import { extractIdl } from "@qinit/build/idl";
import { initK12, k12Sync } from "@qinit/core";
import type { WorkerCompileRequest, WorkerCompileResponse, WorkerRequest } from "./protocol";

// Matches the backend's browser default (LITE_WASM_ARENA_SZ) — the 1 GiB compiler default would
// make every deployed module reserve far more memory than a browser tab should.
const ARENA_SZ = 64 * 1024 * 1024;

const toHex = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
};

const mapDiagnostics = (ds: CompileDiagnostic[]) =>
  ds.map((d) => ({ severity: d.severity, line: d.span.line, column: d.span.col, message: d.message }));

async function handle(req: WorkerCompileRequest): Promise<{ res: WorkerCompileResponse; transfer: Transferable[] }> {
  const started = performance.now();
  const fail = (partial: Partial<WorkerCompileResponse>): { res: WorkerCompileResponse; transfer: Transferable[] } => ({
    res: { id: req.id, kind: "compiled", ok: false, diagnostics: [], ms: performance.now() - started, ...partial },
    transfer: [],
  });

  try {
    const callees: CalleeIdl[] = [];
    const calleeSources: Array<{ name: string; source: string }> = [];
    for (const c of req.callees ?? []) {
      const cr = await compileContract({ source: c.source, name: c.name, slot: c.slot, arenaSz: ARENA_SZ });
      if (cr.diagnostics.some((d) => d.severity === "error")) {
        return fail({ diagnostics: mapDiagnostics(cr.diagnostics), error: `callee ${c.name} failed to compile` });
      }
      callees.push({
        name: c.name,
        index: c.slot,
        functions: Object.fromEntries(cr.idl.functions.map((f) => [f.name, { inputType: f.inputType, inSize: f.inSize, outSize: f.outSize }])),
        procedures: Object.fromEntries(cr.idl.procedures.map((p) => [p.name, { inputType: p.inputType, inSize: p.inSize, outSize: p.outSize }])),
      });
      calleeSources.push({ name: c.name, source: c.source });
    }

    const r = await compileContract({
      source: req.source,
      name: req.name,
      slot: req.slot,
      arenaSz: ARENA_SZ,
      callees: callees.length ? callees : undefined,
      calleeSources: calleeSources.length ? calleeSources : undefined,
    });

    const errors = r.diagnostics.filter((d) => d.severity === "error");
    if (errors.length || r.wasm.byteLength === 0) {
      return fail({ diagnostics: mapDiagnostics(r.diagnostics) });
    }

    // Rich IDL — the same derivation the backend runs (extractIdl on the contract source), so the
    // IDE's call forms / state decoding are identical on both paths. Never a cast of the compiler's
    // minimal ABI metadata.
    let idl: WorkerCompileResponse["idl"];
    let idlError: string | undefined;
    try {
      idl = extractIdl(req.source, req.name);
    } catch (e) {
      idlError = e instanceof Error ? e.message : String(e);
    }

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
        idlError,
        diagnostics: mapDiagnostics(r.diagnostics),
        ms: performance.now() - started,
      },
      transfer: [buf],
    };
  } catch (e) {
    return fail({ error: e instanceof Error ? e.message : String(e) });
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  if (e.data.kind === "hello") {
    self.postMessage({ id: e.data.id, kind: "hello", protocolVersion: COMPILER_PROTOCOL_VERSION, compilerInfo });
    return;
  }
  void handle(e.data).then(({ res, transfer }) => self.postMessage(res, transfer));
};

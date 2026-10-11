// one contract build, as the compile worker runs it: compile the callees for their ABI, compile the contract,
// then apply the rules `qinit build` applies. Kept apart from the worker's message plumbing so a test can run it.
import { compileContractWithTypeScript as compileContract } from "@qinit/compiler/browser";
import type { ContractIdl, CompileDiagnostic } from "@qinit/compiler/browser";
import { analyzeContract, detectContractName, verifierViolations } from "@qinit/compiler/analyzer";
import { buildGateDiagnostics } from "@qinit/build/compile/build-rules";
import { initK12, k12Sync } from "@qinit/core";
import type { CompileDiagnostic as IdeDiagnostic } from "./result";
import { toContractIdlView } from "../idl-view";
import type { WorkerCompileRequest, WorkerCompileResponse } from "./protocol";

// matches the backend's browser default (LITE_WASM_ARENA_SZ) — the 1 GiB compiler default would
// make every deployed module reserve far more memory than a browser tab should.
const ARENA_SIZE_BYTES = 64 * 1024 * 1024;

const toHex = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
};

const mapDiagnostics = (ds: CompileDiagnostic[], file?: string): IdeDiagnostic[] =>
  ds.map((d) => ({ severity: d.severity, line: d.span.line, column: d.span.column, message: d.message, file }));

// what `qinit build` refuses beyond a compile error, from the same analyzer the CLI runs: the constructs core's
// verifier rejects and the protocol gate. Without it the IDE deployed contracts no build would accept.
function buildRefusals(req: WorkerCompileRequest, callees: ContractIdl[], calleeSources: Array<{ name: string; source: string; slot: number }>): IdeDiagnostic[] {
  if (!detectContractName(req.source)) {
    return [{ severity: "error", line: 1, column: 1, message: "no contract struct in this file — a contract declares `struct Name : public ContractBase`", code: "qinit/no-contract" }];
  }

  const { diagnostics } = analyzeContract({
    source: req.source,
    contractName: req.name,
    slot: req.slot,
    callees: callees.length ? callees : undefined,
    calleeSources: calleeSources.length ? calleeSources : undefined,
  });
  return [...verifierViolations(diagnostics, req.source), ...buildGateDiagnostics(diagnostics)].map((d) => ({
    severity: "error",
    line: d.span.line,
    column: d.span.column,
    message: d.message,
    code: d.code,
  }));
}

// the compiler and the gate can both report one mistake (a log in a function); keep the first of each line and message.
function withoutRepeats(diagnostics: IdeDiagnostic[]): IdeDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    const key = `${d.file ?? ""}:${d.line}:${d.message}`;
    return seen.has(key) ? false : !!seen.add(key);
  });
}

export async function buildContract(req: WorkerCompileRequest): Promise<{ res: WorkerCompileResponse; transfer: Transferable[] }> {
  const started = performance.now();
  const fail = (partial: Partial<WorkerCompileResponse>): { res: WorkerCompileResponse; transfer: Transferable[] } => ({
    res: { id: req.id, kind: "compiled", ok: false, diagnostics: [], ms: performance.now() - started, ...partial },
    transfer: [],
  });

  try {
    // slot order matters: a callee may itself invoke a lower-index contract (QSWAP → QUTIL → QX),
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
        return fail({ diagnostics: mapDiagnostics(cr.diagnostics, c.file ?? `${c.name}.h`), error: `callee ${c.name} failed to compile` });
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

    const diagnostics = withoutRepeats([...mapDiagnostics(r.diagnostics), ...(req.system ? [] : buildRefusals(req, callees, calleeSources))]);
    if (diagnostics.some((d) => d.severity === "error") || r.wasm.byteLength === 0) {
      return fail({ diagnostics });
    }
    if (!r.idl) {
      return fail({ diagnostics, error: "compiler did not produce IDL" });
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
        diagnostics,
        ms: performance.now() - started,
      },
      transfer: [buf],
    };
  } catch (e) {
    return fail({ error: e instanceof Error ? e.message : String(e) });
  }
}

// IDE compile facade: try the in-browser compiler (worker) first, fall back to the backend clang
// build when the local compiler can't take the request. Results are normalized to the same
// CompileResult shape the backend returns, so call sites don't care which path ran.
import { compileContract as compileOnBackend, type CompileCallee, type CompileResult } from "../api";
import type { WorkerCompileResponse, WorkerResponse } from "./protocol";

export interface SmartCompileRequest {
  source: string;
  name: string;
  slot: number;
  skipVerify?: boolean;
  callees?: CompileCallee[];
}

export interface SmartCompileResult extends CompileResult {
  via: "browser" | "backend";
  ms?: number;
}

// A wedged worker (pathological source) must not block builds forever — terminate and fall back.
const COMPILE_TIMEOUT_MS = 60_000;

let _worker: Worker | null = null;
let _seq = 0;
const _pending = new Map<number, (r: WorkerCompileResponse | null) => void>();

function getWorker(): Worker | null {
  if (_worker) return _worker;
  try {
    _worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  _worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    if (e.data.kind !== "compiled") return;
    const resolve = _pending.get(e.data.id);
    if (resolve) {
      _pending.delete(e.data.id);
      resolve(e.data);
    }
  };
  // A crashed worker (failed chunk load, OOM) fails all in-flight compiles over to the backend and
  // is discarded — the next compile spawns a fresh one.
  _worker.onerror = () => {
    _worker?.terminate();
    _worker = null;
    for (const [id, resolve] of _pending) {
      _pending.delete(id);
      resolve(null);
    }
  };
  return _worker;
}

function compileInWorker(req: SmartCompileRequest): Promise<WorkerCompileResponse | null> {
  const worker = getWorker();
  if (!worker) return Promise.resolve(null);

  const id = ++_seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        _worker?.terminate();
        _worker = null;
        resolve(null);
      }
    }, COMPILE_TIMEOUT_MS);
    _pending.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    worker.postMessage({
      id,
      kind: "compile",
      source: req.source,
      name: req.name,
      slot: req.slot,
      callees: req.callees?.map((c) => ({ name: c.name, source: c.source, slot: c.slot })),
    });
  });
}

// btoa on a giant binary string built with spread overflows the arg limit — chunk it.
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function toCompileResult(r: WorkerCompileResponse): SmartCompileResult {
  if (!r.ok || !r.wasm) {
    return { ok: false, diagnostics: r.diagnostics, error: r.error, via: "browser", ms: r.ms };
  }
  return {
    ok: true,
    wasm: bytesToBase64(new Uint8Array(r.wasm)),
    size: r.size,
    hash: r.hash,
    idl: r.idl,
    idlError: r.idlError,
    diagnostics: r.diagnostics,
    via: "browser",
    ms: r.ms,
  };
}

// Compile through the in-browser worker; use the backend when the local compiler is incapable
// (unsupported construct, worker crash/timeout). With fallbackOnErrors (Compile & Run), ANY local
// failure retries on the backend so the user always gets the authoritative clang verdict; without
// it (background diagnostics), ordinary local source errors surface directly — no backend traffic
// per keystroke.
export async function compileSmart(req: SmartCompileRequest, opts?: { fallbackOnErrors?: boolean }): Promise<SmartCompileResult> {
  const local = await compileInWorker(req);

  if (local && local.ok) {
    return toCompileResult(local);
  }
  if (local && !local.incapable && !opts?.fallbackOnErrors) {
    return toCompileResult(local);
  }

  const backend = await compileOnBackend(req);
  return { ...backend, via: "backend" };
}

// IDE compile facade: run the in-browser compiler (worker) and normalize its response to the
// CompileResult shape the IDE consumes. This is the only compile path — there is no backend
// compiler; a crashed or wedged worker surfaces as an error and the next compile gets a fresh one.
import type { CompilerInfo } from "@qinit/compiler/browser";
import type { GtestProgram } from "@qinit/compiler/browser";
import type { CompileCallee, CompileResult } from "../api";
import type { WorkerCompileResponse, WorkerGtestResponse, WorkerHelloResponse, WorkerResponse } from "./protocol";

export interface CompileRequest {
  source: string;
  name: string;
  slot: number;
  callees?: CompileCallee[];
}

export interface BrowserCompileResult extends CompileResult {
  ms?: number;
}

// A wedged worker (pathological source) must not block builds forever — terminate and report.
const COMPILE_TIMEOUT_MS = 60_000;
const HELLO_TIMEOUT_MS = 10_000;

let _worker: Worker | null = null;
let _seq = 0;
const _pending = new Map<number, (r: WorkerCompileResponse | null) => void>();
const _gtestPending = new Map<number, (r: WorkerGtestResponse | null) => void>();
const _helloPending = new Map<number, (r: WorkerHelloResponse | null) => void>();

function getWorker(): Worker | null {
  if (_worker) return _worker;
  try {
    _worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  _worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    if (e.data.kind === "hello") {
      const resolve = _helloPending.get(e.data.id);
      if (resolve) {
        _helloPending.delete(e.data.id);
        resolve(e.data);
      }
      return;
    }
    if (e.data.kind === "gtest-compiled") {
      const resolve = _gtestPending.get(e.data.id);
      if (resolve) {
        _gtestPending.delete(e.data.id);
        resolve(e.data);
      }
      return;
    }
    if (e.data.kind !== "compiled") return;
    const resolve = _pending.get(e.data.id);
    if (resolve) {
      _pending.delete(e.data.id);
      resolve(e.data);
    }
  };
  // A crashed worker (failed chunk load, OOM) fails all in-flight requests and is discarded — the
  // next compile spawns a fresh one.
  _worker.onerror = () => {
    _worker?.terminate();
    _worker = null;
    for (const [id, resolve] of _pending) {
      _pending.delete(id);
      resolve(null);
    }
    for (const [id, resolve] of _helloPending) {
      _helloPending.delete(id);
      resolve(null);
    }
    for (const [id, resolve] of _gtestPending) {
      _gtestPending.delete(id);
      resolve(null);
    }
  };
  return _worker;
}

export interface BrowserGtestCompileResult {
  ok: boolean;
  program?: GtestProgram;
  wasm?: Uint8Array;
  diagnostics: WorkerGtestResponse["diagnostics"];
  error?: string;
  ms?: number;
}

export async function compileGtestInBrowser(req: { source: string; testSource: string; name: string; slot: number }): Promise<BrowserGtestCompileResult> {
  const worker = getWorker();
  if (!worker) return { ok: false, diagnostics: [], error: "the in-browser compiler worker is unavailable" };
  const id = ++_seq;
  const response = await new Promise<WorkerGtestResponse | null>((resolve) => {
    const timer = setTimeout(() => {
      if (_gtestPending.has(id)) {
        _gtestPending.delete(id);
        _worker?.terminate();
        _worker = null;
        resolve(null);
      }
    }, COMPILE_TIMEOUT_MS);
    _gtestPending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    worker.postMessage({ id, kind: "compile-gtest", ...req });
  });
  if (!response) return { ok: false, diagnostics: [], error: "the in-browser gtest compiler crashed or timed out" };
  return { ok: response.ok, program: response.program, wasm: response.wasm, diagnostics: response.diagnostics, error: response.error, ms: response.ms };
}

function compileInWorker(req: CompileRequest): Promise<WorkerCompileResponse | null> {
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

function requestHello(): Promise<WorkerHelloResponse | null> {
  const worker = getWorker();
  if (!worker) {
    return Promise.resolve(null);
  }

  const id = ++_seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (_helloPending.has(id)) {
        _helloPending.delete(id);
        resolve(null);
      }
    }, HELLO_TIMEOUT_MS);
    _helloPending.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    worker.postMessage({ id, kind: "hello" });
  });
}

let _infoPromise: Promise<CompilerInfo | null> | null = null;

// Identity of the in-browser compiler (embedded snapshot pin + versions). Resolves null when the
// worker can't start or doesn't answer. A null result isn't cached, so a later call retries
// against a fresh worker.
export function getCompilerInfo(): Promise<CompilerInfo | null> {
  if (!_infoPromise) {
    _infoPromise = requestHello().then((r) => {
      if (!r) {
        _infoPromise = null;
        return null;
      }
      return r.compilerInfo;
    });
  }
  return _infoPromise;
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

function toCompileResult(r: WorkerCompileResponse): BrowserCompileResult {
  if (!r.ok || !r.wasm) {
    return { ok: false, diagnostics: r.diagnostics, error: r.error, ms: r.ms };
  }
  return {
    ok: true,
    wasm: bytesToBase64(new Uint8Array(r.wasm)),
    size: r.size,
    hash: r.hash,
    idl: r.idl,
    idlError: r.idlError,
    diagnostics: r.diagnostics,
    ms: r.ms,
  };
}

// Compile through the in-browser worker. Failures are final: source errors carry diagnostics, a
// crash/timeout carries an error string.
export async function compileInBrowser(req: CompileRequest): Promise<BrowserCompileResult> {
  const local = await compileInWorker(req);

  if (!local) {
    return { ok: false, diagnostics: [], error: "the in-browser compiler crashed or timed out — retry the compile" };
  }
  return toCompileResult(local);
}

// the compile result as the shell sees it: the worker reply from compile/local.ts with the wasm re-encoded as
// base64, plus the diagnostic and callee shapes the worker protocol shares with it.
import type { ContractIdlView as ContractIdl } from "../calls/idl-view";

export interface CompileDiagnostic {
  severity: "error" | "warning";
  line: number;
  column: number;
  message: string;
  // the workspace file the problem is in, when it is not the one being built (a callee).
  file?: string;
  // the rule that refused it, when a build rule rather than the compiler did.
  code?: string;
}

export interface CompileResult {
  ok: boolean;
  wasm?: string;
  size?: number;
  hash?: string;
  idl?: ContractIdl;
  diagnostics: CompileDiagnostic[];
  idlError?: string;
  error?: string;
}

// An inter-contract callee passed to the compiler: a sibling contract this one calls, with the slot it's
// deployed at (the callee must sit at a lower index than the caller — the qubic lower-index rule).
export interface CompileCallee {
  name: string;
  source: string;
  slot: number;
  file?: string;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

// Message contract between the IDE and the in-browser compile worker. Kept in one module so both
// sides (worker.ts, local.ts) and tests share the exact shapes.
import type { ContractIdl } from "@qinit/build/idl";
import type { CompilerInfo } from "@qinit/compile/browser";
import type { CompileDiagnostic } from "../api";

export interface WorkerHelloRequest {
  id: number;
  kind: "hello";
}

export interface WorkerCompileRequest {
  id: number;
  kind: "compile";
  source: string;
  name: string;
  slot: number;
  callees?: Array<{ name: string; source: string; slot: number }>;
}

export type WorkerRequest = WorkerHelloRequest | WorkerCompileRequest;

export interface WorkerHelloResponse {
  id: number;
  kind: "hello";
  protocolVersion: number;
  compilerInfo: CompilerInfo;
}

export interface WorkerCompileResponse {
  id: number;
  kind: "compiled";
  ok: boolean;
  wasm?: ArrayBuffer;
  size?: number;
  hash?: string;
  idl?: ContractIdl;
  idlError?: string;
  diagnostics: CompileDiagnostic[];
  // The local compiler couldn't take this request (unsupported construct, internal failure) — the
  // caller should retry on the backend clang path. Distinct from ordinary source errors, which are
  // real diagnostics the user must fix.
  incapable: boolean;
  error?: string;
  ms: number;
}

export type WorkerResponse = WorkerHelloResponse | WorkerCompileResponse;

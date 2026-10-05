// Message contract between the IDE and the in-browser compile worker. Kept in one module so both
// sides (worker.ts, local.ts) and tests share the exact shapes.
import type { ContractIdlView as ContractIdl } from "../idl-view";
import type { CompilerInfo } from "@qinit/compiler/browser";
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
  callees?: Array<{ name: string; source: string; slot: number; file?: string }>;
  // core's own contracts are exempt from the rules written for a developer's contract.
  system?: boolean;
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
  error?: string;
  ms: number;
}

export type WorkerResponse = WorkerHelloResponse | WorkerCompileResponse;

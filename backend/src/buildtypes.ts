// Shared compile request/response types — kept free of @qinit/build so the sandbox spawner + compile pool can
// import them without pulling the toolchain (which lives in buildcore.ts / the worker process).

// An inter-contract callee: another project contract this one calls (CALL/INVOKE_OTHER_CONTRACT). Its source
// is written to a sibling .h so the build can compile its types at `slot` (the deployed index).
export interface CompileCallee {
  name: string;
  source: string;
  slot: number;
}

export interface CompileRequest {
  source: string;
  name?: string;
  // The C++ contract struct type, when it differs from `name` (the on-chain ticker) — e.g. ticker QTRY ->
  // struct QUOTTERY. Drives the wrapper #defines; falls back to `name` when unset.
  stateType?: string;
  slot?: number;
  skipVerify?: boolean;
  callees?: CompileCallee[];
}

export interface CompileDiagnostic {
  severity: "error" | "warning";
  line: number;   // 1-based, into the contract source
  column: number; // 1-based
  message: string;
}

export interface CompileResponse {
  ok: boolean;
  wasm?: string;     // base64 of the compiled module (only when ok)
  size?: number;
  hash?: string;     // K12 of the wasm — matches the node's deploy hash
  idl?: unknown;     // ContractIdl — drives the IDE's call forms
  verify?: unknown;  // contractverify result (Tier-B protocol check)
  diagnostics: CompileDiagnostic[];
  stderr?: string;
  idlError?: string;
  error?: string;    // a server-side failure (toolchain missing, timeout, resource limit, etc.)
}

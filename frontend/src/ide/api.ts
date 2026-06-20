// Compile client — POST the editor source to the backend, which runs @qinit/build (native clang +
// core headers) and returns the wasm (base64) + IDL + diagnostics. The frontend then runs the wasm
// in-page via ./engine.
import type { ContractIdl } from "@qinit/build/idl";

export interface CompileDiagnostic {
  severity: "error" | "warning";
  line: number;
  column: number;
  message: string;
}

export interface CompileResult {
  ok: boolean;
  wasm?: string;
  size?: number;
  hash?: string;
  idl?: ContractIdl;
  verify?: { ok?: boolean; available?: boolean; errors?: string[] };
  diagnostics: CompileDiagnostic[];
  stderr?: string;
  idlError?: string;
  error?: string;
}

// An inter-contract callee passed to the compiler: a sibling contract this one calls, with the slot it's
// deployed at (the callee must sit at a lower index than the caller — the qubic lower-index rule).
export interface CompileCallee {
  name: string;
  source: string;
  slot: number;
}

export async function compileContract(req: { source: string; name: string; slot: number; skipVerify?: boolean; callees?: CompileCallee[] }): Promise<CompileResult> {
  let r: Response;
  try {
    r = await fetch("/api/compile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch (e) {
    // Network / connection failure — the request never reached the server. Keep the underlying detail.
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { ok: false, diagnostics: [], error: `network error reaching POST /api/compile (is the backend on :8787 up?) — ${detail}` };
  }

  // Read the body once as text so the raw response is available whether or not it parses as JSON.
  let text: string;
  try {
    text = await r.text();
  } catch (e) {
    return { ok: false, diagnostics: [], error: `couldn't read the compile response (HTTP ${r.status} ${r.statusText}) — ${(e as Error).message}` };
  }

  let body: CompileResult | undefined;
  try {
    body = text ? (JSON.parse(text) as CompileResult) : undefined;
  } catch {
    body = undefined;
  }

  if (!body) {
    // Non-JSON (a proxy/HTML error page, a crash, or an empty body) — surface the status + a raw snippet.
    const snippet = text.trim().slice(0, 500);
    return { ok: false, diagnostics: [], error: `compile server returned a non-JSON response (HTTP ${r.status} ${r.statusText})${snippet ? `:\n${snippet}` : ""}` };
  }

  if (!r.ok && !body.error) {
    // HTTP error status but the JSON carried no error string — annotate it with the status.
    return { ...body, ok: false, error: `compile server error (HTTP ${r.status} ${r.statusText})` };
  }

  return body;
}

export interface BuildQueue {
  active: number;
  queued: number;
  limit: number;
}

// Poll the backend build-pool state while a compile is pending, to show "waiting for a build slot". Returns
// null on any error (the indicator just stays generic).
export async function fetchBuildQueue(): Promise<BuildQueue | null> {
  try {
    const r = await fetch("/api/compile/queue");
    if (!r.ok) {
      return null;
    }
    return (await r.json()) as BuildQueue;
  } catch {
    return null;
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

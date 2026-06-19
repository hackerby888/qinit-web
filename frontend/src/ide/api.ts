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

export async function compileContract(req: { source: string; name: string; slot: number }): Promise<CompileResult> {
  let r: Response;
  try {
    r = await fetch("/api/compile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch (e) {
    return { ok: false, diagnostics: [], error: `couldn't reach the compile server — is the backend running? (${(e as Error).message})` };
  }

  try {
    return (await r.json()) as CompileResult;
  } catch {
    return { ok: false, diagnostics: [], error: `compile server returned a non-JSON response (${r.status})` };
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

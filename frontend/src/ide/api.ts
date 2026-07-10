// Backend API client for the IDE. Compilation happens in the browser (./compile/local.ts — the
// @qinit/compile worker); the backend only serves the system-contract catalog + sources, which the
// browser then compiles and runs in-page via ./engine.
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
}

// A built-in system contract the IDE can deploy onto its in-browser virtual node (QX, QEARN, …).
export interface SystemContractEntry {
  index: number;
  name: string;
  idl?: ContractIdl;
}

// The system-contract catalog (the picker list). [] on any error — the picker just shows nothing.
export async function fetchSystemCatalog(): Promise<SystemContractEntry[]> {
  try {
    const r = await fetch("/api/system-contracts");
    if (!r.ok) {
      return [];
    }
    return ((await r.json()) as { contracts?: SystemContractEntry[] }).contracts ?? [];
  } catch {
    return [];
  }
}

export interface SystemSource {
  name: string;
  index: number;
  source: string;
}

// The source of a named system contract, for the in-browser compiler to build at its canonical slot.
export async function fetchSystemSource(name: string): Promise<SystemSource | { error: string }> {
  let r: Response;
  try {
    r = await fetch(`/api/system-contracts/${encodeURIComponent(name)}/source`);
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { error: `network error fetching the ${name} source (is the backend on :8787 up?) — ${detail}` };
  }

  const body = (await r.json().catch(() => null)) as (SystemSource & { error?: string }) | null;
  if (!r.ok || !body || typeof body.source !== "string") {
    return { error: body?.error ?? `system-contract source request failed (HTTP ${r.status} ${r.statusText})` };
  }
  return { name: body.name, index: body.index, source: body.source };
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

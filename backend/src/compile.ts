// /api/compile — compile a qpi.h dynamic contract to wasm with the qinit toolchain (@qinit/build's
// buildContract: native clang via the synced wasi-sdk + the core-lite header snapshot). The browser IDE
// POSTs the editor source here and runs the returned wasm in-page via @qinit/engine's InProcessEngine,
// byte-identical to the node. Builds are serialized (clang is heavy) and memoized by a hash of the input.
import { buildContract } from "@qinit/build";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir, cpus } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

// An inter-contract callee: another project contract this one calls (CALL/INVOKE_OTHER_CONTRACT). Its
// source is written to a sibling .h so the build can compile its types at `slot` (the deployed index).
export interface CompileCallee {
  name: string;
  source: string;
  slot: number;
}

export interface CompileRequest {
  source: string;
  name?: string;
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
  error?: string;    // a server-side failure (toolchain missing, etc.)
}

// The core-lite header snapshot buildContract compiles against. QINIT_CORE wins; otherwise the snapshot
// synced by `qinit up` (recorded in ~/.cache/qinit/current.json) — the same headers the CLI uses.
function resolveCorePath(): string | null {
  const env = process.env.QINIT_CORE;
  if (env && existsSync(env)) {
    return env;
  }

  try {
    const cur = JSON.parse(readFileSync(join(process.env.HOME ?? "", ".cache/qinit/current.json"), "utf8"));
    if (cur.coreHeaders && existsSync(cur.coreHeaders)) {
      return cur.coreHeaders;
    }
  } catch {
    // no synced snapshot — fall through to null
  }

  return null;
}

// Parse clang's `file:line:col: error|warning: message` lines into editor diagnostics. Only the contract
// file's own lines matter (diagnostics inside qpi.h / the build wrapper are toolchain-internal).
function parseDiagnostics(stderr: string, contractFile: string): CompileDiagnostic[] {
  const out: CompileDiagnostic[] = [];
  const re = /^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.*)$/gm;

  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    if (!m[1].endsWith(contractFile)) {
      continue;
    }
    out.push({ severity: m[4] as "error" | "warning", line: Number(m[2]), column: Number(m[3]), message: m[5].trim() });
  }

  return out;
}

function sanitizeName(raw: string | undefined): string {
  const n = (raw ?? "Contract").replace(/[^A-Za-z0-9_]/g, "");
  return n.length ? n : "Contract";
}

const cache = new Map<string, CompileResponse>();

// Build concurrency pool. One clang on one TU is single-threaded, so the throughput lever is running several
// builds at once — up to LIMIT in parallel, the rest queued. Default ~ (cores − 1) capped at 8 (clang is also
// RAM-heavy); QINIT_BUILD_CONCURRENCY overrides.
const LIMIT = Math.max(1, Number(process.env.QINIT_BUILD_CONCURRENCY) || Math.min(8, Math.max(1, (cpus()?.length ?? 4) - 1)));
let active = 0;  // builds running now
let queued = 0;  // builds waiting for a slot
const waiters: Array<() => void> = [];

// Snapshot of the pool, for the /api/compile/queue endpoint the IDE polls while a build is pending.
export function buildQueueState(): { active: number; queued: number; limit: number } {
  return { active, queued, limit: LIMIT };
}

// Run `fn` once a build slot is free; releases the slot (and wakes the next waiter) when done.
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= LIMIT) {
    queued++;
    await new Promise<void>((resolve) => waiters.push(resolve));
    queued--;
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = waiters.shift();
    if (next) {
      next();
    }
  }
}

async function runBuild(req: CompileRequest): Promise<CompileResponse> {
  const corePath = resolveCorePath();
  if (!corePath) {
    return { ok: false, diagnostics: [], error: "core headers not found — set QINIT_CORE or run `qinit up`." };
  }

  const name = sanitizeName(req.name);
  const slot = Number.isFinite(req.slot) ? Number(req.slot) : 28;
  const dir = mkdtempSync(join(tmpdir(), "qinit-ide-"));
  const contractFile = `${name}.h`;
  const contractPath = join(dir, contractFile);

  try {
    writeFileSync(contractPath, req.source);

    // Inter-contract callees: write each referenced contract's source to a sibling <Name>.h and map
    // Type -> { header, deployed slot index }. buildContract's buildCalleePrelude stitches their types in
    // and emits the per-fn inputType constants the CALL/INVOKE_OTHER_CONTRACT macros need.
    const dynCallees: Record<string, { header: string; index: number }> = {};
    for (const c of req.callees ?? []) {
      const cname = sanitizeName(c.name);
      const cpath = join(dir, `${cname}.h`);
      writeFileSync(cpath, c.source);
      dynCallees[cname] = { header: cpath, index: Number(c.slot) };
    }

    const r = await buildContract({ contractPath, name, slot, corePath, outDir: dir, skipVerify: req.skipVerify, dynCallees });
    const diagnostics = parseDiagnostics(r.stderr ?? "", contractFile);

    if (!r.ok || !r.so) {
      return { ok: false, diagnostics, verify: r.verify, stderr: r.stderr };
    }

    const wasm = readFileSync(r.so);
    return {
      ok: true,
      wasm: wasm.toString("base64"),
      size: r.size,
      hash: r.hash,
      idl: r.idl,
      verify: r.verify,
      diagnostics,
      stderr: r.stderr,
      idlError: r.idlError,
    };
  } catch (e) {
    return { ok: false, diagnostics: [], error: (e as Error).message };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function compile(req: CompileRequest): Promise<CompileResponse> {
  const key = createHash("sha256")
    .update(`${req.slot ?? 28}\0${req.name ?? ""}\0${req.skipVerify ? 1 : 0}\0${JSON.stringify(req.callees ?? [])}\0${req.source}`)
    .digest("hex");

  const hit = cache.get(key);
  if (hit) {
    return hit;
  }

  return withSlot(async () => {
    // Re-check: an identical build may have finished (and cached) while this one waited for a slot.
    const queuedHit = cache.get(key);
    if (queuedHit) {
      return queuedHit;
    }

    const res = await runBuild(req);
    if (res.ok) {
      cache.set(key, res);
    }
    return res;
  });
}

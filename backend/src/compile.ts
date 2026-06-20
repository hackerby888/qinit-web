// /api/compile — compile a qpi.h dynamic contract to wasm with the qinit toolchain (@qinit/build's
// buildContract: native clang via the synced wasi-sdk + the core-lite header snapshot). The browser IDE
// POSTs the editor source here and runs the returned wasm in-page via @qinit/engine's InProcessEngine,
// byte-identical to the node. Builds are serialized (clang is heavy) and memoized by a hash of the input.
import { buildContract } from "@qinit/build";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

export interface CompileRequest {
  source: string;
  name?: string;
  slot?: number;
  skipVerify?: boolean;
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

// Serialize builds: clang is CPU/IO heavy and writes shared temp dirs — one at a time keeps the box sane.
let queue: Promise<unknown> = Promise.resolve();

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
    const r = await buildContract({ contractPath, name, slot, corePath, outDir: dir, skipVerify: req.skipVerify });
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
    .update(`${req.slot ?? 28}\0${req.name ?? ""}\0${req.skipVerify ? 1 : 0}\0${req.source}`)
    .digest("hex");

  const hit = cache.get(key);
  if (hit) {
    return hit;
  }

  const run = queue.then(() => runBuild(req));
  queue = run.catch(() => undefined);

  const res = await run;
  if (res.ok) {
    cache.set(key, res);
  }

  return res;
}

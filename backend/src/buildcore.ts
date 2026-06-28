// The actual contract build: write the source(s) to a temp dir, run @qinit/build's buildContract (native clang
// via the synced wasi-sdk + core-lite headers), parse diagnostics, return the wasm. This is the only module
// that imports the toolchain. It runs inside the sandboxed worker process (compile-worker.ts) — see sandbox.ts.
import { buildContract } from "@qinit/build";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompileRequest, CompileResponse, CompileDiagnostic } from "./buildtypes";

// The core-lite header snapshot buildContract compiles against. QINIT_CORE wins; otherwise the snapshot synced
// by `qinit up` (recorded in ~/.cache/qinit/current.json) — the same headers the CLI uses.
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

// Parse clang's `file:line:col: error|warning: message` lines into editor diagnostics. Only the contract file's
// own lines matter (diagnostics inside qpi.h / the build wrapper are toolchain-internal).
function parseDiagnostics(stderr: string, files: string[]): CompileDiagnostic[] {
  const out: CompileDiagnostic[] = [];
  const re = /^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.*)$/gm;

  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    if (!files.some((f) => m![1].endsWith(f))) {
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

export async function runBuild(req: CompileRequest): Promise<CompileResponse> {
  const corePath = resolveCorePath();
  if (!corePath) {
    return { ok: false, diagnostics: [], error: "core headers not found — set QINIT_CORE or run `qinit up`." };
  }

  const name = sanitizeName(req.name);
  const stateType = req.stateType ? sanitizeName(req.stateType) : undefined; // C++ struct type when != ticker (QTRY -> QUOTTERY)
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

    // gtest build: compile the test source INTO the wasm after the contract (a combined module runTests drives).
    const testName = req.testSource ? (req.testName ? sanitizeName(req.testName.replace(/\.(cpp|cc|cxx)$/i, "")) + ".test.cpp" : `${name}.test.cpp`) : undefined;
    const r = await buildContract({ contractPath, name, stateType, slot, corePath, outDir: dir, skipVerify: req.skipVerify, dynCallees, arenaSz: req.arenaSz ?? 64 * 1024 * 1024, testSource: req.testSource, testPath: testName });
    const diagnostics = parseDiagnostics(r.stderr ?? "", testName ? [contractFile, testName] : [contractFile]);

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

// Run one contract build inside a killable, resource-limited child process. The toolchain (clang via
// @qinit/build) compiles untrusted user source, so it must not be able to hang or OOM the API server:
//   - a hard wall-clock TIMEOUT — on expiry the whole process group is SIGKILLed (clang grandchildren too);
//   - OS rlimits via `ulimit` in the wrapping shell — CPU seconds, address space, output file size.
// Memory via `ulimit -v` (address space) is a soft backstop; true RSS/network isolation wants cgroups or a
// container (a follow-up Layer). The build runs in compile-worker.ts; results come back as JSON on stdout.
import { spawn } from "node:child_process";
import type { CompileRequest, CompileResponse } from "./buildtypes";

const WORKER = new URL("./compile-worker.ts", import.meta.url).pathname;

const num = (v: string | undefined, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

const TIMEOUT_MS = num(process.env.QINIT_BUILD_TIMEOUT_MS, 30_000);
const CPU_SEC = num(process.env.QINIT_BUILD_CPU_SEC, 30);
const MEM_MB = num(process.env.QINIT_BUILD_MEM_MB, 4096);
const FILE_MB = num(process.env.QINIT_BUILD_FILE_MB, 64);

const fail = (error: string): CompileResponse => ({ ok: false, diagnostics: [], error });

export function runSandboxedBuild(req: CompileRequest): Promise<CompileResponse> {
  return new Promise((resolve) => {
    // ulimit: -t CPU seconds, -v address space (KB), -f max output file (512-byte blocks). Then exec the
    // worker. The runtime is whatever launched us (bun) — re-exec it on the worker .ts.
    const runtime = process.execPath; // e.g. the bun binary
    const script = `ulimit -t ${CPU_SEC} -v ${MEM_MB * 1024} -f ${FILE_MB * 2048} 2>/dev/null; exec '${runtime}' '${WORKER}'`;
    const child = spawn("bash", ["-c", script], { detached: true, stdio: ["pipe", "pipe", "pipe"] });

    let out = "";
    let err = "";
    let settled = false;

    const finish = (res: CompileResponse): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };

    const timer = setTimeout(() => {
      // Kill the whole process group (negative pid) so clang + any grandchildren die, not just bash.
      try {
        if (child.pid) {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        // already gone
      }
      finish(fail(`build timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });

    child.on("error", (e) => {
      finish(fail(`sandbox spawn failed: ${e.message}`));
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      if (signal === "SIGKILL" || signal === "SIGXCPU" || signal === "SIGXFSZ") {
        finish(fail("build killed — hit a CPU / memory / output resource limit"));
        return;
      }
      try {
        finish(JSON.parse(out) as CompileResponse);
      } catch {
        finish(fail(err.trim().slice(-500) || `build worker exited ${code} with no result`));
      }
    });

    child.stdin.write(JSON.stringify(req));
    child.stdin.end();
  });
}

// in-browser .ts test runner — runs the SAME test file the qinit CLI runs under `bun test`, against the in-page
// engine. A qinit test imports `{ test, expect, … }` from "bun:test" and the generated typed clients
// `{ Counter, provider }` from "./.qinit"; here those imports are stripped and the same names are injected.
// The test body runs in a worker (./sandbox.ts, ./test-worker.ts); this side transpiles the file, serves the
// worker's chain calls from the engine, and stops a run that outlives its time or that the developer stops.
import type { ContractIdlView as ContractIdl } from "../calls/idl-view";
import type { IdeEngine, Account, DeployImage } from "../engine/proxy";
import { nameOutput } from "../calls/output-values";
import type { ProcedureOptions, ProcedureOutcome, SandboxBridge, SandboxContract, SandboxEvent, TestResult } from "./sandbox";

export type { TestResult } from "./sandbox";

export interface TestContract {
  name: string;
  slot: number;
  idl: ContractIdl;
  source: string;
  wasm: Uint8Array;
}

export interface TestDeps {
  eng: IdeEngine;
  contracts: Record<string, TestContract>;
  accounts: Account[];
  // called once the run has replaced the chain, so the shell can drop what it showed of the old one.
  onChainReset?: () => void;
}

export interface RunControl {
  timeoutMs?: number;
  // aborting stops the run; the test in flight is reported as stopped.
  signal?: AbortSignal;
  onProgress?: (results: TestResult[]) => void;
}

// a whole file gets this long. A test that spins forever once froze the tab for good.
export const TEST_FILE_TIMEOUT_MS = 60_000;

export type TestWorkerRequest = { kind: "call"; id: number; method: keyof SandboxBridge; args: unknown[] } | { kind: "event"; event: SandboxEvent };
export type TestWorkerReply = { kind: "run"; js: string; contracts: SandboxContract[] } | { kind: "reply"; id: number; ok: boolean; value?: unknown; error?: string };

const fileError = (error: string): TestResult[] => [{ name: "(test file)", ok: false, ms: 0, error, logs: [] }];

// Drop the ESM imports (bun:test / ./.qinit) — their names are injected as globals — and any `export`.
// Each removed line keeps its line breaks, so a syntax error is still reported on the line the developer sees.
function stripModuleSyntax(src: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, "");
  return src
    .replace(/^[ \t]*import\s[\s\S]*?from\s*["'][^"']+["'];?[ \t]*$/gm, blank)
    .replace(/^[ \t]*import\s*["'][^"']+["'];?[ \t]*$/gm, blank)
    .replace(/^([ \t]*)export\s+(?=(default|const|function|class|let|var)\b)/gm, "$1");
}

// the clients a file imports from "./.qinit" that no build has produced yet.
function unbuiltContracts(source: string, built: Record<string, TestContract>): string[] {
  const imported = [...source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']\.\/\.qinit["']/g)].flatMap((match) => match[1].split(","));
  const names = imported.map((name) => name.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean);
  return names.filter((name) => name !== "provider" && !(name in built));
}

async function transpile(source: string): Promise<{ js: string } | { error: string }> {
  const tsmod = (await import("typescript")) as unknown as { default?: typeof import("typescript") } & typeof import("typescript");
  const ts = tsmod.default ?? tsmod;
  const output = ts.transpileModule(stripModuleSyntax(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
    reportDiagnostics: true,
  });

  // transpileModule emits something for a file that does not parse, and that something used to run and pass.
  const errors = (output.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const lines = errors.map((diagnostic) => {
      const line = diagnostic.file && diagnostic.start !== undefined ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : 0;
      return `${line ? `line ${line}: ` : ""}${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
    });
    return { error: `syntax error — ${lines.join("; ")}` };
  }
  return { js: output.outputText };
}

const sandboxContract = (contract: TestContract): SandboxContract => ({
  name: contract.name,
  functions: Object.entries(contract.idl.functions).map(([id, entry]) => ({ id, name: entry.name })),
  procedures: Object.entries(contract.idl.procedures).map(([id, entry]) => ({ id, name: entry.name, hasInput: entry.inFields.length > 0 })),
});

export async function runTests(source: string, deps: TestDeps, control: RunControl = {}): Promise<TestResult[]> {
  const unbuilt = unbuiltContracts(source, deps.contracts);
  if (unbuilt.length) {
    return fileError(unbuilt.map((name) => `${name} is not built yet — open ${name}.h and press ▶ Compile & Run first`).join("; "));
  }

  const transpiled = await transpile(source);
  if ("error" in transpiled) {
    return fileError(transpiled.error);
  }

  const { eng } = deps;
  const wasRunning = eng.isRunning();
  const images: DeployImage[] = Object.values(deps.contracts).map((c) => ({ slot: c.slot, wasm: c.wasm, name: c.name }));

  // what the worker may ask of the chain. Tests run on one fresh chain for the file, with the auto-ticker held so ticks only move when a test moves them.
  const bridge: SandboxBridge = {
    async reset() {
      eng.pause();
      await eng.reset(images);
      deps.onChainReset?.();
    },
    async callFunction(contract, fnId, input) {
      const target = deps.contracts[contract];
      const entry = target.idl.functions[fnId];
      return nameOutput(entry, await eng.callFunction(target.slot, fnId, entry, input));
    },
    async submitProcedure(contract, procId, input, options: ProcedureOptions): Promise<ProcedureOutcome> {
      const target = deps.contracts[contract];
      const entry = target.idl.procedures[procId];
      const caller = { seed: options.seed ?? deps.accounts[0]?.seed ?? "a".repeat(55), amount: options.amount ?? 0 };
      const key = `test:${target.name}:${entry.name}:${Math.random().toString(36).slice(2)}`;
      const sent = await eng.submitProcedure(target.slot, procId, entry, input, key, caller, { name: target.name, source: target.source });
      return { ok: true, txId: sent.txId, tick: sent.targetTick, confirmed: true, included: sent.included, moneyFlew: sent.moneyFlew };
    },
  };

  const worker = new Worker(new URL("./test-worker.ts", import.meta.url), { type: "module" });
  const results: TestResult[] = [];
  let running: { name: string; since: number } | null = null;

  try {
    return await new Promise<TestResult[]>((resolve) => {
      let settled = false;
      const finish = (outcome: TestResult[]) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(outcome);
        }
      };
      // the run ended before the worker finished: report the test that was in flight, with why.
      const cut = (why: string) => finish([...results, { name: running?.name ?? "(test file)", ok: false, ms: running ? Math.round(performance.now() - running.since) : 0, error: why, logs: [] }]);
      const limit = control.timeoutMs ?? TEST_FILE_TIMEOUT_MS;
      const timer = setTimeout(() => cut(`timed out after ${Math.round(limit / 1000)} s — the run was stopped`), limit);
      control.signal?.addEventListener("abort", () => cut("stopped"), { once: true });

      worker.onerror = (event) => cut(`the test worker failed: ${event.message}`);
      worker.onmessage = (event: MessageEvent<TestWorkerRequest>) => {
        const message = event.data;
        if (message.kind === "call") {
          const serve = bridge[message.method] as (...args: unknown[]) => Promise<unknown>;
          serve(...message.args).then(
            (value) => worker.postMessage({ kind: "reply", id: message.id, ok: true, value } satisfies TestWorkerReply),
            (error) => worker.postMessage({ kind: "reply", id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies TestWorkerReply),
          );
          return;
        }

        const sandboxEvent = message.event;
        if (sandboxEvent.kind === "start") {
          running = { name: sandboxEvent.name, since: performance.now() };
        } else if (sandboxEvent.kind === "result") {
          running = null;
          results.push(sandboxEvent.result);
          control.onProgress?.([...results]);
        } else {
          finish(sandboxEvent.kind === "file-error" ? [{ name: "(test file)", ok: false, ms: 0, error: sandboxEvent.error, logs: sandboxEvent.logs }] : results);
        }
      };

      worker.postMessage({ kind: "run", js: transpiled.js, contracts: Object.values(deps.contracts).filter((c) => /^[A-Za-z_$][\w$]*$/.test(c.name)).map(sandboxContract) } satisfies TestWorkerReply);
    });
  } finally {
    worker.terminate();
    // a chain the developer paused stays paused.
    if (wasRunning) eng.resume();
  }
}

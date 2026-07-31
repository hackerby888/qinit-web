// In-browser .ts test runner — runs the SAME test file the qinit CLI runs under `bun test`, but in this page
// against the in-page engine. A qinit test imports `{ test, expect, … }` from "bun:test" and the generated
// typed clients `{ Counter, provider }` from "./.qinit"; here those imports are stripped and the same names
// are injected as globals: the bun:test lifecycle fns, a `provider()`, and a class per deployed contract with
// the same method shapes as `generateClient` (functions read, procedures synchronously include their signed
// transaction in the next tick). The chain is reset once at the start, then tests run in order.
import type { ContractIdlView as ContractIdl, EntryView as IdlEntry } from "../idl-view";
import type { IdeEngine, Account, DeployImage } from "../engine";

export interface TestResult {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
  logs: string[];
}

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
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;

function fmt(v: unknown): string {
  if (typeof v === "bigint") {
    return `${v}n`;
  }
  if (typeof v === "object" && v !== null) {
    return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
  }
  return String(v);
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a === "bigint" || typeof b === "bigint") {
    try {
      return BigInt(a as never) === BigInt(b as never);
    } catch {
      return false;
    }
  }
  return false;
}

function deepEq(a: unknown, b: unknown): boolean {
  if (looseEq(a, b)) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) {
    return false;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) {
    return false;
  }
  return ka.every((k) => deepEq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

// Minimal bun:test/jest matcher.
function makeExpect() {
  return (actual: unknown) => ({
    toBe(expected: unknown) {
      if (!looseEq(actual, expected)) {
        throw new Error(`expected ${fmt(actual)} to be ${fmt(expected)}`);
      }
    },
    toEqual(expected: unknown) {
      if (!deepEq(actual, expected)) {
        throw new Error(`expected ${fmt(actual)} to equal ${fmt(expected)}`);
      }
    },
    toBeGreaterThan(expected: unknown) {
      if (!(BigInt(actual as never) > BigInt(expected as never))) {
        throw new Error(`expected ${fmt(actual)} > ${fmt(expected)}`);
      }
    },
    toBeLessThan(expected: unknown) {
      if (!(BigInt(actual as never) < BigInt(expected as never))) {
        throw new Error(`expected ${fmt(actual)} < ${fmt(expected)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`expected ${fmt(actual)} to be truthy`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`expected ${fmt(actual)} to be falsy`);
      }
    },
  });
}

// The engine decodes a function output positionally (by format, no names); re-attach the IDL field names so a
// test reads `(await c.Get()).value` — matching the generated client's typed output interface.
function nameOutput(entry: IdlEntry, raw: unknown): unknown {
  const fields = entry.outFields ?? [];
  if (fields.length === 0) {
    return raw;
  }
  if (fields.length === 1) {
    return { [fields[0].name]: raw };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && fields.every((f) => f.name in (raw as object))) {
    return raw;
  }
  const arr = Array.isArray(raw) ? raw : [raw];
  const obj: Record<string, unknown> = {};
  fields.forEach((f, i) => {
    obj[f.name] = arr[i];
  });
  return obj;
}

interface ProcOpts {
  seed?: string;
  amount?: number;
  confirm?: boolean;
}

// Build a constructable client class for a contract, mirroring `generateClient`'s shape: `new Counter(opts)`,
// functions return the named output, procedures take `(args?, { amount, seed }?)` and resolve once processed.
function makeContractClass(c: TestContract, eng: IdeEngine, accounts: Account[]): new (opts?: unknown) => Record<string, unknown> {
  class Client {
    constructor(_opts?: unknown) {
      // opts (rpc/index/seed) are a node concern; the in-page client is bound to this deployed contract.
    }
  }

  for (const [fnId, entry] of Object.entries(c.idl.functions) as [string, IdlEntry][]) {
    (Client.prototype as Record<string, unknown>)[entry.name] = async function (input: Record<string, unknown> = {}) {
      return nameOutput(entry, await eng.callFunction(c.slot, fnId, entry, input));
    };
  }

  for (const [procId, entry] of Object.entries(c.idl.procedures) as [string, IdlEntry][]) {
    (Client.prototype as Record<string, unknown>)[entry.name] = async function (input: Record<string, unknown> = {}, opts: ProcOpts = {}) {
      const caller = { seed: opts.seed ?? accounts[0]?.seed ?? "a".repeat(55), amount: Number(opts.amount) || 0 };
      const key = `test:${c.name}:${entry.name}:${Math.random().toString(36).slice(2)}`;
      const { targetTick } = await eng.submitProcedure(c.slot, procId, entry, input, key, caller, { name: c.name, source: c.source });
      return { ok: true, tick: targetTick, confirmed: true, included: true };
    };
  }

  return Client as new (opts?: unknown) => Record<string, unknown>;
}

// Drop the ESM imports (bun:test / ./.qinit) — their names are injected as globals — and any `export`.
function stripModuleSyntax(src: string): string {
  return src
    .replace(/^\s*import\s[\s\S]*?from\s*["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s*["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+(?=(default|const|function|class|let|var)\b)/gm, "");
}

export async function runTests(source: string, deps: TestDeps): Promise<TestResult[]> {
  const tsmod = (await import("typescript")) as unknown as { default?: typeof import("typescript") } & typeof import("typescript");
  const ts = tsmod.default ?? tsmod;
  const js = ts.transpileModule(stripModuleSyntax(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;

  // bun:test-style collection + lifecycle.
  const collected: { name: string; fn: () => unknown }[] = [];
  const beforeAll: (() => unknown)[] = [];
  const beforeEach: (() => unknown)[] = [];
  const afterEach: (() => unknown)[] = [];
  const test = (name: string, fn: () => unknown) => collected.push({ name, fn });
  const describe = (_name: string, fn: () => unknown) => fn(); // flatten — run the body to register its tests

  let logs: string[] = [];
  const sandboxConsole = {
    log: (...a: unknown[]) => logs.push(a.map(fmt).join(" ")),
    error: (...a: unknown[]) => logs.push(a.map(fmt).join(" ")),
    warn: (...a: unknown[]) => logs.push(a.map(fmt).join(" ")),
  };

  // The "./.qinit" surface: provider() (node opts — a no-op here) + a class per deployed contract.
  const provider = () => ({});
  const contractNames = Object.keys(deps.contracts).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  const contractClasses = contractNames.map((n) => makeContractClass(deps.contracts[n], deps.eng, deps.accounts));

  const globalNames = ["test", "expect", "beforeAll", "beforeEach", "afterEach", "describe", "provider", "console", ...contractNames];
  const globalVals: unknown[] = [test, makeExpect(), (fn: () => unknown) => beforeAll.push(fn), (fn: () => unknown) => beforeEach.push(fn), (fn: () => unknown) => afterEach.push(fn), describe, provider, sandboxConsole, ...contractClasses];

  // Register the tests (run the file body). A throw here is a file-level error.
  try {
    const register = new AsyncFunction(...globalNames, js);
    await register(...globalVals);
  } catch (e) {
    return [{ name: "(test file)", ok: false, ms: 0, error: (e as Error).message, logs: [...logs] }];
  }

  // Match the node runner: one fresh chain for the whole file, tests in order. Pause the auto-ticker so tick
  // advancement is deterministic.
  const images: DeployImage[] = Object.values(deps.contracts).map((c) => ({ slot: c.slot, wasm: c.wasm, name: c.name }));
  const results: TestResult[] = [];
  deps.eng.pause();
  try {
    await deps.eng.reset(images);
    for (const h of beforeAll) {
      await h();
    }
    for (const t of collected) {
      logs = [];
      const t0 = performance.now();
      try {
        for (const h of beforeEach) {
          await h();
        }
        await t.fn();
        for (const h of afterEach) {
          await h();
        }
        results.push({ name: t.name, ok: true, ms: Math.round(performance.now() - t0), logs: [...logs] });
      } catch (e) {
        results.push({ name: t.name, ok: false, ms: Math.round(performance.now() - t0), error: (e as Error).message, logs: [...logs] });
      }
    }
  } finally {
    deps.eng.resume();
  }

  return results;
}

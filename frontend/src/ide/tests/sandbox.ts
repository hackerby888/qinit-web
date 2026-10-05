// the body of an in-IDE test run: bun:test's surface (test, expect, hooks) and a client class per contract, with
// every chain call handed to a bridge. It runs in a worker — a test that never returns can then be stopped — and
// imports nothing from the engine, so a unit test can drive it in-process too.

export interface TestResult {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
  logs: string[];
}

// what a client class needs to know about one contract: its entries, and which take an input struct.
export interface SandboxContract {
  name: string;
  functions: { id: string; name: string }[];
  procedures: { id: string; name: string; hasInput: boolean }[];
}

// the options a procedure call takes, as in the CLI's generated client.
export interface ProcedureOptions {
  seed?: string;
  amount?: number | bigint;
  confirm?: boolean;
}

// what a procedure call resolves to: the fields of the CLI client's result that an in-page chain can fill.
export interface ProcedureOutcome {
  ok: boolean;
  txId?: string;
  tick: number;
  confirmed: boolean;
  included: boolean;
  moneyFlew: boolean;
}

export interface SandboxBridge {
  callFunction(contract: string, fnId: string, input: Record<string, unknown>): Promise<unknown>;
  submitProcedure(contract: string, procId: string, input: Record<string, unknown>, options: ProcedureOptions): Promise<ProcedureOutcome>;
  // one fresh chain for the file, asked for once the file has registered its tests.
  reset(): Promise<void>;
}

export type SandboxEvent =
  | { kind: "file-error"; error: string; logs: string[] }
  | { kind: "start"; name: string }
  | { kind: "result"; result: TestResult }
  | { kind: "done" };

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;

function fmt(value: unknown): string {
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? `${item}n` : item));
  }
  return String(value);
}

// toEqual's rule: the same shape and, leaf by leaf, the same value of the same type — 5n is not 5, as under `bun test`.
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || !a || !b || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => key in b && deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// the bun:test matchers a contract test uses. `negated` flips each check, for `.not`.
function matchers(actual: unknown, negated: boolean) {
  const check = (pass: boolean, positive: string, negative: string) => {
    if (pass === negated) {
      throw new Error(negated ? negative : positive);
    }
  };
  const ordered = (expected: unknown, holds: (a: number | bigint, b: number | bigint) => boolean, sign: string) => {
    const comparable = (value: unknown): value is number | bigint => typeof value === "number" || typeof value === "bigint";
    if (!comparable(actual) || !comparable(expected)) {
      throw new Error(`expected a number or bigint on both sides of ${sign}, got ${fmt(actual)} and ${fmt(expected)}`);
    }
    check(holds(actual, expected), `expected ${fmt(actual)} ${sign} ${fmt(expected)}`, `expected ${fmt(actual)} not ${sign} ${fmt(expected)}`);
  };

  return {
    toBe(expected: unknown) {
      check(Object.is(actual, expected), `expected ${fmt(actual)} to be ${fmt(expected)}`, `expected ${fmt(actual)} not to be ${fmt(expected)}`);
    },
    toEqual(expected: unknown) {
      check(deepEqual(actual, expected), `expected ${fmt(actual)} to equal ${fmt(expected)}`, `expected ${fmt(actual)} not to equal ${fmt(expected)}`);
    },
    toBeGreaterThan: (expected: unknown) => ordered(expected, (a, b) => a > b, ">"),
    toBeGreaterThanOrEqual: (expected: unknown) => ordered(expected, (a, b) => a >= b, ">="),
    toBeLessThan: (expected: unknown) => ordered(expected, (a, b) => a < b, "<"),
    toBeLessThanOrEqual: (expected: unknown) => ordered(expected, (a, b) => a <= b, "<="),
    toBeTruthy() {
      check(!!actual, `expected ${fmt(actual)} to be truthy`, `expected ${fmt(actual)} not to be truthy`);
    },
    toBeFalsy() {
      check(!actual, `expected ${fmt(actual)} to be falsy`, `expected ${fmt(actual)} not to be falsy`);
    },
    toBeUndefined() {
      check(actual === undefined, `expected ${fmt(actual)} to be undefined`, "expected a value, got undefined");
    },
    toBeDefined() {
      check(actual !== undefined, "expected a value, got undefined", `expected ${fmt(actual)} to be undefined`);
    },
    toContain(expected: unknown) {
      const holds = typeof actual === "string" ? actual.includes(String(expected)) : Array.isArray(actual) && actual.some((item) => Object.is(item, expected));
      check(holds, `expected ${fmt(actual)} to contain ${fmt(expected)}`, `expected ${fmt(actual)} not to contain ${fmt(expected)}`);
    },
    // `actual` is a function to call; with `expected`, the thrown message must contain it.
    toThrow(expected?: string) {
      let thrown: unknown;
      let threw = false;
      try {
        (actual as () => unknown)();
      } catch (error) {
        thrown = error;
        threw = true;
      }
      const holds = threw && (expected === undefined || messageOf(thrown).includes(expected));
      check(holds, threw ? `expected the error to contain ${fmt(expected)}, got ${fmt(messageOf(thrown))}` : "expected the function to throw", `expected the function not to throw, got ${fmt(messageOf(thrown))}`);
    },
  };
}

function makeExpect() {
  return (actual: unknown) => ({
    ...matchers(actual, false),
    not: matchers(actual, true),
    // a promise that must reject; with `expected`, the error's message must contain it.
    rejects: {
      async toThrow(expected?: string) {
        let thrown: unknown;
        let rejected = false;
        try {
          await actual;
        } catch (error) {
          thrown = error;
          rejected = true;
        }
        if (!rejected) {
          throw new Error("expected the promise to reject");
        }
        if (expected !== undefined && !messageOf(thrown).includes(expected)) {
          throw new Error(`expected the rejection to contain ${fmt(expected)}, got ${fmt(messageOf(thrown))}`);
        }
      },
    },
  });
}

// a client class with the generated client's shape: functions read, procedures take `(args, opts)` — or, for an empty
// input, `(opts)` as well as `({}, opts)`, which is what the typings declare and what the CLI's client accepts.
function contractClass(contract: SandboxContract, bridge: SandboxBridge): new (options?: unknown) => Record<string, unknown> {
  class Client {
    // the constructor options (rpc, index, seed) address a node; the in-page client is bound to the deployed contract.
    constructor(_options?: unknown) {}
  }
  const methods = Client.prototype as unknown as Record<string, unknown>;

  for (const fn of contract.functions) {
    methods[fn.name] = (input: Record<string, unknown> = {}) => bridge.callFunction(contract.name, fn.id, input);
  }
  for (const procedure of contract.procedures) {
    methods[procedure.name] = (argsOrOptions: Record<string, unknown> = {}, maybeOptions?: ProcedureOptions) => {
      const input = procedure.hasInput ? argsOrOptions : {};
      const options = procedure.hasInput ? (maybeOptions ?? {}) : (maybeOptions ?? (argsOrOptions as ProcedureOptions));
      return bridge.submitProcedure(contract.name, procedure.id, input, options);
    };
  }

  return Client as unknown as new (options?: unknown) => Record<string, unknown>;
}

// register the file's tests, ask for a fresh chain, then run hooks and tests in order, reporting each as it finishes.
// `strayRejections` drains promise rejections nobody awaited since the last call; one of those fails the test that was running.
export async function runSandbox(js: string, contracts: SandboxContract[], bridge: SandboxBridge, emit: (event: SandboxEvent) => void, strayRejections: () => string[] = () => []): Promise<void> {
  const collected: { name: string; fn: () => unknown }[] = [];
  const hooks = { beforeAll: [] as (() => unknown)[], afterAll: [] as (() => unknown)[], beforeEach: [] as (() => unknown)[], afterEach: [] as (() => unknown)[] };
  const test = (name: string, fn: () => unknown) => collected.push({ name, fn });
  const describe = (_name: string, fn: () => unknown) => fn(); // flatten — run the body to register its tests

  let logs: string[] = [];
  const print = (...values: unknown[]) => logs.push(values.map((value) => (typeof value === "string" ? value : fmt(value))).join(" "));
  const sandboxConsole = { log: print, info: print, debug: print, warn: print, error: print };

  // the "./.qinit" surface: provider() (node options — nothing to configure here) and a class per deployed contract.
  const globals: Record<string, unknown> = {
    test,
    it: test,
    expect: makeExpect(),
    describe,
    beforeAll: (fn: () => unknown) => hooks.beforeAll.push(fn),
    afterAll: (fn: () => unknown) => hooks.afterAll.push(fn),
    beforeEach: (fn: () => unknown) => hooks.beforeEach.push(fn),
    afterEach: (fn: () => unknown) => hooks.afterEach.push(fn),
    provider: () => ({}),
    console: sandboxConsole,
  };
  for (const contract of contracts) {
    globals[contract.name] = contractClass(contract, bridge);
  }

  try {
    await new AsyncFunction(...Object.keys(globals), js)(...Object.values(globals));
  } catch (error) {
    emit({ kind: "file-error", error: messageOf(error), logs: [...logs] });
    return;
  }

  // one step of the run under a name: its own log, its own verdict, and any rejection left unawaited counted against it.
  const step = async (name: string, body: () => Promise<void>, always: boolean): Promise<void> => {
    logs = [];
    emit({ kind: "start", name });
    const started = performance.now();
    let error: string | undefined;
    try {
      await body();
    } catch (thrown) {
      error = messageOf(thrown);
    }
    // a rejection nobody awaited surfaces a turn later; without this the test stayed green over it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stray = strayRejections();
    error ??= stray.length ? `unhandled rejection: ${stray.join("; ")}` : undefined;
    if (always || error !== undefined) {
      emit({ kind: "result", result: { name, ok: error === undefined, ms: Math.round(performance.now() - started), error, logs: [...logs] } });
    }
  };

  await bridge.reset();
  await step("(beforeAll)", async () => {
    for (const hook of hooks.beforeAll) await hook();
  }, false);

  for (const { name, fn } of collected) {
    await step(name, async () => {
      for (const hook of hooks.beforeEach) await hook();
      await fn();
      for (const hook of hooks.afterEach) await hook();
    }, true);
  }

  await step("(afterAll)", async () => {
    for (const hook of hooks.afterAll) await hook();
  }, false);
  emit({ kind: "done" });
}

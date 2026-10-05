// The in-IDE test runner promises "the same test the CLI runs under bun test". Each case here is a way the two
// disagreed, or a way a run could not be ended.
import { expect, test } from "bun:test";
import { compileContractWithTypeScript as compileContract } from "@qinit/compiler/browser";
import { generateClient } from "../../../../Qinit/packages/build/src/generate/client";
import { IdeEngine } from "../../src/ide/engine";
import { toContractIdlView } from "../../src/ide/idl-view";
import { genQinitDts } from "../../src/ide/tests/dts";
import { runTests, type TestContract } from "../../src/ide/tests/runner";
import { runSandbox, type ProcedureOptions, type SandboxBridge, type SandboxContract, type SandboxEvent, type TestResult } from "../../src/ide/tests/sandbox";

// Deposit has an empty input and takes its payment from the transaction; Add has an input.
const VAULT = `using namespace QPI;

struct Vault : public ContractBase
{
    struct StateData { uint64 total; uint64 deposits; };
    struct Pair { uint32 a; sint64 b; };

    struct Deposit_input {}; struct Deposit_output {};
    struct Add_input { uint64 amount; }; struct Add_output {};
    struct Stats_input {}; struct Stats_output { uint64 total; uint64 deposits; };
    struct Shapes_input { uint8 small; bit flag; id who; Array<uint16, 2> list; Pair pair; };
    struct Shapes_output { sint32 middle; uint64 wide; Array<Pair, 2> pairs; };

    PUBLIC_PROCEDURE(Deposit)
    {
        state.mut().total += qpi.invocationReward();
        state.mut().deposits += 1;
    }

    PUBLIC_PROCEDURE(Add) { state.mut().total += input.amount; }

    PUBLIC_FUNCTION(Stats)
    {
        output.total = state.get().total;
        output.deposits = state.get().deposits;
    }

    PUBLIC_FUNCTION(Shapes) { output.wide = input.small; }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Deposit, 1);
        REGISTER_USER_PROCEDURE(Add, 2);
        REGISTER_USER_FUNCTION(Stats, 1);
        REGISTER_USER_FUNCTION(Shapes, 2);
    }
};`;

const compiled = await compileContract({ source: VAULT, contractName: "Vault", slot: 28, arenaSizeBytes: 64 * 1024 });
const vault: TestContract = { name: "Vault", slot: 28, idl: toContractIdlView(compiled.idl!), source: VAULT, wasm: compiled.wasm };

async function fresh() {
  const eng = new IdeEngine();
  await eng.deploy(vault.slot, vault.wasm, vault.idl);
  const accounts = await eng.ensureAccounts();
  return { eng, deps: { eng, contracts: { Vault: vault }, accounts } };
}

const HEAD = `import { test, expect, beforeAll } from "bun:test";
import { Vault, provider } from "./.qinit";

let v: Vault;
beforeAll(() => { v = new Vault(provider()); });
`;

const verdicts = (results: TestResult[]) => results.map((result) => [result.name, result.ok ? "ok" : result.error]);

// ---- the sandbox alone, with a recording bridge: what a test file may write, and how its calls are read ----

const SANDBOX_VAULT: SandboxContract = { name: "Vault", functions: [{ id: "1", name: "Stats" }], procedures: [{ id: "1", name: "Deposit", hasInput: false }, { id: "2", name: "Add", hasInput: true }] };

// `strayIn` plays the worker's unhandled-rejection hook: the rejections that surfaced while the named step ran.
async function sandbox(js: string, strayIn: Record<string, string[]> = {}) {
  const sent: Array<{ procId: string; input: Record<string, unknown>; options: ProcedureOptions }> = [];
  const bridge: SandboxBridge = {
    reset: async () => undefined,
    callFunction: async () => ({ total: 5n, deposits: 1n }),
    submitProcedure: async (_contract, procId, input, options) => {
      sent.push({ procId, input, options });
      return { ok: true, txId: "tx", tick: 1, confirmed: true, included: true, moneyFlew: false };
    },
  };
  const events: SandboxEvent[] = [];
  let step = "";
  const stray = () => strayIn[step]?.splice(0) ?? [];
  await runSandbox(js, [SANDBOX_VAULT], bridge, (event) => { events.push(event); if (event.kind === "start") step = event.name; }, stray);
  const results = events.flatMap((event) => (event.kind === "result" ? [event.result] : []));
  return { sent, events, results };
}

// W18: the typings said `Deposit(opts?)`, the runner read argument one as the input, so the typed form paid nothing.
test("an empty-input procedure takes its options first or second, as the CLI client does", async () => {
  const { sent } = await sandbox(`
    test("pay", async () => {
      const v = new Vault();
      await v.Deposit({ amount: 1000 });
      await v.Deposit({}, { amount: 2000n });
      await v.Deposit();
      await v.Add({ amount: 7 }, { amount: 3 });
      await v.Add({ amount: 8 });
    });`);

  expect(sent).toEqual([
    { procId: "1", input: {}, options: { amount: 1000 } },
    { procId: "1", input: {}, options: { amount: 2000n } },
    { procId: "1", input: {}, options: {} },
    { procId: "2", input: { amount: 7 }, options: { amount: 3 } },
    { procId: "2", input: { amount: 8 }, options: {} },
  ]);
});

// W19: toBe went through BigInt(), so expect(5n).toBe(5) passed here and failed under bun test.
test("toBe and toEqual do not treat a bigint and a number as one value", async () => {
  const { results } = await sandbox(`
    test("bigint is not number", () => { expect(5n).toBe(5); });
    test("same bigint", () => { expect(5n).toBe(5n); });
    test("deep bigint is not number", () => { expect({ total: 5n }).toEqual({ total: 5 }); });
    test("deep same", async () => { expect(await new Vault().Stats()).toEqual({ total: 5n, deposits: 1n }); });
    test("ordering mixes them, as bun does", () => { expect(5n).toBeGreaterThan(3); expect(2).toBeLessThanOrEqual(2n); });`);

  expect(verdicts(results)).toEqual([
    ["bigint is not number", "expected 5n to be 5"],
    ["same bigint", "ok"],
    ["deep bigint is not number", 'expected {"total":"5n"} to equal {"total":5}'],
    ["deep same", "ok"],
    ["ordering mixes them, as bun does", "ok"],
  ]);
});

// W-s14: the rest of bun:test's everyday surface.
test("it, afterAll, not, toThrow, toContain, rejects and every console level are there", async () => {
  const { results, events } = await sandbox(`
    let closed = 0;
    afterAll(() => { closed += 1; console.info("closed", closed); });
    it("negation", () => { expect(1).not.toBe(2); expect([1, 2]).not.toContain(3); expect("abc").toContain("b"); });
    it("throws", () => { expect(() => { throw new Error("boom there"); }).toThrow("boom"); expect(() => 1).not.toThrow(); });
    it("rejects", async () => { await expect(Promise.reject(new Error("no balance"))).rejects.toThrow("balance"); });
    it("logs", () => { console.debug("d", 1n); console.info({ a: 1 }); });
    it("wrong negation", () => { expect(1).not.toBe(1); });`);

  expect(verdicts(results)).toEqual([["negation", "ok"], ["throws", "ok"], ["rejects", "ok"], ["logs", "ok"], ["wrong negation", "expected 1 not to be 1"]]);
  expect(results[3].logs).toEqual(["d 1n", '{"a":1}']);
  expect(events.at(-1)).toEqual({ kind: "done" });
});

// W-s15: a rejected call nobody awaited left an uncaught page error while the suite stayed green.
test("a rejection no test awaited fails the test it happened in", async () => {
  const { results } = await sandbox(`test("forgot await", () => {}); test("clean", () => {});`, { "forgot await": ["Deposit failed: invalid amount"] });

  expect(verdicts(results)).toEqual([["forgot await", "unhandled rejection: Deposit failed: invalid amount"], ["clean", "ok"]]);
});

// ---- the whole runner: worker, engine, time limit ----

// W20: the result was a constant, so a test could not see a payment that never moved.
test("a procedure result carries the transaction's own id and whether qu moved", async () => {
  const { eng, deps } = await fresh();
  const held = await eng.balanceOf(deps.accounts[0].id);

  const results = await runTests(`${HEAD}
    test("paid", async () => {
      const r = await v.Deposit({ amount: 1000 });
      expect(r.ok).toBe(true);
      expect(r.confirmed).toBe(true);
      expect(typeof r.txId).toBe("string");
      expect(r.moneyFlew).toBe(true);
      expect(await v.Stats()).toEqual({ total: 1000n, deposits: 1n });
    });
    test("above the balance", async () => {
      const r = await v.Deposit({}, { amount: ${held}n });
      expect(r.moneyFlew).toBe(false);
      expect((await v.Stats()).deposits).toBe(1n);
    });`, deps);

  expect(verdicts(results)).toEqual([["paid", "ok"], ["above the balance", "ok"]]);
  eng.dispose();
});

// W22: transpileModule emits something for a file that does not parse, and that something ran and passed.
test("a file with a syntax error fails, naming the line", async () => {
  const { eng, deps } = await fresh();
  const results = await runTests(`${HEAD}\ntest("broken", async () => { expect(1).toBe(1) `, deps);

  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ name: "(test file)", ok: false });
  expect(results[0].error).toMatch(/^syntax error — line 7: /);
  eng.dispose();
});

test("a client that no build has produced is named, with what to press", async () => {
  const { eng, deps } = await fresh();
  const results = await runTests(`import { test } from "bun:test";\nimport { Ledger, Vault, provider } from "./.qinit";\ntest("x", () => {});`, deps);

  expect(verdicts(results)).toEqual([["(test file)", "Ledger is not built yet — open Ledger.h and press ▶ Compile & Run first"]]);
  eng.dispose();
});

// W21: the test body ran on the page thread, so an endless loop froze the tab with no way out.
test("a test that never returns is cut off at the time limit, and the next run works", async () => {
  const { eng, deps } = await fresh();
  const results = await runTests(`${HEAD}
    test("fine", async () => { await v.Deposit(); });
    test("spins", async () => { while (true) {} });
    test("never reached", () => {});`, deps, { timeoutMs: 1500 });

  expect(verdicts(results)).toEqual([["fine", "ok"], ["spins", "timed out after 2 s — the run was stopped"]]);
  expect(verdicts(await runTests(`${HEAD}\ntest("after", async () => { expect((await v.Stats()).deposits).toBe(0n); });`, deps))).toEqual([["after", "ok"]]);
  eng.dispose();
}, 20_000);

test("a run can be stopped, reporting the test in flight", async () => {
  const { eng, deps } = await fresh();
  const stop = new AbortController();
  const partial: string[][] = [];
  setTimeout(() => stop.abort(), 800);
  const results = await runTests(`${HEAD}
    test("first", () => {});
    test("waits", async () => { await new Promise(() => {}); });`, deps, { signal: stop.signal, onProgress: (so) => partial.push(so.map((r) => r.name)) });

  expect(verdicts(results)).toEqual([["first", "ok"], ["waits", "stopped"]]);
  expect(partial).toEqual([["first"]]);
  eng.dispose();
}, 20_000);

// W6, W-s11: the run replaces the developer's chain — it must say so — and must not restart a ticker they paused.
test("a run reports the chain it replaced and leaves a paused chain paused", async () => {
  const { eng, deps } = await fresh();
  eng.start();
  eng.pause();
  let replaced = 0;
  const results = await runTests(`${HEAD}\ntest("one", async () => { await v.Deposit(); });`, { ...deps, onChainReset: () => replaced++ });

  expect(verdicts(results)).toEqual([["one", "ok"]]);
  expect(replaced).toBe(1);
  expect(eng.isRunning()).toBe(false);

  eng.resume();
  await runTests(`${HEAD}\ntest("two", () => {});`, deps);
  expect(eng.isRunning()).toBe(true);
  eng.dispose();
});

// ---- the editor's typings must describe the client the CLI generates ----

// one `name: type` per field of an interface the CLI client emits.
function cliFields(client: string, name: string): string[] {
  const body = new RegExp(`export interface ${name} \\{\\n([\\s\\S]*?)\\n\\}`).exec(client)?.[1] ?? "";
  return body.split("\n").map((line) => line.trim().replace(/;$/, "")).filter(Boolean);
}

test("the editor's client typings give every field the type the CLI's generated client gives it", () => {
  const cli = generateClient(compiled.idl!);
  const ide = genQinitDts([vault.idl]);

  for (const [name, fields] of [["Stats_output", cliFields(cli, "Stats_output")], ["Shapes_input", cliFields(cli, "Shapes_input")], ["Shapes_output", cliFields(cli, "Shapes_output")]] as const) {
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      // the CLI also takes a byte array as one hex string; the editor's plain array type is the narrower of the two.
      expect([name, ide.includes(field.replace("(number[] | string)", "number[]"))]).toEqual([name, true]);
    }
  }

  expect(ide).toContain("Deposit(argsOrOpts?: {} | { seed?: string; amount?: number | bigint; confirm?: boolean }, maybeOpts?: { seed?: string; amount?: number | bigint; confirm?: boolean }): Promise<");
  expect(ide).toContain("Add(args: { amount: bigint }, opts?: { seed?: string; amount?: number | bigint; confirm?: boolean }): Promise<");
  expect(ide).toContain("Stats(): Promise<{ total: bigint; deposits: bigint }>;");
});

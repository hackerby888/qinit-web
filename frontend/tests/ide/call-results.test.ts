// what the IDE reports about a call must be that call's own: its frame, its prints, whether it ran at all.
// Each test is a finding from the browser campaign, driven here against the real engine and compiler.
import { expect, test } from "bun:test";
import { compileContractWithTypeScript as compileContract, type ContractIdl } from "@qinit/compiler/browser";
import { IdeEngine, type TxProcessed } from "../../src/ide/engine";
import { EXAMPLES } from "../../src/ide/examples";
import { toContractIdlView, type ContractIdlView } from "../../src/ide/idl-view";
import { nameOutput, outputText } from "../../src/ide/output-values";

const exampleSource = (file: string) => EXAMPLES.find((example) => example.file === file)!.source;

interface Built {
  name: string;
  slot: number;
  source: string;
  wasm: Uint8Array;
  idl: ContractIdlView;
  compilerIdl: ContractIdl;
}

async function build(name: string, source: string, slot: number, callees: Built[] = []): Promise<Built> {
  const result = await compileContract({
    source,
    contractName: name,
    slot,
    arenaSizeBytes: 64 * 1024,
    callees: callees.length ? callees.map((callee) => callee.compilerIdl) : undefined,
    calleeSources: callees.length ? callees.map((callee) => ({ name: callee.name, source: callee.source, slot: callee.slot })) : undefined,
  });
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length || !result.idl) {
    throw new Error(errors.map((diagnostic) => diagnostic.message).join("\n") || `${name} did not compile`);
  }
  return { name, slot, source, wasm: result.wasm, idl: toContractIdlView(result.idl), compilerIdl: result.idl };
}

async function deploy(engine: IdeEngine, built: Built): Promise<void> {
  await engine.deploy(built.slot, built.wasm, built.idl);
  engine.registerSource(built.slot, built.source, built.name);
}

function capture(engine: IdeEngine): TxProcessed[] {
  const seen: TxProcessed[] = [];
  engine.onTxProcessed = (event) => seen.push(event);
  return seen;
}

const run = (engine: IdeEngine, built: Built, procId: string, seed: string, amount: bigint | number = 0, input: Record<string, unknown> = {}) =>
  engine.submitProcedure(built.slot, procId, built.idl.procedures[procId], input, `${built.name}:p:${procId}`, { seed, amount }, { name: built.name, source: built.source });

// W12: the trace was read by array position with a 64-entry window, so call 65 onward got no detail and the old one stayed.
test("every call keeps its own trace past the 64th", async () => {
  const counter = await build("Counter", exampleSource("Counter.h"), 28);
  const engine = new IdeEngine();
  await deploy(engine, counter);
  const seen = capture(engine);
  const [caller] = await engine.ensureAccounts();

  for (let call = 1; call <= 70; call++) {
    await run(engine, counter, "1", caller.seed);
  }

  expect(seen).toHaveLength(70);
  expect(seen.map((event) => event.executed)).toEqual(Array(70).fill(true));
  expect(seen[63].detail?.diff).toEqual([{ label: "counter", text: "63 → 64" }]);
  expect(seen[64].detail?.diff).toEqual([{ label: "counter", text: "64 → 65" }]);
  expect(seen[69].detail?.diff).toEqual([{ label: "counter", text: "69 → 70" }]);

  const read = await engine.callFunctionDetailed(counter.slot, "1", counter.idl.functions["1"], {});
  expect(read.output).toBe(70n);
  expect(read.detail?.steps.map((step) => step.label)).toEqual(["function #1"]);
});

// W5: steps arrive in completion order, callee first, and the summary took the first procedure frame.
test("a procedure that calls another contract is summarised by its own frame, the callee beneath it", async () => {
  const counter = await build("Counter", exampleSource("Counter.h"), 28);
  const proxy = await build("Proxy", exampleSource("Proxy.h"), 29, [counter]);
  const engine = new IdeEngine();
  await deploy(engine, counter);
  await deploy(engine, proxy);
  const seen = capture(engine);
  const [caller] = await engine.ensureAccounts();

  const bump = Object.entries(proxy.idl.procedures).find(([, entry]) => entry.name === "BumpCounter")![0];
  await run(engine, proxy, bump, caller.seed);

  const detail = seen[0].detail!;
  expect(detail.caller).toBe(caller.id);
  expect(detail.diff).toEqual([{ label: "bumps", text: "0 → 1" }]);
  expect(detail.hostCalls.some((line) => line.startsWith("invokeProcedure"))).toBe(true);
  expect(detail.callees.map((callee) => `${callee.contract}.${callee.label}`)).toEqual(["Counter.procedure #1"]);
  expect(detail.callees[0].diff).toEqual([{ label: "counter", text: "0 → 1" }]);
});

// W8: the node includes a transfer the balance cannot cover and drops it; the IDE said "applied ✓" and kept the last result.
test("a transaction above the signer's balance is reported as not executed, with no detail", async () => {
  const counter = await build("Counter", exampleSource("Counter.h"), 28);
  const engine = new IdeEngine();
  await deploy(engine, counter);
  const seen = capture(engine);
  const [caller] = await engine.ensureAccounts();
  const held = await engine.balanceOf(caller.id);

  const paid = await run(engine, counter, "1", caller.seed, 5n);
  expect(paid).toMatchObject({ executed: true, moneyFlew: true });
  expect(paid.txId).toMatch(/^[a-z]{60}$/);

  const dropped = await run(engine, counter, "1", caller.seed, held + 1n);
  expect(dropped).toMatchObject({ executed: false, moneyFlew: false });
  expect(seen[1]).toMatchObject({ executed: false, detail: undefined });

  expect(await engine.callFunction(counter.slot, "1", counter.idl.functions["1"], {})).toBe(1n);
  expect(await engine.balanceOf(caller.id)).toBe(held - 5n);
  // W15: what the contract holds is readable at its address.
  expect(await engine.balanceOf(await engine.addressOf(counter.slot))).toBe(5n);
});

// W13: the IDE aimed at the next multiple of the length, one tick short of where the node switches.
test("advanceEpoch crosses the boundary in one step and reports the new epoch's bounds", async () => {
  const counter = await build("Counter", exampleSource("Counter.h"), 28);
  const engine = new IdeEngine();
  await deploy(engine, counter);
  engine.setEpochLength(20);
  await engine.reset([{ slot: counter.slot, wasm: counter.wasm, name: counter.name }]);
  engine.pause();
  expect(engine.epochLength()).toBe(20);

  const before = await engine.info();
  const after = await engine.advanceEpoch();
  expect(after.epoch).toBe(before.epoch + 1);
  expect(after.tick).toBe(after.epochFirstTick);
  expect(after.epochLastTick - after.epochFirstTick + 1).toBe(20);

  // W14: the first tick of an epoch takes a transaction; the old landing tick refused every one.
  const [caller] = await engine.ensureAccounts();
  expect((await run(engine, counter, "1", caller.seed)).executed).toBe(true);
  expect((await engine.advanceEpoch()).epoch).toBe(before.epoch + 2);
});

// W-s11: a reset restarted the ticker under a developer who had paused to look.
test("reset, replay and a scenario run leave a paused chain paused", async () => {
  const counter = await build("Counter", exampleSource("Counter.h"), 28);
  const images = [{ slot: counter.slot, wasm: counter.wasm, name: counter.name }];
  const engine = new IdeEngine();
  await deploy(engine, counter);
  engine.start();

  await engine.reset(images);
  expect(engine.isRunning()).toBe(true);

  engine.pause();
  await engine.reset(images);
  expect(engine.isRunning()).toBe(false);
  await engine.replay(images);
  expect(engine.isRunning()).toBe(false);
  await engine.runSteps(images, []);
  expect(engine.isRunning()).toBe(false);

  const tick = (await engine.info()).tick;
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect((await engine.info()).tick).toBe(tick);
  engine.dispose();
});

const SHAPES = `using namespace QPI;

struct Shapes : public ContractBase
{
    struct StateData { uint64 unused; };
    struct Pair { uint32 a; sint64 b; };

    struct Many_input {}; struct Many_output { uint8 small; uint64 wide; id who; };
    struct One_input {}; struct One_output { uint64 only; };
    struct Wrapped_input {}; struct Wrapped_output { Pair pair; };
    struct Listed_input {}; struct Listed_output { Array<uint64, 4> values; };
    struct Nested_input {}; struct Nested_output { Pair first; Array<Pair, 2> rest; uint64 tail; };
    struct Nothing_input {}; struct Nothing_output {};

    PUBLIC_FUNCTION(Many) { output.small = 255; output.wide = 18446744073709551615ULL; }
    PUBLIC_FUNCTION(One) { output.only = 42; }
    PUBLIC_FUNCTION(Wrapped) { output.pair.a = 7; output.pair.b = -8; }
    PUBLIC_FUNCTION(Listed) { output.values.set(0, 1); output.values.set(3, 4); }
    PUBLIC_FUNCTION(Nested) { output.first.a = 7; output.first.b = -8; output.tail = 99; }
    PUBLIC_FUNCTION(Nothing) { }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_FUNCTION(Many, 1);
        REGISTER_USER_FUNCTION(One, 2);
        REGISTER_USER_FUNCTION(Wrapped, 3);
        REGISTER_USER_FUNCTION(Listed, 4);
        REGISTER_USER_FUNCTION(Nested, 5);
        REGISTER_USER_FUNCTION(Nothing, 6);
    }
};`;

// W11, W25: the engine decodes an output by position; the row and the scenario asserts read it by field name.
test("a function output is named field by field, whatever its shape", async () => {
  const shapes = await build("Shapes", SHAPES, 28);
  const engine = new IdeEngine();
  await deploy(engine, shapes);
  // the zero identity as the node spells it, checksum included.
  const zero = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFXIB";

  const named = async (fnId: string) => nameOutput(shapes.idl.functions[fnId], await engine.callFunction(shapes.slot, fnId, shapes.idl.functions[fnId], {}));

  expect(await named("1")).toEqual({ small: 255, wide: 18446744073709551615n, who: zero });
  expect(await named("2")).toEqual({ only: 42n });
  expect(await named("3")).toEqual({ pair: { a: 7, b: -8n } });
  expect(await named("4")).toEqual({ values: [1n, 0n, 0n, 4n] });
  expect(await named("5")).toEqual({ first: { a: 7, b: -8n }, rest: [{ a: 0, b: 0n }, { a: 0, b: 0n }], tail: 99n });
  expect(await named("6")).toEqual({});

  expect(outputText(await named("1"))).toBe(`{small: 255, wide: 18446744073709551615, who: ${zero}}`);
  expect(outputText(await named("5"))).toBe("{first: {a: 7, b: -8}, rest: [{a: 0, b: 0}, {a: 0, b: 0}], tail: 99}");
  expect(outputText(await named("6"))).toBe("{}");
});

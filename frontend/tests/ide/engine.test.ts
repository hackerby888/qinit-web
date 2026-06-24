// IdeEngine is the in-browser virtual node: deploy a contract, query its functions, and submit procedures
// that land on a future tick (like the live network). This drives the real @qinit engine + codecs (resolved
// from the sibling monorepo via the bun-test alias shim) against the committed Counter fixture wasm.
import { test, expect } from "bun:test";
import { IdeEngine } from "../../src/ide/engine";
import { extractIdl } from "@qinit/build/idl";

// Same shape as the fixture's contract: Inc procedure @1, Get function @1, Get_output { uint64 value }.
const SRC = `using namespace QPI;
struct Counter : public ContractBase {
  struct StateData { uint64 counter; };
  struct Inc_input {}; struct Inc_output {};
  struct Get_input {}; struct Get_output { uint64 value; };
  PUBLIC_PROCEDURE(Inc) { state.mut().counter += 1; }
  PUBLIC_FUNCTION(Get) { output.value = state.get().counter; }
  REGISTER_USER_FUNCTIONS_AND_PROCEDURES() { REGISTER_USER_PROCEDURE(Inc, 1); REGISTER_USER_FUNCTION(Get, 1); }
  INITIALIZE() { state.mut().counter = 0; }
};`;

const idl = extractIdl(SRC, "Counter");
const SLOT = 28;
const TICKS_AHEAD = 3; // IdeEngine schedules a submitted procedure this many ticks ahead.

async function counterWasm(): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(`${import.meta.dir}/fixtures/Counter.wasm`).arrayBuffer());
}

// callFunction returns the decoded output (a single uint64 here); read it as a bigint regardless of shape.
function value(r: unknown): bigint {
  if (typeof r === "bigint") {
    return r;
  }
  if (r && typeof r === "object") {
    const v = (r as Record<string, unknown>).value ?? Object.values(r as Record<string, unknown>)[0];
    return typeof v === "bigint" ? v : BigInt(String(v ?? 0));
  }
  return BigInt(String(r ?? 0));
}

test("IdeEngine: deploy constructs the contract — Get reads the INITIALIZE'd state", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);

  const out = await e.callFunction(SLOT, "1", idl.functions["1"], {});
  expect(value(out)).toBe(0n);
});

test("IdeEngine: a submitted procedure is deferred to its target tick, then mutates state", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);

  const [caller] = await e.ensureAccounts();
  await e.submitProcedure(SLOT, "1", idl.procedures["1"], {}, "inc-1", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });

  // In the mempool, not yet applied — Get still reads the initial value.
  expect(value(await e.callFunction(SLOT, "1", idl.functions["1"], {}))).toBe(0n);

  await e.step(TICKS_AHEAD + 1);
  expect(value(await e.callFunction(SLOT, "1", idl.functions["1"], {}))).toBe(1n);
});

test("IdeEngine: reset rebuilds the chain from genesis — state returns to its INITIALIZE'd value", async () => {
  const e = new IdeEngine();
  const wasm = await counterWasm();
  await e.deploy(SLOT, wasm, idl);

  const [caller] = await e.ensureAccounts();
  await e.submitProcedure(SLOT, "1", idl.procedures["1"], {}, "inc-1", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });
  await e.step(TICKS_AHEAD + 1);
  expect(value(await e.callFunction(SLOT, "1", idl.functions["1"], {}))).toBe(1n);

  await e.reset([{ slot: SLOT, wasm, name: "Counter" }]);
  e.stop(); // reset re-arms the auto-ticker; stop it so the assert is deterministic (and no timer leaks)
  expect(value(await e.callFunction(SLOT, "1", idl.functions["1"], {}))).toBe(0n);
});

test("IdeEngine: fundAccount credits the spectrum and balanceOf reads it back", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);

  const accts = await e.ensureAccounts();
  const id = accts[1].id;
  const before = await e.balanceOf(id);

  e.fundAccount(id, 5_000n);
  expect((await e.balanceOf(id)) - before).toBe(5_000n);
});

test("IdeEngine: contracts at different slots keep independent state", async () => {
  const e = new IdeEngine();
  const wasm = await counterWasm();
  await e.deploy(28, wasm, idl);
  await e.deploy(29, wasm, idl);

  const [caller] = await e.ensureAccounts();
  await e.submitProcedure(28, "1", idl.procedures["1"], {}, "inc-28", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });
  await e.step(TICKS_AHEAD + 1);

  expect(value(await e.callFunction(28, "1", idl.functions["1"], {}))).toBe(1n);
  expect(value(await e.callFunction(29, "1", idl.functions["1"], {}))).toBe(0n);
});

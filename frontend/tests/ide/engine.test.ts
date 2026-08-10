// IdeEngine is the in-browser virtual node: deploy a contract, query its functions, and execute procedures
// synchronously in the next tick. This drives the real @qinit engine + codecs (resolved
// from the sibling monorepo via the bun-test alias shim) against a current compiler artifact.
import { test, expect } from "bun:test";
import { compileContract } from "@qinit/compiler/browser";
import { IdeEngine } from "../../src/ide/engine";
import { extractContractIdlView as extractIdl } from "../../src/ide/idl-view";

// Inc procedure @1, Get function @1, Get_output { uint64 value }.
const SRC = `using namespace QPI;

struct Counter : public ContractBase
{
    struct StateData
    {
        uint64 counter;
    };

    struct Inc_input {};
    struct Inc_output {};
    struct Get_input {};
    struct Get_output { uint64 value; };

    PUBLIC_PROCEDURE(Inc)
    {
        state.mut().counter += 1;
    }

    PUBLIC_FUNCTION(Get)
    {
        output.value = state.get().counter;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Inc, 1);
        REGISTER_USER_FUNCTION(Get, 1);
    }
};`;

const idl = extractIdl(SRC, "Counter");
const SLOT = 28;

async function counterWasm(slot = SLOT): Promise<Uint8Array> {
  const result = await compileContract({
    source: SRC,
    contractName: "Counter",
    slot,
    arenaSizeBytes: 64 * 1024,
  });
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length || result.wasm.byteLength === 0 || !result.idl) {
    throw new Error(errors.map((diagnostic) => diagnostic.message).join("\n") || "Counter compilation failed");
  }
  return result.wasm;
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
  const memory = e.memoryUsage();
  expect(memory.contractCount).toBe(1);
  expect(memory.stateBytes).toBe(8);
  expect(memory.linearMemoryBytes).toBeGreaterThan(memory.stateBytes);
});

test("IdeEngine: detailed function calls return a decoded function trace", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);
  e.registerSource(SLOT, SRC, "Counter");
  e.start();
  e.stop();

  const result = await e.callFunctionDetailed(SLOT, "1", idl.functions["1"], {});
  expect(value(result.output)).toBe(0n);
  expect(result.detail?.steps.some((step) => step.kind === 0 && step.entry === 1)).toBe(true);
  expect(result.detail?.logs).toEqual([]);
});

test("IdeEngine: a submitted procedure is included synchronously in the next tick", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);

  const [caller] = await e.ensureAccounts();
  const before = await e.info();
  const { targetTick } = await e.submitProcedure(SLOT, "1", idl.procedures["1"], {}, "inc-1", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });

  expect(targetTick).toBe(before.tick + 1);
  expect((await e.info()).tick).toBe(targetTick);
  expect(value(await e.callFunction(SLOT, "1", idl.functions["1"], {}))).toBe(1n);
});

test("IdeEngine: reset rebuilds the chain from genesis — state returns to its INITIALIZE'd value", async () => {
  const e = new IdeEngine();
  const wasm = await counterWasm();
  await e.deploy(SLOT, wasm, idl);

  const [caller] = await e.ensureAccounts();
  await e.submitProcedure(SLOT, "1", idl.procedures["1"], {}, "inc-1", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });
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
  await e.deploy(28, await counterWasm(28), idl);
  await e.deploy(29, await counterWasm(29), idl);

  const [caller] = await e.ensureAccounts();
  await e.submitProcedure(28, "1", idl.procedures["1"], {}, "inc-28", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });

  expect(value(await e.callFunction(28, "1", idl.functions["1"], {}))).toBe(1n);
  expect(value(await e.callFunction(29, "1", idl.functions["1"], {}))).toBe(0n);
});

test("IdeEngine: addressOf returns the contract's 60-char identity", async () => {
  const e = new IdeEngine();

  const addr = await e.addressOf(SLOT);
  expect(typeof addr).toBe("string");
  expect(addr.length).toBe(60);
});

test("IdeEngine: onTxProcessed fires with a decoded trace when a procedure lands", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);
  e.start();
  e.stop(); // start() turns on debug-trace capture; stop() drops the auto-ticker so we drive ticks by hand

  const seen: Array<{ key: string; name: string; detail?: { steps: unknown[] } }> = [];
  e.onTxProcessed = (ev) => seen.push(ev as never);

  const [caller] = await e.ensureAccounts();
  await e.submitProcedure(SLOT, "1", idl.procedures["1"], {}, "inc-1", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });

  expect(seen.length).toBe(1);
  expect(seen[0].key).toBe("inc-1");
  expect(seen[0].name).toBe("Inc");
  expect(Array.isArray(seen[0].detail?.steps)).toBe(true);
  expect(seen[0].detail!.steps.length).toBeGreaterThan(0);
});

test("IdeEngine: stateOf decodes the live StateData scalars before and after a mutation", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);

  const before = await e.stateOf(SLOT, SRC, "Counter");
  expect(before.fields).toEqual([{ name: "counter", value: "0" }]);
  expect(before.containers).toEqual([]);

  const [caller] = await e.ensureAccounts();
  await e.submitProcedure(SLOT, "1", idl.procedures["1"], {}, "inc-1", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });

  const after = await e.stateOf(SLOT, SRC, "Counter");
  expect(after.fields).toEqual([{ name: "counter", value: "1" }]);
});

test("IdeEngine: stateOf exposes the current container line model", async () => {
  const source = `using namespace QPI;

struct ArrayState : public ContractBase
{
    struct StateData { uint64 values[2]; };
    struct Get_input {};
    struct Get_output {};

    PUBLIC_FUNCTION(Get) {}

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_FUNCTION(Get, 1);
    }
};`;
  const contractIdl = extractIdl(source, "ArrayState");
  const compiled = await compileContract({ source, contractName: "ArrayState", slot: SLOT, arenaSizeBytes: 64 * 1024 });
  expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);

  const engine = new IdeEngine();
  await engine.deploy(SLOT, compiled.wasm, contractIdl);
  const state = await engine.stateOf(SLOT, source, "ArrayState");

  expect(state.containers).toMatchObject([{
    name: "values",
    kind: "array",
    status: "loaded",
    totalEntries: 0,
    lines: [{ label: "[0..1]", text: "=0 ×2 (skipped)", filled: false }],
  }]);
});

test("IdeEngine: assets reports the deployed contract's post-IPO shares", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);

  const assets = e.assets();
  expect(assets.length).toBe(1);
  expect(assets[0].name).toBe("COUNTER");
  expect(assets[0].totalShares).toBe("676");
  expect(assets[0].holdings.reduce((sum, holding) => sum + BigInt(holding.shares), 0n)).toBe(676n);
});

test("IdeEngine: replay re-drives the recorded history from genesis to the same state", async () => {
  const e = new IdeEngine();
  const wasm = await counterWasm();
  await e.deploy(SLOT, wasm, idl);

  const [caller] = await e.ensureAccounts();
  await e.submitProcedure(SLOT, "1", idl.procedures["1"], {}, "inc-1", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });
  expect(value(await e.callFunction(SLOT, "1", idl.functions["1"], {}))).toBe(1n);
  expect(e.exportHistory().length).toBe(1);

  await e.replay([{ slot: SLOT, wasm, name: "Counter" }]);
  e.stop();
  expect(value(await e.callFunction(SLOT, "1", idl.functions["1"], {}))).toBe(1n);
});

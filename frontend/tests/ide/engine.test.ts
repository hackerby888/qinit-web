// IdeEngine is the in-browser virtual node: deploy a contract, query its functions, and execute procedures
// synchronously in the next tick. This drives the real @qinit engine + codecs (resolved
// from the sibling monorepo via the bun-test alias shim) against a current compiler artifact.
import { test, expect } from "bun:test";
import { compileContractWithTypeScript as compileContract } from "@qinit/compiler/browser";
import { DEFAULT_EPOCH_LENGTH } from "@qinit/engine";
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

const TRAP_SRC = `using namespace QPI;

struct Trap : public ContractBase
{
    struct StateData { uint64 counter; };
    struct Bump_input {}; struct Bump_output {};
    struct Div_input { uint64 a; uint64 b; }; struct Div_output {};

    PUBLIC_PROCEDURE(Bump) { state.mut().counter += 1; }
    PUBLIC_PROCEDURE(Div) { state.mut().counter = input.a / input.b; }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Bump, 1);
        REGISTER_USER_PROCEDURE(Div, 2);
    }
};`;

const trapIdl = extractIdl(TRAP_SRC, "Trap");

const NESTED_CALLEE_SRC = `using namespace QPI;

struct NestedCallee : public ContractBase
{
    struct StateData { uint64 calls; };
    struct Fail_input { uint64 a; uint64 b; }; struct Fail_output { uint64 value; };

    PUBLIC_PROCEDURE(Fail)
    {
        state.mut().calls++;
        output.value = input.a / input.b;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Fail, 1);
    }
};`;

const NESTED_CALLER_SRC = `using namespace QPI;

struct NestedCaller : public ContractBase
{
    struct StateData { uint64 completed; };
    struct CalleeFail_input { uint64 a; uint64 b; };
    struct CalleeFail_output { uint64 value; };
    struct Run_input {}; struct Run_output {};
    struct Run_locals
    {
        CalleeFail_input failInput;
        CalleeFail_output failOutput;
    };

    PUBLIC_PROCEDURE_WITH_LOCALS(Run)
    {
        locals.failInput.a = 7;
        locals.failInput.b = 0;
        INVOKE_OTHER_CONTRACT_PROCEDURE(
            NestedCallee,
            Fail,
            locals.failInput,
            locals.failOutput,
            0);
        state.mut().completed++;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Run, 1);
    }
};`;

const nestedCallerIdl = extractIdl(NESTED_CALLER_SRC, "NestedCaller");

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

async function trapWasm(): Promise<Uint8Array> {
  const result = await compileContract({
    source: TRAP_SRC,
    contractName: "Trap",
    slot: SLOT,
    arenaSizeBytes: 64 * 1024,
  });
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length || result.wasm.byteLength === 0 || !result.idl) {
    throw new Error(errors.map((diagnostic) => diagnostic.message).join("\n") || "Trap compilation failed");
  }
  return result.wasm;
}

async function nestedTrapWasm(): Promise<{ callee: Uint8Array; caller: Uint8Array }> {
  const callee = await compileContract({
    source: NESTED_CALLEE_SRC,
    contractName: "NestedCallee",
    slot: SLOT,
    arenaSizeBytes: 64 * 1024,
  });
  const calleeErrors = callee.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (calleeErrors.length || callee.wasm.byteLength === 0 || !callee.idl) {
    throw new Error(calleeErrors.map((diagnostic) => diagnostic.message).join("\n") || "NestedCallee compilation failed");
  }

  const caller = await compileContract({
    source: NESTED_CALLER_SRC,
    contractName: "NestedCaller",
    slot: SLOT + 1,
    arenaSizeBytes: 64 * 1024,
    callees: [{ ...callee.idl, name: "NestedCallee", slot: SLOT }],
    calleeSources: [{ name: "NestedCallee", source: NESTED_CALLEE_SRC, slot: SLOT }],
  });
  const callerErrors = caller.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (callerErrors.length || caller.wasm.byteLength === 0) {
    throw new Error(callerErrors.map((diagnostic) => diagnostic.message).join("\n") || "NestedCaller compilation failed");
  }

  return { callee: callee.wasm, caller: caller.wasm };
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
  expect(result.output).toBe(0n);
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
  expect(before.fields).toEqual([{ name: "counter", value: "0", data: 0n }]);
  expect(before.containers).toEqual([]);

  const [caller] = await e.ensureAccounts();
  await e.submitProcedure(SLOT, "1", idl.procedures["1"], {}, "inc-1", { seed: caller.seed, amount: 0 }, { name: "Counter", source: SRC });

  const after = await e.stateOf(SLOT, SRC, "Counter");
  expect(after.fields).toEqual([{ name: "counter", value: "1", data: 1n }]);
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

test("IdeEngine: a contract trap stops the session until an explicit reset", async () => {
  const e = new IdeEngine();
  const wasm = await trapWasm();
  await e.deploy(SLOT, wasm, trapIdl);
  const [caller] = await e.ensureAccounts();
  const faults: Array<{ message: string; slot?: number; entry?: number }> = [];
  e.onFault = (fault) => faults.push(fault);
  e.start();

  await expect(
    e.submitProcedure(
      SLOT,
      "2",
      trapIdl.procedures["2"],
      { a: "7", b: "0" },
      "div-zero",
      { seed: caller.seed, amount: 0 },
      { name: "Trap", source: TRAP_SRC },
    ),
  ).rejects.toThrow();

  expect(e.isRunning()).toBe(false);
  expect(faults).toHaveLength(1);
  expect(faults[0].slot).toBe(SLOT);
  expect(faults[0].entry).toBe(2);
  expect(await e.faultInfo()).toEqual(expect.objectContaining({ slot: SLOT, entry: 2 }));
  await expect(
    e.submitProcedure(
      SLOT,
      "1",
      trapIdl.procedures["1"],
      {},
      "bump-after-fault",
      { seed: caller.seed, amount: 0 },
      { name: "Trap", source: TRAP_SRC },
    ),
  ).rejects.toThrow("the chain is halted (Division by zero at tick 1) — press ↺ reset or ▶ Compile & Run to restart it");

  await e.reset([{ slot: SLOT, wasm, name: "Trap" }]);
  e.stop();
  expect(await e.faultInfo()).toBeNull();
});

test("IdeEngine: a nested callee trap keeps the session ticking", async () => {
  const e = new IdeEngine();
  const wasm = await nestedTrapWasm();
  await e.deploy(SLOT, wasm.callee, extractIdl(NESTED_CALLEE_SRC, "NestedCallee"));
  await e.deploy(SLOT + 1, wasm.caller, nestedCallerIdl);
  e.registerSource(SLOT, NESTED_CALLEE_SRC, "NestedCallee");
  e.registerSource(SLOT + 1, NESTED_CALLER_SRC, "NestedCaller");
  const [caller] = await e.ensureAccounts();
  let trapped = false;
  e.onTxProcessed = (event) => {
    trapped = event.detail?.steps.some((step) => step.slot === SLOT && !step.ok) ?? false;
  };
  e.setSpeed(60_000);
  e.start();

  try {
    const before = await e.info();
    await e.submitProcedure(
      SLOT + 1,
      "1",
      nestedCallerIdl.procedures["1"],
      {},
      "nested-trap",
      { seed: caller.seed, amount: 0 },
      { name: "NestedCaller", source: NESTED_CALLER_SRC },
    );

    expect(e.isRunning()).toBe(true);
    expect(trapped).toBe(true);
    expect(await e.faultInfo()).toBeNull();
    expect((await e.info()).tick).toBe(before.tick + 1);
    await e.step();
    expect((await e.info()).tick).toBe(before.tick + 2);
  } finally {
    e.stop();
  }
});

// Ticks per epoch was fixed, so reaching END_EPOCH in the IDE meant a jump of thousands of ticks.
// The value is staged rather than live: applying it mid-chain would leave the epoch reporting a last tick
// the chain had already passed, so the rebuild from genesis is what puts it into effect.
test("IdeEngine: a new epoch length is staged, then applied by the next reset", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);

  // the length is the node's own, read with the first tick info; the panel once showed a literal the node did not use.
  await e.info();
  expect(e.epochLength()).toBe(DEFAULT_EPOCH_LENGTH);
  expect(e.pendingEpochLength()).toBe(DEFAULT_EPOCH_LENGTH);

  e.setEpochLength(10);
  expect(e.pendingEpochLength()).toBe(10);
  expect(e.epochLength()).toBe(DEFAULT_EPOCH_LENGTH); // the running chain is untouched

  await e.reset([{ slot: SLOT, wasm: await counterWasm(), name: "Counter" }]);
  expect(e.epochLength()).toBe(10);

  // core's rule: an epoch ends after the tick a full length past its first tick, so tick 10 is still epoch 0
  await e.step(10);
  expect((await e.info()).epoch).toBe(0);
  await e.step(1);
  expect((await e.info()).epoch).toBe(1); // boundary after tick 10, not the default length
});

test("IdeEngine: a short epoch keeps rolling over at its own length", async () => {
  const e = new IdeEngine();
  await e.deploy(SLOT, await counterWasm(), idl);
  e.setEpochLength(4);
  await e.reset([{ slot: SLOT, wasm: await counterWasm(), name: "Counter" }]);

  await e.step(15);
  const info = await e.info();
  expect(info.tick).toBe(15);
  expect(info.epoch).toBe(3); // epochs end after ticks 4, 9 and 14: each runs its first tick plus 4
});

import { expect, test } from "bun:test";
import { compileContractWithTypeScript as compileContract } from "@qinit/compiler/browser";
import { STARTER } from "../../src/ide/examples";
import { extractContractIdlView as extractIdl } from "../../src/ide/idl-view";
import { IdeEngine } from "../../src/ide/engine";

test("Counter starter emits a native-shaped LOG_INFO after Inc", () => {
  const source = STARTER.find((file) => file.file === "Counter.h")?.source ?? "";
  expect(source).toContain("struct CounterLog");
  expect(source).toContain("uint32 _contractIndex;");
  expect(source).toContain("uint32 _type;");
  expect(source).toContain("sint8 _terminator;");
  expect(source).toContain("PUBLIC_PROCEDURE_WITH_LOCALS(Inc)");
  expect(source).toContain("LOG_INFO(locals.log);");
});

test("Counter starter LOG_INFO compiles and is decoded after Inc", async () => {
  const source = STARTER.find((file) => file.file === "Counter.h")?.source ?? "";
  const compiled = await compileContract({ source, contractName: "Counter", slot: 28, arenaSizeBytes: 64 * 1024 });
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

  const engine = new IdeEngine();
  const idl = extractIdl(source, "Counter");
  await engine.deploy(28, compiled.wasm, idl);
  engine.registerSource(28, source, "Counter");
  engine.start();
  engine.stop();
  const seen: string[] = [];
  engine.onTxProcessed = (event) => seen.push(...(event.detail?.logs ?? []));
  const [caller] = await engine.ensureAccounts();
  await engine.submitProcedure(28, "1", idl.procedures["1"], {}, "Counter:p:1", { seed: caller.seed, amount: 0 }, { name: "Counter", source });

  expect(seen).toHaveLength(1);
  expect(seen[0]).toContain("INFO CounterLog");
  expect(seen[0]).toContain("CounterIncremented");
  expect(seen[0]).toContain('"value":"1"');
});

// two 24-byte logs, both INFO, no _type: the decoder cannot name either, so the line carries both names instead of a bare size
test("a log the decoder cannot name lists its candidates", async () => {
  const source = `using namespace QPI;
struct Bridge2 {};
struct Bridge : public ContractBase {
  struct OrderLog { uint32 _contractIndex; uint32 _errorCode; uint64 orderId; uint64 amount; sint8 _terminator; };
  struct TokensLog { uint32 _contractIndex; uint64 locked; uint64 received; sint8 _terminator; };
  struct StateData { uint32 calls; };
  struct Emit_input {}; struct Emit_output {};
  struct Emit_locals { OrderLog order; TokensLog tokens; };
  PUBLIC_PROCEDURE_WITH_LOCALS(Emit) {
    locals.order = OrderLog{ CONTRACT_INDEX, 0, 7, 100, 0 };
    LOG_INFO(locals.order);
    state.mut().calls += 1;
  }
  REGISTER_USER_FUNCTIONS_AND_PROCEDURES() { REGISTER_USER_PROCEDURE(Emit, 1); }
};`;
  const compiled = await compileContract({ source, contractName: "Bridge", slot: 28, arenaSizeBytes: 64 * 1024 });
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

  const engine = new IdeEngine();
  const idl = extractIdl(source, "Bridge");
  await engine.deploy(28, compiled.wasm, idl);
  engine.registerSource(28, source, "Bridge");
  engine.start();
  engine.stop();
  const seen: string[] = [];
  engine.onTxProcessed = (event) => seen.push(...(event.detail?.logs ?? []));
  const [caller] = await engine.ensureAccounts();
  await engine.submitProcedure(28, "1", idl.procedures["1"], {}, "Bridge:p:1", { seed: caller.seed, amount: 0 }, { name: "Bridge", source });

  expect(seen).toHaveLength(1);
  expect(seen[0]).toStartWith("INFO ?OrderLog|TokensLog 24B 0x");
});

test("the starter project holds the contract and its TS test, no gtest", () => {
  expect(STARTER.map((file) => file.file)).toEqual(["Counter.h", "Counter.test.ts"]);
});

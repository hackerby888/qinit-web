import { expect, test } from "bun:test";
import { compileContractWithTypeScript as compileContract, compileGtestWithTypeScript as compileGtest } from "@qinit/compiler/browser";
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

test("Counter core-lite gtest compiles and runs in-browser without clang", async () => {
  const source = STARTER.find((file) => file.file === "Counter.h")?.source ?? "";
  const testSource = STARTER.find((file) => file.file === "Counter.test.cpp")?.source ?? "";
  const contract = await compileContract({ source, contractName: "Counter", slot: 28, arenaSizeBytes: 64 * 1024 });
  const gtest = await compileGtest({ source, testSource, contractName: "Counter", slot: 28 });
  expect(gtest.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  expect(gtest.program).toBeDefined();

  const engine = new IdeEngine();
  const results = await engine.runGtest(gtest.program!, gtest.wasm!, { 28: contract.wasm });
  expect(results.map((result) => [result.name, result.passed])).toEqual([
    ["Counter.StartsAtZero", true],
    ["Counter.Increments", true],
    ["Counter.EachTestStartsFresh", true],
  ]);
});

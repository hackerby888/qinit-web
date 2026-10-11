// The bundled Cheats example is the one place a browser user meets CC_*, so it has to compile through
// the same browser compiler the IDE uses, and the words it prints have to survive into the IDL.
import { expect, test } from "bun:test";
import { compileContractWithTypeScript as compileContract } from "@qinit/compiler/browser";
import { EXAMPLES } from "../../../src/ide/workspace/examples";
import { extractContractIdlView as extractIdl } from "../../../src/ide/calls/idl-view";
import { IdeEngine } from "../../../src/ide/engine/proxy";
import { scanQpi } from "../../../src/ide/qpi/lint/qpi-rules";

const source = EXAMPLES.find((file) => file.file === "Cheats.h")?.source ?? "";

test("the Cheats example compiles, and its printed words are recorded in the IDL", async () => {
  const compiled = await compileContract({ source, contractName: "Cheats", slot: 28, arenaSizeBytes: 64 * 1024 });

  expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  expect(compiled.idl?.cheats).toHaveLength(3);
  expect(compiled.idl?.cheats.flatMap((cheat) => cheat.parts.map((part) => part.lit)).filter(Boolean)).toEqual(["adding", "total is now", "reading"]);
});

test("the linter does not flag the words inside a cheatcode, only real string literals", () => {
  expect(scanQpi(source).filter((finding) => finding.rule === "qpi/no-string")).toEqual([]);
  expect(scanQpi(`PUBLIC_PROCEDURE(P) { f("loose"); }`).filter((finding) => finding.rule === "qpi/no-string")).toHaveLength(1);
});

test("running the Cheats example in the IDE engine surfaces the printed lines", async () => {
  const compiled = await compileContract({ source, contractName: "Cheats", slot: 28, arenaSizeBytes: 64 * 1024 });
  const engine = new IdeEngine();
  const idl = extractIdl(source, "Cheats");

  await engine.deploy(28, compiled.wasm, idl);
  engine.registerSource(28, source, "Cheats");
  engine.start();
  engine.stop();

  let prints: string[] = [];
  let logs: string[] = [];
  engine.onTxProcessed = (event) => {
    prints = event.detail?.prints ?? prints;
    logs = event.detail?.logs ?? logs;
  };

  const [caller] = await engine.ensureAccounts();
  await engine.submitProcedure(28, "1", idl.procedures["1"], { amount: 7 }, "Cheats:p:1", { seed: caller.seed, amount: 0 }, { name: "Cheats", source });

  // The words come from the IDL, the values off the wire; the reader sees the line the dev wrote.
  expect(prints).toEqual([":27 adding 7", ":30 total is now 7"]);
  // And none of it reached the protocol log.
  expect(logs).toEqual([]);
});

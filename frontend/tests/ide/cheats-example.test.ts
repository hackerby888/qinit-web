// The bundled Cheats example is the one place a browser user meets CC_*, so it has to compile through
// the same browser compiler the IDE uses, and the words it prints have to survive into the IDL.
import { expect, test } from "bun:test";
import { compileContractWithTypeScript as compileContract } from "@qinit/compiler/browser";
import { EXAMPLES } from "../../src/ide/examples";
import { scanQpi } from "../../src/ide/qpi/lint/qpi-rules";

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

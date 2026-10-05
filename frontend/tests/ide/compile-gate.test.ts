// the IDE once deployed what `qinit build` refuses. Each row here is one edit of the starter contract; the build must
// refuse it under the rule the CLI's verifier names, and take the untouched starter and every shipped example.
import { expect, test } from "bun:test";
import { VERIFIER_RULES } from "@qinit/compiler/analyzer";
import { buildContract } from "../../src/ide/compile/build";
import { EXAMPLES, STARTER } from "../../src/ide/examples";
import { scanLocals, scanQpi } from "../../src/ide/qpi/lint/qpi-rules";
import { buildSeverity, VERIFIER_RULE_IDS } from "../../src/ide/qpi/markers";
import { baseName, fileKind } from "../../src/ide/workspace";

const COUNTER = STARTER.find((file) => file.file === "Counter.h")!.source;

const build = async (source: string, name = "Counter", callees: Array<{ name: string; source: string; slot: number; file?: string }> = []) =>
  (await buildContract({ id: 1, kind: "compile", source, name, slot: 30, callees })).res;

// insert a line before the starter's increment, inside Inc's body.
const inInc = (line: string) => COUNTER.replace("        state.mut().counter += 1;", `${line}\n        state.mut().counter += 1;`);
const inState = (line: string) => COUNTER.replace("        uint64 counter;", `        uint64 counter;\n${line}`);

test("the starter builds, with its IDL and the layout facts a redeploy check reads", async () => {
  const built = await build(COUNTER);

  expect(built.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(built.ok).toBe(true);
  expect(built.idl?.layout).toEqual({ state: { size: 8, format: "uint64" }, migration: undefined });
});

const REFUSED: Array<[edit: string, source: string, code: string]> = [
  ["a division", inInc("        state.mut().counter = state.get().counter / 2;"), "qpi/no-division"],
  ["a modulo", inInc("        state.mut().counter = state.get().counter % 2;"), "qpi/no-modulo"],
  ["a plain array", inState("        uint64 raw[4];"), "qpi/no-brackets"],
  ["a preprocessor line", `#include <vector>\n${COUNTER}`, "qpi/no-preprocessor"],
  ["a local variable", inInc("        uint64 tmp = 1;"), "qpi/stack-local"],
  ["a float", inState("        float ratio;"), "qpi/no-float"],
  ["a string literal", inInc('        state.mut().counter = sizeof("abc");'), "qpi/no-string"],
  ["an unqualified div", inInc("        state.mut().counter = div(state.get().counter, 2ULL);"), "qpi/unqualified-div"],
];

test("each construct `qinit build` refuses fails the build, under its rule", async () => {
  for (const [edit, source, code] of REFUSED) {
    const built = await build(source);
    const refusal = built.diagnostics.find((d) => d.code === code);

    expect([edit, built.ok, refusal?.severity]).toEqual([edit, false, "error"]);
    expect(built.wasm).toBeUndefined();
  }
});

test("the fix the editor offers for a division is one the build accepts", async () => {
  expect((await build(inInc("        state.mut().counter = QPI::div(state.get().counter, 2ULL);"))).ok).toBe(true);
});

test("a file with no contract struct is refused with the CLI's sentence, not deployed as an empty module", async () => {
  for (const source of ["", "   \n", "// nothing here yet\n", "struct Helper { uint64 a; };\n"]) {
    const built = await build(source);

    expect(built.ok).toBe(false);
    expect(built.diagnostics.map((d) => d.message)).toEqual(["no contract struct in this file — a contract declares `struct Name : public ContractBase`"]);
  }
});

test("every shipped contract example passes the gate", async () => {
  const contracts = EXAMPLES.filter((example) => fileKind(example.file) === "contract");
  const proxyCallee = contracts.find((example) => example.file === "Counter.h")!;

  for (const example of contracts) {
    const callees = /_OTHER_CONTRACT_/.test(example.source) ? [{ name: "Counter", source: proxyCallee.source, slot: 28 }] : [];
    const built = await build(example.source, baseName(example.file), callees);

    expect([example.file, built.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.line}: ${d.message}`)]).toEqual([example.file, []]);
    expect(built.ok).toBe(true);
  }
});

test("a callee's compile error names the callee's file, not the caller's", async () => {
  const brokenCounter = COUNTER.replace("state.mut().counter += 1;", "state.mut().countr += 1;");
  const proxy = EXAMPLES.find((example) => example.file === "Proxy.h")!.source;
  const built = await build(proxy, "Proxy", [{ name: "Counter", source: brokenCounter, slot: 28, file: "lib/Counter.h" }]);

  expect(built.ok).toBe(false);
  expect(built.error).toBe("callee Counter failed to compile");
  expect(built.diagnostics.filter((d) => d.severity === "error").map((d) => [d.file, d.message])).toEqual([["lib/Counter.h", "unsupported assignment target [state.mut().countr]"]]);
});

// the editor marks the same rules before a build runs; a warning there for something the build refuses is how W16 hid.
test("the editor marks the verifier's rules as errors, by the same list the build uses", () => {
  expect(new Set(VERIFIER_RULE_IDS)).toEqual(new Set(VERIFIER_RULES));

  const source = inInc("        uint64 tmp = state.get().counter / 2;");
  const findings = [...scanQpi(source), ...scanLocals(source)];
  expect(findings.map((finding) => [finding.rule, buildSeverity(finding, source)]).sort()).toEqual([
    ["qpi/no-division", "error"],
    ["qpi/stack-local", "error"],
  ]);

  // a double underscore in the middle of a name is the lint's own advice; the verifier reserves only a leading one.
  const middle = inState("        uint64 my__field;");
  const leading = inState("        uint64 __hidden;");
  expect(scanQpi(middle).filter((f) => f.rule === "qpi/no-dunder").map((f) => buildSeverity(f, middle))).toEqual(["warn"]);
  expect(scanQpi(leading).filter((f) => f.rule === "qpi/no-dunder").map((f) => buildSeverity(f, leading))).toEqual(["error"]);
});

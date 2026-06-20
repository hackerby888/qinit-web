// Context-aware diagnostics: a function may not mutate state or call a mutating qpi.* method.
import { test, expect, describe } from "bun:test";
import { scanContext } from "./contextlint";

const inEntry = (macro: string, body: string): string =>
  `struct S : public ContractBase { struct StateData { uint64 c; }; ${macro} { ${body} } };`;

const rules = (src: string): string[] => scanContext(src).map((f) => f.rule);

describe("state.mut() in a function", () => {
  test("flagged in a function", () => {
    expect(rules(inEntry("PUBLIC_FUNCTION(F)", "state.mut().c = 1;"))).toEqual(["qpi/mut-in-function"]);
  });

  test("the finding points at the `mut` token", () => {
    const src = inEntry("PUBLIC_FUNCTION(F)", "state.mut().c = 1;");
    const f = scanContext(src)[0];
    expect(src.slice(f.offset, f.offset + f.length)).toBe("mut");
    expect(f.severity).toBe("error");
  });

  test("allowed in a procedure", () => {
    expect(rules(inEntry("PUBLIC_PROCEDURE(P)", "state.mut().c = 1;"))).toEqual([]);
  });

  test("allowed in a lifecycle hook", () => {
    expect(rules(inEntry("INITIALIZE()", "state.mut().c = 0;"))).toEqual([]);
  });

  test("state.get() in a function is fine", () => {
    expect(rules(inEntry("PUBLIC_FUNCTION(F)", "uint64 x = state.get().c;"))).toEqual([]);
  });
});

describe("mutating qpi.* in a function", () => {
  test("qpi.transfer flagged in a function", () => {
    expect(rules(inEntry("PUBLIC_FUNCTION(F)", "qpi.transfer(dest, 1);"))).toEqual(["qpi/mutate-in-function"]);
  });

  test("read-only qpi.invocator is fine in a function", () => {
    expect(rules(inEntry("PUBLIC_FUNCTION(F)", "id a = qpi.invocator();"))).toEqual([]);
  });

  test("qpi.transfer is fine in a procedure", () => {
    expect(rules(inEntry("PUBLIC_PROCEDURE(P)", "qpi.transfer(dest, 1);"))).toEqual([]);
  });
});

describe("no false positives", () => {
  test("a commented-out violation is not flagged", () => {
    expect(rules(inEntry("PUBLIC_FUNCTION(F)", "// state.mut().c = 1;"))).toEqual([]);
  });

  test("outside any entry body -> nothing", () => {
    expect(rules("struct S { struct StateData { uint64 c; state.mut(); }; };")).toEqual([]);
  });
});

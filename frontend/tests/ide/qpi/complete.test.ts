// The completion gating rules — the qpi-faithful contract that the IDE must honour. Each case pins one
// rule about WHERE a member set is (or isn't) offered.
import { test, expect, describe } from "bun:test";
import { memberCompletionAt } from "../../../src/ide/qpi/members";
import { allowedBuiltinsAt } from "../../../src/ide/qpi/snippets";
import { at } from "./test-helpers";

// A contract with state + a Move entry's input/output/locals structs; `recv` is dropped into `macro`'s body
// at the cursor.
function inEntry(macro: string, recv: string): string {
  return [
    "struct S : public ContractBase {",
    "  struct StateData { uint64 counter; HashMap<id, sint64> balances; };",
    "  struct Move_input { uint64 amount; id to; };",
    "  struct Move_output { uint64 total; };",
    "  struct Move_locals { uint64 tmp; };",
    `  ${macro} { ${recv}| }`,
    "};",
  ].join("\n");
}

function labels(macro: string, recv: string): string[] | null {
  const { src, offset, line } = at(inEntry(macro, recv));
  const items = memberCompletionAt(src, line, offset);
  return items ? items.map((i) => i.label) : null;
}

describe("state. accessors by mutability", () => {
  test("a procedure can mutate -> get + mut", () => {
    expect(labels("PUBLIC_PROCEDURE(Move)", "state.")).toEqual(["mut", "get"]);
  });

  test("a const function -> get only", () => {
    expect(labels("PUBLIC_FUNCTION(Move)", "state.")).toEqual(["get"]);
  });

  test("a lifecycle hook can mutate -> get + mut", () => {
    expect(labels("INITIALIZE()", "state.")).toEqual(["mut", "get"]);
  });

  test("outside an entry body -> nothing (state out of scope)", () => {
    const { src, offset, line } = at("struct S : public ContractBase { struct StateData { uint64 x; state.| }; };");
    expect(memberCompletionAt(src, line, offset)).toEqual([]);
  });
});

describe("state.mut()/get(). fields", () => {
  test("resolves StateData fields", () => {
    expect(labels("PUBLIC_PROCEDURE(Move)", "state.mut().")).toEqual(["counter", "balances"]);
  });

  test("a scalar leaf has no members", () => {
    expect(labels("PUBLIC_PROCEDURE(Move)", "state.get().counter.")).toEqual([]);
  });

  test("nested container field -> the container's method table", () => {
    const got = labels("PUBLIC_PROCEDURE(Move)", "state.get().balances.");
    expect(got).toContain("set");
    expect(got).toContain("get");
    expect(got).toContain("removeByKey");
    expect(got).not.toContain("counter");
  });
});

describe("input / output gating", () => {
  test("input. resolves in a user procedure", () => {
    expect(labels("PUBLIC_PROCEDURE(Move)", "input.")).toEqual(["amount", "to"]);
  });

  test("output. resolves in a user function", () => {
    expect(labels("PUBLIC_FUNCTION(Move)", "output.")).toEqual(["total"]);
  });

  test("input. is empty in a lifecycle hook (NoData / qpi.h IO)", () => {
    expect(labels("INITIALIZE()", "input.")).toEqual([]);
    expect(labels("BEGIN_TICK()", "input.")).toEqual([]);
  });
});

describe("locals gating", () => {
  test("locals. resolves only in a _WITH_LOCALS entry with a <Name>_locals struct", () => {
    expect(labels("PUBLIC_PROCEDURE_WITH_LOCALS(Move)", "locals.")).toEqual(["tmp"]);
  });

  test("locals. is empty in a plain (non-_WITH_LOCALS) entry", () => {
    expect(labels("PUBLIC_PROCEDURE(Move)", "locals.")).toEqual([]);
  });
});

describe("qpi. context", () => {
  test("a procedure sees the mutating host methods", () => {
    const got = labels("PUBLIC_PROCEDURE(Move)", "qpi.") ?? [];
    expect(got).toContain("transfer");
    expect(got).toContain("burn");
    expect(got).toContain("invocator");
  });

  test("a const function does NOT see the mutating methods", () => {
    const got = labels("PUBLIC_FUNCTION(Move)", "qpi.") ?? [];
    expect(got).not.toContain("transfer");
    expect(got).not.toContain("burn");
    expect(got).not.toContain("issueAsset");
    expect(got).not.toContain("distributeDividends");
    expect(got).toContain("invocator");
    expect(got).toContain("getEntity");
  });

  test("outside an entry body -> nothing", () => {
    const { src, offset, line } = at("struct S { struct StateData { uint64 x; qpi.| }; };");
    expect(memberCompletionAt(src, line, offset)).toEqual([]);
  });
});

describe("not a member position", () => {
  test("plain text -> null (let other providers handle)", () => {
    const { src, offset, line } = at("struct S { PUBLIC_PROCEDURE(Move) { uint64 x|; } };");
    expect(memberCompletionAt(src, line, offset)).toBeNull();
  });
});

describe("allowedBuiltinsAt", () => {
  const builtinsIn = (macro: string): string[] => {
    const { src, offset } = at(inEntry(macro, ""));
    return allowedBuiltinsAt(src, offset);
  };

  test("user procedure: qpi/state/input/output (no locals)", () => {
    expect(builtinsIn("PUBLIC_PROCEDURE(Move)")).toEqual(["qpi", "state", "input", "output"]);
  });

  test("_WITH_LOCALS with a locals struct: + locals", () => {
    expect(builtinsIn("PUBLIC_PROCEDURE_WITH_LOCALS(Move)")).toEqual(["qpi", "state", "input", "output", "locals"]);
  });

  test("lifecycle hook: only qpi/state", () => {
    expect(builtinsIn("INITIALIZE()")).toEqual(["qpi", "state"]);
  });

  test("outside an entry body: none", () => {
    const { src, offset } = at("struct S : public ContractBase { struct StateData { uint64 x; | }; };");
    expect(allowedBuiltinsAt(src, offset)).toEqual([]);
  });
});

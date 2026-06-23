// Parser primitives: struct/field extraction, entry-body detection, entry classification, container
// detection, and path walking. These underpin every completion feature, so they get the most cases.
import { test, expect, describe } from "bun:test";
import {
  collectStructs, enclosingEntry, enclosingEntryBase, isFunctionEntry, isUserEntry, containerKind, walkPath,
} from "../../../src/ide/qpi/members";
import { at } from "./test-helpers";

const fields = (src: string, name: string) => (collectStructs(src).get(name) ?? []).map((f) => `${f.name}:${f.type}`);

describe("collectStructs / parseFields", () => {
  test("scalar fields keep their types", () => {
    expect(fields("struct A { uint64 x; id y; sint8 z; };", "A")).toEqual(["x:uint64", "y:id", "z:sint8"]);
  });

  test("template fields preserve the inner commas", () => {
    expect(fields("struct B { HashMap<id, sint64> m; Array<uint64, 4> a; };", "B")).toEqual(["m:HashMap<id, sint64>", "a:Array<uint64, 4>"]);
  });

  test("nested structs are captured separately, not inlined into the parent", () => {
    const src = "struct Outer { struct Inner { uint64 z; }; uint64 w; };";
    expect(fields(src, "Outer")).toEqual(["w:uint64"]);
    expect(fields(src, "Inner")).toEqual(["z:uint64"]);
  });

  test("line comments are ignored", () => {
    expect(fields("struct C {\n uint64 a; // the counter\n id b;\n };", "C")).toEqual(["a:uint64", "b:id"]);
  });

  test("default initializers are dropped from the field name", () => {
    expect(fields("struct D { uint64 a = 5; };", "D")).toEqual(["a:uint64"]);
  });

  test("empty struct has no fields", () => {
    expect(fields("struct E {};", "E")).toEqual([]);
  });

  test("methods (parenthesized) are not fields", () => {
    expect(fields("struct F { uint64 x; void run(); };", "F")).toEqual(["x:uint64"]);
  });

  test("a contract's StateData is found amid the surrounding struct", () => {
    const src = "struct CONTRACT_STATE_TYPE : public ContractBase { struct StateData { uint64 counter; }; };";
    expect(fields(src, "StateData")).toEqual(["counter:uint64"]);
  });
});

describe("enclosingEntry (body-aware)", () => {
  test("inside a procedure body -> the macro + base", () => {
    const { src, offset } = at("struct S : public ContractBase { PUBLIC_PROCEDURE(Inc) { state.| } };");
    expect(enclosingEntry(src, offset)).toEqual({ macro: "PUBLIC_PROCEDURE", base: "Inc" });
  });

  test("a _WITH_LOCALS entry keeps its base name", () => {
    const { src, offset } = at("struct S { PUBLIC_FUNCTION_WITH_LOCALS(Get) { | } };");
    expect(enclosingEntry(src, offset)).toEqual({ macro: "PUBLIC_FUNCTION_WITH_LOCALS", base: "Get" });
  });

  test("a lifecycle hook's macro is its own base", () => {
    const { src, offset } = at("struct S { INITIALIZE() { | } };");
    expect(enclosingEntry(src, offset)).toEqual({ macro: "INITIALIZE", base: "INITIALIZE" });
  });

  test("inside StateData (not an entry body) -> null", () => {
    const { src, offset } = at("struct S : public ContractBase { struct StateData { uint64 x; | }; };");
    expect(enclosingEntry(src, offset)).toBeNull();
  });

  test("between two entry bodies -> null", () => {
    const { src, offset } = at("struct S { PUBLIC_PROCEDURE(A) {} | PUBLIC_PROCEDURE(B) {} };");
    expect(enclosingEntry(src, offset)).toBeNull();
  });

  test("nested braces inside the body don't end it early", () => {
    const { src, offset } = at("struct S { PUBLIC_PROCEDURE(Inc) { if (true) { } state.| } };");
    expect(enclosingEntry(src, offset)?.base).toBe("Inc");
  });

  test("enclosingEntryBase returns just the base (or null)", () => {
    const { src, offset } = at("struct S { PUBLIC_PROCEDURE(Move) { | } };");
    expect(enclosingEntryBase(src, offset)).toBe("Move");
  });
});

describe("entry classification", () => {
  test("isFunctionEntry only for FUNCTION macros", () => {
    expect(isFunctionEntry("PUBLIC_FUNCTION")).toBe(true);
    expect(isFunctionEntry("PUBLIC_FUNCTION_WITH_LOCALS")).toBe(true);
    expect(isFunctionEntry("PUBLIC_PROCEDURE")).toBe(false);
    expect(isFunctionEntry("INITIALIZE")).toBe(false);
    expect(isFunctionEntry("BEGIN_TICK")).toBe(false);
  });

  test("isUserEntry only for PUBLIC_/PRIVATE_ fn/proc", () => {
    expect(isUserEntry("PUBLIC_PROCEDURE")).toBe(true);
    expect(isUserEntry("PRIVATE_FUNCTION_WITH_LOCALS")).toBe(true);
    expect(isUserEntry("INITIALIZE")).toBe(false);
    expect(isUserEntry("POST_INCOMING_TRANSFER")).toBe(false);
    expect(isUserEntry("BEGIN_EPOCH")).toBe(false);
  });
});

describe("containerKind", () => {
  test("detects each container template", () => {
    expect(containerKind("HashMap<id, sint64>")).toBe("HashMap");
    expect(containerKind("Array<uint64, 4>")).toBe("Array");
    expect(containerKind("HashSet<id, 1024>")).toBe("HashSet");
    expect(containerKind("Collection<Order, 256>")).toBe("Collection");
    expect(containerKind("BitArray<1024>")).toBe("BitArray");
  });

  test("non-containers -> null", () => {
    expect(containerKind("uint64")).toBeNull();
    expect(containerKind("id")).toBeNull();
    expect(containerKind("MyStruct")).toBeNull();
  });
});

describe("walkPath", () => {
  const structs = collectStructs("struct StateData { uint64 c; Config cfg; HashMap<id, sint64> bal; }; struct Config { uint64 fee; id owner; };");

  test("empty path -> the root type itself", () => {
    expect(walkPath("StateData", [], structs)).toBe("StateData");
  });

  test("single hop into a struct field -> the field's type", () => {
    expect(walkPath("StateData", ["cfg"], structs)).toBe("Config");
  });

  test("hop to a container-typed field -> the container type", () => {
    expect(walkPath("StateData", ["bal"], structs)).toBe("HashMap<id, sint64>");
  });

  test("multi-hop into nested struct fields", () => {
    expect(walkPath("StateData", ["cfg", "fee"], structs)).toBe("uint64");
  });

  test("unknown field -> null", () => {
    expect(walkPath("StateData", ["nope"], structs)).toBeNull();
  });

  test("hopping through a scalar -> null (no members)", () => {
    expect(walkPath("StateData", ["c", "x"], structs)).toBeNull();
  });
});

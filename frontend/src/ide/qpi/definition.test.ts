// Goto-definition: resolve a name to its declaration offset in the contract source.
import { test, expect, describe } from "bun:test";
import { definitionOffset } from "./definition";

const DOC = [
  "using namespace QPI;",
  "struct CONTRACT_STATE_TYPE : public ContractBase {",
  "  struct StateData { uint64 counter; };",
  "  struct Get_output { uint64 value; };",
  "  PUBLIC_PROCEDURE(Inc) { state.mut().counter += 1; }",
  "  PUBLIC_FUNCTION(Get) { output.value = state.get().counter; }",
  "  REGISTER_USER_FUNCTIONS_AND_PROCEDURES() {",
  "    REGISTER_USER_PROCEDURE(Inc, 1);",
  "    REGISTER_USER_FUNCTION(Get, 1);",
  "  }",
  "};",
].join("\n");

// The line of source that the resolved offset lands on (and an assertion the offset really sits on `word`).
function defLine(word: string): string | null {
  const off = definitionOffset(DOC, word);
  if (off === null) {
    return null;
  }
  expect(DOC.slice(off, off + word.length)).toBe(word);
  const start = DOC.lastIndexOf("\n", off - 1) + 1;
  const end = DOC.indexOf("\n", off);
  return DOC.slice(start, end === -1 ? undefined : end).trim();
}

describe("definitionOffset", () => {
  test("a procedure name resolves to its entry macro", () => {
    expect(defLine("Inc")).toBe("PUBLIC_PROCEDURE(Inc) { state.mut().counter += 1; }");
  });

  test("a function name resolves to its entry macro", () => {
    expect(defLine("Get")).toBe("PUBLIC_FUNCTION(Get) { output.value = state.get().counter; }");
  });

  test("a struct/type name resolves to its struct declaration", () => {
    expect(defLine("Get_output")).toBe("struct Get_output { uint64 value; };");
  });

  test("a field name resolves to its declaration", () => {
    expect(defLine("counter")).toBe("struct StateData { uint64 counter; };");
  });

  test("a symbol that lives in qpi.h (not the source) -> null", () => {
    expect(definitionOffset(DOC, "HashMap")).toBeNull();
  });

  test("an unknown identifier -> null", () => {
    expect(definitionOffset(DOC, "nope")).toBeNull();
  });
});

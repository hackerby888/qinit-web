// The conservative cpp/qpi formatter: brace-depth re-indent, trailing trim, blank-run collapse, comment-safe.
import { test, expect, describe } from "bun:test";
import { formatCode } from "./format";

describe("formatCode (cpp)", () => {
  test("re-indents to brace depth (4 spaces)", () => {
    const input = ["struct S {", "uint64 x;", "if (a) {", "b;", "}", "}"].join("\n");
    const expected = ["struct S {", "    uint64 x;", "    if (a) {", "        b;", "    }", "}"].join("\n");
    expect(formatCode(input, "cpp")).toBe(expected);
  });

  test("trims trailing whitespace", () => {
    expect(formatCode("x;   ", "cpp")).toBe("x;");
  });

  test("collapses runs of blank lines to one", () => {
    expect(formatCode("a;\n\n\n\nb;", "cpp")).toBe("a;\n\nb;");
  });

  test("braces inside a comment do not change indentation", () => {
    const input = ["// {", "x;"].join("\n");
    expect(formatCode(input, "cpp")).toBe(["// {", "x;"].join("\n"));
  });

  test("is idempotent", () => {
    const input = ["struct S{", "  uint64 x;", "    if(a){", "b;", "}", "}"].join("\n");
    const once = formatCode(input, "cpp");
    expect(formatCode(once, "cpp")).toBe(once);
  });
});

describe("formatCode (typescript)", () => {
  test("uses a 2-space unit", () => {
    const input = ["function f() {", "return 1;", "}"].join("\n");
    expect(formatCode(input, "typescript")).toBe(["function f() {", "  return 1;", "}"].join("\n"));
  });
});

// Workspace search: substring + regex, case toggle, line/col results.
import { test, expect, describe } from "bun:test";
import { searchError, searchWorkspace } from "../../../src/ide/workspace/search";

const files = [
  { name: "a.h", source: "hello world\nfoo bar\nHELLO again" },
  { name: "b.h", source: "baz qux" },
];

describe("searchWorkspace", () => {
  test("case-insensitive substring matches across files with line/col", () => {
    const r = searchWorkspace(files, "hello");
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("a.h");
    expect(r[0].matches.map((m) => m.line)).toEqual([1, 3]);
    expect(r[0].matches[0].col).toBe(1);
  });

  test("case-sensitive narrows the match set", () => {
    const r = searchWorkspace(files, "hello", { caseSensitive: true });
    expect(r[0].matches.map((m) => m.line)).toEqual([1]);
  });

  test("regex mode", () => {
    const r = searchWorkspace(files, "f\\w+", { regex: true });
    expect(r[0].name).toBe("a.h");
    expect(r[0].matches[0].preview).toContain("foo");
  });

  test("plain mode treats regex metacharacters literally", () => {
    expect(searchWorkspace([{ name: "x", source: "a.b\naxb" }], "a.b")).toHaveLength(1);
    expect(searchWorkspace([{ name: "x", source: "a.b\naxb" }], "a.b")[0].matches).toHaveLength(1);
  });

  test("empty query and invalid regex return nothing", () => {
    expect(searchWorkspace(files, "")).toEqual([]);
    expect(searchWorkspace(files, "(", { regex: true })).toEqual([]);
  });

  // W-s21: an invalid pattern kept the previous count on screen and said nothing.
  test("an invalid regex says why; a valid one, plain text and an empty query do not", () => {
    expect(searchError("(", { regex: true })).toMatch(/^invalid pattern — /);
    expect(searchError("[a-", { regex: true })).toMatch(/^invalid pattern — /);
    expect(searchError("a.*b", { regex: true })).toBeNull();
    expect(searchError("(", { regex: false })).toBeNull();
    expect(searchError("", { regex: true })).toBeNull();
  });
});

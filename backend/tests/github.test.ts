// GitHub integration pure helpers: ref parsing (many input shapes), text-file filtering, and subdir-relative
// renaming. The network calls (fetchRepoFiles / createGist) are exercised by hand against real repos.
import { test, expect, describe } from "bun:test";
import { parseRepoRef, isTextFile, relativeName } from "../src/github";

describe("parseRepoRef", () => {
  test("owner/repo", () => {
    expect(parseRepoRef("qubic/core")).toEqual({ owner: "qubic", repo: "core", ref: undefined, subdir: "" });
  });

  test("owner/repo/subdir", () => {
    expect(parseRepoRef("qubic/core/src/contracts")).toEqual({ owner: "qubic", repo: "core", ref: undefined, subdir: "src/contracts" });
  });

  test("owner/repo@ref", () => {
    expect(parseRepoRef("qubic/core@dev")).toEqual({ owner: "qubic", repo: "core", ref: "dev", subdir: "" });
  });

  test("full URL and .git suffix", () => {
    expect(parseRepoRef("https://github.com/qubic/core.git")).toEqual({ owner: "qubic", repo: "core", ref: undefined, subdir: "" });
  });

  test("browse /tree/<ref>/<subdir> URL", () => {
    expect(parseRepoRef("https://github.com/qubic/core/tree/main/src/contracts")).toEqual({ owner: "qubic", repo: "core", ref: "main", subdir: "src/contracts" });
  });

  test("rejects a bare name", () => {
    expect(parseRepoRef("core")).toBeNull();
    expect(parseRepoRef("")).toBeNull();
  });
});

describe("isTextFile", () => {
  test("accepts source extensions, rejects binaries and extensionless", () => {
    expect(isTextFile("Counter.h")).toBe(true);
    expect(isTextFile("lib/a.cpp")).toBe(true);
    expect(isTextFile("notes.md")).toBe(true);
    expect(isTextFile("logo.png")).toBe(false);
    expect(isTextFile("Makefile")).toBe(false);
  });
});

describe("relativeName", () => {
  test("no subdir keeps the full path", () => {
    expect(relativeName("src/a.h", "")).toBe("src/a.h");
  });

  test("strips the subdir prefix", () => {
    expect(relativeName("src/lib/a.h", "src")).toBe("lib/a.h");
  });

  test("returns null for a path outside the subdir", () => {
    expect(relativeName("docs/a.h", "src")).toBeNull();
  });
});

// Workspace analysis aggregator: offset->line/col accuracy, category tagging, severity passthrough, file
// filtering, multi-file aggregation, and ordering.
import { test, expect, describe } from "bun:test";
import { analyzeFile, analyzeWorkspace, categoryOf, isContractFile, severityCounts } from "../../../src/ide/qpi/analyze";

describe("isContractFile", () => {
  test("accepts C/C++ sources, rejects everything else", () => {
    for (const n of ["Counter.h", "lib/Net.hpp", "a.cpp", "b.cc", "c.cxx", "d.c"]) {
      expect(isContractFile(n)).toBe(true);
    }
    for (const n of ["Counter.test.ts", "store.ts", "data.json", "README.md", "noext"]) {
      expect(isContractFile(n)).toBe(false);
    }
  });
});

describe("categoryOf", () => {
  test("maps known rules and falls back to Other", () => {
    expect(categoryOf("qpi/no-random")).toBe("Determinism");
    expect(categoryOf("qpi/native-type")).toBe("Types");
    expect(categoryOf("qpi/no-dynamic-memory")).toBe("Memory");
    expect(categoryOf("qpi/mut-in-function")).toBe("State");
    expect(categoryOf("qpi/whatever-new")).toBe("Other");
  });
});

describe("analyzeFile line/col", () => {
  test("locates a finding on the right line and column (1-based)", () => {
    const src = "line one\nuint64 x = rand();\nok";
    const f = analyzeFile("A.h", src).find((x) => x.rule === "qpi/no-random");
    expect(f).toBeTruthy();
    expect(f!.line).toBe(2);
    // column of "rand" within "uint64 x = rand();" -> 1-based index of 'r'
    expect(src.split("\n")[1].slice(f!.col - 1, f!.col - 1 + 4)).toBe("rand");
  });

  test("first column is 1, first line is 1", () => {
    const f = analyzeFile("A.h", "rand();").find((x) => x.rule === "qpi/no-random");
    expect(f!.line).toBe(1);
    expect(f!.col).toBe(1);
  });

  test("findings are sorted by line then column", () => {
    const src = "std::x; rand();\nnew Foo();";
    const fs = analyzeFile("A.h", src);
    for (let i = 1; i < fs.length; i++) {
      const a = fs[i - 1];
      const b = fs[i];
      expect(a.line < b.line || (a.line === b.line && a.col <= b.col)).toBe(true);
    }
  });
});

describe("analyzeFile coverage across scanners", () => {
  test("pulls findings from each scanner with the right category", () => {
    const src = [
      "using namespace QPI;",
      "struct S {",
      "  int n;", // native-type -> Types
      "};",
      "PUBLIC_FUNCTION(Get) {",
      "  state.mut().v = 1;", // mut-in-function -> State (error)
      "  uint64 r = rand();", // determinism + stack-local
      "  output.q = input.a / input.b;", // no-division -> Language
      "}",
    ].join("\n");
    const fs = analyzeFile("C.h", src);
    const cats = new Set(fs.map((f) => f.category));
    expect(cats.has("Types")).toBe(true);
    expect(cats.has("State")).toBe(true);
    expect(cats.has("Determinism")).toBe(true);
    expect(cats.has("Language")).toBe(true);
    // the state.mut()-in-function finding is an error
    const stateErr = fs.find((f) => f.rule === "qpi/mut-in-function");
    expect(stateErr?.severity).toBe("error");
  });

  test("a clean contract yields no findings", () => {
    const clean = [
      "using namespace QPI;",
      "struct CONTRACT_STATE_TYPE : public ContractBase {",
      "  struct StateData { uint64 value; };",
      "  struct Set_input { uint64 value; };",
      "  struct Set_output {};",
      "  PUBLIC_PROCEDURE(Set) {",
      "    state.mut().value = input.value;",
      "  }",
      "  REGISTER_USER_FUNCTIONS_AND_PROCEDURES() {",
      "    REGISTER_USER_PROCEDURE(Set, 1);",
      "  }",
      "};",
    ].join("\n");
    expect(analyzeFile("Clean.h", clean)).toEqual([]);
  });
});

describe("analyzeWorkspace", () => {
  const files = [
    { name: "A.h", source: "uint64 x = rand();" }, // 1 determinism finding
    { name: "lib/B.hpp", source: "Foo* p = new Foo();" }, // 1 memory finding
    { name: "skip.test.ts", source: "const p = new Foo(); // not a contract" }, // ignored
    { name: "notes.md", source: "rand() malloc()" }, // ignored
  ];

  test("aggregates only contract files and tags each with its file", () => {
    const fs = analyzeWorkspace(files);
    const byFile = new Set(fs.map((f) => f.file));
    expect(byFile.has("A.h")).toBe(true);
    expect(byFile.has("lib/B.hpp")).toBe(true);
    expect(byFile.has("skip.test.ts")).toBe(false);
    expect(byFile.has("notes.md")).toBe(false);
  });

  test("nested folder paths are preserved in the file field", () => {
    const fs = analyzeWorkspace(files);
    expect(fs.some((f) => f.file === "lib/B.hpp")).toBe(true);
  });

  test("empty workspace -> no findings", () => {
    expect(analyzeWorkspace([])).toEqual([]);
  });
});

describe("severityCounts", () => {
  test("buckets findings by severity", () => {
    const src = "PUBLIC_FUNCTION(G) {\n  state.mut().v = rand();\n}"; // error (mut) + warn (random)
    const counts = severityCounts(analyzeFile("C.h", src));
    expect(counts.error).toBeGreaterThanOrEqual(1);
    expect(counts.warn).toBeGreaterThanOrEqual(1);
    expect(counts.error + counts.warn + counts.info).toBe(analyzeFile("C.h", src).length);
  });
});

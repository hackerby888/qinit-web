// Native C++ types are forbidden in QPI — flag them and suggest the fixed-width QPI equivalent.
import { test, expect, describe } from "bun:test";
import { scanNativeTypes } from "../../../../src/ide/qpi/lint/native-types";

const findings = (src: string) => scanNativeTypes(src);
const first = (src: string) => findings(src)[0];

describe("scanNativeTypes flags native scalar types", () => {
  test("`int` is flagged and points at the token", () => {
    const src = "struct S { int counter; };";
    const f = first(src);
    expect(f.rule).toBe("qpi/native-type");
    expect(f.severity).toBe("warn");
    expect(src.slice(f.offset, f.offset + f.length)).toBe("int");
    expect(f.message).toContain("sint32");
  });

  test("`bool` suggests `bit`", () => {
    expect(first("bool ok;").message).toContain("bit");
  });

  test("`char`, `short`, `long` suggest sized signed types", () => {
    expect(first("char c;").message).toContain("sint8");
    expect(first("short s;").message).toContain("sint16");
    expect(first("long n;").message).toContain("sint64");
  });

  test("stdint aliases are flagged", () => {
    expect(first("uint32_t x;").message).toContain("uint32");
    expect(first("int64_t y;").message).toContain("sint64");
    expect(first("size_t z;").message).toContain("uint64");
  });
});

describe("multi-word native types group into one finding", () => {
  test("`unsigned int` is one finding spanning both words, suggesting uint32", () => {
    const src = "unsigned int amount;";
    const fs = findings(src);
    expect(fs).toHaveLength(1);
    expect(src.slice(fs[0].offset, fs[0].offset + fs[0].length)).toBe("unsigned int");
    expect(fs[0].message).toContain("uint32");
  });

  test("`unsigned char` -> uint8, `long long` -> sint64", () => {
    expect(first("unsigned char b;").message).toContain("uint8");
    expect(first("long long big;").message).toContain("sint64");
  });
});

describe("QPI types and non-types are not flagged", () => {
  test("QPI fixed-width types produce no findings", () => {
    expect(findings("uint64 a; sint32 b; uint8 c; bit d; id owner;")).toHaveLength(0);
  });

  test("identifiers containing a type substring are not flagged", () => {
    // `print`, `point`, `mint` must not match `int`; `belong` must not match `long`.
    expect(findings("print(point); belong;")).toHaveLength(0);
  });

  test("native types inside comments and strings are ignored", () => {
    expect(findings("// int x\nuint64 ok;")).toHaveLength(0);
    expect(findings('uint64 ok; /* unsigned long */')).toHaveLength(0);
  });

  test("a clean contract body has zero findings", () => {
    const src = "struct S : public ContractBase { struct StateData { uint64 total; bit paused; }; };";
    expect(findings(src)).toHaveLength(0);
  });
});

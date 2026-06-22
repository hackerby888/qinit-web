// Static-analysis rules: determinism (time/RNG), no heap, no exceptions/RTTI, no STL. Heavy on edge cases —
// identifier near-misses (timestamp, renew, freedom, mystd), comment/string masking, and offset accuracy.
import { test, expect, describe } from "bun:test";
import { scanScRules } from "./sc-rules";

const rules = (s: string): string[] => scanScRules(s).map((f) => f.rule);
const has = (s: string, rule: string): boolean => rules(s).includes(rule);
const count = (s: string, rule: string): number => rules(s).filter((r) => r === rule).length;
const spanText = (s: string, rule: string): string[] => scanScRules(s).filter((f) => f.rule === rule).map((f) => s.slice(f.offset, f.offset + f.length));

describe("qpi/no-random", () => {
  test("flags the RNG call family", () => {
    expect(has("x = rand();", "qpi/no-random")).toBe(true);
    expect(has("srand(seed);", "qpi/no-random")).toBe(true);
    expect(has("y = random();", "qpi/no-random")).toBe(true);
    expect(has("drand48();", "qpi/no-random")).toBe(true);
    expect(has("rand_r(&s);", "qpi/no-random")).toBe(true);
  });

  test("allows whitespace before the paren", () => {
    expect(has("rand ();", "qpi/no-random")).toBe(true);
  });

  test("does not flag identifiers that merely contain the word", () => {
    expect(has("uint64 brand = 0;", "qpi/no-random")).toBe(false);
    expect(has("myrandom();", "qpi/no-random")).toBe(false);
    expect(has("uint64 randomness = seed;", "qpi/no-random")).toBe(false); // no call paren
    expect(has("auto r = rand;", "qpi/no-random")).toBe(false); // not a call
  });

  test("flags the function name only", () => {
    expect(spanText("v = rand();", "qpi/no-random")).toEqual(["rand"]);
  });
});

describe("qpi/no-time", () => {
  test("flags wall-clock calls", () => {
    expect(has("t = time(0);", "qpi/no-time")).toBe(true);
    expect(has("clock();", "qpi/no-time")).toBe(true);
    expect(has("gettimeofday(&tv, 0);", "qpi/no-time")).toBe(true);
    expect(has("gmtime(&t);", "qpi/no-time")).toBe(true);
  });

  test("does not flag time-ish identifiers or qpi time", () => {
    expect(has("uint64 timestamp = 0;", "qpi/no-time")).toBe(false);
    expect(has("state.mut().lastTime = t;", "qpi/no-time")).toBe(false);
    expect(has("output.time = input.time;", "qpi/no-time")).toBe(false); // member, no call
    expect(has("qpi.tick();", "qpi/no-time")).toBe(false);
    expect(has("uint64 tickTime = 0;", "qpi/no-time")).toBe(false);
  });
});

describe("qpi/no-dynamic-memory", () => {
  test("flags new / delete keywords", () => {
    expect(has("Foo* p = new Foo();", "qpi/no-dynamic-memory")).toBe(true);
    expect(has("delete p;", "qpi/no-dynamic-memory")).toBe(true);
    expect(has("delete[] arr;", "qpi/no-dynamic-memory")).toBe(true);
  });

  test("flags the malloc family as calls", () => {
    expect(has("p = malloc(8);", "qpi/no-dynamic-memory")).toBe(true);
    expect(has("calloc(4, 8);", "qpi/no-dynamic-memory")).toBe(true);
    expect(has("realloc(p, 16);", "qpi/no-dynamic-memory")).toBe(true);
    expect(has("free(p);", "qpi/no-dynamic-memory")).toBe(true);
  });

  test("does not flag identifiers containing the keyword", () => {
    expect(has("uint64 newValue = 1;", "qpi/no-dynamic-memory")).toBe(false);
    expect(has("renew(x);", "qpi/no-dynamic-memory")).toBe(false);
    expect(has("uint64 freedom = 0;", "qpi/no-dynamic-memory")).toBe(false);
    expect(has("output.freeBalance = b;", "qpi/no-dynamic-memory")).toBe(false); // free not a call
    expect(has("state.get().newest;", "qpi/no-dynamic-memory")).toBe(false);
  });
});

describe("qpi/no-exceptions", () => {
  test("flags throw / try / catch", () => {
    expect(has("throw 1;", "qpi/no-exceptions")).toBe(true);
    expect(has("try { x(); }", "qpi/no-exceptions")).toBe(true);
    expect(has("catch (e) {}", "qpi/no-exceptions")).toBe(true);
  });

  test("does not flag near-miss identifiers", () => {
    expect(has("uint64 throwaway = 0;", "qpi/no-exceptions")).toBe(false);
    expect(has("trying(x);", "qpi/no-exceptions")).toBe(false); // try not followed by {
    expect(has("uint64 catchphrase = 0;", "qpi/no-exceptions")).toBe(false);
  });
});

describe("qpi/no-rtti", () => {
  test("flags typeid and dynamic_cast", () => {
    expect(has("auto& t = typeid(x);", "qpi/no-rtti")).toBe(true);
    expect(has("dynamic_cast<Foo*>(p);", "qpi/no-rtti")).toBe(true);
  });

  test("does not flag identifiers", () => {
    expect(has("uint64 typeidx = 0;", "qpi/no-rtti")).toBe(false);
  });
});

describe("qpi/no-stl", () => {
  test("flags std:: usage with or without spaces", () => {
    expect(has("std::vector<uint64> v;", "qpi/no-stl")).toBe(true);
    expect(has("std :: map<id, X> m;", "qpi/no-stl")).toBe(true);
    expect(spanText("std::array<int,4> a;", "qpi/no-stl")).toEqual(["std"]);
  });

  test("does not flag std embedded in another identifier", () => {
    expect(has("mystd::foo();", "qpi/no-stl")).toBe(false);
    expect(has("uint64 std_field = 0;", "qpi/no-stl")).toBe(false); // no ::
  });
});

describe("comment / string masking", () => {
  const cases = [
    `// rand() time() new malloc() throw std::vector`,
    `/* rand() malloc() delete std:: typeid() */`,
    `Logger logf = "rand() malloc() std::vector throw";`,
  ];
  test("ignores violations inside comments and string literals", () => {
    for (const c of cases) {
      expect(scanScRules(c)).toEqual([]);
    }
  });

  test("a real violation after a comment is still caught", () => {
    expect(has("// allowed: rand()\nx = rand();", "qpi/no-random")).toBe(true);
    expect(count("// rand()\nrand();\nrand();", "qpi/no-random")).toBe(2);
  });
});

describe("aggregate behaviour", () => {
  test("a clean contract body produces no findings", () => {
    const ok = `
      PUBLIC_PROCEDURE(Set) {
        state.mut().value = qpi.tick();
        output.ok = div(input.a, input.b);
      }
    `;
    expect(scanScRules(ok)).toEqual([]);
  });

  test("multiple distinct violations come back sorted by offset", () => {
    const src = "x = rand();\nFoo* p = new Foo();\nstd::vector<uint64> v;";
    const fs = scanScRules(src);
    expect(fs.map((f) => f.rule)).toEqual(["qpi/no-random", "qpi/no-dynamic-memory", "qpi/no-stl"]);
    for (let i = 1; i < fs.length; i++) {
      expect(fs[i].offset).toBeGreaterThan(fs[i - 1].offset);
    }
  });

  test("every finding is advisory (warn) and points at a non-empty span", () => {
    for (const f of scanScRules("rand(); new Foo(); std::x; throw 1;")) {
      expect(f.severity).toBe("warn");
      expect(f.length).toBeGreaterThan(0);
    }
  });

  test("empty source", () => {
    expect(scanScRules("")).toEqual([]);
  });
});

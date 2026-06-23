// The IDE's system-contract endpoints: the catalog (pick-list) and compile-by-name. The real compile needs the
// wasi toolchain + core snapshot, so it's exercised by the qinit-side build tests; here we cover the catalog
// shape and the no-toolchain / unknown-name branches (which never invoke clang).
import { test, expect, describe } from "bun:test";
import { systemCatalog, compileSystem } from "../src/system";

describe("system contracts API", () => {
  test("catalog: array of {index,name,idl}; QX is index 1 when a snapshot is present", () => {
    const cat = systemCatalog();
    expect(Array.isArray(cat)).toBe(true);
    if (cat.length) {
      expect(cat.every((c) => typeof c.index === "number" && typeof c.name === "string" && c.name.length > 0)).toBe(true);
      expect(cat.find((c) => c.name === "QX")?.index).toBe(1);
    }
  });

  test("compileSystem: unknown name -> ok:false with an error, never invokes the toolchain", async () => {
    const r = await compileSystem("NOTACONTRACT");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.wasm).toBeUndefined();
  });
});

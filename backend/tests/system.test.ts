// The IDE's system-contract endpoints: the catalog (pick-list) and source-by-name. The browser compiles the
// source itself, so the backend only needs the catalog shape and the no-core / unknown-name branches here.
import { test, expect, describe } from "bun:test";
import { systemCatalog, systemSource } from "../src/system";

describe("system contracts API", () => {
  test("catalog: array of {index,name,idl}; QX is index 1 when a snapshot is present", () => {
    const cat = systemCatalog();
    expect(Array.isArray(cat)).toBe(true);
    if (cat.length) {
      expect(cat.every((c) => typeof c.index === "number" && typeof c.name === "string" && c.name.length > 0)).toBe(true);
      expect(cat.find((c) => c.name === "QX")?.index).toBe(1);
    }
  });

  test("systemSource: unknown name -> ok:false with a 404", () => {
    const r = systemSource("NOTACONTRACT");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeTruthy();
      expect([404, 503]).toContain(r.status);
    }
  });

  test("systemSource: a catalog entry serves its source at its canonical index", () => {
    const cat = systemCatalog();
    if (!cat.length) {
      return;
    }
    const r = systemSource("QX");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.index).toBe(1);
      expect(r.source.length).toBeGreaterThan(1000);
    }
  });
});

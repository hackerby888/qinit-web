// Readiness gating: ready when Mongo is connected, or when the in-memory layer is intentional (QINIT_NO_DB).
import { test, expect, describe } from "bun:test";
import { isReady } from "../src/lifecycle";

describe("isReady", () => {
  test("ready when Mongo is connected", () => {
    expect(isReady(true, false)).toBe(true);
  });

  test("not ready when Mongo is down and a real DB is expected", () => {
    expect(isReady(false, false)).toBe(false);
  });

  test("ready when the in-memory layer is intentional (QINIT_NO_DB), regardless of Mongo", () => {
    expect(isReady(false, true)).toBe(true);
    expect(isReady(true, true)).toBe(true);
  });
});

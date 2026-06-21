// Unit test for the shared-token admin gate. adminTokenOk is the pure constant-time check: only a configured,
// exactly-matching token passes; an unset server token means the admin area is locked.
import { test, expect, describe } from "bun:test";
import { adminTokenOk } from "../src/admin";

describe("adminTokenOk", () => {
  test("accepts an exact match", () => {
    expect(adminTokenOk("s3cret", "s3cret")).toBe(true);
  });

  test("rejects a mismatch of equal length", () => {
    expect(adminTokenOk("s3crxt", "s3cret")).toBe(false);
  });

  test("rejects a length mismatch", () => {
    expect(adminTokenOk("s3cret-longer", "s3cret")).toBe(false);
  });

  test("is locked when the server token is unset or empty", () => {
    expect(adminTokenOk("anything", undefined)).toBe(false);
    expect(adminTokenOk("anything", null)).toBe(false);
    expect(adminTokenOk("anything", "")).toBe(false);
  });

  test("rejects a missing presented token", () => {
    expect(adminTokenOk(undefined, "s3cret")).toBe(false);
    expect(adminTokenOk(null, "s3cret")).toBe(false);
    expect(adminTokenOk("", "s3cret")).toBe(false);
  });
});

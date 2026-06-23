// Boot-config security helpers: weak-secret detection + the CORS origin allowlist.
import { test, expect, describe } from "bun:test";
import { isWeakSecret, parseOrigins, originAllowed } from "../src/security";

describe("isWeakSecret", () => {
  test("flags missing, default, and too-short secrets", () => {
    expect(isWeakSecret(undefined)).toBe(true);
    expect(isWeakSecret("")).toBe(true);
    expect(isWeakSecret("dev-insecure-secret-change-me")).toBe(true);
    expect(isWeakSecret("short")).toBe(true);
    expect(isWeakSecret("a".repeat(23))).toBe(true);
  });

  test("accepts a strong secret (>= 24 chars, not the default)", () => {
    expect(isWeakSecret("a".repeat(24))).toBe(false);
    expect(isWeakSecret("kJ8x2pQ!9vLm3nRt6wYz4bC7dEfG")).toBe(false);
  });
});

describe("parseOrigins", () => {
  test("splits a comma list, trims, drops blanks", () => {
    expect(parseOrigins("https://a.com, https://b.com ,, ")).toEqual(["https://a.com", "https://b.com"]);
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("")).toEqual([]);
  });
});

describe("originAllowed", () => {
  const allowed = ["https://app.example.com", "http://localhost:5180"];

  test("permits a no-Origin request (curl / server-to-server)", () => {
    expect(originAllowed(undefined, allowed)).toBe(true);
  });

  test("permits listed origins, rejects others", () => {
    expect(originAllowed("https://app.example.com", allowed)).toBe(true);
    expect(originAllowed("http://localhost:5180", allowed)).toBe(true);
    expect(originAllowed("https://evil.com", allowed)).toBe(false);
  });

  test("a wildcard entry disables the allowlist", () => {
    expect(originAllowed("https://anything.com", ["*"])).toBe(true);
  });
});

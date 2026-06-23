// JWT unit tests for the self-signed HS256 tokens. Covers sign/verify round-trip, expiry enforcement,
// signature tampering, malformed input, and the userIdFromToken helper used by the collab WS layer.
import { test, expect, describe } from "bun:test";
import { signJwt, verifyJwt, userIdFromToken } from "../src/auth";

const future = (): number => Math.floor(Date.now() / 1000) + 3600;
const past = (): number => Math.floor(Date.now() / 1000) - 3600;

describe("signJwt / verifyJwt", () => {
  test("round-trips a payload", () => {
    const token = signJwt({ sub: "u1", name: "Ada", exp: future() });
    const payload = verifyJwt(token);

    expect(payload?.sub).toBe("u1");
    expect(payload?.name).toBe("Ada");
  });

  test("rejects an expired token", () => {
    const token = signJwt({ sub: "u1", exp: past() });
    expect(verifyJwt(token)).toBeNull();
  });

  test("accepts a token with no exp claim", () => {
    const token = signJwt({ sub: "u1" });
    expect(verifyJwt(token)?.sub).toBe("u1");
  });

  test("rejects a tampered signature", () => {
    const token = signJwt({ sub: "u1", exp: future() });
    const parts = token.split(".");
    const flip = parts[2][0] === "A" ? "B" : "A";
    const forged = `${parts[0]}.${parts[1]}.${flip}${parts[2].slice(1)}`;

    expect(verifyJwt(forged)).toBeNull();
  });

  test("rejects a tampered payload (signature no longer matches)", () => {
    const token = signJwt({ sub: "u1", exp: future() });
    const parts = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin", exp: future() })).toString("base64url");

    expect(verifyJwt(`${parts[0]}.${forgedPayload}.${parts[2]}`)).toBeNull();
  });

  test("rejects malformed tokens", () => {
    expect(verifyJwt("not-a-jwt")).toBeNull();
    expect(verifyJwt("a.b")).toBeNull();
    expect(verifyJwt("")).toBeNull();
  });
});

describe("userIdFromToken", () => {
  test("returns the sub for a valid token", () => {
    const token = signJwt({ sub: "github:42", exp: future() });
    expect(userIdFromToken(token)).toBe("github:42");
  });

  test("returns null for nullish, malformed, expired, or sub-less tokens", () => {
    expect(userIdFromToken(null)).toBeNull();
    expect(userIdFromToken(undefined)).toBeNull();
    expect(userIdFromToken("garbage")).toBeNull();
    expect(userIdFromToken(signJwt({ sub: "u1", exp: past() }))).toBeNull();
    expect(userIdFromToken(signJwt({ name: "no-sub", exp: future() }))).toBeNull();
  });
});

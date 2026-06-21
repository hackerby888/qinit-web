// The fixed-window rate decision: allow up to `limit` per window, then block until the window resets.
import { test, expect, describe } from "bun:test";
import { rateStep, type RateState } from "../src/ratelimit";

describe("rateStep", () => {
  const windowMs = 60_000;
  const limit = 3;

  test("first request in a fresh window is allowed and opens the window", () => {
    const r = rateStep(undefined, 1_000, windowMs, limit);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
    expect(r.state).toEqual({ count: 1, resetAt: 61_000 });
  });

  test("requests up to the limit are allowed; the next is blocked", () => {
    let state: RateState | undefined;
    const now = 1_000;
    const seen: boolean[] = [];

    for (let i = 0; i < 4; i++) {
      const r = rateStep(state, now, windowMs, limit);
      state = r.state;
      seen.push(r.allowed);
    }

    expect(seen).toEqual([true, true, true, false]); // 4th over limit=3
    expect(state!.count).toBe(4);
  });

  test("remaining never goes negative", () => {
    const over: RateState = { count: 5, resetAt: 61_000 };
    expect(rateStep(over, 1_000, windowMs, limit).remaining).toBe(0);
  });

  test("a request after the window resets starts a new window", () => {
    const expired: RateState = { count: 3, resetAt: 61_000 };
    const r = rateStep(expired, 61_000, windowMs, limit); // now >= resetAt
    expect(r.allowed).toBe(true);
    expect(r.state).toEqual({ count: 1, resetAt: 121_000 });
  });
});

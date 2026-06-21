// Unit test for the cross-instance single-writer election used by the collab write-back. Pure logic, so it
// runs without Redis: the SET-NX winner writes, the current lock holder may renew + write, everyone else
// yields.
import { test, expect, describe } from "bun:test";
import { electedWriter } from "../src/collab";

describe("electedWriter", () => {
  test("the SET-NX winner writes (regardless of any stale holder reading)", () => {
    expect(electedWriter("OK", null, "self")).toBe(true);
    expect(electedWriter("OK", "someone-else", "self")).toBe(true);
  });

  test("when the lock is held, only the current holder writes (lease renewal)", () => {
    expect(electedWriter(null, "self", "self")).toBe(true);
    expect(electedWriter(null, "rival", "self")).toBe(false);
  });

  test("a lost race with no readable holder yields", () => {
    expect(electedWriter(null, null, "self")).toBe(false);
  });
});

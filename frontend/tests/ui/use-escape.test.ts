// Escape closes the overlay on top and nothing under it: one key press used to close every overlay that was open.
import { test, expect } from "bun:test";
import { pushEscape, runEscape } from "../../src/ui/use-escape";

test("nothing open: Escape is not taken", () => {
  expect(runEscape()).toBe(false);
});

test("only the newest handler runs, and releasing it hands Escape back to the one under it", () => {
  const calls: string[] = [];
  const releaseExplorer = pushEscape(() => calls.push("tx explorer"));
  const releaseSearch = pushEscape(() => calls.push("search"));

  expect(runEscape()).toBe(true);
  expect(calls).toEqual(["search"]);

  releaseSearch();
  runEscape();
  expect(calls).toEqual(["search", "tx explorer"]);

  releaseExplorer();
  expect(runEscape()).toBe(false);
});

test("an overlay under the top one can close first without disturbing it", () => {
  const calls: string[] = [];
  const releaseUnder = pushEscape(() => calls.push("under"));
  const releaseTop = pushEscape(() => calls.push("top"));

  releaseUnder();
  runEscape();
  expect(calls).toEqual(["top"]);
  releaseTop();
});

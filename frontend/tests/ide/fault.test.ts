// a halted chain has to say what failed, where, and how to restart it — the developer otherwise meets a bare abort code.
import { expect, test } from "bun:test";
import { failureLine, faultLine } from "../../src/ide/fault";

const FAULT = {
  message: "abort(3422552092)",
  phase: "transaction",
  failedTick: 3,
  failedEpoch: 0,
  lastFinalizedTick: 2,
  lastFinalizedEpoch: 0,
  slot: 28,
  kind: 1,
  entry: 1,
};

test("a failed CC_ASSERT names the contract, the entry, the file and the line", () => {
  expect(faultLine(FAULT, { contract: "Cheats", entry: "Add", file: "Cheats.h" })).toBe(
    "Cheats.Add halted the chain at tick 3: CC_ASSERT failed at Cheats.h:28 (abort(0xCC00001C)). Press ↺ reset or ▶ Compile & Run to restart it.",
  );
});

test("without a deployed contract to name, the slot stands in; a fault outside any contract names neither", () => {
  expect(faultLine(FAULT)).toStartWith("slot 28 halted the chain at tick 3: CC_ASSERT failed at slot 28:28");
  expect(faultLine({ ...FAULT, slot: undefined, message: "log store failed" })).toBe(
    "the chain halted at tick 3: log store failed. Press ↺ reset or ▶ Compile & Run to restart it.",
  );
});

test("a trap that is not an assert keeps its own words, with the trap code named", () => {
  expect(faultLine({ ...FAULT, message: "Division by zero" }, { contract: "Trap", entry: "Div" })).toStartWith("Trap.Div halted the chain at tick 3: Division by zero.");
  expect(faultLine({ ...FAULT, message: "abort(3424452608)" }, { contract: "Trap" })).toStartWith("Trap halted the chain at tick 3: wasm trap.");
});

test("a failed action reads the same from every button, and on a halted chain says why once", () => {
  expect(failureLine("Add", new Error("abort(3422552092)"))).toBe("Add failed: abort(0xCC00001C)");
  expect(failureLine("+1 tick", "worker gone")).toBe("+1 tick failed: worker gone");
  expect(failureLine("faucet", new Error("abort(3422552092)"), true)).toBe("faucet failed: the chain is halted. Press ↺ reset or ▶ Compile & Run to restart it.");
});

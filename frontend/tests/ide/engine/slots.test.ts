// the shell's first dynamic slot has to be the in-page node's: a literal drifted to a native contract's index once.
import { expect, test } from "bun:test";
import { VirtualNode } from "@qinit/engine";
import { assignSlot, slotAtOrAbove } from "../../../src/ide/engine/slots";

test("the first assigned slot is the engine's first dynamic slot", () => {
  const node = new VirtualNode();
  expect(assignSlot({}, "A")).toBe(node.slotBase);
  expect(slotAtOrAbove({}, "A", 0)).toBe(node.slotBase);
});

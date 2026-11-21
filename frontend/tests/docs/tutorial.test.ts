// the tutorial's contract must keep building: each full contract listing in tutorial-*.md goes through the IDE's build gate.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { buildContract } from "../../src/ide/compile/build";

const content = new URL("../../src/docs/content/", import.meta.url);

test("every full contract listing in the tutorial builds", async () => {
  const listings = readdirSync(content)
    .filter((file) => /^tutorial-.*\.md$/.test(file))
    .flatMap((file) => [...readFileSync(new URL(file, content), "utf8").matchAll(/```cpp[^\n]*\n([\s\S]*?)```/g)].map((block) => ({ file, source: block[1] })))
    .filter((listing) => listing.source.includes(": public ContractBase"));

  // the contract as first written, and as it stands after the upgrade
  expect(listings.map((listing) => listing.file)).toEqual(["tutorial-client.md", "tutorial-contract.md"]);
  for (const { file, source } of listings) {
    const name = /struct (\w+) : public ContractBase/.exec(source)![1];
    const built = (await buildContract({ id: 1, kind: "compile", source, name, slot: 30, callees: [] })).res;

    expect([file, built.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.line}: ${d.message}`)]).toEqual([file, []]);
    expect(built.ok).toBe(true);
  }
});

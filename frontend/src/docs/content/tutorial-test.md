---
title: Crowdfund 2: tests
group: Tutorial
order: 2
description: Tutorial, part 2 of 4: test the crowdfund contract with a TypeScript spec that sends QU, checks access and moves past the deadline.
---

You will end this page with three green tests: a contribution, a refused withdrawal, and a refund after the deadline.

`qinit new` wrote a spec for the counter template. Replace `tests/Crowdfund.test.ts` with one for your contract:

```ts
import { test, expect, beforeAll } from "bun:test";
import { Crowdfund, provider, rpc } from "./.qinit";

let owner: Crowdfund;
let backer: Crowdfund;
beforeAll(async () => {
  const { seeds } = await rpc().fundedSeeds();   // the local node's funded test identities
  owner = new Crowdfund({ ...provider(), seed: seeds[0] });
  backer = new Crowdfund({ ...provider(), seed: seeds[1] });
  await owner.Open({ goal: 1000n, epochs: 1 });
});

test("a contribution is counted", async () => {
  const tx = await backer.Contribute({}, { amount: 400n });
  expect(tx.output).toEqual({ success: 1 });
  expect((await owner.Status()).raised).toBe(400n);
}, 60000);

test("nobody withdraws before the goal is met", async () => {
  expect((await backer.Withdraw()).output).toEqual({ success: 0 });
  expect((await owner.Withdraw()).output).toEqual({ success: 0 });
}, 60000);

test("after the deadline the backer takes the QU back", async () => {
  await rpc().advanceEpoch();
  expect((await backer.Refund()).output).toEqual({ success: 1 });
  expect((await owner.Status()).raised).toBe(0n);
}, 60000);
```

```bash
qinit test
```

```text
✓ node          simulator @ http://127.0.0.1:45517
✓ deploy        Crowdfund @ slot 32
✓ sdk           tests/.qinit/ (1 fn / 4 proc)
✓ types         @types/bun present
✓ tests         all passed

[bun test ✓]
╭─────────────────────────────────────╮
│ bun test v1.3.14 (0d9b296a)         │
│  3 pass                             │
│  0 fail                             │
│  6 expect() calls                   │
│ Ran 3 tests across 1 file. [21.35s] │
╰─────────────────────────────────────╯

[passed ✓]
╭─────────────────────────────────╮
│ contract Crowdfund @ 32         │
│ rpc      http://127.0.0.1:45517 │
│ node     simulator              │
╰─────────────────────────────────╯
```

`qinit test` started its own node, deployed the contract and generated the typed client the spec imports, so there was nothing to set up first.

- `{ amount: 400n }` sends QU with a call.
- `tx.output` is the procedure's output struct, which is how the spec sees a refusal.
- `rpc().advanceEpoch()` jumps past the deadline instead of waiting a week.

For C++ tests of the same contract, see [Test a contract](/docs/testing). Next: [run it on your own node](/docs/tutorial-deploy).

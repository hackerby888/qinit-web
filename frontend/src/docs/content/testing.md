---
title: Test a contract
group: Guides
order: 2
---

Qinit has two test paths. They test different boundaries, and `qinit new` writes a starter file for each.

## Contract logic: `qinit gtest`

Each test gets a fresh, isolated Qubic state. No running node is needed.

`tests/Counter.test.cpp` holds a small harness around the contract and the tests that use it:

```cpp
TEST(Counter, IncrementsOncePerCall)
{
    ContractTestingCounter t;
    const id user = id::randomValue();
    increaseEnergy(user, 1000000000);

    t.inc(user);
    t.inc(user);
    EXPECT_EQ(t.get(), 2ull);
}
```

Run only that test:

```bash
qinit gtest --filter Increments
```

```text
✓ Counter.IncrementsOncePerCall
✓ tests     1/1 passed

[passed ✓]
╭───────────────────────────────────────────────╮
│ contract Counter @ 31                         │
│ backend  TypeScript compiler                  │
│ test     tests/Counter.test.cpp               │
│ node     in-process engine (isolated genesis) │
╰───────────────────────────────────────────────╯
```

Drop `--filter` to run every test in the file.

The contract is built with your saved compiler. Change it for good with `qinit compiler clang`, or for one run with `--compiler clang`. The C++ test harness itself is always built with Clang.

The test file is compiled for wasm32: `long`, `size_t` and pointers are 4 bytes there and 8 on core, so hold amounts, ticks and indices in `sint64`/`uint64`, never in `long`.

## RPC workflow: `qinit test`

Use this for deployment and generated-client behavior: the test talks to a node the way an application does.

`tests/Counter.test.ts` is already in the project:

```ts
import { test, expect, beforeAll } from "bun:test";
import { Counter, provider } from "./.qinit";

let c: Counter;
beforeAll(() => { c = new Counter(provider()); });

test("Counter: starts at zero and increments", async () => {
  expect((await c.Get()).value).toBe(0n);
  const r = await c.Inc();
  expect(r.confirmed).toBe(true);
  expect(r.included).toBe(true);
  expect((await c.Get()).value).toBe(1n);
}, 60000);
```

```bash
qinit test
```

```text
✓ node          simulator @ http://127.0.0.1:46611
✓ deploy        Counter @ slot 31
✓ sdk           tests/.qinit/ (1 fn / 1 proc)
✓ tests         all passed

[bun test ✓]
╭──────────────────────────────────────╮
│ bun test v1.3.14 (0d9b296a)          │
│  1 pass                              │
│  0 fail                              │
│  4 expect() calls                    │
│ Ran 1 test across 1 file. [517.00ms] │
╰──────────────────────────────────────╯
```

`qinit test` starts its own node, deploys the contract, and generates the typed client the test imports into `tests/.qinit/`. That folder is rewritten on every run, so the client always matches the contract.

It uses your saved runtime and compiler. Change them with `qinit runtime` and `qinit compiler`, or pass `--runtime core` or `--compiler clang` for one run.

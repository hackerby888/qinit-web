---
title: Test a contract
group: Guides
order: 2
---

Qinit has two test paths. They test different boundaries.

## Contract logic: `qinit gtest`

Each test gets a fresh, isolated Qubic state. No running node is needed.

Replace a generated TODO in `tests/Counter.test.cpp` with a real assertion:

```cpp
TEST(Counter, Increments)
{
    ContractTestingCounter t;
    const id user = id::randomValue();
    t.fund(user, 1000000000);

    t.inc(user);

    EXPECT_EQ(t.get().value, 1);
}
```

Run only that test:

```bash
qinit gtest --compiler typescript --filter Increments
```

```text
✓ Counter.Increments
✓ tests     1/1 passed
```

The test harness uses Clang. `--compiler typescript` selects the faster compiler for the contract module.

## RPC workflow: `qinit test`

Use this for deployment and generated-client behavior. It requires Bun.

```bash
qinit test --runtime simulator --compiler typescript
```

On the first run, Qinit creates `tests/Counter.test.ts` and its self-contained client:

```ts
import { expect, test } from "bun:test";
import { Counter, provider } from "./.qinit";

test("Counter: starts at zero and increments", async () => {
  const c = new Counter(provider());
  expect((await c.Get()).value).toBe(0n);
  const result = await c.Inc();
  expect(result.confirmed).toBe(true);
  expect(result.included).toBe(true);
  expect((await c.Get()).value).toBe(1n);
}, 60000);
```

A passing run ends with:

```text
(pass) Counter: starts at zero and increments
1 pass
0 fail
```

`qinit test` may add test files and `package.json` entries. Review and commit the useful generated files.

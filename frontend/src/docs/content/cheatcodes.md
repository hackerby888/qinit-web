---
title: Debug with cheatcodes
group: Guides
order: 9
---

**Cheatcodes** are `CC_*` macros you write straight into contract code while developing: print a value, assert something, fake a caller, or move time forward. Qinit removes them before a contract goes to Qubic Core, so nothing you ship contains them. They work with both compilers and both runtimes.

| Cheatcode | What it does | Where |
| --- | --- | --- |
| `CC_PRINT("label", value, …)` | prints words and values to the call trace | anywhere |
| `CC_ASSERT(condition)` | aborts with the source line when false | anywhere |
| `CC_PAY(to, amount)` | sends QU from the contract | procedures |
| `CC_DEAL(who, amount)` | sets a balance outright | procedures |
| `CC_WARP_TICK(n)` / `CC_WARP_EPOCH(n)` | shifts the tick or epoch the contract sees | procedures |
| `CC_PRANK(who, reward)` / `CC_UNPRANK()` | changes the caller the contract sees | procedures |

The last four change state, so they're rejected at build time inside a `PUBLIC_FUNCTION`. A warp or prank lasts only for the current call, never into the next transaction.

## Example contract

`qinit new Tally`, then replace `contracts/Tally.h`:

```cpp
using namespace QPI;

struct Tally2 {};

struct Tally : public ContractBase
{
    struct StateData
    {
        uint64 total;
    };

    struct Add_input { uint64 amount; };
    struct Add_output {};
    struct Get_input { uint64 expected; };
    struct Get_output { uint64 total; };

    PUBLIC_PROCEDURE(Add)
    {
        CC_PRINT("adding", input.amount, "from", qpi.invocator());
        state.mut().total += input.amount;
        CC_PRINT("total is now", state.get().total);
    }

    PUBLIC_FUNCTION(Get)
    {
        CC_ASSERT(state.get().total == input.expected);
        output.total = state.get().total;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Add, 1);
        REGISTER_USER_FUNCTION(Get, 1);
    }
};
```

## See the prints

```bash
qinit deploy
qinit call --proc Tally Add --in 5uint64 --trace
```

```text
✓ Tally proc#1 (Add) 422µs · tick 2760
  in     5
  out    {}
  caller SINUBYSBZKBSVEFQDZBQWUEJWRXCXOZNKPHIXDZWRBKXDSPJEHFAMBACXHUN
  state
    total 0 → 5
  print  :19 adding 5 from SINUBYSBZKBSVEFQDZBQWUEJWRXCXOZNKPHIXDZWRBKXDSPJEHFAMBACXHUN
  print  :21 total is now 5
```

Each print shows its source line. Prints also appear live in `qinit debug Tally`. A line can hold only one `CC_PRINT`.

## Catch a broken assumption

```bash
qinit call --fn Tally Get --in 5uint64
qinit call --fn Tally Get --in 6uint64
```

```text
✓ Tally.Get
  out 5

✗ call
  querySmartContract: code=-1 Error calling smart contract function:
  abort(0xCC00001A)
```

The abort code is `0xCC000000` plus the line number: `0x1A` is line 26, the `CC_ASSERT`. In a function, a failed assert fails only that query. In a procedure it halts the local node:

```text
node halted: Tally proc#1 trapped abort(0xCC000014) at tick 3021 — run `qinit node run` to restart it
```

`qinit node run` starts a fresh chain, so deploy again afterwards.

## Ship without them

See exactly what will ship:

```bash
qinit strip contracts/Tally.h --out Tally.clean.h
```

Build or deploy the stripped version. Your source file is never modified:

```bash
qinit build --production
qinit deploy --production
```

The stripped wasm is byte-for-byte identical to a build that never had cheatcodes. `qinit integrate` strips automatically, and it refuses if a `CC_*` call is still left.

---
title: Call another contract
group: Guides
order: 7
---

## Start from the example

```bash
qinit new reader --template intercontract
cd reader
qinit node run
qinit deploy
```

```text
▌ CONTRACTS ─────────────────────────────────────────────────────────────────
  contract  slot  kind    status    source
  Counter     31  callee  deployed  contracts/Counter.h
  Reader      32  main    deployed  contracts/Reader.h
```

The template creates both `Reader.h` and its `Counter.h` dependency. Qinit discovers the call, builds both contracts, and deploys the callee first.

## Make the call

Input, output, and locals use the callee's types:

```cpp
struct ReadCounter_locals {
  Counter::Get_input input;
  Counter::Get_output output;
};

PUBLIC_FUNCTION_WITH_LOCALS(ReadCounter)
{
  CALL_OTHER_CONTRACT_FUNCTION(Counter, Get, locals.input, locals.output);
  output.value = locals.output.value;
}
```

For a procedure, use `INVOKE_OTHER_CONTRACT_PROCEDURE` and pass the invocation reward as the last argument:

```cpp
struct BumpCounter_locals {
  Counter::Inc_input input;
  Counter::Inc_output output;
};

PUBLIC_PROCEDURE_WITH_LOCALS(BumpCounter)
{
  INVOKE_OTHER_CONTRACT_PROCEDURE(Counter, Inc, locals.input, locals.output, 0);
}
```

## See it run

```bash
qinit call --proc Reader BumpCounter
qinit call --fn Reader ReadCounter
```

```text
✓ Reader.BumpCounter  processed
  tx   kuekiyqwnyycggsdotlhyqbjyojcrbfqiqotaqzybggjmwoqwszqifpfpqll
  tick 2721

✓ Reader.ReadCounter
  out 1
```

Add `--trace` to see the call cross into the other contract:

```bash
qinit call --proc Reader BumpCounter --trace
```

```text
✓ Reader proc#1 (BumpCounter) 225µs · tick 2730
  in     {}
  out    {}
  caller SINUBYSBZKBSVEFQDZBQWUEJWRXCXOZNKPHIXDZWRBKXDSPJEHFAMBACXHUN
  state (no change)
  host   invokeProcedure → @31 proc #1 reward=0
  ✓ Counter proc#1 (Inc) 70µs · tick 2730
    in     {}
    out    {}
    caller GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANAVO
    state
      counter 1 → 2
```

The trace nests the callee under the caller. Inside `Counter`, the caller is `Reader`'s own address, not the user who sent the transaction.

## Bring your own dependency

Put contract headers under `contracts/` and Qinit finds them by state type. A header elsewhere can be mapped explicitly:

```bash
qinit deploy --callee Counter=../shared/Counter.h
```

## Slots

A system contract is always deployed at its mainnet slot. Only your own contracts' slots vary, and Qinit assigns those for you.

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

This creates both `Reader.h` and its `Counter.h` dependency. Qinit discovers the call, builds both contracts, and deploys the callee first.

## Make the call

Input, output, and locals use the callee's types:

```cpp
struct ReadCounter_locals {
  Counter::Get_input input;
  Counter::Get_output output;
};

PUBLIC_FUNCTION_WITH_LOCALS(ReadCounter)
{
  CALL_OTHER_CONTRACT_FUNCTION(
    Counter,
    Get,
    locals.input,
    locals.output
  );
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
  INVOKE_OTHER_CONTRACT_PROCEDURE(
    Counter,
    Inc,
    locals.input,
    locals.output,
    0
  );
}
```

## Bring your own dependency

Put custom contract headers under `contracts/` and Qinit finds them by state type. A header elsewhere can be mapped explicitly:

```bash
qinit deploy --callee Counter=../shared/Counter.h
```

The current dynamic window is slots **29–32**. Let Qinit assign them: every custom callee must have a lower slot than its caller, and dependency cycles are rejected.

System contracts are different. Their slots are fixed by Qubic Core, so Qinit uses those canonical indexes instead of the dynamic planner.

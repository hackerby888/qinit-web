---
title: Write a contract
group: Guides
order: 1
---

A Qinit contract is one QPI C++ header. `qinit new counter` creates `contracts/Counter.h`:

```cpp
using namespace QPI;

struct CONTRACT_STATE2_TYPE {};

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData
    {
        uint64 counter;
    };

    struct Inc_input {};
    struct Inc_output {};
    struct Get_input {};
    struct Get_output { uint64 value; };

    PUBLIC_PROCEDURE(Inc)
    {
        state.mut().counter += 1;
    }

    PUBLIC_FUNCTION(Get)
    {
        output.value = state.get().counter;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Inc, 1);
        REGISTER_USER_FUNCTION(Get, 1);
    }

    INITIALIZE()
    {
        state.mut().counter = 0;
    }
};
```

The project root also has `qinit.json`, so commands need no repeated flags:

```json
{
  "contractName": "Counter",
  "contract": "contracts/Counter.h",
  "rpc": "http://127.0.0.1:41841"
}
```

## What each part does

- `StateData` is persistent contract state.
- `<Name>_input` and `<Name>_output` define the public ABI.
- `PUBLIC_FUNCTION` reads with `state.get()`.
- `PUBLIC_PROCEDURE` may write with `state.mut()`.
- Registration assigns a numeric ID. Function and procedure IDs are separate, so both can use `1`.
- `INITIALIZE` sets state on the first deployment.
- The empty `CONTRACT_STATE2_TYPE` is part of the Core contract shape; keep it in the file.

Use QPI fixed-width types and containers: `uint64`, `sint32`, `id`, `bit`, `Array`, `HashMap`, and friends.

## Start from another template

```bash
qinit new balances --template hashmap
qinit new token --template asset
qinit new reader --template intercontract
```

These add a map-backed balance contract, an asset workflow, or a ready-to-build caller and callee. The generated files are normal contract code; edit them directly.

## Try a typed input

Make `Inc` accept an amount:

```cpp
struct Inc_input { uint64 amount; };

PUBLIC_PROCEDURE(Inc)
{
    state.mut().counter += input.amount;
}
```

Then check and build it:

```bash
qinit verify
qinit build
```

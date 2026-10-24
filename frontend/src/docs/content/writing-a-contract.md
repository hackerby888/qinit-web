---
title: Write a contract
group: Guides
order: 1
---

A Qinit contract is one QPI C++ header. `qinit new counter` creates `contracts/Counter.h`:

```cpp
using namespace QPI;

struct Counter2
{
};

struct Counter : public ContractBase
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

`contractName` is the name the contract deploys under. It defaults to the struct and may differ from it; the struct is always read from the header.

## What each part does

- `StateData` is persistent contract state.
- `<Name>_input` and `<Name>_output` define the public ABI.
- `PUBLIC_FUNCTION` reads with `state.get()`.
- `PUBLIC_PROCEDURE` may write with `state.mut()`.
- Registration assigns a numeric ID. Function and procedure IDs are separate, so both can use `1`.
- `INITIALIZE` sets state on the first deployment.
- The empty `Counter2` struct is part of the Core contract shape; keep it in the file.

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
```

```text
✓ protocol rules  passed — complies with qpi.h restrictions
```

```bash
qinit build
```

```text
[built ✓ (TypeScript)]
╭───────────────────────────────────────────────────────────────────────────╮
│ wasm /home/you/counter/dist/contracts/Counter.wasm                        │
│ size 4438 bytes                                                           │
│ k12  8dbf57bb8dc1f7a4eb971ccc10529c8ccc1d91d79c920aa66bbb9d7fe5c2a81e     │
╰───────────────────────────────────────────────────────────────────────────╯
```

Deploy it and pass the amount with `--in`:

```bash
qinit deploy
qinit call --proc Counter Inc --in 5uint64
qinit call --fn Counter Get
```

```text
✓ Counter.Inc   processed
  tx   docetjjnmtygnappzrxzfhvgickfpbffiyklpsevgacmcybejvckjrchlsug
  tick 2716

✓ Counter.Get
  out 5
```

The value carries its QPI type. Qinit also knows from the contract that `amount` is a `uint64`, so `--in 5` works too. See [Call values](/docs/call-values).

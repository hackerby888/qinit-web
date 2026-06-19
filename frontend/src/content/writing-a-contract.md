---
title: Write a contract
group: Guides
order: 1
---

## The file

A contract is one `.h` file. Here's the counter:

```cpp
struct CONTRACT_STATE_TYPE : public ContractBase {
  struct StateData { uint64 counter; };

  struct Inc_input {};  struct Inc_output {};
  struct Get_input {};  struct Get_output { uint64 value; };

  PUBLIC_PROCEDURE(Inc) { state.mut().counter += 1; }
  PUBLIC_FUNCTION(Get)  { output.value = state.get().counter; }

  REGISTER_USER_FUNCTIONS_AND_PROCEDURES() {
    REGISTER_USER_PROCEDURE(Inc, 1);
    REGISTER_USER_FUNCTION(Get, 1);
  }
  INITIALIZE() { state.mut().counter = 0; }
};
```

## State

`state.get()` reads. `state.mut()` writes. Your data lives in `StateData`.

## Functions vs procedures

- `PUBLIC_FUNCTION` — read only, returns data, free.
- `PUBLIC_PROCEDURE` — writes state, sent as a transaction.

Give each one an id in `REGISTER_USER_FUNCTIONS_AND_PROCEDURES`.

## Rules

- No native types — use `uint64`, `sint32`, `id`.
- No `[]` arrays — use `Array<>`, `HashMap<>`.
- No `%` or `/` — use `mod`, `div`.

> **Warn** — These are Qubic's QPI rules. Break them and the build fails (qinit shows the error).

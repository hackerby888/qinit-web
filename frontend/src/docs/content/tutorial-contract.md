---
title: Crowdfund 1: the contract
group: Tutorial
order: 1
description: Tutorial, part 1 of 4: write a crowdfunding contract for Qubic that takes QU, tracks backers and pays out or refunds.
---

You are going to build a crowdfund. People send QU toward a goal; the owner collects if the goal is met, and everyone takes their QU back if it is not. Four short pages, and this one ends with a contract that builds.

```bash
qinit new crowdfund
cd crowdfund
```

```text
✓ created crowdfund/  (template: counter)
  contracts/Crowdfund.h
  tests/Crowdfund.test.ts
  tests/Crowdfund.test.cpp
  qinit.json · package.json · tsconfig.json · .gitignore · README.md
  node_modules/@types/bun (editor typing for the spec)
next: cd crowdfund && qinit node run && qinit dev
```

Replace `contracts/Crowdfund.h` with the whole app:

```cpp
using namespace QPI;

struct Crowdfund2
{
};

struct Crowdfund : public ContractBase
{
    struct StateData
    {
        id owner;
        uint64 goal;
        uint64 raised;
        uint32 deadlineEpoch;
        HashMap<id, uint64, 1024> contributions;
    };

    struct Open_input { uint64 goal; uint32 epochs; };
    struct Open_output { bit success; };
    struct Contribute_input {};
    struct Contribute_output { bit success; };
    struct Withdraw_input {};
    struct Withdraw_output { bit success; };
    struct Refund_input {};
    struct Refund_output { bit success; };
    struct Status_input {};
    struct Status_output { id owner; uint64 goal; uint64 raised; uint32 deadlineEpoch; uint64 contributors; };

    // whoever opens the campaign owns it
    PUBLIC_PROCEDURE(Open)
    {
        if (state.get().goal != 0 || input.goal == 0) return;
        state.mut().owner = qpi.invocator();
        state.mut().goal = input.goal;
        state.mut().deadlineEpoch = qpi.epoch() + input.epochs;
        output.success = 1;
    }

    // the QU sent with the call is the contribution; a closed campaign sends it straight back
    struct Contribute_locals { uint64 given; };
    PUBLIC_PROCEDURE_WITH_LOCALS(Contribute)
    {
        if (state.get().goal == 0 || qpi.epoch() >= state.get().deadlineEpoch)
        {
            qpi.transfer(qpi.invocator(), qpi.invocationReward());
            return;
        }
        state.get().contributions.get(qpi.invocator(), locals.given);
        state.mut().contributions.set(qpi.invocator(), locals.given + qpi.invocationReward());
        state.mut().raised += qpi.invocationReward();
        output.success = 1;
    }

    // owner only, once the goal is met: pays out and closes the campaign
    PUBLIC_PROCEDURE(Withdraw)
    {
        if (qpi.invocator() != state.get().owner || state.get().raised < state.get().goal) return;
        qpi.transfer(state.get().owner, state.get().raised);
        state.mut().goal = 0;
        state.mut().raised = 0;
        state.mut().contributions.reset();
        output.success = 1;
    }

    // after the deadline, if the goal was missed, each contributor takes their QU back
    struct Refund_locals { uint64 given; };
    PUBLIC_PROCEDURE_WITH_LOCALS(Refund)
    {
        if (qpi.epoch() < state.get().deadlineEpoch || state.get().raised >= state.get().goal) return;
        if (!state.get().contributions.get(qpi.invocator(), locals.given)) return;
        state.mut().contributions.removeByKey(qpi.invocator());
        state.mut().raised -= locals.given;
        if (state.get().raised == 0) state.mut().goal = 0;   // the last refund closes the campaign
        qpi.transfer(qpi.invocator(), locals.given);
        output.success = 1;
    }

    PUBLIC_FUNCTION(Status)
    {
        output.owner = state.get().owner;
        output.goal = state.get().goal;
        output.raised = state.get().raised;
        output.deadlineEpoch = state.get().deadlineEpoch;
        output.contributors = state.get().contributions.population();
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Open, 1);
        REGISTER_USER_PROCEDURE(Contribute, 2);
        REGISTER_USER_PROCEDURE(Withdraw, 3);
        REGISTER_USER_PROCEDURE(Refund, 4);
        REGISTER_USER_FUNCTION(Status, 1);
    }
};
```

Four things carry the app:

- **QU arrives with the call.** `qpi.invocationReward()` is what the caller sent, and `qpi.transfer` sends QU out.
- **`qpi.invocator()` is the caller.** Comparing it with `owner` is all the access control `Withdraw` needs.
- **No local variables.** A procedure that needs scratch space declares a `_locals` struct and uses `locals`.
- **Nothing reverts.** A refused call returns early, and `success` stays 0.

```bash
qinit build
```

```text
[built ✓ (TypeScript)]
╭───────────────────────────────────────────────────────────────────────╮
│ wasm /home/you/crowdfund/dist/contracts/Crowdfund.wasm                │
│ size 6773 bytes                                                       │
│ k12  c1af13f9f8e14b3e33fc5e1f415171cf3a6f2d0564eccdcb02aa84f39d84d7b4 │
╰───────────────────────────────────────────────────────────────────────╯
```

It builds. Next: [prove it works](/docs/tutorial-test).

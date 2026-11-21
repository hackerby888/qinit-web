---
title: Crowdfund 4: client and upgrade
group: Tutorial
order: 4
description: Tutorial, part 4 of 4: call the crowdfund contract from a TypeScript client, then change its state layout without losing the QU it holds.
---

You will end this page with a script that funds the campaign, and an upgraded contract that kept every QU.

## Fund it from code

```bash
qinit gen
```

```text
[client generated ✓]
╭────────────────────────────────────────────────────────────────────────╮
│ contract  Crowdfund                                                    │
│ slot      32                                                           │
│ fns/procs 1 / 4                                                        │
│ file      /home/you/crowdfund/dist/clients/Crowdfund.ts                │
│                                                                        │
│ import { Crowdfund } from "/home/you/crowdfund/dist/clients/Crowdfund" │
╰────────────────────────────────────────────────────────────────────────╯
```

Save this as `fund.ts` in the project folder and run it with [Bun](https://bun.sh):

```ts
import { Crowdfund } from "./dist/clients/Crowdfund";

const campaign = new Crowdfund({ rpcBaseUrl: "http://127.0.0.1:41841" });

const tx = await campaign.Contribute({}, { amount: 600n });
if (!tx.confirmed || !tx.included) throw new Error(`contribution failed: ${tx.txId}`);

const { goal, raised, contributors } = await campaign.Status();
console.log(`${raised} of ${goal} QU raised by ${contributors} backer`);
```

```bash
bun fund.ts
```

```text
1000 of 1000 QU raised by 1 backer
```

Goal met. With no `seed` given, the client signs with the local node's funded identity, the same one you used on the last page.

## Change the contract while it holds QU

New requirement: remember how much the contract has paid out. Add a field at the end of `StateData`, and one line in `Withdraw` before `raised` is cleared:

```cpp
    struct StateData
    {
        id owner;
        uint64 goal;
        uint64 raised;
        uint32 deadlineEpoch;
        HashMap<id, uint64, 1024> contributions;
        uint64 paidOut;   // new
    };
```

```cpp
    PUBLIC_PROCEDURE(Withdraw)
    {
        if (qpi.invocator() != state.get().owner || state.get().raised < state.get().goal) return;
        qpi.transfer(state.get().owner, state.get().raised);
        state.mut().paidOut += state.get().raised;   // new
        state.mut().goal = 0;
        state.mut().raised = 0;
        state.mut().contributions.reset();
        output.success = 1;
    }
```

```bash
qinit deploy
```

```text
[deploy failed]
╭──────────────────────────────────────────────────────────────────────────────╮
│ state layout changed — was 41288 B, now 41296 B (added 1: uint64 at the end) │
│  — and Crowdfund has no MIGRATE handler, so the old state bytes would be     │
│ reinterpreted under the new offsets. Add a MIGRATE handler, restart the node │
│  for a clean slot, or pass --allow-state-carryover to keep the bytes as they │
│  are.                                                                        │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Nothing was deployed, and the 1000 QU campaign is untouched. Describe the layout that is live now, and say how it becomes the new one. Both go inside `struct Crowdfund`:

```cpp
    // exactly the StateData that is live now
    struct OldStateData
    {
        id owner;
        uint64 goal;
        uint64 raised;
        uint32 deadlineEpoch;
        HashMap<id, uint64, 1024> contributions;
    };

    MIGRATE()
    {
        state.mut().owner = oldState.owner;
        state.mut().goal = oldState.goal;
        state.mut().raised = oldState.raised;
        state.mut().deadlineEpoch = oldState.deadlineEpoch;
        state.mut().contributions = oldState.contributions;
    }
```

```cpp fold The whole Crowdfund.h after this change
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
        uint64 paidOut;   // new
    };

    // exactly the StateData that is live now
    struct OldStateData
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
        state.mut().paidOut += state.get().raised;   // new
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

    MIGRATE()
    {
        state.mut().owner = oldState.owner;
        state.mut().goal = oldState.goal;
        state.mut().raised = oldState.raised;
        state.mut().deadlineEpoch = oldState.deadlineEpoch;
        state.mut().contributions = oldState.contributions;
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

```bash
qinit deploy
```

```text
▌ CONTRACTS ─────────────────────────────────────────────────────────────────
  contract   slot  kind  status   source
  Crowdfund    32  main  updated  contracts/Crowdfund.h
…
```

```bash
qinit state Crowdfund
```

```text
• Crowdfund state
  owner         SINUBYSBZKBSVEFQDZBQWUEJWRXCXOZNKPHIXDZWRBKXDSPJEHFAMBACXHUN
  goal          1000
  raised        1000
  deadlineEpoch 2
  paidOut       0
…
```

Same campaign, same 1000 QU, one new field. `qinit call --proc Crowdfund Withdraw` pays it out to you, and `qinit node stop` stops the node.

## Where next

- [Ship to Qubic Core](/docs/core-integration): the path from your node to mainnet.
- [Migrate state](/docs/migrate-state): the rules behind the upgrade you just did.
- [Call another contract](/docs/inter-contract) and [Use oracles](/docs/oracles): reach outside your own contract.
- [Inspect & debug](/docs/inspect-and-debug): trace a call when something goes wrong.

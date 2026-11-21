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
        uint64 paidOut;
```

```cpp
        state.mut().paidOut += state.get().raised;
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

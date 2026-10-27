---
title: Migrate state
group: Guides
order: 12
---

A contract's state outlives its code. Redeploying keeps the state bytes and does not run `INITIALIZE` again, which is what lets you fix a bug without losing data. The moment you change `StateData`, though, the old bytes no longer line up with the new fields. A **migration** is the code that carries them over.

## What a redeploy does

| You redeploy with | Result |
| --- | --- |
| the same `StateData` | state kept as it is |
| a changed `StateData`, no handler | refused |
| a changed `StateData`, `OldStateData` + `MIGRATE` | `MIGRATE` runs once and fills the new state |

Take the counter from the [Quickstart](/docs/quickstart), incremented twice:

```bash
qinit state Counter
```

```text
• Counter state
  counter 2
```

Add a field to `StateData` and deploy again:

```cpp
struct StateData
{
    uint64 counter;
    uint64 lastMigratedTick;
};
```

```bash
qinit deploy
```

```text
[deploy failed]
╭──────────────────────────────────────────────────────────────────────────────╮
│ state layout changed — was 8 B, now 16 B (added 1: uint64 at the end) — and  │
│ Counter has no MIGRATE handler, so the old state bytes would be              │
│ reinterpreted under the new offsets. Add a MIGRATE handler, restart the node │
│  for a clean slot, or pass --allow-state-carryover to keep the bytes as they │
│  are.                                                                        │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Nothing was deployed. The old contract and its state are still live.

## Write the migration

Describe the previous layout as `OldStateData`, and move the data in `MIGRATE`:

```cpp
struct Counter : public ContractBase
{
    struct StateData
    {
        uint64 counter;
        uint64 lastMigratedTick;
    };

    // exactly the StateData of the version that is live now
    struct OldStateData
    {
        uint64 counter;
    };

    // … inputs, outputs, functions and procedures as before …

    MIGRATE()
    {
        state.mut().counter = oldState.counter;
        state.mut().lastMigratedTick = qpi.tick();
    }
};
```

Inside `MIGRATE` you have:

- `oldState`: the live state, read through `OldStateData`. It is read-only.
- `state.mut()`: the new `StateData`. Every field starts at zero, so you only write what should carry over.
- `qpi`: read-only calls such as `qpi.tick()` and `qpi.epoch()`. A migration cannot transfer QU or change assets.

Need scratch variables? Declare a `MIGRATE_locals` struct and use `MIGRATE_WITH_LOCALS()` instead; the variables are then available as `locals`.

`INITIALIZE` is not involved: it ran on the first deployment and never runs again.

```bash
qinit deploy
```

```text
▌ CONTRACTS ─────────────────────────────────────────────────────────────────
  contract  slot  kind  status   source
  Counter     31  main  updated  contracts/Counter.h
```

```bash
qinit state Counter
```

```text
• Counter state
  counter          2
  lastMigratedTick 2760
```

The counter survived, and the new field holds the tick the migration ran at. `qinit ls` now lists the contract as `v2`. In `qinit debug Counter` the migration appears as its own `migrate` entry, with the old state as its input.

## Rules worth knowing

- **`OldStateData` must match the live state exactly.** `MIGRATE` runs when the live state is as large as `OldStateData`. If the layout changed and the sizes differ, the deploy is refused rather than run without your handler.
- **One step at a time.** A contract has one `OldStateData`, so it can only describe the version directly before it. To go from v1 to v3, deploy v2 first, then v3.
- **It runs once, unless the sizes match.** After a normal migration the live state has the new size, so the handler stays idle on later redeploys and can be deleted with the next change. If the old and new layouts happen to be the same size, `MIGRATE` runs again on every redeploy: remove it once it has done its job.
- **`qinit dev` applies the same check** on every save, so a layout change stops hot reload until the handler is there.
- **Constants count.** If a constant sizes a state member (`Array<uint64, MAX_USERS>`), changing it changes the layout. Keep the old value under another name and use it in `OldStateData`.

## When a migration fails

A `MIGRATE` that aborts halts the local node:

```text
[deploy failed]
╭──────────────────────────────────────────────────────────────────────────────╮
│ node halted: Counter migrate#0 trapped abort(0xCC00002E) at tick 2744 — run  │
│ `qinit node run` to restart it                                               │
╰──────────────────────────────────────────────────────────────────────────────╯
```

The state is not rolled back, and `qinit node run` starts a fresh chain. Before trying a migration on state you care about, save it:

```bash
qinit state Counter --dump --out counter-v1.bin
```

Then you can replay the migration as often as you need, as shown under State files below.

## Without a migration

Two ways out when you do not need one:

```bash
qinit deploy --allow-state-carryover
```

keeps the old bytes exactly as they are and zero-fills what is new. It is only right when you added fields at the end and changed nothing before them:

```text
• Counter state
  counter          1
  lastMigratedTick 0
```

```bash
qinit node run --restart
```

throws the chain away. The next deploy starts from `INITIALIZE`.

## State files

Dump a contract's state to a file:

```bash
qinit state Counter --dump --out counter-v1.bin
```

```text
[state dump ✓]
╭──────────────────────────────────────────────╮
│ slot     31                                  │
│ contract Counter                             │
│ size     8 bytes                             │
│ path     /home/you/counter/counter-v1.bin    │
╰──────────────────────────────────────────────╯
```

Start a contract from a file instead of running `INITIALIZE`:

```bash
qinit deploy --state counter-v1.bin
```

The file's size decides what happens:

| File size equals | Result |
| --- | --- |
| `StateData` | loaded as it is |
| `OldStateData` | `MIGRATE` runs on it |
| anything else | refused |

Here the 8-byte v1 file meets the v2 contract on a fresh node, so the migration runs on the file:

```text
• Counter state
  counter          3
  lastMigratedTick 2710
```

A file of any other size is refused:

```text
[deploy failed]
╭────────────────────────────────────────────────────────────────────────────╮
│ state file is 5 B but Counter's StateData is 16 B, or 8 B for its MIGRATE  │
│ handler                                                                    │
╰────────────────────────────────────────────────────────────────────────────╯
```

This is the way to test a migration against real data: a core node's `contract????.???` state file works as input too. For a system contract, use `qinit system add QX --state QX=qx.bin`.

## On mainnet

The same `OldStateData` and `MIGRATE` go into Qubic Core with your contract update. Core additionally needs to be told that the contract's state changes, with an entry in `contractStateChangeInfos` in `contract_def.h`:

```cpp
constexpr ContractStateChangeInfo contractStateChangeInfos[] = { { <contract_index>, MIGRATE, <epoch> } };
```

Core offers two simpler change types beside `MIGRATE`: `PADDING` zero-extends a state that only grew at the end, and `RESET` starts it over from zero. See [Ship to Qubic Core](/docs/core-integration) for how an update gets there.

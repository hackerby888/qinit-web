---
title: Control the local chain
group: Guides
order: 11
---

Your local node is a small Qubic chain of your own. A **tick** is one block, and an **epoch** is a longer period (about a week on mainnet). Contracts can run code on these boundaries. Locally you can skip ahead instead of waiting.

## Example contract

`qinit new Clock`, then replace `contracts/Clock.h`:

```cpp
using namespace QPI;

struct Clock2 {};

struct Clock : public ContractBase
{
    struct StateData
    {
        uint32 epochsSeen;
        uint16 lastEpoch;
        uint32 lastTick;
    };

    struct Now_input {};
    struct Now_output { uint32 epochsSeen; uint16 lastEpoch; uint32 lastTick; };

    // runs once at the start of every epoch
    BEGIN_EPOCH()
    {
        state.mut().epochsSeen += 1;
        state.mut().lastEpoch = qpi.epoch();
    }

    // runs after every tick
    END_TICK()
    {
        state.mut().lastTick = qpi.tick();
    }

    PUBLIC_FUNCTION(Now)
    {
        output.epochsSeen = state.get().epochsSeen;
        output.lastEpoch = state.get().lastEpoch;
        output.lastTick = state.get().lastTick;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_FUNCTION(Now, 1);
    }
};
```

## Skip time

```bash
qinit deploy
qinit tick
qinit tick advance 100
qinit epoch advance
qinit call --fn Clock Now
```

```text
epoch                4 → 5
tick                 11756 → 13509
new epoch start tick 13509

out  {epochsSeen: 1, lastEpoch: 5, lastTick: 13522}
```

- `qinit tick` (or `qinit epoch`) shows the current tick, epoch, and ticks left in the epoch.
- `tick advance <n>` runs `n` ticks right away. `tick advance-to-last` jumps to just before the epoch ends, so you can test end-of-epoch logic.
- `epoch advance` finishes the current epoch, so `END_EPOCH` and then `BEGIN_EPOCH` run.
- `tick rate 500` slows ticking to 500 ms per tick. `tick rate 100` makes it fast again.

## Node options

```bash
qinit node run --tick-ms 100
qinit node run --fees off
qinit node run --restart
qinit node stop
```

- `--tick-ms` sets the tick speed when the node starts (simulator).
- `--fees off` turns off execution fees (simulator). By default each contract pays for its CPU time out of a fee reserve. A contract whose reserve runs out goes **dormant**: its procedures stop running, but its functions still answer.
- `--restart` starts a fresh chain even if a node is already running. `--keep` keeps the existing chain data instead.

## System contracts

Qubic's built-in contracts (QX, QUTIL, …) are loaded only when you ask for them on the simulator:

```bash
qinit system ls
qinit system add QX
qinit system rm QX
```

`add` deploys the contract and any contracts it depends on, and records the choice in `qinit.json` so the next simulator start loads it again. `rm` refuses while a deployed contract still calls it. Pass `--force` to remove it anyway. On the core runtime, system contracts are always built in.

## Upgrade state safely

Redeploying keeps a contract's state. If you change `StateData`, the old bytes no longer fit, so Qinit refuses:

```text
state layout changed — was 8 B (uint64), now 16 B (uint64, uint64) — and
Tally has no MIGRATE handler, so the old state bytes would be reinterpreted
under the new offsets.
```

Describe the old layout and move the data over in `MIGRATE`:

```cpp
struct OldStateData
{
    uint64 total;
};

MIGRATE()
{
    state.mut().total = oldState.total;
}
```

To keep the old bytes as they are, redeploy with `--allow-state-carryover`. To start clean, run `qinit node run --restart`.

## Save and load state

Snapshot a contract's state, and later deploy from it instead of running `INITIALIZE`:

```bash
qinit state Tally --dump --out tally.bin
qinit deploy --state tally.bin
```

If the file's size matches the current `StateData`, it is loaded as-is. If it matches `OldStateData`, `MIGRATE` runs on it. Any other size is rejected. A core node's `contract????.???` state file works too. For a system contract, use `qinit system add QX --state QX=qx.bin`.

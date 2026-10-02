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
```

```text
epoch           1
tick            2866
epoch last tick 5401
ticks left      2535
epoch length    2701 ticks
```

```bash
qinit tick advance 100
```

```text
tick     2866 → 2966
advanced 100
```

```bash
qinit epoch advance
```

```text
epoch                1 → 2
tick                 2967 → 5403
new epoch start tick 5403
```

```bash
qinit call --fn Clock Now
```

```text
✓ Clock.Now
  out {epochsSeen: 1, lastEpoch: 2, lastTick: 5405}
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

System contracts are the contracts already live on mainnet: QX, QUTIL, QEARN, and the rest. Their code ships inside the node, and each one sits at its mainnet slot. On the simulator they are loaded only when you ask for them:

```bash
qinit system ls
```

```text
slot  contract     state   (add: qinit system add <name…>)
•  1  QX           available
•  2  QTRY         available
•  3  RANDOM       available
•  4  QUTIL        available
…
```

```bash
qinit system add QX
```

```text
✓ QX @ 1 deployed · contracts/system_scs/Qx.h
✓ qinit.json system += QX
```

```bash
qinit system rm QX
```

```text
✓ QX @ 1 removed
```

`add` deploys the contract at its mainnet slot, along with any contracts it depends on, and records the choice in `qinit.json` so the next simulator start loads it again. `rm` refuses while a deployed contract still calls it. Pass `--force` to remove it anyway. On the core runtime, system contracts are always built in.

## Upgrade and move state

Redeploying keeps a contract's state. Changing `StateData`, saving state to a file, and starting a contract from one are covered in [Migrate state](/docs/migrate-state).

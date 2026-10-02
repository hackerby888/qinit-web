---
title: Inspect & debug
group: Guides
order: 5
---

## Read contract state

```bash
qinit state Counter
```

```text
• Counter state
  counter 1
```

Qinit decodes the state from the contract source the node holds, so the fields always match what is deployed. A local `qinit.idl.json` is not used for decoded state.

Containers are listed with their occupancy, and long empty runs are skipped:

```bash
qinit state Balances
```

```text
• Balances state
  total 125

[1] balances · 2 entries · 1022/1024 slots unoccupied
  slot[0]          AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFXIB
                   = 100
  slots[1..286]    (unoccupied ×286; skipped)
  slot[287]        BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXK
                   = 25
  slots[288..1023] (unoccupied ×736; skipped)
```

A large container stays collapsed until you ask for it by its index, or for all of them:

```bash
qinit state Balances --container 1
qinit state Balances --all
```

Use a digest when you only need to compare state, or dump the exact bytes for offline work:

```bash
qinit state Counter --digest
```

```text
[state digest ✓]
╭───────────────────────────────────────────────────────────────────────────╮
│ slot       31                                                             │
│ state size 8                                                              │
│ digest     4e34329a1bac6e80862edb5e727be3d…d1169670a179622a21be84ff826f6e │
╰───────────────────────────────────────────────────────────────────────────╯
```

```bash
qinit state Counter --dump --out counter-state.bin
```

A dumped file can start a contract later. See [Migrate state](/docs/migrate-state).

## Trace one call

```bash
qinit call --proc Counter Inc --trace
```

```text
✓ Counter.Inc   processed
  tx   yeoftyjhyhdhvfnyuhyebbszetgaocdzkqowofljehibsenxvhubhrxgagef
  tick 2777

✓ Counter proc#1 (Inc) 61µs · tick 2777
  in     {}
  out    {}
  caller SINUBYSBZKBSVEFQDZBQWUEJWRXCXOZNKPHIXDZWRBKXDSPJEHFAMBACXHUN
  state
    counter 1 → 2
```

`--trace` shows the captured invocation: entry, input and output, caller, nested calls, logs, and state changes. `--trace-full` also expands container details. It implies `--trace`.

The state shown in a trace is the change recorded for that call. Use `qinit state` when you want the contract's current state.

## Watch calls live

```bash
qinit debug Counter
```

Keep it open in one terminal and make calls in another. Pick a trace to inspect its inputs, outputs, nested calls, logs, and state diff.

For chain-level lookup, open the explorer:

```bash
qinit explorer
qinit explorer 7474
```

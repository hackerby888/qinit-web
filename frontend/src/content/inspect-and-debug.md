---
title: Inspect & debug
group: Guides
order: 5
---

## Read contract state

```bash
qinit ls
qinit state Counter
```

For a deployed dynamic contract, Qinit decodes the source registered by the node against the configured QPI headers. A local `qinit.idl.json` is not used for decoded state.

Large containers stay collapsed until you ask for them:

```bash
qinit state Balances --container 1
qinit state Balances --all
```

Use a digest when you only need to compare state, or dump the exact bytes for offline work:

```bash
qinit state Counter --digest
qinit state Counter --dump --out counter-state.bin
```

## Trace one call

```bash
qinit call --proc Counter Inc --trace
qinit call --fn Counter Get --trace-full
```

`--trace` shows the captured invocation: entry, nested calls, logs, and state changes. `--trace-full` also expands container details. It implies `--trace`.

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

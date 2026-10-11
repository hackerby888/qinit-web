---
title: Quickstart
group: Getting Started
order: 2
---

Deploy a counter, increment it, and read its state.

## 1. Create the project

```bash
qinit new counter
cd counter
```

```text
✓ created counter/  (template: counter)
  contracts/Counter.h
  tests/Counter.test.ts
  tests/Counter.test.cpp
  qinit.json · package.json · tsconfig.json · .gitignore · README.md
next: cd counter && qinit node run && qinit dev
```

The contract, both test files, and the project config are there from the start.

## 2. Start the local node

```bash
qinit node run
```

```text
✓ core headers    cached local
✓ node binary     simulator — no binary
✓ wasm compiler   cached
✓ node running    launched pid 50116, ticking at 2703

[node up ✓]
╭───────────────────────────────────────╮
│ runtime   simulator (in-process)      │
│ version   local                       │
│ rpc       http://127.0.0.1:41841      │
│ peer      127.0.0.1:31841             │
│ tick      2703                        │
│ contracts (none)                      │
│ scratch   /home/you/.cache/qinit/run  │
╰───────────────────────────────────────╯
```

The node keeps running in the background. It is the simulator unless you chose another runtime with `qinit runtime`.

## 3. Deploy

```bash
qinit deploy
```

```text
▌ CONTRACTS ─────────────────────────────────────────────────────────────────
  contract  slot  kind  status    source
  Counter     31  main  deployed  contracts/Counter.h

[deployed ✓]
╭─────────────────────────────────────────────────────────────────────────────╮
│ contract   Counter                                                          │
│ slot       31                                                               │
│ SC address FBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAKO     │
│ SC balance 0                                                                │
│ tx         —                                                                │
│ codeHash   7fe14550236deab91bb020d8a828f02b3f637cc7ab79c3c8c538c177ec32cccb │
│ fns/procs  1 / 1                                                            │
│                                                                             │
│ next: qinit call                                                            │
╰─────────────────────────────────────────────────────────────────────────────╯
```

`deploy` builds the Wasm, picks a slot, uploads it, and verifies the live code hash.

## 4. Call it

```bash
qinit call --proc Counter Inc
```

```text
✓ Counter.Inc   processed
  tx   ogbosuvyooiesbnkklpauxixbiscvalvvbuwwpzkhgvgsjrmuiivpbafrvqa
  tick 2728
```

`Inc` is a procedure, so Qinit signs a transaction and waits for its target tick.

```bash
qinit call --fn Counter Get
```

```text
✓ Counter.Get
  out 1
```

`Get` is a read-only function and returns immediately.

```bash
qinit state Counter
```

```text
• Counter state
  counter 1
```

Run `qinit call` with no flags to choose the contract and entry from an interactive picker.

When you are done:

```bash
qinit node stop
```

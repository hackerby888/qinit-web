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

Qinit creates:

```text
counter/
├── contracts/Counter.h
├── tests/Counter.test.cpp
├── qinit.json
└── README.md
```

## 2. Start the fast local runtime

```bash
qinit runtime simulator
qinit compiler typescript
qinit node run
```

Qinit remembers the runtime and compiler choices. `node run` starts the simulator in the background and prepares any missing tools.

## 3. Deploy

```bash
qinit deploy
```

`deploy` builds the Wasm, picks a dynamic slot, uploads it, and verifies the live code hash.

## 4. Call it

```bash
qinit call --proc Counter Inc
qinit call --fn Counter Get
qinit state Counter
```

After `Inc` is processed, the last two commands show:

```text
✓ Counter.Get
  out 1

• Counter state
  counter 1
```

`Inc` is a procedure, so Qinit waits for its target tick. `Get` is a read-only function and returns immediately.

Run `qinit call` with no flags to choose the contract and entry from an interactive picker.

When you are done:

```bash
qinit node stop
```

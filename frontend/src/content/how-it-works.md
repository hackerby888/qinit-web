---
title: From simulator to Core
group: Concepts
order: 1
---

## One contract, two compilers

Your contract is a QPI C++ header:

```text
contracts/Counter.h
        |
        +-- TypeScript compiler -> Wasm
        |
        +-- clang compiler ------> Wasm
```

Both compilers accept the same QPI C++ source. Qinit also derives the schema used for calls and typed clients. The in-process TypeScript compiler is the default: it needs no external toolchain and builds in milliseconds. Clang is the reference compiler; build with it before you ship.

Choose once, or override one command:

```bash
qinit compiler clang
qinit build --compiler typescript
```

## Two runtimes

```bash
qinit runtime simulator
qinit runtime core
```

The simulator is the default: an in-process development runtime with nothing to download. The Core runtime launches a compatible core-lite node and uses its RPC interface. Build, deploy, call, and test commands keep the same shape across both.

## Local Wasm, mainnet native

On your local node a contract is deployed as Wasm into a slot, which is what makes redeploying in seconds possible. Mainnet does not load contracts that way: every mainnet contract is compiled into the node itself. Going live therefore means adding your header to Qubic Core and getting it accepted. See [Ship to Qubic Core](/docs/core-integration).

## What deploy proves

`qinit deploy` resolves inter-contract dependencies, assigns slots, builds Wasm, uploads it, activates it, then checks the live code hash. A matching contract name reuses its existing slot.

On the first deployment, state starts at zero and `INITIALIZE` runs. On a redeploy, `INITIALIZE` does not run again and the state is kept. If `StateData` changed shape, the deploy is refused until the contract defines `OldStateData` and `MIGRATE`. See [Migrate state](/docs/migrate-state).

That is why hot reload can keep state, and why a state-layout change deserves the same care as a data migration.

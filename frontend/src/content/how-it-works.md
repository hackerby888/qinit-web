---
title: From simulator to Core
group: Concepts
order: 1
---

## One contract, two local paths

Your contract is a QPI C++ header:

```text
contracts/Counter.h
        |
        +-- clang compiler ------> Wasm
        |
        +-- TypeScript compiler -> Wasm
```

Both compiler backends accept the same QPI C++ source. Qinit also derives the schema used for named calls and typed clients. `clang` is the default; the in-process TypeScript compiler avoids an external compiler toolchain and is useful for a fast local loop.

Choose once, or override one command:

```bash
qinit compiler typescript
qinit build --compiler clang
```

## Two runtimes

```bash
qinit runtime core
qinit runtime simulator
```

The simulator is an in-process development runtime. The Core runtime launches a compatible core-lite node and uses its RPC interface. Build, deploy, call, and test commands keep the same shape across both.

Dynamic Wasm runs in the simulator and compatible testnet Core runtimes; the current slot window is **29–32**. It is not a native mainnet deployment. To add a native contract to Qubic Core, use `qinit integrate` and follow the Core build and activation process instead.

## What deploy proves

`qinit deploy` resolves inter-contract dependencies, assigns valid slots, builds Wasm, uploads it, activates it, then checks the live code hash. A matching contract name reuses its existing slot.

On the first deployment, state starts at zero and `INITIALIZE` runs. On a redeploy, `INITIALIZE` does not run again. Define `OldStateData` and `MIGRATE` when a new layout needs an explicit conversion; without a compatible migration, the runtime preserves the overlapping old bytes and zeroes the rest.

That is why hot reload can keep state—and why a state-layout change deserves the same care as a data migration.

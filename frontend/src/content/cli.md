---
title: Commands
group: Reference
order: 1
---

## Everyday loop

```bash
qinit node run
qinit deploy
qinit call
qinit state Counter
qinit node stop
```

`qinit call` opens the guided picker. For scripts, name the entry directly:

```bash
qinit call --proc Counter Inc
qinit call --fn Counter Get
```

## Create and develop

```bash
qinit new counter
qinit build               # compile without deploying
qinit dev                 # rebuild and redeploy after each save
qinit verify              # check the QPI surface
qinit gen                 # generate a TypeScript client
```

Use `qinit test` for Bun integration tests against a deployed contract. Use `qinit gtest` for isolated Core-style C++ tests.

## Choose a backend

```bash
qinit runtime core
qinit runtime simulator

qinit compiler clang
qinit compiler typescript
```

`core` and `clang` are the defaults. The simulator plus TypeScript compiler is the quickest local loop; both compilers accept the same QPI C++ contract header.

## Inspect the node

```bash
qinit node status
qinit tick show
qinit epoch show
qinit ls
qinit explorer
qinit debug Counter
```

## Native Core integration

```bash
qinit integrate contracts/MyToken.h \
  --asset MYTOKEN \
  --construction-epoch 200
```

`integrate` edits a Qubic Core checkout for a native contract build. It is not a dynamic Wasm deployment.

## JSON for scripts

Use `--json` only where the command implements machine output. These forms are supported:

```bash
qinit build --json
qinit deploy --json
qinit ls --json
qinit state Counter --digest --json
qinit state Counter --dump --out counter-state.bin --json
```

Decoded `qinit state Counter` and `qinit call` are terminal views, not JSON APIs.

Run `qinit help` for the full list, or `qinit deploy --help` for one command.

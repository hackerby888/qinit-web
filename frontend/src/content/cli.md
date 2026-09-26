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
qinit tick
qinit ls
qinit explorer
qinit debug Counter
```

## Control time

```bash
qinit tick advance 100
qinit tick advance-to-last
qinit tick rate 500
qinit epoch advance
```

Skip ahead instead of waiting for tick and epoch hooks. See [Control the local chain](/docs/local-chain).

## Oracles

```bash
qinit oracle pending
qinit oracle resolve <queryId> --reply "6512345sint64, 100sint64"
qinit oracle serve --reply "6512345sint64, 100sint64"
```

A local node has no oracle machine, so you answer queries yourself. See [Use oracles](/docs/oracles).

## Cheatcodes and release builds

```bash
qinit strip contracts/Tally.h --out Tally.clean.h
qinit build --production
qinit deploy --production
```

`CC_PRINT`, `CC_ASSERT` and the other `CC_*` macros are removed before code ships. See [Debug with cheatcodes](/docs/cheatcodes).

## Signatures

```bash
qinit sign <64-hex-digest>
qinit sign <64-hex-digest> --seed <seed> --json
```

Produces the signature a contract's `qpi.signatureValidity` accepts. See [Verify signatures](/docs/signatures).

## System contracts and state

```bash
qinit system ls
qinit system add QX
qinit system rm QX
qinit state Counter --dump --out counter.bin
qinit deploy --state counter.bin
qinit deploy --allow-state-carryover
```

See [Control the local chain](/docs/local-chain) for how `MIGRATE` and state files fit together.

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
qinit oracle pending --json
qinit sign <64-hex-digest> --json
qinit info --json
```

Decoded `qinit state Counter` and `qinit call` are terminal views, not JSON APIs.

## Setup and maintenance

```bash
qinit setup               # install the tools Qinit needs
qinit doctor              # check your dev setup
qinit info                # show the active compiler, runtime, node and headers
qinit update              # update the Qinit binary
qinit clean --dry-run     # show what cached downloads would be freed
qinit uninstall --dry-run
qinit ext install         # install the editor extension (VS Code, Cursor, …)
qinit theme ocean         # default, emerald, ocean, rose, amber, mono
qinit cheat-sheet         # one-screen summary of common workflows
qinit version
```

`clean` and `uninstall` confirm before deleting anything. Pass `--yes` to skip the prompt.

Run `qinit help` for the full list, or `qinit deploy --help` for one command.

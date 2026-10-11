---
title: Commands
group: Reference
order: 1
---

The commands you use most, grouped by task. Every flag and default is in the [CLI reference](/docs/cli-reference).

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
qinit call --proc Balances Set --in "0id, 100uint64"
```

`--in` takes the input values, each with its type. The type is optional when Qinit knows the entry's schema: `--in "0, 100"` means the same. See [Call values](/docs/call-values), and [`qinit call`](/docs/cli-reference#qinit-call) for every flag.

## Create and develop

```bash
qinit new counter
qinit build               # compile without deploying
qinit dev                 # rebuild and redeploy after each save
qinit verify              # check the QPI surface
qinit gen                 # generate a TypeScript client
```

Use `qinit test` for Bun integration tests against a deployed contract. Use `qinit gtest` for isolated Core-style C++ tests. Flags: [Develop](/docs/cli-reference#develop).

## Choose a backend

```bash
qinit runtime simulator
qinit runtime core

qinit compiler typescript
qinit compiler clang
```

`simulator` and `typescript` are the defaults, the quickest local loop. Both compilers accept the same QPI C++ contract header. Most build commands also take `--compiler` for one run; `node run` and `test` take `--runtime`. See [How Qinit picks defaults](/docs/cli-reference#how-qinit-picks-defaults).

## Inspect the node

```bash
qinit node status
qinit tick
qinit ls
qinit explorer
qinit debug Counter
```

Flags and keys: [Node](/docs/cli-reference#node), [`qinit explorer`](/docs/cli-reference#qinit-explorer), [`qinit debug`](/docs/cli-reference#qinit-debug).

## Control time

```bash
qinit tick advance 100
qinit tick advance-to-last
qinit tick rate 500
qinit epoch advance
```

Skip ahead instead of waiting for tick and epoch hooks. See [Control the local chain](/docs/local-chain) and [`qinit tick`](/docs/cli-reference#qinit-tick).

## Oracles

```bash
qinit oracle pending
qinit oracle resolve <queryId> --reply "6512345sint64, 100sint64"
qinit oracle serve --reply "6512345sint64, 100sint64"
```

A local node has no oracle machine, so you answer queries yourself. See [Use oracles](/docs/oracles) and [`qinit oracle`](/docs/cli-reference#qinit-oracle).

## Cheatcodes and release builds

```bash
qinit strip contracts/Tally.h --out Tally.clean.h
qinit build --production
qinit deploy --production
```

`CC_PRINT`, `CC_ASSERT` and the other `CC_*` macros are removed before code ships. See [Debug with cheatcodes](/docs/cheatcodes) and [`qinit strip`](/docs/cli-reference#qinit-strip).

## Signatures

```bash
qinit sign <64-hex-digest>
qinit sign <64-hex-digest> --seed <seed> --json
```

Produces the signature a contract's `qpi.signatureValidity` accepts. See [Verify signatures](/docs/signatures) and [`qinit sign`](/docs/cli-reference#qinit-sign).

## System contracts and state

```bash
qinit system ls
qinit system add QX
qinit system rm QX
qinit state Counter --dump --out counter.bin
qinit deploy --state counter.bin
qinit deploy --allow-state-carryover
```

See [Control the local chain](/docs/local-chain) for system contracts, and [Migrate state](/docs/migrate-state) for how `MIGRATE` and state files fit together. Flags: [`qinit system`](/docs/cli-reference#qinit-system), [`qinit state`](/docs/cli-reference#qinit-state), [`qinit deploy`](/docs/cli-reference#qinit-deploy).

## Native Core integration

```bash
qinit integrate contracts/MyToken.h \
  --asset MYTOKEN \
  --construction-epoch 200
```

`integrate` adds the contract to a Qubic Core checkout, ready for a pull request. See [Ship to Qubic Core](/docs/core-integration) and [`qinit integrate`](/docs/cli-reference#qinit-integrate).

## JSON for scripts

Add `--json` to get one JSON document instead of the terminal view:

```bash
qinit build --json
qinit deploy --json
qinit call --fn Counter Get --json
qinit state Counter --json
qinit ls --json
qinit oracle pending --json
qinit sign <64-hex-digest> --json
qinit info --json
```

Every document has `ok` and `error`. `call` needs `--fn` or `--proc` with `--json`; the full-screen commands (`explorer`, `debug`, `dev`) have no JSON form. The [CLI reference](/docs/cli-reference#conventions) marks each command that supports it.

## Setup and maintenance

```bash
qinit setup               # install the tools Qinit needs
qinit doctor              # check your dev setup
qinit info                # show the active compiler, runtime, node and headers
qinit update              # update the Qinit binary
qinit clean --dry-run     # show what cached downloads would be freed
qinit uninstall --dry-run
qinit ext install         # install the editor extension (VS Code, Cursor, …)
qinit seed                # pick the seed that signs your transactions
qinit theme ocean         # default, emerald, ocean, rose, amber, mono
qinit cheat-sheet         # one-screen summary of common workflows
qinit version
```

`clean` and `uninstall` only show what they would remove. Pass `--yes` to delete. Flags: [Setup](/docs/cli-reference#setup).

Run `qinit help` for the full list, or `qinit deploy --help` for one command.

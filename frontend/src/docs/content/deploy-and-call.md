---
title: Deploy & call
group: Guides
order: 4
---

## Build and deploy

```bash
qinit build
qinit deploy
qinit ls
```

`build` writes Wasm and IDL artifacts under `dist/`. `deploy` builds again when needed, deploys dependencies first, and checks that the live slot contains the expected code hash.

> Local node only. Mainnet and public testnets run contracts compiled into Qubic Core; see [Ship to Qubic Core](/docs/core-integration).

```text
[deployed · 1]
╭────────────────────────────────────────────────────────────────────╮
│ slot  name     state  fn·proc  ver       reserve  k12              │
│   31  Counter  ready      1/1   v1  100000000000  7fe14550…6deab9… │
╰────────────────────────────────────────────────────────────────────╯
```

`ls` shows every deployed contract with its slot, entry counts, version, and fee reserve. Redeploying the same contract name reuses its slot and bumps `ver`.

The slot is reused only by the project that deployed it. A second project with the same `contractName` is refused before anything is uploaded, so it cannot inherit the first one's state:

```text
[deploy failed]
╭──────────────────────────────────────────────────────────────────────────────╮
│ slot 31 already runs a 'Counter' this project never deployed (no entry in    │
│ qinit.idl.json) — another project with the same contractName owns it; rename │
│  contractName in qinit.json, or pass --slot 31 to take the slot over         │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Interactive calls

```bash
qinit call
```

Pick a contract, then a function or procedure. Qinit reads the contract's schema and prompts for the input.

## Direct calls

```bash
qinit call --proc Counter Inc
qinit call --fn Counter Get
```

- Functions are unsigned, read-only RPC queries.
- Procedures are signed transactions. Qinit waits and reports `processed`, `dropped`, or `unconfirmed`.
- `--amount <n>` transfers QUs with a procedure.

Pass input with `--in`, one value per field, in the order the contract declares them. Each value is written with its QPI type. This sets a balance on the `hashmap` template (`Set_input { id who; uint64 amount; }`):

```bash
qinit call --proc Balances Set --in "0id, 100uint64"
qinit call --proc Balances Set --in "BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXKid, 25uint64"
```

```text
✓ Balances.Set  processed
  tx   rrcpxmtzchvxqexwsnywzulctjjestcxletwmgayjbshgxmdmgczisybrfdd
  tick 5450
```

An `id` is a 60-letter identity or a 64-hex public key followed by `id`, or `0id` for the zero id.

The type is optional when Qinit knows the entry's schema: `--in "0, 100"` means the same.

```bash
qinit call --fn Balances BalanceOf --in BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXKid
```

```text
✓ Balances.BalanceOf
  out 25
```

A function with several output fields prints them by name:

```bash
qinit call --fn Balances Stats
```

```text
✓ Balances.Stats
  out {total: 125, population: 2}
```

See [Call values](/docs/call-values) for ids, arrays, and structs.

## Use another node

The local simulator exposes a funded development seed, so it normally needs no signer setup. For another node, select or save a funded seed and pass its RPC URL:

```bash
qinit seed --rpc http://node.example:41841
qinit deploy --rpc http://node.example:41841
qinit call --proc Counter Inc --rpc http://node.example:41841
```

If the node does not expose development seeds, use `qinit seed <SEED>`. Never put a real seed in `qinit.json`, source files, or Git.

For application code, generate a self-contained SDK with `qinit gen`; see [Typed clients](/docs/typed-clients).

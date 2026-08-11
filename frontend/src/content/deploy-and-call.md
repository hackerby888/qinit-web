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

Redeploying the same contract name reuses its slot.

## Interactive calls

```bash
qinit call
```

Pick a contract, then a function or procedure. Qinit reads the IDL and prompts for the named fields.

## Direct calls

```bash
qinit call --proc Counter Inc
qinit call --fn Counter Get
qinit call --proc Balances Set --in "0id, 100uint64"
```

- Functions are unsigned, read-only RPC queries.
- Procedures are signed transactions. Qinit waits and reports `processed`, `dropped`, or `unconfirmed`.
- `--amount <n>` transfers QUs with a procedure.

Use named JSON when an IDL is available:

```bash
qinit call --proc Balances Set \
  --args '{"who":"<IDENTITY>","amount":100}'
```

Replace `<IDENTITY>` with a real 60-character Qubic identity.

## Use another node

The local simulator exposes a funded development seed, so it normally needs no signer setup. For another node, select or save a funded seed and pass its RPC URL:

```bash
qinit seed --rpc http://node.example:41841
qinit deploy --rpc http://node.example:41841
qinit call --proc Counter Inc --rpc http://node.example:41841
```

If the node does not expose development seeds, use `qinit seed <SEED>`. Never put a real seed in `qinit.json`, source files, or Git.

For application code, generate a self-contained SDK with `qinit gen`; see [Typed clients](/docs/typed-clients).

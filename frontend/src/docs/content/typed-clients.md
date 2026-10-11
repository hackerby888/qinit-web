---
title: Typed clients
group: Guides
order: 6
---

## Generate a client

Deploy first, then generate:

```bash
qinit deploy
qinit gen
```

```text
[client generated ✓]
╭──────────────────────────────────────────────────────────────────╮
│ contract  Counter                                                │
│ slot      31                                                     │
│ fns/procs 1 / 1                                                  │
│ file      /home/you/counter/dist/clients/Counter.ts              │
│                                                                  │
│ import { Counter } from "/home/you/counter/dist/clients/Counter" │
╰──────────────────────────────────────────────────────────────────╯
```

`qinit gen` writes:

```text
dist/clients/Counter.ts
dist/clients/runtime.ts
```

The generated files are self-contained TypeScript and do not import Qinit workspace packages.

## Use it

```ts
import { Counter } from "./dist/clients/Counter";

const counter = new Counter({
  rpcBaseUrl: "http://127.0.0.1:41841",
  seed: process.env.QUBIC_SEED,
});

const tx = await counter.Inc();
if (!tx.ok || !tx.confirmed || !tx.included) {
  throw new Error(`increment failed: ${tx.txId ?? "no transaction id"}`);
}

const { value } = await counter.Get();
console.log(value); // bigint
```

Functions are read-only. Procedures are signed transactions and wait for confirmation by default. A transaction ID only proves broadcast, so check `confirmed` and `included` before treating a write as final.

The local test node can provide a funded development seed. For another node, pass a funded seed explicitly and never commit or log it. Use `{ confirm: false }` only when your application handles confirmation itself.

## Slot matters

The generated class remembers its slot. `qinit gen` uses the slot your last `qinit deploy` recorded for the contract; it does not ask the node. Pass `--slot` when the contract lives somewhere else, for example on another node:

```bash
qinit ls
qinit gen --slot 34
```

You can still override it at runtime:

```ts
const counter = new Counter({
  index: 34,
  seed: process.env.QUBIC_SEED,
});
```

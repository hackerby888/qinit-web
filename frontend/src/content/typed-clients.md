---
title: Typed clients
group: Guides
order: 6
---

## Generate a client

First find the deployed slot, then generate against that slot:

```bash
qinit ls
qinit gen --slot 29
```

Replace `29` with your contract's slot. `qinit gen` writes:

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

The generated class remembers its slot. `qinit gen` does not look up the live deployment; without `--slot` (or a project slot), it targets the first dynamic slot, currently 29. Pass `--slot` when the deployed contract lives elsewhere. You can still override it at runtime:

```ts
const counter = new Counter({
  index: 30,
  seed: process.env.QUBIC_SEED,
});
```

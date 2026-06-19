---
title: Deploy & call
group: Guides
order: 2
---

## Deploy

Build, upload, and turn on — one command:

```bash
qinit deploy
```

On a test node you don't need a key — qinit grabs a funded one for you. Then it checks the contract is really live: the on-chain hash must match your build. If not, it says `✗ not armed` instead of pretending it worked.

## Call

Run interactive (pick from a menu):

```bash
qinit call
```

Or call directly — function `1` on contract `28`:

```bash
qinit call --fn 28 1
```

Reads (functions) come back instantly. Writes (procedures) go in as a transaction.

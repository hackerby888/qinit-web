---
title: How it works
group: Concepts
order: 1
---

## Three parts

- **The binary** — `qinit`. It compiles your `.h` into a `.so` and talks to the node over HTTP.
- **The cache** — `~/.cache/qinit`. Core headers + the node binary, fetched once.
- **The node** — a local Qubic test node. `qinit up` runs it.

## What deploy does

Your `.so` is split into chunks, sent as transactions, then turned on at a slot. qinit then reads the slot back and checks its hash matches your build — so "deployed" really means deployed.

> **Note** — It's testnet-only and dev-focused, but your contract code stays mainnet-compatible.

---
title: Hot reload
group: Guides
order: 3
---

## qinit dev

Point it at your contract and leave it running. Every save = a fresh build + deploy.

```bash
qinit dev
```

The slot is reused, so the contract address stays the same. Press `q` to stop.

> **Tip** — Pair it with `qinit up` in another tab: node in one, dev loop in the other.

---
title: Hot reload
group: Guides
order: 3
---

Start the node once, then let Qinit redeploy after every save.

```bash
qinit node run
qinit dev
```

`dev` deploys immediately, then watches the main contract and every header under `contracts/`. It waits for edits to settle before running the same checked deployment pipeline again.

The contract name keeps its slot, so call commands do not change.

Redeploy does not rerun `INITIALIZE`. Existing state bytes are preserved; when `StateData` changes shape, add `OldStateData` and `MIGRATE()` instead of relying on byte overlap.

## Fastest loop

```bash
qinit runtime simulator
qinit compiler typescript
qinit node run --restart
qinit dev
```

Press `q` to stop the watcher. Stop the background node separately:

```bash
qinit node stop
```

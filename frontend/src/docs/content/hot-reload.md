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

Redeploy does not rerun `INITIALIZE`, and existing state is kept. When `StateData` changes shape, Qinit refuses the redeploy until the contract says how to carry the old state over. See [Migrate state](/docs/migrate-state).

## Start clean

```bash
qinit node run --restart
qinit dev
```

`--restart` throws the chain away and starts a fresh one, so the next deploy runs `INITIALIZE` again.

Press `q` to stop the watcher. Stop the background node separately:

```bash
qinit node stop
```

---
title: Commands
group: Reference
order: 1
---

## Commands

Run `qinit help` any time. The main ones:

- `qinit new <name> --template <kind>` — make a project.
- `qinit up` — sync headers + run a test node (reuses a ticking one; `--restart` to force fresh).
- `qinit dev` — watch the contract, auto build + deploy on save.
- `qinit deploy` — build + upload + deploy; `--seed`, `--callee Name=path@slot`.
- `qinit call` — interactive; or `--fn <idx> <id>` / `--proc <idx> <id>`.
- `qinit node run|status|stop|get` — manage the node by hand.
- `qinit sync` — get core headers (`--from <core>` or `--ref <tag>`).
- `qinit doctor` — check the toolchain.

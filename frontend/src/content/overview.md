---
title: Overview
group: Getting Started
order: 1
---

## What is qinit?

qinit is a tool to build and ship smart contracts on Qubic. You write a contract, run one command, and it runs on a test node — no setup.

One small binary does it all: make a project, build, deploy, and call.

> **Tip** — New here? Go straight to [Quickstart](/docs/quickstart).

## Why use it

- One binary. No clang, cmake, or node to wire up by hand.
- Hot reload — save your file and it redeploys.
- Safe deploys — it checks the contract is really live (by hash), not just "sent".
- The same `.h` works on mainnet too.

## The loop

Five steps, all from your terminal:

```bash
qinit new my-sc   # make a project
qinit up          # run a test node
qinit dev         # edit -> auto build + deploy
qinit call        # run a function
```

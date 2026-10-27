---
title: Start here
group: Getting Started
order: 1
---

Qinit is one CLI for building, testing, deploying, and inspecting **Qubic contracts**.

> **`qinit deploy` targets your local node only.** Mainnet and public testnets run contracts compiled into Qubic Core; going live means [shipping to Qubic Core](/docs/core-integration).

## Install

Linux and macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/hackerby888/qinit/main/install.sh | sh
qinit doctor
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/hackerby888/qinit/main/install.ps1 | iex
qinit doctor
```

The installer runs `qinit setup` and caches the Qubic headers, local node, Wasm compiler, and verifier.

## Fast local loop

```bash
qinit new counter && cd counter
qinit node run
qinit deploy
```

Out of the box Qinit runs the in-process **simulator** and compiles with its **TypeScript compiler**. That is the shortest edit-test loop, and it needs no setup.

Before you ship, check the same contract with Clang and a real Core node:

```bash
qinit compiler clang
qinit runtime core
```

Both choices are saved. To switch for one command only, pass `--compiler` or `--runtime` to that command.

## The Qubic model

- Contracts are QPI C++ headers. Qinit compiles them to Wasm for your local node.
- A contract lives at a numbered **slot**. Redeploying the same name from the same project reuses its slot.
- A **function** reads immediately. A **procedure** is a signed transaction processed at a future tick.
- Inputs use QPI types such as `uint64`, `sint64`, `id`, `bit`, and `m256i`.

Qinit handles the compiler, local node, deployment protocol, IDL, state decoding, and traces. You stay in the contract code.

> New here? Build the counter in [Quickstart](/docs/quickstart).

Prefer the browser? Open the [Qinit Web IDE](/ide) to edit and compile a contract without creating a local project.

---
title: Start here
group: Getting Started
order: 1
---

Qinit is one CLI for building, testing, deploying, and inspecting **Qubic dynamic contracts**.

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
qinit runtime simulator
qinit compiler typescript
qinit node run
qinit dev
```

The simulator and TypeScript compiler give you the shortest edit-test loop. Check production-shaped builds with Clang and Core when your contract is ready.

## The Qubic model

- Contracts are QPI C++ headers compiled to Wasm.
- A dynamic contract lives at a numbered **slot**. Redeploying the same name reuses its slot.
- A **function** reads immediately. A **procedure** is a signed transaction processed at a future tick.
- Inputs use QPI types such as `uint64`, `sint64`, `id`, `bit`, and `m256i`.

Qinit handles the compiler, local node, deployment protocol, IDL, state decoding, and traces. You stay in the contract code.

> New here? Build the counter in [Quickstart](/docs/quickstart).

Prefer the browser? Open the [Qinit Web IDE](/ide) to edit and compile a contract without creating a local project.

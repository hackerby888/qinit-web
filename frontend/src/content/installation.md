---
title: Installation
group: Getting Started
order: 2
---

## Install

One line (Linux / macOS):

```bash
curl -fsSL https://raw.githubusercontent.com/hackerby888/qinit/main/install.sh | sh
```

It drops the `qinit` binary in `~/.local/bin`. Set `QINIT_BIN` to pick another folder. Windows: grab `qinit-windows-x64.exe` from [Releases](https://github.com/hackerby888/qinit/releases/latest).

## Check it works

```bash
qinit doctor
```

`doctor` checks clang, the core headers, and crypto. All green = you're ready.

> **Note** — qinit needs `clang-18` to build a contract. If it's missing, `doctor` says so.

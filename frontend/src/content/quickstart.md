---
title: Quickstart
group: Getting Started
order: 3
---

## Zero to live

From a blank folder to a running contract.

### 1. Install

```bash
curl -fsSL https://raw.githubusercontent.com/hackerby888/qinit/main/install.sh | sh
```

### 2. New project

```bash
qinit new my-sc --template counter && cd my-sc
```

### 3. Start a node

```bash
qinit up
```

`up` downloads a test node, runs it, and gets headers ready. If a node is already ticking, it reuses it.

### 4. Edit + auto-deploy

```bash
qinit dev
```

Open `contracts/My_sc.h`, change something, save. qinit builds and deploys it for you.

### 5. Call it

```bash
qinit call
```

> **Tip** — That's the whole loop. Edit, save, call — repeat.

---
title: Call another contract
group: Guides
order: 5
---

## Call another contract

Your contract can call another one (a built-in like QX, or your own). Use the normal Qubic macros:

```cpp
Counter::Get_input gi; Counter::Get_output go;
CALL_OTHER_CONTRACT_FUNCTION(Counter, Get, gi, go);

Counter::Inc_input ii; Counter::Inc_output io;
INVOKE_OTHER_CONTRACT_PROCEDURE(Counter, Inc, ii, io, 0);
```

For your own deployed contract, tell qinit where it lives when you deploy:

```bash
qinit deploy --callee Counter=/abs/path/Counter.h@28
```

> **Note** — Rule: you can only call a contract at a **lower slot** than yours.

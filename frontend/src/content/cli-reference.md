---
title: CLI reference
group: Reference
order: 2
---

Every `qinit` command, with its flags and defaults. For a short list grouped by task, see [Commands](/docs/cli).

The CLI carries the same information. `qinit help` lists the commands, and `--help` on any command shows its flags:

```bash
qinit call --help
```

## Conventions

In a usage line, `<value>` is required, `[value]` is optional, and `a|b` means pick one. A flag marked *repeatable* can be given more than once. Flags can come before or after the other arguments.

Three flags work on every command:

| Flag | What it does |
|---|---|
| `--help`, `-h` | Show the command's usage, flags and examples. |
| `--json` | Print one JSON document instead of the terminal view. Only the commands marked **JSON** below produce one. |
| `--plain` | Plain text, no colors or spinners. Qinit switches to it by itself when the output is not a terminal or `NO_COLOR` is set. |

A JSON document is one line with `ok` and `error`, plus the command's own fields:

```bash
qinit call --fn Counter Get --json
```

```json
{"ok":true,"contract":"Counter","slot":31,"address":"FBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAKO","balance":"0","entry":"Get","kind":"function","tick":null,"tx":null,"out":"1","error":null}
```

A command exits with `0` on success and `1` on failure. A flag the command does not know is a failure:

```bash
qinit call --bogus
```

```text
✗ invalid arguments: Unknown option '--bogus'. To specify a positional argument
starting with a '-', place it at the end of the command after '--', as in '--
"--bogus"
run `qinit call --help`
```

A value that starts with `-` needs no special quoting: `--reply -1sint64` works.

## How Qinit picks defaults

Most commands run inside a project and read `qinit.json` from the current directory. Qinit does not look in parent directories.

| Field | Meaning |
|---|---|
| `contract` | The contract header, for example `contracts/Counter.h`. |
| `contractName` | The contract's name. It must match the struct in the header. |
| `slot` | The slot to deploy at. Leave it out and Qinit picks one. |
| `rpc` | The node's RPC URL. |
| `coreDir` | A Qubic Core checkout to take the headers from. |
| `system` | The system contracts the simulator loads at start. `qinit system add` maintains it. |

When a value can come from more than one place, Qinit takes the first one that is set:

| Setting | Order |
|---|---|
| Contract file | the file on the command line or `--contract`, then `contract` in `qinit.json` |
| Contract name | always the struct the header declares; `--contract-name` and `contractName` must agree with it. At most 31 characters. |
| Slot | `--slot`, then `slot` in `qinit.json`, then a free slot Qinit picks |
| Node | `--rpc`, then `rpc` in `qinit.json`, then `http://127.0.0.1:41841` |
| Core headers | `--core-dir`, then `coreDir` in `qinit.json`, then the `QINIT_CORE` environment variable, then the headers `qinit setup` cached |
| Compiler | `--compiler`, then the choice saved by `qinit compiler`, then `typescript` |
| Runtime | `--runtime`, then the choice saved by `qinit runtime`, then `simulator` |
| Signer seed | `--seed`, then the seed saved by `qinit seed`, then the node's funded seed |

Only `qinit node run` and `qinit test` choose a runtime. Every other command talks to whichever node answers at the RPC URL.

If the saved seed has no balance, `deploy` and `call --proc` sign with the node's funded seed instead. A seed passed with `--seed` is never replaced.

## Shared options

These flags mean the same on every command that takes them. The command tables below list them in one row.

| Flag | What it does |
|---|---|
| `--rpc <url>` | The node to talk to. |
| `--seed <seed>` | The seed that signs transactions: 55 lowercase letters. |
| `--contract <file.h>` | The contract header. The same as giving the file as an argument. |
| `--contract-name <name>` | The contract name. It must match the struct in the header. |
| `--slot <n>` | The contract's slot. |
| `--core-dir <path>` | A Qubic Core checkout to take the headers from. |
| `--callee <Name>=<header>[@<slot>]` | A contract this one calls, when its header is outside the project. Repeatable. See [Call another contract](/docs/inter-contract). |
| `--compiler <clang\|typescript>` | The compiler for this run. |
| `--runtime <core\|simulator>` | The runtime for this run. |
| `--skip-verify` | Skip the compatibility checks. For development only. |
| `--no-build-rules` | Skip the Qinit build rules for user contracts. For development only. |

## Setup

### qinit setup

Installs what Qinit needs: the Qubic headers, the local node, the Wasm compiler and the verifier. The installer runs it once; run it again to check for updates.

```bash
qinit setup [--force]
```

| Flag | What it does |
|---|---|
| `--force` | Install updates without asking. |

When updates are available, `setup` asks before installing them. Without a terminal it skips them unless you pass `--force`. Set `QINIT_NO_UPDATE` to turn the update check off.

### qinit doctor

Checks the development setup. **JSON.**

```bash
qinit doctor
```

```text
[toolchain ✓]
╭────────────────────────────────────────────────────────────────────────────╮
│ ✓ wasi-sdk (wasm compiler)      /home/you/.cache/qini…64-linux/bin/clang++ │
│ ✓ qubic-core-lite headers       /home/you/Projects/qu…e-lite/src/qpi/qpi.h │
│ ✓ wasm ABI (cli vs headers)     ABI 7                                      │
│ ✓ contract-verify tool          /home/you/.cache/qini…tools/contractverify │
╰────────────────────────────────────────────────────────────────────────────╯
```

A failed required check makes the command exit with `1` and prints how to fix it. The contract-verify tool is optional.

### qinit update

Updates the `qinit` binary to the latest release. `qinit self-update` is the same command.

```bash
qinit update [--force] [--dry-run]
```

| Flag | What it does |
|---|---|
| `--force` | Install even when the release is the same or older. |
| `--dry-run` | Show what would be installed. |

### qinit clean

Removes Qinit's cache: the downloaded node, headers, compiler and tools. `qinit setup` fetches them again. **JSON.**

```bash
qinit clean [--yes] [--dry-run]
```

| Flag | What it does |
|---|---|
| `--yes` | Delete. Without it, `clean` only shows what it would remove. |
| `--dry-run` | Show what would be removed. |

```bash
qinit clean --dry-run
```

```text
/home/you/.cache/qinit
• would free 934.8MB
  wasi-sdk            552.7MB
  qinit-v0.0.46       85.3MB
  qinit-v0.0.49       41.3MB
  qinit-v0.0.52       40.3MB
  …
```

### qinit uninstall

Removes the `qinit` binary and its cache.

```bash
qinit uninstall [--yes] [--keep-cache] [--dry-run]
```

| Flag | What it does |
|---|---|
| `--yes` | Remove. Without it, `uninstall` only shows what it would remove. |
| `--keep-cache` | Remove the binary and keep the cache. |
| `--dry-run` | Show what would be removed. |

```bash
qinit uninstall --dry-run
```

```text
• would remove
  binary /home/you/.local/bin/qinit
  cache  /home/you/.cache/qinit  934.8MB

re-run to confirm: qinit uninstall --yes
```

## Node

`qinit node` manages the local node. It has four subcommands; with none, it runs `status`. All four take these flags and produce **JSON**:

| Flag | What it does |
|---|---|
| `--ref <tag>` | The node and headers release to use. |
| `--rpc <url>` | The node's RPC URL. A local node needs a loopback address. |

### qinit node run

Starts the local node. If one is already running on the same runtime, `run` reuses it.

```bash
qinit node run
```

```text
✓ core headers    cached local
✓ node binary     simulator — no binary
✓ wasm compiler   cached
✓ node running    launched pid 157776, ticking at 2703

[node up ✓]
╭──────────────────────────────────────╮
│ runtime   simulator (in-process)     │
│ version   local                      │
│ rpc       http://127.0.0.1:41841     │
│ peer      127.0.0.1:31841            │
│ tick      2703                       │
│ contracts (none)                     │
│ scratch   /home/you/.cache/qinit/run │
╰──────────────────────────────────────╯
```

| Flag | What it does |
|---|---|
| `--restart` | Start a fresh node even if one is running. |
| `--keep` | Keep the existing node data. |
| `--offline` | Use the cached files and make no network request. |
| `--scratch-dir <path>` | Where the node keeps its data and log. Default: `run` in the cache directory. |
| `--wait <s>` | How long to wait for the node to start, in seconds. |
| `--runtime <core\|simulator>` | The runtime for this run. |
| `--compiler <clang\|typescript>` | The compiler the simulator builds system contracts with. |
| `--tick-ms <n>` | Simulator: milliseconds per tick. `0` is as fast as possible. |
| `--fees <metered\|off>` | Simulator: charge execution fees or not. Default: `metered`. |
| `--history-ticks <n>` | Simulator: how many finalized ticks to keep. Default: all of them. |
| `--full-tick` | Simulator: record quorum and votes for empty ticks too. |
| `--peer-port <n>` | Simulator: the peer port. Default: `31841`. |
| `--core-dir <path>` | Core: the Core checkout. The Core runtime also needs `--node-bin`. |
| `--node-bin <path>` | Core: a node binary to run instead of the downloaded one. |
| `--http-port <n>` | Core: the node's HTTP port. Default: the port in `--rpc`. |
| `--node-mode <n>` | Core: the node mode. |
| `--peers <addr>` | Core: a peer address. |

See [Control the local chain](/docs/local-chain).

### qinit node status

Shows whether the node is up, and its tick and epoch. Exits with `1` when the node is down.

```bash
qinit node status
```

```text
[node up ✓]
╭────────────────────────────────────────────────────╮
│ ✓ rpc: up, ticking                                 │
│                                                    │
│ tick            2705                               │
│ epoch           1                                  │
│ epoch last tick 5401  (2696 left)                  │
│ contract slots  0 armed / 48                       │
│ synced          headers local · node qinit-v0.0.52 │
╰────────────────────────────────────────────────────╯
```

### qinit node stop

Stops the local node.

```bash
qinit node stop
```

```text
[stopped ✓]
╭────────────────╮
│ ✓ node stopped │
╰────────────────╯
```

| Flag | What it does |
|---|---|
| `--scratch-dir <path>` | Stop the node that uses this data directory. Default: the node started for this RPC URL. |

### qinit node get

Downloads the node binary for the Core runtime and caches it, without starting it. `--ref` picks the release.

```bash
qinit node get [--ref <tag>]
```

### qinit tick

Shows the current tick, or moves it. **JSON.**

```bash
qinit tick [show | advance <n> | advance-to-last [gap] | rate <ms>]
```

| Subcommand | What it does |
|---|---|
| `show` | Print the tick and epoch. The default. |
| `advance <n>` | Skip `n` ticks. Default: 1. It stops at the epoch's last tick; `qinit epoch advance` crosses it. |
| `advance-to-last [gap]` | Skip to `gap` ticks before the epoch's last tick. Default gap: 3. `qinit tick last` is the same. |
| `rate <ms>` | Set the simulator's milliseconds per tick. With no value, print the current rate. |

| Flag | What it does |
|---|---|
| `--rpc <url>` | The node to talk to. |

```bash
qinit tick
```

```text
epoch           1
tick            2705
epoch last tick 5401
ticks left      2696
epoch length    2701 ticks
```

```bash
qinit tick advance 5
```

```text
tick     2705 → 2710
advanced 5
```

```bash
qinit tick advance-to-last
```

```text
tick            5403 → 8101
epoch last tick 8103
epoch           2
```

### qinit epoch

Shows the epoch, or ends it and starts the next one. **JSON.**

```bash
qinit epoch [show | advance]
```

| Flag | What it does |
|---|---|
| `--rpc <url>` | The node to talk to. |

```bash
qinit epoch advance
```

```text
epoch                1 → 2
tick                 2760 → 5403
new epoch start tick 5403
```

See [Control the local chain](/docs/local-chain).

### qinit oracle

Answers the oracle queries your contracts make, and reads the oracle log. **JSON.**

```bash
qinit oracle [pending | resolve <queryId> | serve | log [<fromTick> [<toTick>]]]
```

| Subcommand | What it does |
|---|---|
| `pending` | List the queries waiting for a reply. The default. |
| `resolve <queryId>` | Answer one query, with `--reply` or `--reply-hex`. |
| `serve` | Keep answering queries until you press Ctrl-C: every query with one `--reply`, or each interface with its own reply from `--rules`. |
| `log [<fromTick> [<toTick>]]` | Show oracle records for a tick range. Default: the last 30 ticks. |

| Flag | What it does |
|---|---|
| `--reply <value text>` | The reply, as typed values, for example `'123456sint64, 1000sint64'`. |
| `--reply-hex <hex>` | The reply as raw bytes, for a layout too large to type. |
| `--status <success\|unavailable>` | `resolve`: answer with a value, or report that there is none. Default: `success`. |
| `--rules <path>` | `serve`: a JSON file that maps an interface name to its reply text. |
| `--peer-port <n>` | `log`: the node's peer port. Default: `31841`. |
| `--rpc <url>` | The node to talk to. |

```bash
qinit oracle pending
```

```text
pending none
```

See [Use oracles](/docs/oracles) and [Format strings](/docs/format-strings).

## Develop

### qinit new

Creates a contract project in a new folder.

```bash
qinit new <name> [--template counter|hashmap|asset|intercontract]
```

| Flag | What it does |
|---|---|
| `--template <t>` | The starting contract: `counter`, `hashmap`, `asset` or `intercontract`. Default: `counter`. |
| `--core-dir <path>` | A Qubic Core checkout to record in the project's `qinit.json`. |

```bash
qinit new counter
```

```text
✓ created counter/  (template: counter)
  contracts/Counter.h
  tests/Counter.test.ts
  tests/Counter.test.cpp
  qinit.json · package.json · tsconfig.json · .gitignore · README.md
next: cd counter && qinit node run && qinit dev
```

See [Write a contract](/docs/writing-a-contract).

### qinit build

Compiles a contract to Wasm. **JSON.**

```bash
qinit build [<file.h>]
```

| Flag | What it does |
|---|---|
| `--production` | Build without cheatcodes, as Qubic Core will. |
| `--out <dir>` | Where to write the Wasm. Default: `dist/contracts`. |
| `--contract`, `--contract-name`, `--slot`, `--core-dir`, `--rpc`, `--callee`, `--compiler`, `--skip-verify`, `--no-build-rules` | See [Shared options](#shared-options). Without a node, `build` assigns slots locally. |

```bash
qinit build contracts/Counter.h
```

```text
[built ✓ (TypeScript)]
╭───────────────────────────────────────────────────────────────────────╮
│ wasm /home/you/counter/dist/contracts/Counter.wasm                    │
│ size 4435 bytes                                                       │
│ k12  7fe14550236deab91bb020d8a828f02b3f637cc7ab79c3c8c538c177ec32cccb │
╰───────────────────────────────────────────────────────────────────────╯
```

The JSON document has `compiler`, `artifact`, `size`, `hash`, `idl` and `warnings`.

### qinit dev

Watches the contract and redeploys it each time you save. Press `q` or Ctrl-C to stop.

```bash
qinit dev [<file.h>]
```

| Flag | What it does |
|---|---|
| `--contract`, `--contract-name`, `--slot`, `--core-dir`, `--rpc`, `--seed`, `--callee`, `--compiler`, `--skip-verify` | See [Shared options](#shared-options). |

See [Hot reload](/docs/hot-reload).

### qinit verify

Checks that a contract follows the rules Qubic Core enforces on contract code. **JSON.**

```bash
qinit verify [<file.h>]
```

| Flag | What it does |
|---|---|
| `--contract`, `--contract-name`, `--core-dir`, `--callee`, `--no-build-rules` | See [Shared options](#shared-options). |

```bash
qinit verify contracts/Counter.h
```

```text
✓ protocol rules  passed — complies with qpi.h restrictions
```

### qinit gen

Generates a typed TypeScript client for a contract. **JSON.**

```bash
qinit gen [<file.h>]
```

| Flag | What it does |
|---|---|
| `--out <dir>` | Where to write the client. Default: `dist/clients`. |
| `--contract`, `--contract-name`, `--slot`, `--core-dir` | See [Shared options](#shared-options). With no `--slot` and none in `qinit.json`, `gen` uses the slot the contract is deployed at. |

```bash
qinit gen contracts/Counter.h
```

```text
[client generated ✓]
╭──────────────────────────────────────────────────────────────────╮
│ contract  Counter                                                │
│ slot      31                                                     │
│ fns/procs 1 / 1                                                  │
│ file      /home/you/counter/dist/clients/Counter.ts              │
│                                                                  │
│ import { Counter } from "/home/you/counter/dist/clients/Counter" │
╰──────────────────────────────────────────────────────────────────╯
```

See [Typed clients](/docs/typed-clients).

### qinit strip

Writes a copy of the contract with the `CC_*` cheatcodes removed. **JSON.**

```bash
qinit strip [<file.h>] [--out <file.h>]
```

| Flag | What it does |
|---|---|
| `--out <file.h>` | Write the result here. Without it, `strip` prints it. |
| `--contract <file.h>` | The contract header. |

```bash
qinit strip contracts/Counter.h --out /tmp/Counter.clean.h
```

```text
[Counter.h]
╭────────────────────────────╮
│ wrote /tmp/Counter.clean.h │
╰────────────────────────────╯
```

See [Debug with cheatcodes](/docs/cheatcodes).

### qinit integrate

Adds the contract to a Qubic Core checkout, or updates it there, ready for a pull request. **JSON.**

```bash
qinit integrate [<file.h>] [--asset <symbol> --construction-epoch <n>]
```

| Flag | What it does |
|---|---|
| `--out <dir>` | The Qubic Core checkout. Default: `../<Name>-core`. |
| `--asset <symbol>` | The contract's asset symbol. |
| `--construction-epoch <n>` | The first epoch the contract is active. |
| `--destruction-epoch <n>` | The first epoch it is inactive. Default: `10000`. |
| `--contract`, `--contract-name`, `--no-build-rules` | See [Shared options](#shared-options). |

In a terminal, `integrate` asks for the asset symbol and the construction epoch when you leave them out. See [Ship to Qubic Core](/docs/core-integration).

## Deploy and interact

### qinit deploy

Builds the contract and deploys it, together with the contracts it calls. **JSON.**

```bash
qinit deploy [<file.h>] [--contract-name <name>] [--slot <n>]
```

| Flag | What it does |
|---|---|
| `--production` | Build without cheatcodes, as Qubic Core will. |
| `--state [<name>=]<path>` | Start a contract from a raw state file instead of running `INITIALIZE`. Repeatable. |
| `--allow-state-carryover` | Redeploy over a changed `StateData` layout without a `MIGRATE` handler, keeping the old state bytes. |
| `--contract`, `--contract-name`, `--slot`, `--core-dir`, `--rpc`, `--seed`, `--callee`, `--compiler`, `--skip-verify`, `--no-build-rules` | See [Shared options](#shared-options). |

```bash
qinit deploy
```

```text
✓ node ticking    tick 2723  17ms
✓ resolve slot    slot 31 (new)  1.4s
✓ build wasm      4435B · k12 7fe14550236deab91bb020d8a828f02b3f637cc7ab7…  93ms
✓ upload          direct (simulator)
✓ deploy          slot 31
✓ confirm         ready · 7fe14550236deab91bb020d8a828f02b3f637cc7ab79c3c…

▌ CONTRACTS ─────────────────────────────────────────────────────────────────
  contract  slot  kind  status    source
  Counter     31  main  deployed  contracts/Counter.h

▌ NOTES ─────────────────────────────────────────────────────────────────────
  signer    node funded seed
  compiler  prebuilt artifact (exact bytes)

[deployed ✓]
╭─────────────────────────────────────────────────────────────────────────────╮
│ contract   Counter                                                          │
│ slot       31                                                               │
│ SC address FBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAKO     │
│ SC balance 0                                                                │
│ tx         —                                                                │
│ codeHash   7fe14550236deab91bb020d8a828f02b3f637cc7ab79c3c8c538c177ec32cccb │
│ fns/procs  1 / 1                                                            │
│                                                                             │
│ next: qinit call                                                            │
╰─────────────────────────────────────────────────────────────────────────────╯
```

Deploying again to the same slot replaces the code and keeps the state. See [Deploy & call](/docs/deploy-and-call) and [Migrate state](/docs/migrate-state).

### qinit call

Calls a contract function or procedure. **JSON.**

```bash
qinit call [--fn|--proc <contract> <entry>] [--in "<values>"] [--out <type>]
```

With no arguments, `call` opens a guided picker: contract, entry, input. It then prints the command that does the same without the picker. Scripts name the entry directly, with `--fn` for a function or `--proc` for a procedure.

| Flag | What it does |
|---|---|
| `--fn` | Call a function. It reads state and needs no signature. |
| `--proc` | Call a procedure. Qinit signs a transaction, sends it and waits until it is processed. |
| `--in "<values>"` | The input values, each with its type: `"0id, 100uint64"`. The type is optional when Qinit knows the entry's schema. |
| `--args <json>` | The input as JSON, instead of `--in`. |
| `--out <type>` | Read the output as this type. Needed only to read it as another type of the same size, or when Qinit has no schema for the contract. |
| `--amount <n>` | QU to send with a procedure call, as its invocation reward. |
| `--tick <n>` | The tick the transaction targets. Default: the current tick plus 3. |
| `--no-settle` | Return as soon as the transaction is sent, without waiting. |
| `--trace` | Show the state changes and the contract calls the call made. |
| `--trace-full` | Like `--trace`, and include container details. |
| `--all` | Show fields that are zero or empty too. |
| `--rpc`, `--seed` | See [Shared options](#shared-options). |

```bash
qinit call --proc Counter Inc
```

```text
✓ Counter.Inc   processed
  tx   snhnxpcqhdmiwexvrmhtjgeczyndgyrpelycinwlxczrvsbugaibqhvegtln
  tick 2741

▌ CONTRACT ────────────────────────────────────────────────
  SC balance 0
  SC address FBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAKO

qinit explorer snhnxpcqhdmiwexvrmhtjgeczyndgyrpelycinwlxczrvsbugaibqhvegtln for
more info
```

```bash
qinit call --fn Counter Get
```

```text
✓ Counter.Get
  out 1

▌ CONTRACT ────────────────────────────────────────────────
  SC balance 0
  SC address FBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAKO
```

```bash
qinit call --proc Counter Inc --trace
```

```text
✓ Counter.Inc   processed
  tx   phegkwmzwxafnatmerdppkpeumihndnoicuoihzdyctztnnjmobofcnfurbm
  tick 2750

✓ Counter proc#1 (Inc) 36µs · tick 2750
  in     {}
  out    {}
  caller SINUBYSBZKBSVEFQDZBQWUEJWRXCXOZNKPHIXDZWRBKXDSPJEHFAMBACXHUN
  state
    counter 1 → 2

▌ CONTRACT ────────────────────────────────────────────────
  SC balance 0
  SC address FBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAKO

qinit explorer phegkwmzwxafnatmerdppkpeumihndnoicuoihzdyctztnnjmobofcnfurbm for
more info
```

With `--json`, `call` needs `--fn` or `--proc`: there is no picker without a terminal. See [Call values](/docs/call-values) and [Format strings](/docs/format-strings).

### qinit seed

Saves the seed that signs your transactions. **JSON.**

```bash
qinit seed [<seed>] [--show] [--clear]
```

With no arguments, `seed` lets you pick one of the node's funded seeds. With a seed, it saves that one.

| Flag | What it does |
|---|---|
| `--show` | Show the saved seed. |
| `--clear` | Remove the saved seed. |
| `--rpc <url>` | The node to list funded seeds from. |

```bash
qinit seed --show
```

```text
no saved seed — run `qinit seed` to pick one
```

The seed is kept in plain text in Qinit's config directory. Save a development seed only, never one that holds real funds.

### qinit sign

Signs a 32-byte digest, for a contract that checks a signature with `signatureValidity`. **JSON.**

```bash
qinit sign <hex-digest> [--seed <seed>]
```

| Flag | What it does |
|---|---|
| `--digest <hex>` | The digest, as 64 hex characters. The same as giving it as an argument. |
| `--seed <seed>` | The seed to sign with. Default: the saved seed. |

```bash
qinit sign 3f2a000000000000000000000000000000000000000000000000000000000000 --seed aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

```text
signer    BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXK
publicKey 1f590d03e613bdded38b4c0820ac446…f91af12435980b3ede3c08c315a2544
digest    3f2a000000000000000000000000000…0000000000000000000000000000000
signature 167c820935fae739b012a291dda1327…0c3ddc44e107acea61e23f95ff80c00
verifies  yes

Pass the signature as the hex string for an Array<sint8, 64> field, with the
signer as the id qpi.signatureValidity() checks against: --in "<hex>,
<identity>id"
```

The seed in this example is the public all-`a` test seed. `--json` prints the full signature. See [Verify signatures](/docs/signatures).

### qinit ls

Lists the contracts deployed on the node, then the system contracts. **JSON.**

```bash
qinit ls
```

```text
[deployed · 1]
╭────────────────────────────────────────────────────────────────────╮
│ slot  name     state  fn·proc  ver       reserve  k12              │
│   31  Counter  ready      1/1   v1  100000000000  7fe14550…6deab9… │
╰────────────────────────────────────────────────────────────────────╯
[system · 30 · not loaded — qinit system add <name>]
…
```

| Flag | What it does |
|---|---|
| `--rpc <url>` | The node to talk to. |

### qinit state

Shows a contract's state, decoded field by field. **JSON.**

```bash
qinit state [<name|slot>]
```

With no target, `state` lets you pick a contract. Large containers start collapsed; load them by the index shown next to them.

| Flag | What it does |
|---|---|
| `--container <index>` | Load one container by its index. Repeatable. |
| `--all` | Load every container. |
| `--digest` | Show the digest of the whole state instead. |
| `--dump` | Write the raw state bytes to `state/<Name>_dump.bin`. |
| `--out <path>` | With `--dump`: write to this path instead. |
| `--rpc <url>` | The node to talk to. |

```bash
qinit state Counter
```

```text
• Counter state
  counter 2
```

```bash
qinit state Counter --digest
```

```text
[state digest ✓]
╭───────────────────────────────────────────────────────────────────────────╮
│ slot       31                                                             │
│ state size 8                                                              │
│ digest     4e34329a1bac6e80862edb5e727be3d…d1169670a179622a21be84ff826f6e │
╰───────────────────────────────────────────────────────────────────────────╯
```

```bash
qinit state Counter --dump
```

```text
[state dump ✓]
╭───────────────────────────────────────────────────╮
│ slot     31                                       │
│ contract Counter                                  │
│ size     8 bytes                                  │
│ path     /home/you/counter/state/Counter_dump.bin │
╰───────────────────────────────────────────────────╯
```

```bash
qinit state Counter --json
```

```json
{"ok":true,"contract":"Counter","slot":31,"address":"FBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAKO","balance":"0","complete":true,"fields":[{"name":"counter","value":"2","error":null}],"containers":[],"error":null}
```

See [Inspect & debug](/docs/inspect-and-debug) and [Migrate state](/docs/migrate-state).

### qinit explorer

A full-screen explorer for the chain: ticks, transactions, contracts and identities. It needs a terminal.

```bash
qinit explorer [<tick|txid|identity>]
```

An argument opens the explorer on that tick, transaction or identity.

| Flag | What it does |
|---|---|
| `--rpc <url>` | The node to talk to. |

| Key | What it does |
|---|---|
| `1` `2` `3` `4` | Overview, contracts, identity, wallet |
| `/` | Find a tick, transaction or identity |
| `s` | Send, from an identity |
| `r` | Refresh |
| `t` | Next color theme |
| arrows, Enter, Esc | Move, open, go back |
| `q` | Quit |

### qinit debug

Watches contract calls live and shows what each one changed.

```bash
qinit debug [<Contract>]
```

With no contract, `debug` shows the calls of every contract.

| Flag | What it does |
|---|---|
| `--contract <name\|slot>` | The contract to watch. The same as giving it as an argument. |
| `--rpc <url>` | The node to talk to. |

| Key | What it does |
|---|---|
| up, down | Select a call |
| `x` | Hide the selected call |
| Ctrl-T | Show or hide internal calls |
| `q`, Esc | Quit |

See [Inspect & debug](/docs/inspect-and-debug).

### qinit test

Deploys the contract and runs its TypeScript tests against it. **JSON.**

```bash
qinit test [<file.h>]
```

| Flag | What it does |
|---|---|
| `--filter <pat>` | Run only the tests whose name matches. |
| `--timeout <ms>` | The test timeout. Default: `60000`. |
| `--keep-node` | Core: leave the node that `test` started running. |
| `--node-bin <path>` | Core: a node binary to run. |
| `--ref <tag>` | Core: the node release to use. |
| `--node-mode <n>` | Core: the node mode. |
| `--peers <addr>` | Core: a peer address. |
| `--wait <s>` | Core: how long to wait for the node to start, in seconds. |
| `--contract`, `--contract-name`, `--slot`, `--core-dir`, `--rpc`, `--seed`, `--callee`, `--compiler`, `--runtime`, `--skip-verify` | See [Shared options](#shared-options). |

```bash
qinit test
```

```text
✓ node          simulator @ http://127.0.0.1:42143
✓ deploy        Counter @ slot 31
✓ sdk           tests/.qinit/ (1 fn / 1 proc)
✓ tests         all passed

[bun test ✓]
╭──────────────────────────────────────╮
│ bun test v1.3.14 (0d9b296a)          │
│  1 pass                              │
│  0 fail                              │
│  4 expect() calls                    │
│ Ran 1 test across 1 file. [504.00ms] │
╰──────────────────────────────────────╯

[passed ✓]
╭─────────────────────────────────╮
│ contract Counter @ 31           │
│ rpc      http://127.0.0.1:42143 │
│ node     simulator              │
╰─────────────────────────────────╯
```

On the simulator, `test` starts its own in-process node, so your running node is left alone. See [Test a contract](/docs/testing).

### qinit gtest

Runs the contract's Core-style C++ tests on an isolated chain. **JSON.**

```bash
qinit gtest [<test.cpp>]
```

The test file defaults to `tests/<Name>.test.cpp`. Clang always builds the test; `--compiler` chooses who builds the contract under test.

| Flag | What it does |
|---|---|
| `--filter <pat>` | Run only the tests whose name contains one of these, comma-separated. |
| `--new` | Create `tests/<Name>.test.cpp`, or replace it. |
| `--state-type <T>` | The contract's struct type. It must match the header. |
| `--corpus <NAME>` | Run a system contract's own test, by name. |
| `--shared-mem` | Support tests that need a lot of memory. |
| `--contract`, `--contract-name`, `--slot`, `--core-dir`, `--callee`, `--compiler` | See [Shared options](#shared-options). |

```bash
qinit gtest
```

```text
✓ Counter.StartsAtZero
✓ Counter.IncrementsOncePerCall
  compile   qpi 0ms · pre 0ms · parse 0ms · analyze 0ms · codegen 3ms · wabt 28ms · total 31ms
✓ tests     2/2 passed

[passed ✓]
╭───────────────────────────────────────────────╮
│ contract Counter @ 31                         │
│ backend  TypeScript compiler                  │
│ test     tests/Counter.test.cpp               │
│ node     in-process engine (isolated genesis) │
╰───────────────────────────────────────────────╯
```

See [Test a contract](/docs/testing).

### qinit system

Loads the system contracts, the ones already live on mainnet, into your local node. **JSON.**

```bash
qinit system [ls | add <name…> | rm <name…>]
```

| Subcommand | What it does |
|---|---|
| `ls` | List the system contracts and which are loaded. The default. |
| `add <name…>` | Deploy them at their mainnet slots, with the contracts they depend on, and record them in `qinit.json`. |
| `rm <name…>` | Remove them. |

| Flag | What it does |
|---|---|
| `--state <name>=<path>` | With `add`: start a system contract from a raw state file. Repeatable. |
| `--force` | With `rm`: remove a system contract even when a deployed contract calls it. |
| `--compiler <clang\|typescript>` | The compiler the simulator builds system contracts with. |
| `--rpc <url>` | The node to talk to. |

```bash
qinit system ls
```

```text
slot  contract     state   (add: qinit system add <name…>)
•  1  QX           available
•  2  QTRY         available
•  3  RANDOM       available
•  4  QUTIL        available
…
```

See [Control the local chain](/docs/local-chain).

## Editor and preferences

### qinit ext install

Installs the Qinit extension into your editor. **JSON.**

```bash
qinit ext install [--vsix <path>] [--editor <cmd>]
```

| Flag | What it does |
|---|---|
| `--editor <cmd>` | The editor command: `code`, `cursor`, `windsurf` or `codium`. Default: the first of these that is installed. |
| `--vsix <path>` | Install this extension package instead of the latest published build. |

### qinit runtime

Chooses the runtime `qinit node run` and `qinit test` use by default. **JSON.**

```bash
qinit runtime [core|simulator] [--show]
```

With no argument, `runtime` opens a picker. With a name, it saves that choice.

| Flag | What it does |
|---|---|
| `--show` | Show the active runtime. |

```bash
qinit runtime --show
```

```text
active runtime: simulator
```

See [From simulator to Core](/docs/how-it-works).

### qinit compiler

Chooses the compiler that builds your contracts by default. **JSON.**

```bash
qinit compiler [clang|typescript] [--show]
```

With no argument, `compiler` opens a picker. With a name, it saves that choice.

| Flag | What it does |
|---|---|
| `--show` | Show the active compiler. |

```bash
qinit compiler --show
```

```text
active compiler: typescript
```

### qinit theme

Chooses the color theme.

```bash
qinit theme [default|emerald|ocean|rose|amber|mono] [--show]
```

| Flag | What it does |
|---|---|
| `--show` | Show the active theme. |

### qinit info

Shows the current setup: the Qinit version, the compiler, the runtime and node, and the Core headers. **JSON.**

```bash
qinit info
```

```text
[qinit]
╭────────────────────────────────────╮
│ version 0.1.16                     │
│ binary  /home/you/.local/bin/qinit │
╰────────────────────────────────────╯
[compiler]
╭───────────────────────────────────────────────────────────────────────────╮
│ backend      typescript (default)                                         │
│ wasi-sdk     /home/you/.cache/qinit/wasi-sd…29.0-x86_64-linux/bin/clang++ │
│ protocol     3                                                            │
│ qpi snapshot sha256:8854536930ea6… @ c55ef383750c…                        │
╰───────────────────────────────────────────────────────────────────────────╯
[runtime]
╭──────────────────────────────────────────────────────────────╮
│ runtime      simulator (default)                             │
│ rpc          http://127.0.0.1:41841                          │
│ node         not reachable                                   │
│ node version qinit-v0.0.52                                   │
│ node binary  /home/you/.cache/qinit/qinit-v0.0.52/node/Qubic │
│ headers      local                                           │
╰──────────────────────────────────────────────────────────────╯
[core]
╭───────────────────────────────────────────────────────────╮
│ checkout /home/you/Projects/qubic-core-lite               │
│ qpi.h    /home/you/Projects/qubic-core-lite/src/qpi/qpi.h │
╰───────────────────────────────────────────────────────────╯
```

A value marked `(default)` has no saved choice behind it.

| Flag | What it does |
|---|---|
| `--rpc <url>` | The node to report on. |

### qinit cheat-sheet

Prints a one-screen summary: setup, a sample contract, deploy and call, the `--in` value formats, the cheatcodes. `qinit cheat` is the same command.

```bash
qinit cheat-sheet
```

### qinit version

Prints the version. `qinit --version` and `qinit -v` do the same. **JSON.**

```bash
qinit version
```

```text
╭────────────────────────────────────────────────────────────────────╮
│ ◆ qinit   [v0.1.16]   Build, test and deploy Qubic smart contracts │
╰────────────────────────────────────────────────────────────────────╯
```

### qinit help

Lists the commands, or shows one command's usage, flags and examples. `qinit` with no arguments does the same as `qinit help`.

```bash
qinit help [<command> [<subcommand>]]
```

```bash
qinit help call
```

```text
call a contract function or procedure

usage:qinit call [ --fn|--proc <contract> <fn|proc> ] [--in "<values>"] [--out
      <type> ]

flags
  --tick <n>       target tick for the transaction (default: current + 3)
  --fn             make a read-only call
  --proc           send a signed call and wait for it
  --args <json>    JSON input
  --in "<values>"  input values, e.g. "0id, 100uint64" (id: 0, 60 A-Z chars, or
64 hex); the type may be omitted when the entry's schema is known
  --out <type>     output type
  --amount <n>     transfer amount
  --trace          show state changes and contract calls
  --trace-full     include container details
  --all            show zero and empty fields
  --no-settle      return without waiting for processing
  --rpc <url>      RPC URL
  --seed <seed>    signer seed
  --json           emit a machine-readable result (implies --plain)

examples
  qinit call # interactive mode
  qinit call --proc Mytoken Mint --in "0id, 100uint64"
  qinit call --fn   Mytoken BalanceOf --in 0id
  qinit call --proc Mytoken Mint --in "0, 100" # types optional with a schema
```

## Files and environment

Qinit keeps your saved choices in its config directory: `~/.config/qinit` on Linux and macOS (or `$XDG_CONFIG_HOME/qinit`), `%APPDATA%\qinit` on Windows.

| File | Holds |
|---|---|
| `seed` | The saved signer seed. |
| `runtime` | The saved runtime. |
| `compiler-backend` | The saved compiler. |
| `theme` | The saved color theme. |

Downloads and node data go in the cache directory, `~/.cache/qinit`. `qinit clean` empties it.

| Path | Holds |
|---|---|
| `<version>/core-headers/` | The Qubic headers for a release. |
| `<version>/node/` | The node binary for a release. |
| `wasi-sdk/` | The Wasm compiler. |
| `tools/` | The contract-verify tool. |
| `run/` | The local node's data and log. |
| `current.json` | Which headers, node and tools are active. |

A project holds these:

| Path | Holds |
|---|---|
| `qinit.json` | The project settings. See [How Qinit picks defaults](#how-qinit-picks-defaults). |
| `qinit.idl.json` | The deployed contract's schema, written by `deploy`. |
| `dist/contracts/` | Built Wasm, from `build`. |
| `dist/clients/` | Generated clients, from `gen`. |
| `state/` | State dumps, from `state --dump`. |
| `tests/` | `<Name>.test.ts` and `<Name>.test.cpp`. |

Environment variables:

| Variable | What it does |
|---|---|
| `QINIT_CORE` | A Qubic Core checkout to take the headers from. |
| `QINIT_CACHE` | The cache directory. Default: `~/.cache/qinit`. |
| `XDG_CONFIG_HOME` | The parent of the config directory. |
| `WASM_CLANG`, `WASI_SYSROOT` | Use this clang and sysroot instead of the cached Wasm compiler. |
| `NO_COLOR` | Plain output. |
| `QINIT_NO_UPDATE` | Turn the update checks off. |
| `QINIT_DEBUG` | Print debug messages. |

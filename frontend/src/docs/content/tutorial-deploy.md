---
title: Crowdfund 3: deploy and call
group: Tutorial
order: 3
description: Tutorial, part 3 of 4: deploy the crowdfund contract to a local Qubic node, open a campaign and send it QU from the command line.
---

You will end this page with a live campaign on your machine, holding real (local) QU.

```bash
qinit node run
```

```text
✓ core headers    cached local
✓ node binary     simulator — no binary
✓ wasm compiler   cached
✓ node running    launched pid 29771, ticking at 2703

[node up ✓]
╭───────────────────────────────────────╮
│ runtime   simulator (in-process)      │
│ version   local                       │
│ rpc       http://127.0.0.1:41841      │
│ peer      127.0.0.1:31841             │
│ tick      2703                        │
│ contracts (none)                      │
│ scratch   /home/you/.cache/qinit/run  │
╰───────────────────────────────────────╯
```

```bash
qinit deploy
```

```text
▌ CONTRACTS ─────────────────────────────────────────────────────────────────
  contract   slot  kind  status    source
  Crowdfund    32  main  deployed  contracts/Crowdfund.h
…
```

Open a campaign: a goal of 1000 QU, closing one epoch from now.

```bash
qinit call --proc Crowdfund Open --in "1000uint64, 1uint32"
```

```text
✓ Crowdfund.Open  processed
  tx   avewhkqnbnzwpewnowdfqxhxgxpadoyvssgdhvoskenffdljubuivhcayfsh
  tick 2716
…
```

You signed that call, so you are the owner. The types in `--in` are optional here, because Qinit knows the contract's schema: `--in "1000, 1"` works too.

Now back your own campaign. `--amount` is the QU sent with the call:

```bash
qinit call --proc Crowdfund Contribute --amount 400
```

```text
✓ Crowdfund.Contribute  processed
  tx   hmxxdbfrcsogagqkqjdjcleuazraqvcrpghemqzszbjupctewvkduudhlroh
  tick 2723

▌ CONTRACT ────────────────────────────────────────────────
  SC balance 400
  SC address GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANAVO
…
```

The contract holds 400 QU. Ask it what it knows:

```bash
qinit call --fn Crowdfund Status
```

```text
✓ Crowdfund.Status
  out {owner: "SINUBYSBZKBSVEFQDZBQWUEJWRXCXOZNKPHIXDZWRBKXDSPJEHFAMBACXHUN",
  goal: 1000, raised: 400, deadlineEpoch: 2, contributors: 1}
…
```

Leave the node running. Next: [fund the rest from code](/docs/tutorial-client).

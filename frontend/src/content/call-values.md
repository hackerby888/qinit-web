---
title: Call values
group: Reference
order: 2
---

## Prefer named calls

When Qinit has the contract schema, pass normal JSON:

```bash
qinit call --proc Balances Set \
  --args '{"who":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFXIB","amount":"9007199254740993"}'
```

Quote 64-bit integers in JSON when they may exceed JavaScript's safe integer range.

A byte array (`Array<uint8, N>` or `Array<sint8, N>`) also takes one hex string of exactly `N` bytes, such as a signature from `qinit sign`. See [Verify signatures](/docs/signatures).

## Raw values

Use `--in` for numeric entry IDs, missing schemas, or exact ABI work. Every scalar carries its QPI type:

```bash
qinit call --proc Balances 1 --in "0id, 25uint64"
qinit call --fn Balances 1 --in "0id" --out uint64
```

Common values:

```text
42uint64
-7sint64
1bit
0id
0m256i
```

`0id` and `0m256i` each encode 32 zero bytes. They are raw `--in` tokens; JSON input uses a full identity or hex value. A non-zero `id` is a 60-letter Qubic identity or a 64-hex public key. A non-zero `m256i` is 64 hex characters.

Structs and fixed arrays nest naturally:

```text
{ 7uint32, 9uint64 }
[3; 1uint16, 2uint16, 3uint16]
[8; 0uint8 ×8]
```

The repeat marker may be `×`, `*`, or `x`.

See [Format strings](/docs/format-strings) for the full language, padding rules, and what each error means.

## Invocation reward

```bash
qinit call --proc Counter Inc --amount 100
```

`--amount` attaches QU as the contract's invocation reward. It is value sent with the call, not a gas limit.

## Interactive completion

Run `qinit call`, choose an entry, and type just the value:

```text
1
```

Pause briefly. After the 300 ms debounce, Qinit suggests the schema's type, such as `1uint64`; press Tab to accept it. You do not need to type `u` first. This also works for signed integers and the zero shorthands `0id` and `0m256i`. Typing a prefix such as `1u` still completes immediately.

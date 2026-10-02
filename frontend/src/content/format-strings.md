---
title: Format strings
group: Reference
order: 3
---

A format string is the text you pass to `--in`, to `qinit oracle resolve --reply`, and to `--out`.

## Values only

When Qinit knows the entry's schema, a format string is just the values, comma-separated, one per field:

```text
--in "0, 100"
--in "BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXK, 25"
--reply "6512345, 100"
```

Each value takes the type of the field it lands in. Qinit has the schema whenever it has the contract: your project's build, or the source a node registered at deploy.

| Type | Bytes | Value |
| --- | --- | --- |
| `uint8` `sint8` | 1 | `42` `-7` |
| `bit` | 1 | `0` `1` |
| `uint16` `sint16` | 2 | `300` |
| `uint32` `sint32` | 4 | `70000` |
| `uint64` `sint64` | 8 | `42` `-7` |
| `uint128` `sint128` | 16 | `42` |
| `id` | 32 | 60-letter identity, 64-hex public key, or `0` |
| `m256i` | 32 | 64 hex characters, or `0` |

Numbers are plain decimal. Hex is for `id`, `m256i`, and byte arrays only.

## Structs and arrays

```text
{ 7, 9 }              struct
[3; 1, 2, 3]          array — the count must match
[8; 0 ×8]             repeat, so you don't type eight zeros
```

The repeat marker may be `×`, `*`, or `x`, with a space before it. Commas separate fields; one trailing comma is fine. Nest as deep as you like:

```text
{ 1, [2; { 2, 3 }, { 4, 5 } ] }
```

A byte array (`Array<uint8, N>` or `Array<sint8, N>`) also takes one hex string of exactly `N` bytes in place of `[N; …]`.

## Typed values

A value may carry its type: the number, then the type name.

```text
42uint64   -7sint64   1bit   0id   0m256i
```

You need this in two cases:

- **No schema.** Calling an entry by number on a contract whose source Qinit cannot see. Then every value carries its type, and `--out` names the output type:

```bash
qinit call --proc 31 1 --in "0id, 25uint64"
qinit call --fn 31 1 --in "0id" --out uint64
```

- **An asset name** packed into a `uint64`: `MYTOKasset`.

With a schema, a typed value is still accepted, and it must match its field:

```text
✗ call
  bad input: input.amount is uint64, got '100uint32'
  all-zero sample: 0id, 0uint64
```

`--out` always takes types, never values: `uint64`, `{ id, uint16 }`, `[2;uint8]`.

## Padding

A struct is rarely the sum of its fields.

```text
{ uint8, uint64 }   16 bytes, not 9
{ uint64, uint8 }   16 bytes, not 9
```

Two rules, the same ones the contract's C++ follows:

- Each field starts at a multiple of its own size. `uint8` at 0 leaves `uint64` starting at 8, not 1.
- The struct is padded up to its widest field, so an array of them stays aligned.

Arrays pad their elements the same way, so `[2;{ uint8, uint64 }]` is 32 bytes.

This is why `qinit state` reports the sizes it does, and why a byte count in an error message can look larger than what you typed.

## When it fails

The CLI hands you a filled-in template. It spells every value with its type so you can see what each field expects; copy it and replace the zeros, with or without the types:

```text
✗ call
  bad input: input has 2 field(s), got 1 value(s)
  all-zero sample: 0id, 0uint64
```

| Message | Cause |
| --- | --- |
| `input has 2 field(s), got 1 value(s)` | too few or too many values for the entry |
| `input.amount is uint64, got 'abc'` | the value is not a number, or carries the wrong type |
| `id must be 0, a 60-char identity (A-Z) or a 64-hex pubkey, got 'nobody'` | not a valid `id` |
| `hex is not accepted, write '0x10' in decimal` | a hex number where a decimal one is wanted |
| `uint64 out of range: -1 (allowed 0..18446744073709551615)` | the number does not fit the field |
| `array of 4 needs 4 values, got 3` | the count disagrees with the values listed |
| `array value is missing its closing ']'` | unbalanced or mismatched bracket |
| `cannot parse value token '5' (expected <number><type>, e.g. 5uint64)` | no schema for this entry, so the value needs its type |
| `encodes to 8 bytes, proc 1/2 wants 12` | no schema: the typed values parsed, but are not the shape that entry takes |

Not sure what an entry takes? Run `qinit call` and let the picker show its fields.

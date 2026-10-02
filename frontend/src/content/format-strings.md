---
title: Format strings
group: Reference
order: 3
---

A format string is the text you pass to `--in`, to `qinit oracle resolve --reply`, and to `--out`.

## Two dialects

`--in` and `--reply` take values. `--out` takes types. Same shapes, one carries numbers.

```text
--in    42uint64, [2; 1uint8, 2uint8]
--out   uint64,   [2;uint8]
```

## Values

A value is a number followed by its QPI type. Values are comma-separated, one per field:

```text
--in "0id, 100uint64"
--in "BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXKid, 25uint64"
--reply "6512345sint64, 100sint64"
```

| Type | Bytes | Value |
| --- | --- | --- |
| `uint8` `sint8` | 1 | `42uint8` `-7sint8` |
| `bit` | 1 | `1bit` |
| `uint16` `sint16` | 2 | `300uint16` |
| `uint32` `sint32` | 4 | `70000uint32` |
| `uint64` `sint64` | 8 | `42uint64` `-7sint64` |
| `uint128` `sint128` | 16 | `42uint128` |
| `id` | 32 | `0id` |
| `m256i` | 32 | `0m256i` |

`0id` and `0m256i` are shorthands for 32 zero bytes. A real `id` is a 60-letter Qubic identity or a 64-hex public key, then `id`. A real `m256i` is 64 hex characters, then `m256i`.

Numbers are plain decimal. An asset name packed into a `uint64` is written `MYTOKasset`.

## Structs and arrays

```text
{ 7uint32, 9uint64 }              struct
[3; 1uint16, 2uint16, 3uint16]    array — the count must match
[8; 0uint8 ×8]                    repeat, so you don't type eight zeros
```

The repeat marker may be `×`, `*`, or `x`. Commas separate fields; one trailing comma is fine. Nest as deep as you like:

```text
{ 1uint8, [2; { 2uint16, 3uint64 }, { 4uint16, 5uint64 } ] }
```

A byte array (`Array<uint8, N>` or `Array<sint8, N>`) also takes one hex string of exactly `N` bytes in place of `[N; …]`, when Qinit knows the entry's schema.

## Without the types

The type is optional when Qinit knows the entry's schema: `--in "0, 100"` means the same as `--in "0id, 100uint64"`. Each value takes the type of the field it lands in.

```text
--in "0, 100"
--in "BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXK, 25"
--in "{ 7, 9 }, [3; 1, 2, 3], [8; 0 ×8]"
--reply "6512345, 100"
```

Qinit has the schema whenever it has the contract: your project's build, or the source a node registered at deploy. Typed and untyped values can be mixed, and a typed one must still match its field:

```text
✗ call
  bad input: input.amount is uint64, got '100uint32'
  all-zero sample: 0id, 0uint64
```

Two details for untyped values: write a repeat with a space or with `×` / `*` (`0 x8`, since `0x8` reads as hex), and keep asset names typed (`MYTOKasset`).

Without a schema, for example calling an entry by number on a contract whose source Qinit cannot see, every value needs its type and `--out` names the output type:

```bash
qinit call --proc 31 1 --in "0id, 25uint64"
qinit call --fn 31 1 --in "0id" --out uint64
```

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

The CLI hands you a filled-in template. Copy it and replace the zeros:

```text
✗ call
  bad input: input has 2 field(s), got 1 value(s)
  all-zero sample: 0id, 0uint64
```

| Message | Cause |
| --- | --- |
| `input has 2 field(s), got 1 value(s)` | too few or too many values for the entry |
| `input.amount is uint64, got '100uint32'` | the value carries the wrong type, or is not a number |
| `id must be 0, a 60-char identity (A-Z) or a 64-hex pubkey, got 'nobody'` | not a valid `id` |
| `hex is not accepted, write '0x10' in decimal` | a hex number where a decimal one is wanted |
| `uint64 out of range: -1 (allowed 0..18446744073709551615)` | the number does not fit the field |
| `array of 4 needs 4 values, got 3` | the count disagrees with the values listed |
| `array value is missing its closing ']'` | unbalanced or mismatched bracket |
| `cannot parse value token '5' (expected <number><type>, e.g. 5uint64)` | no schema for this entry, so the value needs its type |
| `encodes to 8 bytes, proc 1/2 wants 12` | no schema: the typed values parsed, but are not the shape that entry takes |

Not sure what an entry takes? Run `qinit call` and let the picker show its fields.

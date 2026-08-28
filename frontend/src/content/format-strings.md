---
title: Format strings
group: Reference
order: 3
---

## Two dialects

`--in` takes values. `--out` takes types. Same shapes, one carries numbers.

```text
--in    42uint64, [2; 1uint8, 2uint8]
--out   uint64,   [2;uint8]
```

Swapping them is an error, not a guess:

```text
--in  "uint64"      cannot parse value token 'uint64' (expected <number><type>, e.g. 5uint64)
--out "42uint64"    unknown type '42uint64'
```

## Scalars

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

`0id` and `0m256i` are shorthands for 32 zero bytes. A real `id` is a 60-letter Qubic identity or a
64-hex public key. A real `m256i` is 64 hex characters.

## Structs and arrays

```text
{ 7uint32, 9uint64 }              struct
[3; 1uint16, 2uint16, 3uint16]    array — the count must match
[8; 0uint8 ×8]                    repeat, so you don't type eight zeros
```

The repeat marker may be `×`, `*`, or `x`. Commas separate fields; one trailing comma is fine. Nest as
deep as you like:

```text
{ 1uint8, [2; { 2uint16, 3uint64 }, { 4uint16, 5uint64 } ] }
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

This is why `qinit state` reports the sizes it does, and why a byte count in an error message can look
larger than what you typed.

## Don't type it by hand

When Qinit has the schema, use JSON and skip the language entirely — see [Call values](/docs/call-values).

```bash
qinit call --proc Balances Set --args '{"who":"...","amount":"9007199254740993"}'
```

When `--in` fails, the CLI hands you a filled-in template. Copy it and replace the zeros:

```text
bad input: array of 4 needs 4 values, got 3
all-zero sample: 0uint8, [4; 0uint16 ×4]
```

## Errors

| Message | Cause |
| --- | --- |
| `array of 4 needs 4 values, got 3` | count disagrees with the values listed |
| `array count 'abc' must be a non-negative integer` | count is not a plain number |
| `array value is missing its closing ']'` | unbalanced or mismatched bracket |
| `struct fields are separated by ','` | missing comma inside `{ }` |
| `unexpected 'uint8' after the type` | missing comma at the top level |
| `encodes to 8 bytes, proc 1/2 wants 12` | valid on its own, wrong shape for that entry |

The last one is the useful one: your string parsed fine, it just isn't what the contract expects. Check
the entry's schema with `qinit ls` or run `qinit call` and let the picker fill it in.

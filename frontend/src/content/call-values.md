---
title: Call values
group: Reference
order: 2
---

## Write the values

`--in` takes one value per input field, in the order the contract declares them. Each value is written with its QPI type: the number, then the type name.

```bash
qinit call --proc Balances Set --in "BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXKid, 25uint64"
qinit call --fn Balances BalanceOf --in 0id
```

| Field type | Write |
| --- | --- |
| `uint8` … `uint128`, `sint8` … `sint128` | a decimal number and the type: `42uint64`, `-7sint64` |
| `bit` | `0bit` or `1bit` |
| `id` | a 60-letter identity or a 64-hex public key, then `id`; `0id` for the zero id |
| `m256i` | 64 hex characters, then `m256i`; `0m256i` for zero |
| `Array<uint8, N>`, `Array<sint8, N>` | one hex string of exactly `N` bytes, such as a signature from `qinit sign` |

Structs and fixed arrays nest naturally:

```text
{ 7uint32, 9uint64 }
[3; 1uint16, 2uint16, 3uint16]
[8; 0uint8 ×8]
```

The repeat marker may be `×`, `*`, or `x`.

A value of the wrong type is refused before anything is sent, and Qinit names the field:

```text
✗ call
  bad input: input.amount is uint64, got '100uint32'
  all-zero sample: 0id, 0uint64
```

## Leave the type out

The type is optional when Qinit knows the entry's schema, which it does for any contract it has the source of. Each value then takes the type of the field it lands in:

```bash
qinit call --proc Balances Set --in "BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXK, 25"
qinit call --fn Balances BalanceOf --in 0
```

Without a schema, for example calling an entry by number on a contract Qinit has no source for, every value needs its type.

See [Format strings](/docs/format-strings) for the full language and what each error means.

## Read the result

A function prints its output decoded by field name. `--out` is only needed to read the bytes as another type of the same size, for example an `id` as hex:

```bash
qinit call --fn Voucher Digest --in 100uint64 --out m256i
```

## Invocation reward

```bash
qinit call --proc Counter Inc --amount 100
```

`--amount` attaches QU as the contract's invocation reward. It is value sent with the call, not a gas limit.

## Interactive

Run `qinit call` and choose an entry. The picker lists the input fields with their types above the prompt and shows an all-zero example; type the values the same way as for `--in`.

## JSON

`--args '{"who":"<IDENTITY>","amount":100}'` passes the same input as JSON keyed by field name. `--in` is the recommended form; use one or the other, not both.

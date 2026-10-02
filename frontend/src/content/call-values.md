---
title: Call values
group: Reference
order: 2
---

## Write the values

`--in` takes one value per input field, in the order the contract declares them. Qinit reads each field's type from the contract, so you type only the values:

```bash
qinit call --proc Balances Set --in "BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXK, 25"
qinit call --fn Balances BalanceOf --in 0
```

| Field type | Write |
| --- | --- |
| `uint8` … `uint128`, `sint8` … `sint128` | a decimal number: `42`, `-7` |
| `bit` | `0` or `1` |
| `id` | a 60-letter identity, a 64-hex public key, or `0` for the zero id |
| `m256i` | 64 hex characters, or `0` |
| `Array<uint8, N>`, `Array<sint8, N>` | one hex string of exactly `N` bytes, such as a signature from `qinit sign` |

Structs and fixed arrays nest naturally:

```text
{ 7, 9 }
[3; 1, 2, 3]
[8; 0 ×8]
```

The repeat marker may be `×`, `*`, or `x`, with a space before it.

A wrong value is refused before anything is sent, and Qinit names the field:

```text
✗ call
  bad input: input.amount is uint64, got 'abc'
  all-zero sample: 0id, 0uint64
```

See [Format strings](/docs/format-strings) for the full language, typed values, and what each error means.

## Read the result

A function prints its output decoded by field name. `--out` is only needed to read the bytes as another type of the same size, for example an `id` as hex:

```bash
qinit call --fn Voucher Digest --in 100 --out m256i
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

---
title: Verify signatures
group: Guides
order: 10
---

A contract can check that a message really comes from a given identity, even when someone else submits it. This is the basis for vouchers, permits and off-chain approvals:

1. The contract hashes the message into a 32-byte **digest**.
2. The owner signs the digest off-chain with their seed.
3. Anyone passes the signature to the contract, which checks it with `qpi.signatureValidity(signer, digest, signature)`.

`qinit sign` does step 2 locally, so you can test both the accept and the reject path.

## Example contract

`qinit new Voucher`, then replace `contracts/Voucher.h`:

```cpp
using namespace QPI;

struct Voucher2 {};

struct Voucher : public ContractBase
{
    struct StateData {};

    struct Digest_input { uint64 amount; };
    struct Digest_output { id digest; };

    struct Check_input { Array<sint8, 64> signature; id signer; uint64 amount; };
    struct Check_output { bit valid; };
    struct Check_locals { id digest; };

    // the bytes the signer must sign: a K12 hash of the voucher
    PUBLIC_FUNCTION(Digest)
    {
        output.digest = qpi.K12(input.amount);
    }

    PUBLIC_FUNCTION_WITH_LOCALS(Check)
    {
        locals.digest = qpi.K12(input.amount);
        output.valid = qpi.signatureValidity(input.signer, locals.digest, input.signature);
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_FUNCTION(Digest, 1);
        REGISTER_USER_FUNCTION(Check, 2);
    }
};
```

A real contract would do this inside a procedure that pays out once. Two functions keep the example to its core.

## Get the digest

```bash
qinit deploy
qinit call --fn Voucher Digest --in 100uint64 --out m256i
```

```text
✓ Voucher.Digest
  out "a59a3f499df8fa2ff0ed47d6c91359386444a274773d63743f611e2da3aa3fb3"
```

`--out m256i` prints the digest as hex. Without it, an `id` prints as a 60-letter identity.

## Sign it

```bash
qinit sign a59a3f499df8fa2ff0ed47d6c91359386444a274773d63743f611e2da3aa3fb3
```

```text
signer    BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXK
publicKey 1f590d03e613bdded38b4c0820ac446…f91af12435980b3ede3c08c315a2544
digest    a59a3f499df8fa2ff0ed47d6c913593…444a274773d63743f611e2da3aa3fb3
signature 0dc5ee0303cc518bd807074447173d5…07f616ef7312bffe1fed41387020e00
verifies  yes
```

`qinit sign` uses your saved seed. If none is saved yet, it stops with `no seed: pass --seed <seed> or save one with qinit seed`. Pass `--seed` to sign as someone else. Use `--json` for the full, untruncated signature:

```bash
qinit sign a59a3f499df8fa2ff0ed47d6c91359386444a274773d63743f611e2da3aa3fb3 --json
```

## Check it on-chain

The contract takes the signature as `Array<sint8, 64>`. A byte array is written as one hex string, so paste the signature from `qinit sign --json` as it is, followed by the signer and the amount with their types:

```bash
qinit call --fn Voucher Check --in "0dc5ee0303cc518bd807074447173d54f65c019f98f91cadaa9565a541c428d950ca470f2c085631f6f69e6d24eb2054c07f616ef7312bffe1fed41387020e00, BZBQFLLBNCXEMGLOBHUVFTLUPLVCPQUASSILFABOFFBCADQSSUPNWLZBQEXKid, 100uint64"
```

```text
✓ Voucher.Check
  out 1
```

Change the last value to `101uint64` and the same signature gives `out 0`: the digest no longer matches what was signed.

> Never paste a real seed into a command you share. Use `qinit seed` to keep it on your machine.

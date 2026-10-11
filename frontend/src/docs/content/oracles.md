---
title: Use oracles
group: Guides
order: 8
---

A contract can't read the internet. An **oracle** fills that gap: the contract asks a question, like "what is BTC/USDT right now?", and an off-chain **oracle machine** answers it. On mainnet the computors run oracle machines and agree on the reply. A local node has none, so you answer the question yourself with `qinit oracle`.

## How a query flows

1. A procedure calls `QUERY_ORACLE(...)` and pays the query fee (10 QU for `Price`) from the contract's balance. It gets back a query id right away.
2. The query waits as `PENDING` until someone answers it.
3. Once answered, the reply is committed and then revealed. Qubic calls your **notification procedure** with the reply and a status.

| Status | Value | Meaning |
| --- | --- | --- |
| `ORACLE_QUERY_STATUS_UNKNOWN` | 0 | refused: bad timeout or fee not paid (query id is `-1`) |
| `ORACLE_QUERY_STATUS_PENDING` | 1 | waiting for an answer |
| `ORACLE_QUERY_STATUS_COMMITTED` | 2 | answered, reveal due next tick |
| `ORACLE_QUERY_STATUS_SUCCESS` | 3 | reply delivered |
| `ORACLE_QUERY_STATUS_TIMEOUT` | 4 | nobody answered in time |

## Example contract

`qinit new BtcPrice`, then replace `contracts/BtcPrice.h`:

```cpp
using namespace QPI;

struct BtcPrice2 {};

struct BtcPrice : public ContractBase
{
    struct StateData
    {
        sint64 queryId;
        uint8 status;
        sint64 numerator;
        sint64 denominator;
    };

    struct Ask_input {};
    struct Ask_output { sint64 queryId; };
    struct Ask_locals { OI::Price::OracleQuery query; };

    struct Get_input {};
    struct Get_output { sint64 queryId; uint8 status; sint64 numerator; sint64 denominator; };

    // the oracle calls this back with the reply
    typedef OracleNotificationInput<OI::Price> OnPrice_input;
    typedef NoData OnPrice_output;

    PRIVATE_PROCEDURE(OnPrice)
    {
        state.mut().status = input.status;
        if (input.status == ORACLE_QUERY_STATUS_SUCCESS && OI::Price::replyIsValid(input.reply))
        {
            state.mut().numerator = input.reply.numerator;
            state.mut().denominator = input.reply.denominator;
        }
    }

    PUBLIC_PROCEDURE_WITH_LOCALS(Ask)
    {
        using namespace Ch;
        locals.query.oracle = OI::Price::getMockOracleId();
        locals.query.currency1 = id(B, T, C, null, null);
        locals.query.currency2 = id(U, S, D, T, null);
        locals.query.timestamp = qpi.now();

        // 60 s to answer; the 10 QU fee comes from the contract's balance
        state.mut().status = ORACLE_QUERY_STATUS_PENDING;
        output.queryId = QUERY_ORACLE(OI::Price, locals.query, OnPrice, 60000);
        state.mut().queryId = output.queryId;
    }

    PUBLIC_FUNCTION(Get)
    {
        output.queryId = state.get().queryId;
        output.status = state.get().status;
        output.numerator = state.get().numerator;
        output.denominator = state.get().denominator;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE_NOTIFICATION(OnPrice);
        REGISTER_USER_PROCEDURE(Ask, 1);
        REGISTER_USER_FUNCTION(Get, 1);
    }
};
```

- `OI::Price` is the **oracle interface**: it fixes the query shape (oracle, timestamp, currency pair) and the reply shape (`numerator / denominator`).
- `OnPrice` is a private procedure. `REGISTER_USER_PROCEDURE_NOTIFICATION` lets the oracle call it; users can't.
- Status is set to `PENDING` *before* `QUERY_ORACLE`, because a refused query calls `OnPrice` immediately with `UNKNOWN`.

## Ask and answer

```bash
qinit node run
qinit deploy
qinit call --proc BtcPrice Ask --amount 10
qinit oracle pending
```

`--amount 10` funds the query fee. Without it the query is refused and `queryId` is `-1`.

```text
#5832565592064 Price  slot 31  query 6d6f636b0000000000000000… (104 B)
```

Answer it. The reply is written like `call --in`: one typed value per field of the interface's reply ([Call values](/docs/call-values)). Qinit knows the interface's reply layout, so the types are optional here too: `--reply "6512345, 100"` means the same.

```bash
qinit oracle resolve 5832565592064 --reply "6512345sint64, 100sint64"
```

```text
query     5832565592064
interface Price
reply     d95e6300000000006400000000000000
accepted  yes — the contract is notified once the reply is revealed
```

```bash
qinit call --fn BtcPrice Get
```

```text
✓ BtcPrice.Get
  out {queryId: 5832565592064, status: 3, numerator: 6512345, denominator: 100}
```

The price is `6512345 / 100` = 65 123.45 USDT. The reply is checked against the interface before it is sent, so a value of the wrong type is refused:

```text
ERROR: input.numerator is sint64, got '65000uint64'
  Price reply looks like: 0sint64, 0sint64
```

## Answer automatically

While you iterate, let Qinit answer every query:

```bash
qinit oracle serve --reply "6600000sint64, 100sint64"
```

To answer several interfaces at once, give each interface its own reply in a rules file:

```bash
echo '{ "Price": "6512345sint64, 100sint64" }' > oracle.json
qinit oracle serve --rules oracle.json
```

`serve` checks for new queries every 500 ms. Stop it with Ctrl-C.

## Test the unhappy path

```bash
qinit call --proc BtcPrice Ask --amount 10
qinit oracle resolve <queryId> --status unavailable
```

```text
query     5858335395840
interface Price
reply     none (reported unavailable)
accepted  yes — the contract is notified once the reply is revealed
```

This reports that there is no answer. The query stays `PENDING` until its timeout, and then `OnPrice` runs with status `4` (`TIMEOUT`) and an empty reply. A single machine can't produce `UNRESOLVABLE`. That status only happens when computors disagree.

## Subscriptions

For a steady price feed, subscribe once instead of querying over and over:

```cpp
output.subscriptionId = SUBSCRIBE_ORACLE(OI::Price, locals.query, OnPrice, 60000, true);
```

- The period is in milliseconds, at least 60 000, and a whole number of minutes.
- The fee is `OI::Price::getSubscriptionFee`: 10 000 QU for a 1-minute period, and less for longer ones.
- Each period sends a new query, and its reply arrives in `OnPrice`. `qinit oracle serve` answers all of them.
- `qpi.unsubscribeOracle(subscriptionId)` stops the subscription.

## Outsourced computation

`INVOKE_OC(OCI::Mock, request)` sends work to computors off-chain. It is one-way: there is no reply and no callback, so there is no `qinit` command for it. Poll `qpi.getOcInvocationStatus(id)` instead. It reads `1` (waiting) until the computors sign, then `2` (`AUTHORIZED`).

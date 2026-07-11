// Starter contracts shown in the IDE file tree. Each is a real, qpi.h-constrained dynamic contract
// (the `CONTRACT_STATE_TYPE` macro form the build wrapper concretizes — identical to `qinit new`).
export interface Example {
  file: string;
  name: string;
  slot: number;
  source: string;
}

const counter = `// Counter — the minimal dynamic contract. State lives on-chain; a procedure mutates it,
// a function reads it. Compiles to wasm and runs in this page, byte-identical to the node.
using namespace QPI;

struct CONTRACT_STATE2_TYPE
{
};

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData
    {
        uint64 counter;
    };

    struct Inc_input {};
    struct Inc_output {};
    enum LogKind { CounterIncremented = 1 };
    struct CounterLog
    {
        uint32 _contractIndex;
        uint32 _type;
        uint64 value;
        sint8 _terminator;
    };
    struct Inc_locals { CounterLog log; };
    struct Get_input {};
    struct Get_output { uint64 value; };

    PUBLIC_PROCEDURE_WITH_LOCALS(Inc)
    {
        state.mut().counter += 1;
        locals.log._contractIndex = 0;
        locals.log._type = CounterIncremented;
        locals.log.value = state.get().counter;
        locals.log._terminator = 0;
        LOG_INFO(locals.log);
    }

    PUBLIC_FUNCTION(Get)
    {
        output.value = state.get().counter;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Inc, 1);
        REGISTER_USER_FUNCTION(Get, 1);
    }
};
`;

const adder = `// Adder — like Counter, but the procedure takes an input. The IDE builds a call form from the
// contract's IDL, so you can pass \`amount\` and read \`Total\` back, all in the browser.
using namespace QPI;

struct CONTRACT_STATE2_TYPE
{
};

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData
    {
        uint64 total;
    };

    struct Add_input { uint64 amount; };
    struct Add_output {};
    struct Total_input {};
    struct Total_output { uint64 value; };

    PUBLIC_PROCEDURE(Add)
    {
        state.mut().total += input.amount;
    }

    PUBLIC_FUNCTION(Total)
    {
        output.value = state.get().total;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Add, 1);
        REGISTER_USER_FUNCTION(Total, 1);
    }
};
`;

const bank = `// Bank — shows the two things the in-process debugger now traces: QPI logging and value transfers.
// Deposit credits your tx value to the contract and emits a LOG_INFO; Withdraw sends Qu back to you
// (a \`transfer\` host call) and logs it. Open the tx inspector after a call: you'll see the decoded log
// line and the host-call event listed beside the on-chain state diff.
using namespace QPI;

struct CONTRACT_STATE2_TYPE
{
};

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData
    {
        uint64 totalDeposited;
        uint64 depositCount;
    };

    // A QPI log message is any struct ending in \`sint8 _terminator\`. LOG_INFO emits the bytes before the
    // terminator; the debugger decodes them (matched by size) into named fields.
    struct MoveLog
    {
        id account;
        uint64 amount;
        sint8 _terminator;
    };

    struct Deposit_input {};
    struct Deposit_output {};
    struct Deposit_locals { MoveLog log; };

    struct Withdraw_input { uint64 amount; };
    struct Withdraw_output {};
    struct Withdraw_locals { MoveLog log; };

    struct Stats_input {};
    struct Stats_output
    {
        uint64 totalDeposited;
        uint64 depositCount;
    };

    PUBLIC_PROCEDURE_WITH_LOCALS(Deposit)
    {
        state.mut().totalDeposited += qpi.invocationReward();
        state.mut().depositCount += 1;

        locals.log.account = qpi.invocator();
        locals.log.amount = qpi.invocationReward();
        LOG_INFO(locals.log);
    }

    PUBLIC_PROCEDURE_WITH_LOCALS(Withdraw)
    {
        qpi.transfer(qpi.invocator(), input.amount);

        locals.log.account = qpi.invocator();
        locals.log.amount = input.amount;
        LOG_INFO(locals.log);
    }

    PUBLIC_FUNCTION(Stats)
    {
        output.totalDeposited = state.get().totalDeposited;
        output.depositCount = state.get().depositCount;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Deposit, 1);
        REGISTER_USER_PROCEDURE(Withdraw, 2);
        REGISTER_USER_FUNCTION(Stats, 1);
    }
};
`;

const token = `// Token — a richer contract for the step debugger. A HashMap ledger of balances, deposits that credit
// your tx value, internal Sends, Withdraw (a real \`transfer\` host call), and Burn (a \`burn\` host call),
// each with a LOG_INFO. Run a procedure, then "🐞 step debug" its tx: walk the StateData diff (the
// HashMap column changes), the host-event timeline, and the decoded log.
using namespace QPI;

struct CONTRACT_STATE2_TYPE
{
};

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData
    {
        HashMap<id, uint64, 1024> balances;
        uint64 totalDeposited;
        uint64 totalBurned;
    };

    // A QPI log message: any struct ending in \`sint8 _terminator\`. The debugger decodes the bytes before
    // it into named fields.
    struct MoveLog
    {
        id account;
        uint64 amount;
        sint8 _terminator;
    };

    struct Deposit_input {};
    struct Deposit_output { uint64 balance; };
    struct Deposit_locals
    {
        uint64 bal;
        MoveLog log;
    };

    struct Send_input
    {
        id to;
        uint64 amount;
    };
    struct Send_output { bit ok; };
    struct Send_locals
    {
        uint64 from;
        uint64 to;
        MoveLog log;
    };

    struct Withdraw_input { uint64 amount; };
    struct Withdraw_output { bit ok; };
    struct Withdraw_locals
    {
        uint64 bal;
        MoveLog log;
    };

    struct Burn_input { uint64 amount; };
    struct Burn_output {};
    struct Burn_locals {};

    struct BalanceOf_input { id who; };
    struct BalanceOf_output { uint64 balance; };
    struct BalanceOf_locals { uint64 bal; };

    // Credit the Qu you sent (value) to your ledger balance.
    PUBLIC_PROCEDURE_WITH_LOCALS(Deposit)
    {
        locals.bal = 0;
        state.get().balances.get(qpi.invocator(), locals.bal);
        state.mut().balances.set(qpi.invocator(), locals.bal + qpi.invocationReward());
        state.mut().totalDeposited += qpi.invocationReward();
        output.balance = locals.bal + qpi.invocationReward();

        locals.log.account = qpi.invocator();
        locals.log.amount = qpi.invocationReward();
        LOG_INFO(locals.log);
    }

    // Move ledger balance to another id (no Qu leaves the contract). Rejects (ok=0) if you're short.
    PUBLIC_PROCEDURE_WITH_LOCALS(Send)
    {
        output.ok = 0;
        locals.from = 0;
        state.get().balances.get(qpi.invocator(), locals.from);
        if (locals.from < input.amount)
        {
            return;
        }
        locals.to = 0;
        state.get().balances.get(input.to, locals.to);
        state.mut().balances.set(qpi.invocator(), locals.from - input.amount);
        state.mut().balances.set(input.to, locals.to + input.amount);
        output.ok = 1;

        locals.log.account = input.to;
        locals.log.amount = input.amount;
        LOG_INFO(locals.log);
    }

    // Cash ledger balance out as real Qu — a \`transfer\` host call you'll see in the debugger.
    PUBLIC_PROCEDURE_WITH_LOCALS(Withdraw)
    {
        output.ok = 0;
        locals.bal = 0;
        state.get().balances.get(qpi.invocator(), locals.bal);
        if (locals.bal < input.amount)
        {
            return;
        }
        state.mut().balances.set(qpi.invocator(), locals.bal - input.amount);
        qpi.transfer(qpi.invocator(), input.amount);
        output.ok = 1;

        locals.log.account = qpi.invocator();
        locals.log.amount = input.amount;
        LOG_INFO(locals.log);
    }

    // Burn Qu the contract holds — a \`burn\` host call.
    PUBLIC_PROCEDURE_WITH_LOCALS(Burn)
    {
        qpi.burn(input.amount);
        state.mut().totalBurned += input.amount;
    }

    PUBLIC_FUNCTION_WITH_LOCALS(BalanceOf)
    {
        locals.bal = 0;
        state.get().balances.get(input.who, locals.bal);
        output.balance = locals.bal;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Deposit, 1);
        REGISTER_USER_PROCEDURE(Send, 2);
        REGISTER_USER_PROCEDURE(Withdraw, 3);
        REGISTER_USER_PROCEDURE(Burn, 4);
        REGISTER_USER_FUNCTION(BalanceOf, 1);
    }
};
`;

const proxy = `// Proxy — an inter-contract contract. It calls the Counter contract using the upstream macros:
// ReadCounter reads Counter's value (CALL_OTHER_CONTRACT_FUNCTION), BumpCounter increments it
// (INVOKE_OTHER_CONTRACT_PROCEDURE). \`Counter\` resolves to the Counter.h file in this project; the IDE
// deploys it first at a LOWER slot (the qubic lower-index rule: a callee must sit below its caller), then
// deploys Proxy. Hit ▶ Compile & Run on this file and the whole graph deploys in one go.
using namespace QPI;

struct CONTRACT_STATE2_TYPE
{
};

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData
    {
        uint64 bumps;
    };

    struct ReadCounter_input {};
    struct ReadCounter_output { uint64 value; };
    struct ReadCounter_locals
    {
        Counter::Get_input gi;
        Counter::Get_output go;
    };

    struct BumpCounter_input {};
    struct BumpCounter_output {};
    struct BumpCounter_locals
    {
        Counter::Inc_input ii;
        Counter::Inc_output io;
    };

    // Cross-contract read: call Counter.Get and return its value.
    PUBLIC_FUNCTION_WITH_LOCALS(ReadCounter)
    {
        CALL_OTHER_CONTRACT_FUNCTION(Counter, Get, locals.gi, locals.go);
        output.value = locals.go.value;
    }

    // Cross-contract write: invoke Counter.Inc, then record that we did (reward 0).
    PUBLIC_PROCEDURE_WITH_LOCALS(BumpCounter)
    {
        INVOKE_OTHER_CONTRACT_PROCEDURE(Counter, Inc, locals.ii, locals.io, 0);
        state.mut().bumps += 1;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_FUNCTION(ReadCounter, 1);
        REGISTER_USER_PROCEDURE(BumpCounter, 1);
    }
};
`;

const shares = `// Shares — Qubic's native asset / share model (qpi.issueAsset + share transfer), so the ASSETS panel
// lights up. INITIALIZE mints a fixed "DEMO" asset to the contract (issuer = SELF); Issue mints a named
// asset to the caller; Transfer moves shares between holders. Watch the ASSETS panel after deploying.
using namespace QPI;

struct CONTRACT_STATE2_TYPE
{
};

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData
    {
        uint64 issuedCount;
    };

    struct Issue_input
    {
        uint64 assetName;
        sint64 numberOfShares;
    };
    struct Issue_output { sint64 issued; };

    struct Transfer_input
    {
        uint64 assetName;
        id issuer;
        id to;
        sint64 numberOfShares;
    };
    struct Transfer_output { sint64 moved; };

    struct SharesOf_input
    {
        uint64 assetName;
        id issuer;
        id who;
    };
    struct SharesOf_output { sint64 shares; };

    // Mint shares of an asset to the caller (issuer = invocator), managed by this contract.
    PUBLIC_PROCEDURE(Issue)
    {
        output.issued = qpi.issueAsset(input.assetName, qpi.invocator(), 0, input.numberOfShares, 0);
        state.mut().issuedCount += 1;
    }

    // Move shares the caller owns + possesses to another id.
    PUBLIC_PROCEDURE(Transfer)
    {
        output.moved = qpi.transferShareOwnershipAndPossession(input.assetName, input.issuer, qpi.invocator(), qpi.invocator(), input.numberOfShares, input.to);
    }

    PUBLIC_FUNCTION(SharesOf)
    {
        output.shares = qpi.numberOfPossessedShares(input.assetName, input.issuer, input.who, input.who, SELF_INDEX, SELF_INDEX);
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Issue, 1);
        REGISTER_USER_PROCEDURE(Transfer, 2);
        REGISTER_USER_FUNCTION(SharesOf, 1);
    }

    INITIALIZE()
    {
        qpi.issueAsset(0x4F4D4544, SELF, 0, 1000000, 0); // "DEMO", 1,000,000 shares to this contract
    }
};
`;

const equity = `// Equity — a company cap-table on Qubic's native asset model. INITIALIZE issues 1,000,000 "EQUITY" shares
// into the contract's own treasury (issuer = SELF); Grant moves shares from the treasury to a holder;
// SharesOf reads a holder's balance. Deploy it and watch the ASSETS panel — each Grant updates the holdings.
using namespace QPI;

struct CONTRACT_STATE2_TYPE
{
};

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData
    {
        uint64 grantCount;
    };

    struct Grant_input
    {
        id to;
        sint64 numberOfShares;
    };
    struct Grant_output { sint64 moved; };

    struct SharesOf_input { id holder; };
    struct SharesOf_output { sint64 shares; };

    // Move shares from the treasury (held + managed by this contract) to a holder.
    PUBLIC_PROCEDURE(Grant)
    {
        output.moved = qpi.transferShareOwnershipAndPossession(0x595449555145, SELF, SELF, SELF, input.numberOfShares, input.to);
        state.mut().grantCount += 1;
    }

    PUBLIC_FUNCTION(SharesOf)
    {
        output.shares = qpi.numberOfPossessedShares(0x595449555145, SELF, input.holder, input.holder, SELF_INDEX, SELF_INDEX);
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Grant, 1);
        REGISTER_USER_FUNCTION(SharesOf, 1);
    }

    INITIALIZE()
    {
        qpi.issueAsset(0x595449555145, SELF, 0, 1000000, 0); // "EQUITY", 1,000,000 shares into the treasury
    }
};
`;

const counterTest = `// The SAME test the qinit CLI runs under \`bun test\` — runs here in-page too. Compile & Run Counter first,
// then open this file and hit "▶ Run tests". The imports resolve to the node's generated client (./.qinit)
// under bun test, and to the in-page engine here. The chain is one fresh node for the file: state persists
// across tests, in order (call procedures to set it up — like a real node).
import { test, expect, beforeAll } from "bun:test";
import { Counter, provider } from "./.qinit";

let c: Counter;
beforeAll(() => { c = new Counter(provider()); });

test("Counter starts at zero and increments", async () => {
  expect((await c.Get()).value).toBe(0n);

  const r = await c.Inc();           // submits + auto-confirms (resolves once processed)
  expect(r.confirmed).toBe(true);
  expect((await c.Get()).value).toBe(1n);
});

test("increments again on the same chain", async () => {
  await c.Inc();
  expect((await c.Get()).value).toBe(2n);   // 2, not 1 — the chain persists across tests
});
`;

const counterGtest = `// Standard core-lite contract_testing.h gtest. The same source builds natively with
// core-lite and compiles in-browser through Qinit's TS gtest compiler.
#define NO_UEFI
#include "contract_testing.h"

class ContractTestingCounter : protected ContractTesting {
public:
    ContractTestingCounter() {
        initEmptySpectrum();
        initEmptyUniverse();
        INIT_CONTRACT(Counter);
        callSystemProcedure(Counter_CONTRACT_INDEX, INITIALIZE);
    }
    void fund(const id& account, uint64 amount) { increaseEnergy(account, amount); }
    Counter::Inc_output inc(const id& user, sint64 amount = 0) {
        Counter::Inc_input input{};
        Counter::Inc_output output{};
        invokeUserProcedure(Counter_CONTRACT_INDEX, 1, input, output, user, amount);
        return output;
    }
    Counter::Get_output get() const {
        Counter::Get_input input{};
        Counter::Get_output output{};
        callFunction(Counter_CONTRACT_INDEX, 1, input, output);
        return output;
    }
};

TEST(Counter, StartsAtZero) {
    ContractTestingCounter t;
    EXPECT_EQ(t.get().value, 0ull);
}

TEST(Counter, Increments) {
    ContractTestingCounter t;
    const id user = id::randomValue();
    t.fund(user, 1000000000);
    Counter::Inc_output ignored = t.inc(user);
    (void)ignored;
    EXPECT_EQ(((Counter::StateData*)contractStates[Counter_CONTRACT_INDEX])->counter, 1ull);
    EXPECT_EQ(t.get().value + 1ull, 2ull);
}

TEST(Counter, EachTestStartsFresh) {
    ContractTestingCounter t;
    Counter::Get_output output = t.get();
    EXPECT_EQ(output.value, 0ull);
}
`;

// The dev playground — every starter contract (used by the create button's bottom-right "dev" region).
export const EXAMPLES: Example[] = [
  { file: "Counter.h", name: "Counter", slot: 28, source: counter },
  { file: "Adder.h", name: "Adder", slot: 28, source: adder },
  { file: "Bank.h", name: "Bank", slot: 28, source: bank },
  { file: "Token.h", name: "Token", slot: 28, source: token },
  { file: "Proxy.h", name: "Proxy", slot: 29, source: proxy },
  { file: "Shares.h", name: "Shares", slot: 28, source: shares },
  { file: "Equity.h", name: "Equity", slot: 28, source: equity },
  { file: "Counter.test.ts", name: "Counter.test", slot: 0, source: counterTest },
];

// The standard project — one Counter contract + its TS test + its C++ gtest. The default for a new project.
export const STARTER: Example[] = [
  { file: "Counter.h", name: "Counter", slot: 28, source: counter },
  { file: "Counter.test.ts", name: "Counter.test", slot: 0, source: counterTest },
  { file: "Counter.test.cpp", name: "Counter.test", slot: 0, source: counterGtest },
];

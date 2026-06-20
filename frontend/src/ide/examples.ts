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
    struct Get_input {};
    struct Get_output { uint64 value; };

    PUBLIC_PROCEDURE(Inc)
    {
        state.mut().counter += 1;
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

    INITIALIZE()
    {
        state.mut().counter = 0;
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

    INITIALIZE()
    {
        state.mut().total = 0;
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
    struct Stats_output { uint64 totalDeposited; uint64 depositCount; };

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

    INITIALIZE()
    {
        state.mut().totalDeposited = 0;
        state.mut().depositCount = 0;
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
    struct Deposit_locals { uint64 bal; MoveLog log; };

    struct Send_input { id to; uint64 amount; };
    struct Send_output { bit ok; };
    struct Send_locals { uint64 from; uint64 to; MoveLog log; };

    struct Withdraw_input { uint64 amount; };
    struct Withdraw_output { bit ok; };
    struct Withdraw_locals { uint64 bal; MoveLog log; };

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

    INITIALIZE()
    {
        state.mut().totalDeposited = 0;
        state.mut().totalBurned = 0;
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
    struct ReadCounter_locals { Counter::Get_input gi; Counter::Get_output go; };

    struct BumpCounter_input {};
    struct BumpCounter_output {};
    struct BumpCounter_locals { Counter::Inc_input ii; Counter::Inc_output io; };

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

    INITIALIZE()
    {
        state.mut().bumps = 0;
    }
};
`;

export const EXAMPLES: Example[] = [
  { file: "Counter.h", name: "Counter", slot: 28, source: counter },
  { file: "Adder.h", name: "Adder", slot: 28, source: adder },
  { file: "Bank.h", name: "Bank", slot: 28, source: bank },
  { file: "Token.h", name: "Token", slot: 28, source: token },
  { file: "Proxy.h", name: "Proxy", slot: 29, source: proxy },
];

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

export const EXAMPLES: Example[] = [
  { file: "Counter.h", name: "Counter", slot: 28, source: counter },
  { file: "Adder.h", name: "Adder", slot: 28, source: adder },
  { file: "Bank.h", name: "Bank", slot: 28, source: bank },
];

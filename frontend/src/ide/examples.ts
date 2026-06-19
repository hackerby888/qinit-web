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

export const EXAMPLES: Example[] = [
  { file: "Counter.h", name: "Counter", slot: 28, source: counter },
  { file: "Adder.h", name: "Adder", slot: 28, source: adder },
];

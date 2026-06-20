// The QPI vocabulary, in one place — consumed by both the Monarch grammar (grammar.ts, for syntax
// coloring) and the completion provider (snippets.ts, for the type suggestions). Verified against the
// core-lite header snapshot (~/.cache/qinit/qinit-v0.0.32/core-headers/src/contracts/qpi.h).

// Scalar + container types a contract declares (StateData fields, _input/_output structs). Coloured as
// `type.qpi`, distinct from the C++ built-in types.
export const QPI_TYPES = [
  "uint8", "uint16", "uint32", "uint64", "uint128",
  "sint8", "sint16", "sint32", "sint64",
  "bit", "id", "m256i",
  "Array", "BitArray", "SlowAnySizeArray", "HashMap", "HashSet", "Collection", "LinkedList", "ProposalVoting",
  "Asset", "Entity", "ContractBase", "NoData", "ProposalAndVotingByComputors",
];

// The contract-shape macros — entry-point declarations, lifecycle hooks, registration, logging, and the
// build-wrapper magic identifiers. Coloured as `annotation` (they read like decorators on the contract).
export const QPI_MACROS = [
  "PUBLIC_FUNCTION", "PUBLIC_FUNCTION_WITH_LOCALS",
  "PUBLIC_PROCEDURE", "PUBLIC_PROCEDURE_WITH_LOCALS",
  "PRIVATE_FUNCTION", "PRIVATE_FUNCTION_WITH_LOCALS",
  "PRIVATE_PROCEDURE", "PRIVATE_PROCEDURE_WITH_LOCALS",
  "INITIALIZE",
  "BEGIN_EPOCH", "END_EPOCH", "BEGIN_TICK", "END_TICK",
  "PRE_ACQUIRE_SHARES", "PRE_RELEASE_SHARES", "POST_ACQUIRE_SHARES", "POST_RELEASE_SHARES",
  "POST_INCOMING_TRANSFER", "SET_SHAREHOLDER_PROPOSAL", "SET_SHAREHOLDER_VOTES", "EXPAND",
  "REGISTER_USER_FUNCTIONS_AND_PROCEDURES", "REGISTER_USER_FUNCTION", "REGISTER_USER_PROCEDURE",
  "LOG_INFO", "LOG_DEBUG", "LOG_WARNING", "LOG_ERROR", "LOG_PAUSE", "LOG_RESUME",
  "STATIC_ASSERT",
  "CONTRACT_STATE_TYPE", "CONTRACT_STATE2_TYPE", "CONTRACT_INDEX",
];

// The framework-provided locals every entry body sees — the QPI context object and the marshalled
// state/io/locals references. Coloured as `variable.predefined`.
export const QPI_BUILTINS = [
  "qpi", "state", "input", "output", "locals",
];

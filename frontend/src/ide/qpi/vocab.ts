// The QPI vocabulary, in one place — consumed by both the Monarch grammar (grammar.ts, for syntax
// coloring) and the completion provider (snippets.ts, for the type suggestions). Verified against the
// core-lite header snapshot (~/.cache/qinit/qinit-v0.0.32/core-headers/src/qpi/qpi.h).

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
  "CALL_OTHER_CONTRACT_FUNCTION", "CALL_OTHER_CONTRACT_FUNCTION_E",
  "INVOKE_OTHER_CONTRACT_PROCEDURE", "INVOKE_OTHER_CONTRACT_PROCEDURE_E",
  "LOG_INFO", "LOG_DEBUG", "LOG_WARNING", "LOG_ERROR", "LOG_PAUSE", "LOG_RESUME",
  "STATIC_ASSERT",
  "CONTRACT_STATE_TYPE", "CONTRACT_STATE2_TYPE", "CONTRACT_INDEX",
  // Cheatcodes: dev-only, stripped before a contract is submitted to Core.
  "CC_PRINT", "CC_ASSERT", "CC_PAY", "CC_DEAL", "CC_WARP_TICK", "CC_WARP_EPOCH", "CC_PRANK", "CC_UNPRANK",
];

// The framework-provided locals every entry body sees — the QPI context object and the marshalled
// state/io/locals references. Coloured as `variable.predefined`.
export const QPI_BUILTINS = [
  "qpi", "state", "input", "output", "locals",
];

// The core-lite gtest harness vocabulary — coloured like the contract macros
// (`annotation`). Only meaningful in a .cpp test; harmless on a contract (these never appear there).
export const QPI_GTEST = [
  "TEST",
  "EXPECT_EQ", "EXPECT_NE", "EXPECT_LT", "EXPECT_LE", "EXPECT_GT", "EXPECT_GE", "EXPECT_TRUE", "EXPECT_FALSE",
  "ASSERT_EQ", "ASSERT_NE", "ASSERT_LT", "ASSERT_LE", "ASSERT_GT", "ASSERT_GE", "ASSERT_TRUE", "ASSERT_FALSE",
  "ContractTesting",
];

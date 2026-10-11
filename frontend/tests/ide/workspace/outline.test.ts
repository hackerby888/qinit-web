// parseOutline is the regex symbol extractor behind the IDE outline panel + click-to-jump (no compile, so it
// tracks the live buffer). These lock the brace-matching and macro-matching against regressions.
import { test, expect } from "bun:test";
import { parseOutline } from "../../../src/ide/workspace/outline";

const SRC = `using namespace QPI;
struct Asset : public ContractBase {
  struct StateData {
    uint64 supply;
    id owner;
    Array<uint64, 8> ledger;
    struct Nested { uint64 leak; } nested;
  };
  struct Issue_input {}; struct Issue_output {};
  struct Burn_input {}; struct Burn_output {};
  struct Total_input {}; struct Total_output { uint64 n; };
  PUBLIC_PROCEDURE(Issue) { }
  PUBLIC_PROCEDURE_WITH_LOCALS(Burn) { }
  PRIVATE_FUNCTION(Total) { }
  PUBLIC_FUNCTION(Supply) { }
  REGISTER_USER_FUNCTIONS_AND_PROCEDURES() { }
  INITIALIZE() { }
};`;

test("parseOutline extracts StateData scalar/array fields and skips a nested struct's members", () => {
  const o = parseOutline(SRC);
  expect(o.state).toEqual(["supply", "owner", "ledger", "nested"]); // "leak" stays inside the nested brace
});

test("parseOutline lists functions and procedures, including the _WITH_LOCALS macro variant", () => {
  const o = parseOutline(SRC);
  expect(o.procedures).toEqual(["Issue", "Burn"]);
  expect(o.functions).toEqual(["Total", "Supply"]);
});

test("parseOutline returns empty groups when StateData and the macros are absent", () => {
  const o = parseOutline("struct Bare : public ContractBase {};");
  expect(o).toEqual({ state: [], functions: [], procedures: [] });
});

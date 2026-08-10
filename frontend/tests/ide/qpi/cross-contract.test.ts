import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  crossContractCompletionAt,
  crossContractDefinitionAt,
  crossContractHoverAt,
  crossContractSignatureAt,
  isCrossContractCompletionAt,
  qpiWorkspaceContracts,
  setQpiWorkspaceFiles,
} from "../../../src/ide/qpi/cross-contract";
import { QPI_MACROS } from "../../../src/ide/qpi/vocab";
import { at } from "./test-helpers";

const COUNTER = `using namespace QPI;

struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData { uint64 counter; };
    struct Get_input {};
    struct Get_output { uint64 value; };
    struct Inc_input {};
    struct Inc_output {};
    struct Ignored_input {};
    struct Ignored_output {};
    struct Hidden_input {};
    struct Hidden_output {};

    PUBLIC_FUNCTION(Get) {}
    PUBLIC_PROCEDURE(Inc) {}
    PUBLIC_FUNCTION(Ignored) {}
    PRIVATE_FUNCTION(Hidden) {}

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_FUNCTION(Get, 1);
        REGISTER_USER_PROCEDURE(Inc, 1);
        REGISTER_USER_FUNCTION(Hidden, 2);
    }
};`;

const PROXY = `using namespace QPI;
struct CONTRACT_STATE_TYPE : public ContractBase
{
    struct StateData {};
};`;

beforeEach(() => {
  setQpiWorkspaceFiles([
    { name: "contracts/Counter.h", source: COUNTER },
    { name: "Proxy.h", source: PROXY },
    { name: "Counter.test.cpp", source: "TEST(Counter, Get) {}" },
  ]);
});

afterEach(() => setQpiWorkspaceFiles([]));

const labelsAt = (fixture: string, file = "/Proxy.h"): string[] => {
  const { src, offset } = at(fixture);
  return crossContractCompletionAt(src, offset, file).map((item) => item.label);
};

describe("workspace index", () => {
  test("indexes contract headers by basename and only exposes public registered entries", () => {
    expect(qpiWorkspaceContracts().map((contract) => contract.name)).toEqual(["Counter", "Proxy"]);
    const counter = qpiWorkspaceContracts()[0];
    expect(counter.functions.map((entry) => entry.name)).toEqual(["Get"]);
    expect(counter.procedures.map((entry) => entry.name)).toEqual(["Inc"]);
  });

  test("updates immediately when a project source changes", () => {
    setQpiWorkspaceFiles([{ name: "Counter.h", source: COUNTER.replace("PUBLIC_FUNCTION(Get)", "PUBLIC_FUNCTION(Read)") }]);
    expect(qpiWorkspaceContracts()[0].functions.map((entry) => entry.name)).toEqual([]);
  });
});

describe("cross-contract completion", () => {
  test("offers other project contracts for the first macro argument", () => {
    expect(labelsAt("CALL_OTHER_CONTRACT_FUNCTION(|")).toEqual(["Counter"]);
  });

  test("filters the second argument by operation kind", () => {
    expect(labelsAt("CALL_OTHER_CONTRACT_FUNCTION(Counter, |")).toEqual(["Get"]);
    expect(labelsAt("INVOKE_OTHER_CONTRACT_PROCEDURE(Counter, |")).toEqual(["Inc"]);
    expect(labelsAt("INVOKE_OTHER_CONTRACT_PROCEDURE_E(Counter, |")).toEqual(["Inc"]);
  });

  test("offers public entry IO types after a callee qualifier", () => {
    expect(labelsAt("Counter::|")).toEqual(["Get_input", "Get_output", "Inc_input", "Inc_output"]);
  });

  test("does not claim a completion context inside a comment", () => {
    const { src, offset } = at("// CALL_OTHER_CONTRACT_FUNCTION(Counter, |");
    expect(isCrossContractCompletionAt(src, offset)).toBe(false);
  });

  test("cross-contract macros are part of the highlighted QPI vocabulary", () => {
    expect(QPI_MACROS).toContain("CALL_OTHER_CONTRACT_FUNCTION");
    expect(QPI_MACROS).toContain("CALL_OTHER_CONTRACT_FUNCTION_E");
    expect(QPI_MACROS).toContain("INVOKE_OTHER_CONTRACT_PROCEDURE");
    expect(QPI_MACROS).toContain("INVOKE_OTHER_CONTRACT_PROCEDURE_E");
  });
});

describe("signature, hover, and definition", () => {
  test("tracks the active cross-contract macro argument", () => {
    const { src, offset } = at("CALL_OTHER_CONTRACT_FUNCTION(Counter, |");
    const signature = crossContractSignatureAt(src, offset)!;
    expect(signature.label).toBe("CALL_OTHER_CONTRACT_FUNCTION(contract, function, input, output)");
    expect(signature.active).toBe(1);
  });

  test("describes a referenced callee entry", () => {
    const src = "CALL_OTHER_CONTRACT_FUNCTION(Counter, Get, input, output);";
    const hover = crossContractHoverAt(src, src.indexOf("Get") + 1)!;
    expect(hover.title).toContain("Counter function");
    expect(hover.detail).toContain("Counter::Get_input");
  });

  test("resolves a callee and its entry into the target project file", () => {
    const src = "CALL_OTHER_CONTRACT_FUNCTION(Counter, Get, input, output);";
    const contract = crossContractDefinitionAt(src, src.indexOf("Counter") + 1)!;
    const entry = crossContractDefinitionAt(src, src.indexOf("Get") + 1)!;

    expect(contract.file).toBe("contracts/Counter.h");
    expect(contract.source.slice(contract.offset, contract.offset + contract.length)).toBe("CONTRACT_STATE_TYPE");
    expect(entry.source.slice(entry.offset, entry.offset + entry.length)).toBe("Get");
  });

  test("resolves a qualified IO type into the callee source", () => {
    const src = "Counter::Get_input value;";
    const target = crossContractDefinitionAt(src, src.indexOf("Get_input") + 1)!;
    expect(target.file).toBe("contracts/Counter.h");
    expect(target.source.slice(target.offset, target.offset + target.length)).toBe("Get_input");
  });

  test("does not resolve unknown or wrong-kind callee symbols", () => {
    const wrongKind = "CALL_OTHER_CONTRACT_FUNCTION(Counter, Inc, input, output);";
    const unknownType = "Counter::Missing_type value;";
    expect(crossContractDefinitionAt(wrongKind, wrongKind.indexOf("Inc") + 1)).toBeNull();
    expect(crossContractDefinitionAt(unknownType, unknownType.indexOf("Missing_type") + 1)).toBeNull();
  });
});

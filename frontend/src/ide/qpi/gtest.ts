// A core-lite contract_testing.h gtest file is not a qpi.h contract, so the QPI linter and the contract
// providers skip it. The IDE does not run these files: `qinit gtest` does, on your machine.
import type * as Monaco from "monaco-editor";

// A gtest test model: its file is a .cpp/.cc/.cxx, or it includes the core harness / uses TEST().
export function isGtestModel(model: Monaco.editor.ITextModel): boolean {
  if (/\.(cpp|cc|cxx)$/.test(model.uri?.path ?? "")) {
    return true;
  }
  return /#include\s+["<][^">]*contract_testing\.h|(^|\n)\s*TEST\s*\(|\bContractTesting\b/.test(model.getValue());
}

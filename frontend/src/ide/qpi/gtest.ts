// Editor support for core-lite contract_testing.h gtest files. A test is NOT a qpi.h
// contract, so the QPI linter + contract providers are wrong on it. This module provides:
//   (1) isGtestModel() — the contract providers/linter call it to SKIP a test model;
//   (2) a completion provider for tests: the gtest macros, ContractTesting fixtures (member completion
//       after `<var>.`), and — from the deployed contracts' IDLs — the contract's <Name>::Entry_input /
//       _output structs + StateData. The C++ analogue of how .ts tests get genQinitDts.
import type * as Monaco from "monaco-editor";
import type { ContractIdlView as ContractIdl } from "../idl-view";

// A gtest test model: its file is a .cpp/.cc/.cxx, or it includes the core harness / uses TEST().
export function isGtestModel(model: Monaco.editor.ITextModel): boolean {
  if (/\.(cpp|cc|cxx)$/.test(model.uri?.path ?? "")) {
    return true;
  }
  return /#include\s+["<][^">]*contract_testing\.h|(^|\n)\s*TEST\s*\(|\bContractTesting\b/.test(model.getValue());
}

// The deployed contracts' IDLs (fed by the IDE, mirroring updateQinitTypes -> genQinitDts) — drive the
// contract-type completions inside a test.
let g_idls: ContractIdl[] = [];
export function setGtestIdls(idls: ContractIdl[]): void {
  g_idls = idls;
}

const MACROS: Array<{ label: string; insert: string; doc: string }> = [
  { label: "TEST", insert: "TEST(${1:Suite}, ${2:Name}) {\n\tContractTesting${1:Suite} t;\n\t$0\n}", doc: "A core-lite GoogleTest case using the contract fixture." },
  { label: "EXPECT_EQ", insert: "EXPECT_EQ(${1:actual}, ${2:expected});", doc: "Non-fatal equality check." },
  { label: "EXPECT_NE", insert: "EXPECT_NE(${1:a}, ${2:b});", doc: "Non-fatal inequality check." },
  { label: "EXPECT_LT", insert: "EXPECT_LT(${1:a}, ${2:b});", doc: "Non-fatal a < b." },
  { label: "EXPECT_LE", insert: "EXPECT_LE(${1:a}, ${2:b});", doc: "Non-fatal a <= b." },
  { label: "EXPECT_GT", insert: "EXPECT_GT(${1:a}, ${2:b});", doc: "Non-fatal a > b." },
  { label: "EXPECT_GE", insert: "EXPECT_GE(${1:a}, ${2:b});", doc: "Non-fatal a >= b." },
  { label: "EXPECT_TRUE", insert: "EXPECT_TRUE(${1:cond});", doc: "Non-fatal truthiness check." },
  { label: "EXPECT_FALSE", insert: "EXPECT_FALSE(${1:cond});", doc: "Non-fatal falsiness check." },
  { label: "ASSERT_EQ", insert: "ASSERT_EQ(${1:actual}, ${2:expected});", doc: "Fatal equality check (returns on failure)." },
  { label: "ASSERT_TRUE", insert: "ASSERT_TRUE(${1:cond});", doc: "Fatal truthiness check (returns on failure)." },
  { label: "ASSERT_FALSE", insert: "ASSERT_FALSE(${1:cond});", doc: "Fatal falsiness check (returns on failure)." },
];

// Core ContractTesting methods — fixture-specific wrappers remain normal C++ member completion.
const METHODS: Array<{ label: string; insert: string; doc: string }> = [
  { label: "invokeUserProcedure", insert: "invokeUserProcedure(${1:contractIndex}, ${2:inputType}, ${3:input}, ${4:output}, ${5:user}, ${6:amount})", doc: "Invoke a user procedure through the core test harness." },
  { label: "callFunction", insert: "callFunction(${1:contractIndex}, ${2:inputType}, ${3:input}, ${4:output})", doc: "Call a user function through the core test harness." },
  { label: "callSystemProcedure", insert: "callSystemProcedure(${1:contractIndex}, ${2:INITIALIZE})", doc: "Call a contract system procedure." },
  { label: "initEmptySpectrum", insert: "initEmptySpectrum()", doc: "Initialize an empty spectrum for the fixture." },
  { label: "initEmptyUniverse", insert: "initEmptyUniverse()", doc: "Initialize an empty asset universe for the fixture." },
];

let registered = false;

export function registerQpiGtest(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  const snip = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  monaco.languages.registerCompletionItemProvider("cpp", {
    triggerCharacters: ["."],
    provideCompletionItems(model, position) {
      if (!isGtestModel(model)) {
        return { suggestions: [] };
      }

      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const before = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
      const src = model.getValue();

      // `<var>.` — if <var> was declared as a ContractTesting-derived fixture, offer core harness members.
      // receiver gets nothing (don't pollute member completion with our top-level items).
      const dot = before.match(/(\w+)\s*\.\s*\w*$/);
      if (dot) {
        if (new RegExp(`\\bContractTesting[A-Za-z_0-9]*\\s+${dot[1]}\\b`).test(src)) {
          return {
            suggestions: METHODS.map((m) => ({
              label: m.label,
              kind: monaco.languages.CompletionItemKind.Method,
              insertText: m.insert,
              insertTextRules: snip,
              documentation: m.doc,
              range,
            })),
          };
        }
        return { suggestions: [] };
      }

      const suggestions: Monaco.languages.CompletionItem[] = [];
      for (const m of MACROS) {
        suggestions.push({ label: m.label, kind: monaco.languages.CompletionItemKind.Snippet, insertText: m.insert, insertTextRules: snip, documentation: m.doc, range });
      }
      suggestions.push({ label: "ContractTesting", kind: monaco.languages.CompletionItemKind.Class, insertText: "ContractTesting${1:Contract} ${2:t};", insertTextRules: snip, documentation: "A fixture derived from core-lite ContractTesting.", range });

      // Contract types from the deployed IDLs: <Name>::Entry_input/_output (+ inputType id) and StateData.
      for (const idl of g_idls) {
        const add = (label: string, detail: string, kind: Monaco.languages.CompletionItemKind) => suggestions.push({ label, detail, kind, insertText: label, range });
        if (idl.state && idl.state.length) {
          add(`${idl.name}::StateData`, "contract state", monaco.languages.CompletionItemKind.Struct);
        }
        for (const [it, e] of Object.entries(idl.procedures)) {
          add(`${idl.name}::${e.name}_input`, `procedure it=${it}`, monaco.languages.CompletionItemKind.Struct);
          add(`${idl.name}::${e.name}_output`, `procedure it=${it}`, monaco.languages.CompletionItemKind.Struct);
        }
        for (const [it, e] of Object.entries(idl.functions)) {
          add(`${idl.name}::${e.name}_input`, `function it=${it}`, monaco.languages.CompletionItemKind.Struct);
          add(`${idl.name}::${e.name}_output`, `function it=${it}`, monaco.languages.CompletionItemKind.Struct);
        }
      }

      return { suggestions };
    },
  });
}

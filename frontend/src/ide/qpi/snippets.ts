// QPI completion: snippets for the contract macros (PUBLIC_PROCEDURE / _WITH_LOCALS / REGISTER_* / a
// whole-contract skeleton) plus the QPI scalar/container types. The qinit VS Code extension leans on
// clangd for member completion; this is the lightweight, in-page surface (clangd parity is Phase 2).
import type * as Monaco from "monaco-editor";
import { QPI_TYPES } from "./vocab";

interface Snip {
  label: string;
  detail: string;
  doc: string;
  insertText: string;
}

const CONTRACT_SKELETON = [
  "using namespace QPI;",
  "",
  "struct CONTRACT_STATE2_TYPE",
  "{",
  "};",
  "",
  "struct CONTRACT_STATE_TYPE : public ContractBase",
  "{",
  "\tstruct StateData",
  "\t{",
  "\t\t${1:uint64 value;}",
  "\t};",
  "",
  "\tstruct ${2:Do}_input {};",
  "\tstruct ${2:Do}_output {};",
  "",
  "\tPUBLIC_PROCEDURE(${2:Do})",
  "\t{",
  "\t\t$0",
  "\t}",
  "",
  "\tREGISTER_USER_FUNCTIONS_AND_PROCEDURES()",
  "\t{",
  "\t\tREGISTER_USER_PROCEDURE(${2:Do}, 1);",
  "\t}",
  "",
  "\tINITIALIZE()",
  "\t{",
  "\t}",
  "};",
].join("\n");

const SNIPPETS: Snip[] = [
  { label: "qpi-contract", detail: "Contract skeleton", doc: "A complete dynamic-contract skeleton (state, a procedure, register, initialize).", insertText: CONTRACT_SKELETON },
  { label: "qpi-procedure", detail: "PUBLIC_PROCEDURE", doc: "A public procedure — mutates state, no locals, no return.", insertText: "PUBLIC_PROCEDURE(${1:Name})\n{\n\t$0\n}" },
  { label: "qpi-function", detail: "PUBLIC_FUNCTION", doc: "A public function — reads state, no locals, sets output.", insertText: "PUBLIC_FUNCTION(${1:Name})\n{\n\t$0\n}" },
  { label: "qpi-procedure-locals", detail: "PUBLIC_PROCEDURE_WITH_LOCALS", doc: "A public procedure that needs locals — declare them in a <Name>_locals struct, access via `locals.`.", insertText: "PUBLIC_PROCEDURE_WITH_LOCALS(${1:Name})\n{\n\t$0\n}" },
  { label: "qpi-function-locals", detail: "PUBLIC_FUNCTION_WITH_LOCALS", doc: "A public function that needs locals — declare them in a <Name>_locals struct.", insertText: "PUBLIC_FUNCTION_WITH_LOCALS(${1:Name})\n{\n\t$0\n}" },
  { label: "qpi-register", detail: "REGISTER_USER_FUNCTIONS_AND_PROCEDURES", doc: "Register functions/procedures so they're callable on-chain by index.", insertText: "REGISTER_USER_FUNCTIONS_AND_PROCEDURES()\n{\n\tREGISTER_USER_PROCEDURE(${1:Proc}, ${2:1});\n\tREGISTER_USER_FUNCTION(${3:Func}, ${4:1});\n}" },
  { label: "qpi-initialize", detail: "INITIALIZE", doc: "The constructor hook — set initial state.", insertText: "INITIALIZE()\n{\n\t$0\n}" },
  { label: "qpi-state", detail: "StateData", doc: "On-chain state struct.", insertText: "struct StateData\n{\n\t$0\n};" },
];

let registered = false;

export function registerQpiSnippets(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerCompletionItemProvider("cpp", {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);

      // After a `.` the member-completion provider owns the list — don't flood it with snippets/types.
      const before = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: Math.max(1, word.startColumn - 1), endLineNumber: position.lineNumber, endColumn: word.startColumn });
      if (before === ".") {
        return { suggestions: [] };
      }

      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const snippets: Monaco.languages.CompletionItem[] = SNIPPETS.map((s) => ({
        label: s.label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: s.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: s.doc,
        detail: s.detail,
        range,
      }));

      const types: Monaco.languages.CompletionItem[] = QPI_TYPES.map((t) => ({
        label: t,
        kind: monaco.languages.CompletionItemKind.TypeParameter,
        insertText: t,
        detail: "QPI type",
        range,
      }));

      return { suggestions: [...snippets, ...types] };
    },
  });
}

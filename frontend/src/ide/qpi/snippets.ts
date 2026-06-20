// QPI completion: snippets for the contract entry macros (PUBLIC_PROCEDURE / _WITH_LOCALS / REGISTER_* /
// INITIALIZE), the QPI scalar/container types, and the framework builtins (state / input / output /
// locals / qpi). Member access off these is resolved separately in ./members.
import type * as Monaco from "monaco-editor";
import { QPI_TYPES, QPI_BUILTINS } from "./vocab";

interface Snip {
  label: string;
  detail: string;
  doc: string;
  insertText: string;
}

const SNIPPETS: Snip[] = [
  { label: "qpi-procedure", detail: "PUBLIC_PROCEDURE", doc: "A public procedure — mutates state, no locals, no return.", insertText: "PUBLIC_PROCEDURE(${1:Name})\n{\n\t$0\n}" },
  { label: "qpi-function", detail: "PUBLIC_FUNCTION", doc: "A public function — reads state, no locals, sets output.", insertText: "PUBLIC_FUNCTION(${1:Name})\n{\n\t$0\n}" },
  { label: "qpi-procedure-locals", detail: "PUBLIC_PROCEDURE_WITH_LOCALS", doc: "A public procedure that needs locals — declare them in a <Name>_locals struct, access via `locals.`.", insertText: "PUBLIC_PROCEDURE_WITH_LOCALS(${1:Name})\n{\n\t$0\n}" },
  { label: "qpi-function-locals", detail: "PUBLIC_FUNCTION_WITH_LOCALS", doc: "A public function that needs locals — declare them in a <Name>_locals struct.", insertText: "PUBLIC_FUNCTION_WITH_LOCALS(${1:Name})\n{\n\t$0\n}" },
  { label: "qpi-register", detail: "REGISTER_USER_FUNCTIONS_AND_PROCEDURES", doc: "Register functions/procedures so they're callable on-chain by index.", insertText: "REGISTER_USER_FUNCTIONS_AND_PROCEDURES()\n{\n\tREGISTER_USER_PROCEDURE(${1:Proc}, ${2:1});\n\tREGISTER_USER_FUNCTION(${3:Func}, ${4:1});\n}" },
  { label: "qpi-initialize", detail: "INITIALIZE", doc: "The constructor hook — set initial state.", insertText: "INITIALIZE()\n{\n\t$0\n}" },
];

// The framework locals a contract body refers to — completed as plain identifiers (typing `stat` → `state`).
const BUILTIN_DOC: Record<string, string> = {
  qpi: "the QPI host API (transfer, invocator, …)",
  state: "contract state — .mut() to write, .get() to read",
  input: "the call's input struct",
  output: "the call's output struct",
  locals: "the entry's locals struct (WITH_LOCALS)",
};

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

      const builtins: Monaco.languages.CompletionItem[] = QPI_BUILTINS.map((b) => ({
        label: b,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: b,
        detail: BUILTIN_DOC[b] ?? "QPI",
        range,
      }));

      return { suggestions: [...snippets, ...types, ...builtins] };
    },
  });
}

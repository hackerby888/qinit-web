// QPI completion: the contract macros (typing `PUBLIC_PROCEDURE` / `REGISTER_…` / `LOG_…` completes the
// real macro name with a body/arg snippet), the QPI scalar/container types, and the framework builtins
// (state / input / output / locals / qpi). Member access off these is resolved separately in ./members.
import type * as Monaco from "monaco-editor";
import { QPI_TYPES, QPI_BUILTINS, QPI_MACROS } from "./vocab";
import { enclosingEntry, collectStructs } from "./members";

// `locals` only makes sense inside a _WITH_LOCALS entry that declares a <Name>_locals struct.
function localsAvailable(model: Monaco.editor.ITextModel, position: Monaco.Position): boolean {
  const entry = enclosingEntry(model.getValue(), model.getOffsetAt(position));
  return !!entry && entry.macro.endsWith("_WITH_LOCALS") && collectStructs(model.getValue()).has(entry.base + "_locals");
}

// Macros that open a `{ … }` body: entry points take a Name arg, lifecycle/registration hooks take none.
const ENTRY_MACROS = new Set([
  "PUBLIC_PROCEDURE", "PUBLIC_FUNCTION", "PUBLIC_PROCEDURE_WITH_LOCALS", "PUBLIC_FUNCTION_WITH_LOCALS",
  "PRIVATE_PROCEDURE", "PRIVATE_FUNCTION", "PRIVATE_PROCEDURE_WITH_LOCALS", "PRIVATE_FUNCTION_WITH_LOCALS",
]);
const HOOK_MACROS = new Set([
  "INITIALIZE", "BEGIN_EPOCH", "END_EPOCH", "BEGIN_TICK", "END_TICK", "POST_INCOMING_TRANSFER",
  "PRE_ACQUIRE_SHARES", "PRE_RELEASE_SHARES", "POST_ACQUIRE_SHARES", "POST_RELEASE_SHARES",
  "SET_SHAREHOLDER_PROPOSAL", "SET_SHAREHOLDER_VOTES", "EXPAND", "REGISTER_USER_FUNCTIONS_AND_PROCEDURES",
]);
// Macros that expand to a single statement.
const CALL_MACROS: Record<string, string> = {
  REGISTER_USER_PROCEDURE: "REGISTER_USER_PROCEDURE(${1:Name}, ${2:1});",
  REGISTER_USER_FUNCTION: "REGISTER_USER_FUNCTION(${1:Name}, ${2:1});",
  LOG_INFO: "LOG_INFO(${1:message});",
  LOG_DEBUG: "LOG_DEBUG(${1:message});",
  LOG_WARNING: "LOG_WARNING(${1:message});",
  LOG_ERROR: "LOG_ERROR(${1:message});",
  LOG_PAUSE: "LOG_PAUSE();",
  LOG_RESUME: "LOG_RESUME();",
  STATIC_ASSERT: "STATIC_ASSERT(${1:condition});",
};

// The insert text for a macro completion: a body scaffold, a statement, or the bare name (e.g. the
// CONTRACT_STATE_TYPE wrapper identifiers). `snippet` => the text has ${…} tab stops.
function macroInsert(name: string): { insert: string; snippet: boolean } {
  if (name in CALL_MACROS) {
    return { insert: CALL_MACROS[name], snippet: true };
  }
  if (ENTRY_MACROS.has(name)) {
    return { insert: name + "(${1:Name})\n{\n\t$0\n}", snippet: true };
  }
  if (HOOK_MACROS.has(name)) {
    return { insert: name + "()\n{\n\t$0\n}", snippet: true };
  }
  return { insert: name, snippet: false };
}

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

      const macros: Monaco.languages.CompletionItem[] = QPI_MACROS.map((name) => {
        const { insert, snippet } = macroInsert(name);
        return {
          label: name,
          kind: snippet ? monaco.languages.CompletionItemKind.Snippet : monaco.languages.CompletionItemKind.Keyword,
          insertText: insert,
          insertTextRules: snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          detail: "QPI macro",
          range,
        };
      });

      const types: Monaco.languages.CompletionItem[] = QPI_TYPES.map((t) => ({
        label: t,
        kind: monaco.languages.CompletionItemKind.TypeParameter,
        insertText: t,
        detail: "QPI type",
        range,
      }));

      const showLocals = localsAvailable(model, position);
      const builtins: Monaco.languages.CompletionItem[] = QPI_BUILTINS.filter((b) => b !== "locals" || showLocals).map((b) => ({
        label: b,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: b,
        detail: BUILTIN_DOC[b] ?? "QPI",
        range,
      }));

      return { suggestions: [...macros, ...types, ...builtins] };
    },
  });
}

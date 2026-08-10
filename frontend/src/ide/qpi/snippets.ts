// QPI completion: the contract macros (typing `PUBLIC_PROCEDURE` / `REGISTER_…` / `LOG_…` completes the
// real macro name with a body/arg snippet), the QPI scalar/container types, and the framework builtins
// (state / input / output / locals / qpi). Member access off these is resolved separately in ./members.
import type * as Monaco from "monaco-editor";
import { isGtestModel } from "./gtest";
import { QPI_TYPES, QPI_BUILTINS, QPI_MACROS } from "./vocab";
import { enclosingEntry, collectStructs, isUserEntry } from "./members";
import { isCrossContractCompletionAt } from "./cross-contract";

// The framework builtins (qpi / state / input / output / locals) that are in scope at `offset` — pure, no
// Monaco. All require being inside an entry body (out of scope in StateData / the REGISTER block / top
// level): `qpi`/`state` in any entry; `input`/`output` only in a user fn/proc (system hooks carry NoData /
// qpi.h IO); `locals` only in a _WITH_LOCALS entry that declares a <Name>_locals struct.
export function allowedBuiltinsAt(src: string, offset: number): string[] {
  const entry = enclosingEntry(src, offset);
  if (!entry) {
    return [];
  }
  const userEntry = isUserEntry(entry.macro);
  const hasLocals = entry.macro.endsWith("_WITH_LOCALS") && collectStructs(src).has(entry.base + "_locals");

  return QPI_BUILTINS.filter((b) => {
    if (b === "input" || b === "output") {
      return userEntry;
    }
    if (b === "locals") {
      return hasLocals;
    }
    return true; // qpi, state
  });
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
  CALL_OTHER_CONTRACT_FUNCTION: "CALL_OTHER_CONTRACT_FUNCTION(${1:Contract}, ${2:Function}, ${3:input}, ${4:output});",
  CALL_OTHER_CONTRACT_FUNCTION_E: "CALL_OTHER_CONTRACT_FUNCTION_E(${1:Contract}, ${2:Function}, ${3:input}, ${4:output}, ${5:error});",
  INVOKE_OTHER_CONTRACT_PROCEDURE: "INVOKE_OTHER_CONTRACT_PROCEDURE(${1:Contract}, ${2:Procedure}, ${3:input}, ${4:output}, ${5:reward});",
  INVOKE_OTHER_CONTRACT_PROCEDURE_E: "INVOKE_OTHER_CONTRACT_PROCEDURE_E(${1:Contract}, ${2:Procedure}, ${3:input}, ${4:output}, ${5:reward}, ${6:error});",
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
      if (isGtestModel(model)) {
        return { suggestions: [] }; // a gtest test gets the gtest provider, not the contract snippets
      }
      const word = model.getWordUntilPosition(position);
      const offset = model.getOffsetAt(position);

      // Member and cross-contract providers own these positions; don't flood them with top-level QPI items.
      const before = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: Math.max(1, word.startColumn - 2), endLineNumber: position.lineNumber, endColumn: word.startColumn });
      if (before.endsWith(".") || before.endsWith("::") || isCrossContractCompletionAt(model.getValue(), offset)) {
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

      const builtins: Monaco.languages.CompletionItem[] = allowedBuiltinsAt(model.getValue(), offset).map((b) => ({
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

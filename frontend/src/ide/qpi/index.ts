// Wire the QPI language layer onto a mounted Monaco editor: register the snippet + quick-fix providers
// (once, globally, on the `cpp` language) and attach debounced Tier-A diagnostics to this editor.
import type * as Monaco from "monaco-editor";
import { registerQpiSnippets } from "./snippets";
import { registerQpiMembers } from "./members";
import { registerQpiSignatureHelp } from "./signature";
import { registerQpiDefinition } from "./definition";
import { registerQpiCodeActions } from "./codeactions";
import { registerQpiCrossContracts, resolveCrossContractType } from "./cross-contract";
import { attachQpiDiagnostics } from "./markers";

export function setupQpi(monaco: typeof Monaco, editor: Monaco.editor.IStandaloneCodeEditor): Monaco.IDisposable {
  registerQpiSnippets(monaco);
  registerQpiMembers(monaco, resolveCrossContractType);
  registerQpiSignatureHelp(monaco);
  registerQpiDefinition(monaco);
  registerQpiCodeActions(monaco);
  registerQpiCrossContracts(monaco);

  return attachQpiDiagnostics(monaco, editor);
}

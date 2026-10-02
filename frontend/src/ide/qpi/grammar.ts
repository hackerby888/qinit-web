// QPI-aware syntax highlighting. Monaco's built-in `cpp` Monarch grammar colours C++ keywords but treats
// the QPI vocabulary (uint64, HashMap, PUBLIC_PROCEDURE, LOG_INFO, qpi, state, …) as undifferentiated
// identifiers. We clone the cpp grammar, inject the QPI categories plus qualified contract IO types, then
// re-register it for the SAME language id (`cpp`) — so every existing provider keeps working untouched.
import type * as Monaco from "monaco-editor";
// eslint-disable-next-line import/no-unresolved -- deep ESM entry, typed via qinit-modules.d.ts
import { language as cppLanguage } from "monaco-editor/esm/vs/basic-languages/cpp/cpp.js";
import { QPI_TYPES, QPI_MACROS, QPI_BUILTINS } from "./vocab";

// The cpp identifier rule looks like `[/[a-zA-Z_]\w*/, { cases: { "@keywords": …, "@default": … } }]`.
// Find it by its `@keywords` case so a Monaco version bump that reshapes the grammar degrades cleanly
// (we leave the built-in cpp grammar in place rather than break highlighting).
function findIdentifierRule(root: unknown[]): number {
  return root.findIndex((rule) => {
    const action = Array.isArray(rule) ? (rule[1] as { cases?: Record<string, unknown> }) : undefined;
    return !!action && typeof action === "object" && !!action.cases && "@keywords" in action.cases;
  });
}

export function applyQpiGrammar(monaco: typeof Monaco): void {
  const base = cppLanguage as unknown as { tokenizer?: { root?: unknown[] } } & Record<string, unknown>;
  const root = base.tokenizer?.root;

  if (!Array.isArray(root)) {
    monaco.languages.setMonarchTokensProvider("cpp", cppLanguage);
    return;
  }

  const idIdx = findIdentifierRule(root);
  if (idIdx < 0) {
    // Unexpected grammar shape — keep plain cpp rather than risk breaking the tokenizer.
    monaco.languages.setMonarchTokensProvider("cpp", cppLanguage);
    return;
  }

  // Rebuild only the identifier rule, extending its `cases`. QPI macros/types/builtins are checked after
  // `@keywords` (none of them are C++ keywords) and before `@default`, so normal C++ is unaffected.
  const [regex, action] = root[idIdx] as [unknown, { cases: Record<string, unknown> }];
  const newRule = [
    regex,
    {
      cases: {
        "@keywords": action.cases["@keywords"],
        "@qpiMacros": "annotation",
        "@qpiTypes": "type.qpi",
        "@qpiBuiltins": "variable.predefined",
        "@default": action.cases["@default"] ?? "identifier",
      },
    },
  ];
  const qualifiedIoRule = [
    /([a-zA-Z_]\w*)(\s*)(::)(\s*)([a-zA-Z_]\w*_(?:input|output))\b/,
    ["type.qpi", "white", "delimiter", "white", "type.qpi"],
  ];

  const newRoot = root.slice();
  newRoot.splice(idIdx, 1, qualifiedIoRule, newRule);

  // A fresh language object — never mutate the shared module export. The injected arrays are what the
  // `@qpiTypes`/`@qpiMacros`/`@qpiBuiltins` case references resolve against.
  const lang = {
    ...base,
    qpiTypes: QPI_TYPES,
    qpiMacros: QPI_MACROS,
    qpiBuiltins: QPI_BUILTINS,
    tokenizer: { ...base.tokenizer, root: newRoot },
  } as unknown as Monaco.languages.IMonarchLanguage;

  monaco.languages.setMonarchTokensProvider("cpp", lang);
}

// Goto-definition (F12 / ctrl-click) — resolved in-page by locating the declaration in the contract source.
// Most-specific first: a function/procedure name -> its PUBLIC_*/PRIVATE_* entry macro; a struct/type name
// -> its `struct Name`; a field name -> its `Type field;` declaration. Symbols that live in qpi.h (the
// containers, qpi methods) aren't in the open model, so they resolve to nothing — as expected.
import type * as Monaco from "monaco-editor";

// The source offset where `word` is *defined*, or null. Uses the regex `d` flag to read the captured
// group's start index precisely.
export function definitionOffset(src: string, word: string): number | null {
  const w = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    // a function / procedure entry: PUBLIC_PROCEDURE(word) / PUBLIC_FUNCTION_WITH_LOCALS(word) / …
    new RegExp(`\\b(?:PUBLIC|PRIVATE)_(?:FUNCTION|PROCEDURE)(?:_WITH_LOCALS)?\\s*\\(\\s*(${w})\\s*\\)`, "d"),
    // a struct / type: struct word
    new RegExp(`\\bstruct\\s+(${w})\\b`, "d"),
    // a field declaration at a statement boundary: <type> word [optional array] ;
    new RegExp(`(?:^|[{;])\\s*[A-Za-z_][\\w:]*(?:\\s*<[^;{}]*>)?(?:\\s*[*&])?\\s+(${w})\\s*(?:\\[[^\\]]*\\])?\\s*;`, "dm"),
  ];

  for (const re of patterns) {
    const m = re.exec(src);
    if (m?.indices?.[1]) {
      return m.indices[1][0];
    }
  }
  return null;
}

let registered = false;

export function registerQpiDefinition(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerDefinitionProvider("cpp", {
    provideDefinition(model, position) {
      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) {
        return null;
      }

      const off = definitionOffset(model.getValue(), wordInfo.word);
      if (off === null) {
        return null;
      }

      const start = model.getPositionAt(off);
      const end = model.getPositionAt(off + wordInfo.word.length);
      return {
        uri: model.uri,
        range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
      };
    },
  });
}

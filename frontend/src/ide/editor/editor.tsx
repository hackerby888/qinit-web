// The Monaco code surface for the IDE. Language is `cpp` (qpi.h contracts are C++), matching the
// qinit VS Code extension, which also rides the C++ grammar. QPI smarts (rule diagnostics, IDL hover,
// quick-fix, snippets) are registered separately in ./qpi and attach to this same `cpp` language.
import Editor, { type OnMount } from "@monaco-editor/react";
import { setupMonaco } from "./monaco";
import { fileKind } from "../workspace/workspace";

setupMonaco();

// The single source of truth for file → Monaco language. Reused by the collab path when it creates models
// manually, so QPI ("cpp") / TypeScript language services attach identically to bound models.
export function langForPath(path?: string): string {
  const kind = fileKind(path ?? "");
  // a path-less model is the collab editor's contract buffer.
  return kind === "test" ? "typescript" : kind === "other" && path ? "plaintext" : "cpp";
}

export interface CodeEditorProps {
  value: string;
  path?: string;
  theme?: string;
  onChange: (value: string) => void;
  onMount?: OnMount;
  readOnly?: boolean;
  // Collab mode: a Yjs MonacoBinding owns the model content, so we must NOT pass a controlled `value`/`path`
  // (they would fight the binding and dispose the bound model on tab switch). Ide.tsx drives the model.
  collab?: boolean;
}

export function CodeEditor({ value, path, theme, onChange, onMount, readOnly, collab }: CodeEditorProps) {
  // Contracts are C++ (qpi.h); .ts test files get the TypeScript language so Monaco's TS worker checks them.
  const language = langForPath(path);
  return (
    <Editor
      height="100%"
      language={collab ? undefined : language}
      theme={theme ?? "qinit-dark"}
      path={collab ? undefined : path}
      value={collab ? undefined : value}
      onChange={(v) => onChange(v ?? "")}
      onMount={onMount}
      options={{
        readOnly: !!readOnly,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13,
        lineHeight: 21,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        padding: { top: 14, bottom: 14 },
        renderLineHighlight: "all",
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        tabSize: 4,
        // Completion is structured (QPI snippets + member resolution); the word-based fallback would
        // otherwise flood the list with raw document words after a `.` on a scalar.
        wordBasedSuggestions: "off",
        automaticLayout: true,
        fixedOverflowWidgets: true,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        guides: { indentation: false },
      }}
    />
  );
}

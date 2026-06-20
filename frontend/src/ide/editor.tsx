// The Monaco code surface for the IDE. Language is `cpp` (qpi.h contracts are C++), matching the
// qinit VS Code extension, which also rides the C++ grammar. QPI smarts (rule diagnostics, IDL hover,
// quick-fix, snippets) are registered separately in ./qpi and attach to this same `cpp` language.
import Editor, { type OnMount } from "@monaco-editor/react";
import { setupMonaco } from "./monaco";

setupMonaco();

export interface CodeEditorProps {
  value: string;
  path?: string;
  onChange: (value: string) => void;
  onMount?: OnMount;
}

export function CodeEditor({ value, path, onChange, onMount }: CodeEditorProps) {
  return (
    <Editor
      height="100%"
      language="cpp"
      theme="qinit-dark"
      path={path}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={onMount}
      options={{
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

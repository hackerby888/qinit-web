// Local Monaco setup (no CDN): wire the base editor web-worker and register our monaco instance with
// @monaco-editor/react, then define a clean dark theme tuned to the qinit palette. The pixel /
// neo-brutalist styling lives in the IDE *chrome*; the code surface itself stays calm and legible.
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { loader } from "@monaco-editor/react";
import { color } from "../landing/tokens";
import { applyQpiGrammar } from "./qpi/grammar";
import { registerEditorThemes } from "./editorThemes";
import { formatCode } from "./format";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    // .ts test files use the TypeScript language worker (diagnostics/completions); everything else (cpp) just
    // needs the base editor worker.
    if (label === "typescript" || label === "javascript") {
      return new TsWorker();
    }
    return new EditorWorker();
  },
};

loader.config({ monaco });

// Dev-only: expose the monaco instance for quick console/automation poking (model.setValue, markers).
if (import.meta.env.DEV) {
  (window as unknown as { monaco: typeof monaco }).monaco = monaco;
}

let ready = false;

export function setupMonaco(): typeof monaco {
  if (ready) {
    return monaco;
  }
  ready = true;

  // Teach the cpp tokenizer the QPI vocabulary (type.qpi / annotation / variable.predefined) — same `cpp`
  // language id, so the existing providers are unaffected.
  applyQpiGrammar(monaco);

  monaco.editor.defineTheme("qinit-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "5E6760", fontStyle: "italic" },
      { token: "keyword", foreground: "9B8CFF" },
      { token: "keyword.directive", foreground: "9B8CFF" },
      { token: "type", foreground: "19E0B4" },
      { token: "type.identifier", foreground: "19E0B4" },
      { token: "type.qpi", foreground: "56C8FF" },
      { token: "annotation", foreground: "FF9E64", fontStyle: "bold" },
      { token: "variable.predefined", foreground: "E58CC9" },
      { token: "number", foreground: "FFD23F" },
      { token: "string", foreground: "FFD23F" },
      { token: "identifier", foreground: "EAF0ED" },
    ],
    colors: {
      "editor.background": color.panel,
      "editor.foreground": "#C9D1CB",
      "editorLineNumber.foreground": "#3D443E",
      "editorLineNumber.activeForeground": "#9AA39C",
      "editor.selectionBackground": "#19E0B433",
      "editor.lineHighlightBackground": "#FFFFFF08",
      "editorCursor.foreground": color.accent,
      "editorIndentGuide.background1": "#1C2622",
      "editorWidget.background": color.panelDeep,
      "editorHoverWidget.background": color.panelDeep,
      "editorHoverWidget.border": color.hair,
      "editorSuggestWidget.background": color.panelDeep,
      "editorSuggestWidget.border": color.hair,
      "editorSuggestWidget.selectedBackground": "#19E0B422",
      "list.hoverBackground": "#FFFFFF08",
      "scrollbarSlider.background": "#1C262288",
      "scrollbarSlider.hoverBackground": "#1C2622cc",
    },
  });

  // The "flat" companion theme — GitHub Dark. Syntax + editor colors mirror Primer's "GitHub Dark Default"
  // so the editor matches the GitHub-dark chrome (FLAT palette). Literal hex on purpose: defineTheme runs once
  // at import, so reading the mutable `color` here would bake whatever palette happened to be active.
  monaco.editor.defineTheme("qinit-flat", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8b949e", fontStyle: "italic" },
      { token: "keyword", foreground: "ff7b72" },
      { token: "keyword.directive", foreground: "ff7b72" },
      { token: "type", foreground: "ffa657" },
      { token: "type.identifier", foreground: "ffa657" },
      { token: "type.qpi", foreground: "79c0ff" },
      { token: "annotation", foreground: "d2a8ff", fontStyle: "bold" },
      { token: "variable.predefined", foreground: "79c0ff" },
      { token: "number", foreground: "79c0ff" },
      { token: "string", foreground: "a5d6ff" },
      { token: "identifier", foreground: "c9d1d9" },
    ],
    colors: {
      "editor.background": "#0d1117",
      "editor.foreground": "#e6edf3",
      "editorLineNumber.foreground": "#6e7681",
      "editorLineNumber.activeForeground": "#c9d1d9",
      "editor.selectionBackground": "#1f6feb40",
      "editor.lineHighlightBackground": "#FFFFFF0a",
      "editorCursor.foreground": "#2f81f7",
      "editorIndentGuide.background1": "#21262d",
      "editorWidget.background": "#161b22",
      "editorHoverWidget.background": "#161b22",
      "editorHoverWidget.border": "#30363d",
      "editorSuggestWidget.background": "#161b22",
      "editorSuggestWidget.border": "#30363d",
      "editorSuggestWidget.selectedBackground": "#1f6feb33",
      "list.hoverBackground": "#FFFFFF0a",
      "scrollbarSlider.background": "#484f5866",
      "scrollbarSlider.hoverBackground": "#484f58aa",
    },
  });

  // The selectable preset themes (qinit-light, monokai, dracula, solarized-dark).
  registerEditorThemes(monaco);

  // Format Document for qpi.h contracts (cpp). TypeScript test files use Monaco's built-in TS formatter.
  monaco.languages.registerDocumentFormattingEditProvider("cpp", {
    provideDocumentFormattingEdits(model) {
      return [{ range: model.getFullModelRange(), text: formatCode(model.getValue(), "cpp") }];
    },
  });

  return monaco;
}

export { monaco };

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

  // The "flat" companion theme — near-monochrome with one dim teal-grey accent, matched to the FLAT
  // palette. Literal hex on purpose: defineTheme runs once at import, so reading the mutable `color`
  // here would bake whatever palette happened to be active.
  monaco.editor.defineTheme("qinit-flat", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "54575C", fontStyle: "italic" },
      { token: "keyword", foreground: "8A8F98" },
      { token: "keyword.directive", foreground: "8A8F98" },
      { token: "type", foreground: "7FA6AD" },
      { token: "type.identifier", foreground: "7FA6AD" },
      { token: "type.qpi", foreground: "7E97A8" },
      { token: "annotation", foreground: "A89B7E", fontStyle: "bold" },
      { token: "variable.predefined", foreground: "8A9AA0" },
      { token: "number", foreground: "AEA686" },
      { token: "string", foreground: "AEA686" },
      { token: "identifier", foreground: "B8BABF" },
    ],
    colors: {
      "editor.background": "#121214",
      "editor.foreground": "#B8BABF",
      "editorLineNumber.foreground": "#3A3A3F",
      "editorLineNumber.activeForeground": "#8A8D93",
      "editor.selectionBackground": "#7FA6AD33",
      "editor.lineHighlightBackground": "#FFFFFF06",
      "editorCursor.foreground": "#7FA6AD",
      "editorIndentGuide.background1": "#222226",
      "editorWidget.background": "#0E0E10",
      "editorHoverWidget.background": "#0E0E10",
      "editorHoverWidget.border": "#222226",
      "editorSuggestWidget.background": "#0E0E10",
      "editorSuggestWidget.border": "#222226",
      "editorSuggestWidget.selectedBackground": "#7FA6AD22",
      "list.hoverBackground": "#FFFFFF06",
      "scrollbarSlider.background": "#22222688",
      "scrollbarSlider.hoverBackground": "#222226cc",
    },
  });

  // The selectable preset themes (qinit-light, monokai, dracula, solarized-dark).
  registerEditorThemes(monaco);

  return monaco;
}

export { monaco };

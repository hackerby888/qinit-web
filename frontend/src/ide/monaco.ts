// Local Monaco setup (no CDN): wire the base editor web-worker and register our monaco instance with
// @monaco-editor/react, then define a clean dark theme tuned to the qinit palette. The pixel /
// neo-brutalist styling lives in the IDE *chrome*; the code surface itself stays calm and legible.
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { loader } from "@monaco-editor/react";
import { color } from "../landing/tokens";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker() {
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

  monaco.editor.defineTheme("qinit-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "5E6760", fontStyle: "italic" },
      { token: "keyword", foreground: "9B8CFF" },
      { token: "keyword.directive", foreground: "9B8CFF" },
      { token: "type", foreground: "19E0B4" },
      { token: "type.identifier", foreground: "19E0B4" },
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

  return monaco;
}

export { monaco };

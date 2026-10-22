// Selectable Monaco editor syntax themes. The two house themes (qinit-dark / qinit-flat) are defined in
// monaco.ts; this registers the extra presets and resolves the user's pick into a Monaco theme name. Every
// preset colors the full QPI token set the cpp tokenizer emits (type.qpi / annotation / variable.predefined),
// so QPI vocabulary stays highlighted whatever the scheme. resolveMonacoTheme is pure → unit-tested.
import type * as Monaco from "monaco-editor";

export type EditorThemeId =
  | "match"
  | "qinit-dark"
  | "qinit-light"
  | "qinit-flat"
  | "monokai"
  | "dracula"
  | "solarized-dark"
  | "intellij-light"
  | "darcula";

export type EditorThemeGroup = "auto" | "light" | "dark";

export interface EditorThemeMeta {
  id: EditorThemeId;
  label: string;
  group: EditorThemeGroup; // section in the picker (Auto / Light / Dark)
  monacoName: string | null; // null = "match" (the house theme that matches the chrome)
  swatch: [string, string, string]; // preview dots: keyword / qpi-type / string
}

// The picker list. "Match UI" is Auto (follows chrome); the rest are sectioned light vs dark.
export const EDITOR_THEMES: EditorThemeMeta[] = [
  { id: "match", label: "Match UI", group: "auto", monacoName: null, swatch: ["#9B8CFF", "#7EE787", "#FFD23F"] },
  { id: "qinit-light", label: "qinit Light", group: "light", monacoName: "qinit-light", swatch: ["#6A4ACB", "#1A7F37", "#8A6D00"] },
  { id: "intellij-light", label: "IntelliJ Light", group: "light", monacoName: "intellij-light", swatch: ["#0033B3", "#871094", "#067D17"] },
  { id: "qinit-dark", label: "qinit Dark", group: "dark", monacoName: "qinit-dark", swatch: ["#9B8CFF", "#7EE787", "#FFD23F"] },
  { id: "qinit-flat", label: "qinit Flat (GitHub Dark)", group: "dark", monacoName: "qinit-flat", swatch: ["#ff7b72", "#a5d6ff", "#79c0ff"] },
  { id: "monokai", label: "Monokai", group: "dark", monacoName: "monokai", swatch: ["#F92672", "#A6E22E", "#E6DB74"] },
  { id: "dracula", label: "Dracula", group: "dark", monacoName: "dracula", swatch: ["#FF79C6", "#50FA7B", "#F1FA8C"] },
  { id: "solarized-dark", label: "Solarized Dark", group: "dark", monacoName: "solarized-dark", swatch: ["#859900", "#2AA198", "#2AA198"] },
  { id: "darcula", label: "IntelliJ Darcula", group: "dark", monacoName: "darcula", swatch: ["#CC7832", "#FFC66D", "#6A8759"] },
];

// Resolve a chosen theme id into the Monaco theme name to apply. "match" is the house theme that matches the
// chrome; an unknown id falls back to the house dark theme.
export function resolveMonacoTheme(id: EditorThemeId): string {
  if (id === "match") {
    return "qinit-flat";
  }

  const meta = EDITOR_THEMES.find((t) => t.id === id);
  return meta?.monacoName ?? "qinit-dark";
}

// A theme's token + chrome palette, expanded into a full IStandaloneThemeData (all QPI token rules + editor.*).
interface Palette {
  base: "vs" | "vs-dark";
  bg: string;
  fg: string;
  comment: string;
  keyword: string;
  type: string;
  qpiType: string;
  annotation: string;
  builtin: string;
  number: string;
  string: string;
  identifier: string;
  lineNr: string;
  lineNrActive: string;
  selection: string; // includes alpha
  lineHighlight: string; // includes alpha
  cursor: string;
  widgetBg: string;
  widgetBorder: string;
  suggestSelected: string; // includes alpha
  scrollbar: string; // includes alpha
}

function build(p: Palette): Monaco.editor.IStandaloneThemeData {
  return {
    base: p.base,
    inherit: true,
    rules: [
      { token: "comment", foreground: p.comment, fontStyle: "italic" },
      { token: "keyword", foreground: p.keyword },
      { token: "keyword.directive", foreground: p.keyword },
      { token: "type", foreground: p.type },
      { token: "type.identifier", foreground: p.type },
      { token: "type.qpi", foreground: p.qpiType },
      { token: "annotation", foreground: p.annotation, fontStyle: "bold" },
      { token: "variable.predefined", foreground: p.builtin },
      { token: "number", foreground: p.number },
      { token: "string", foreground: p.string },
      { token: "identifier", foreground: p.identifier },
    ],
    colors: {
      "editor.background": `#${p.bg}`,
      "editor.foreground": `#${p.fg}`,
      "editorLineNumber.foreground": `#${p.lineNr}`,
      "editorLineNumber.activeForeground": `#${p.lineNrActive}`,
      "editor.selectionBackground": `#${p.selection}`,
      "editor.lineHighlightBackground": `#${p.lineHighlight}`,
      "editorCursor.foreground": `#${p.cursor}`,
      "editorIndentGuide.background1": `#${p.widgetBorder}`,
      "editorWidget.background": `#${p.widgetBg}`,
      "editorHoverWidget.background": `#${p.widgetBg}`,
      "editorHoverWidget.border": `#${p.widgetBorder}`,
      "editorSuggestWidget.background": `#${p.widgetBg}`,
      "editorSuggestWidget.border": `#${p.widgetBorder}`,
      "editorSuggestWidget.selectedBackground": `#${p.suggestSelected}`,
      "list.hoverBackground": `#${p.lineHighlight}`,
      "scrollbarSlider.background": `#${p.scrollbar}`,
      "scrollbarSlider.hoverBackground": `#${p.scrollbar}`,
    },
  };
}

const THEMES: Record<string, Palette> = {
  "qinit-light": {
    base: "vs",
    bg: "F7F7F2", fg: "2B2E29",
    comment: "8A8E78", keyword: "6A4ACB", type: "1A7F37", qpiType: "116329", annotation: "C2632A",
    builtin: "A23E8C", number: "9A7A00", string: "8A6D00", identifier: "2B2E29",
    lineNr: "B8BCB0", lineNrActive: "6B6F63", selection: "3FB95033", lineHighlight: "00000008",
    cursor: "1A7F37", widgetBg: "FFFFFF", widgetBorder: "E2E2D8", suggestSelected: "3FB95022", scrollbar: "00000022",
  },
  monokai: {
    base: "vs-dark",
    bg: "272822", fg: "F8F8F2",
    comment: "75715E", keyword: "F92672", type: "66D9EF", qpiType: "A6E22E", annotation: "FD971F",
    builtin: "AE81FF", number: "AE81FF", string: "E6DB74", identifier: "F8F8F2",
    lineNr: "5A5C52", lineNrActive: "C2C3BD", selection: "49483E", lineHighlight: "3E3D32",
    cursor: "F8F8F0", widgetBg: "1E1F1A", widgetBorder: "3A3B34", suggestSelected: "49483E", scrollbar: "FFFFFF14",
  },
  dracula: {
    base: "vs-dark",
    bg: "282A36", fg: "F8F8F2",
    comment: "6272A4", keyword: "FF79C6", type: "8BE9FD", qpiType: "50FA7B", annotation: "FFB86C",
    builtin: "BD93F9", number: "BD93F9", string: "F1FA8C", identifier: "F8F8F2",
    lineNr: "6272A4", lineNrActive: "F8F8F2", selection: "44475A", lineHighlight: "44475A44",
    cursor: "F8F8F0", widgetBg: "21222C", widgetBorder: "44475A", suggestSelected: "44475A", scrollbar: "FFFFFF14",
  },
  "solarized-dark": {
    base: "vs-dark",
    bg: "002B36", fg: "93A1A1",
    comment: "586E75", keyword: "859900", type: "B58900", qpiType: "2AA198", annotation: "CB4B16",
    builtin: "6C71C4", number: "D33682", string: "2AA198", identifier: "93A1A1",
    lineNr: "586E75", lineNrActive: "93A1A1", selection: "073642", lineHighlight: "073642",
    cursor: "93A1A1", widgetBg: "073642", widgetBorder: "0E4B59", suggestSelected: "0E4B59", scrollbar: "FFFFFF14",
  },
  "intellij-light": {
    base: "vs",
    bg: "FFFFFF", fg: "080808",
    comment: "8C8C8C", keyword: "0033B3", type: "00627A", qpiType: "871094", annotation: "9E880D",
    builtin: "871094", number: "1750EB", string: "067D17", identifier: "080808",
    lineNr: "ADADAD", lineNrActive: "080808", selection: "A6D2FF", lineHighlight: "FCFAED",
    cursor: "000000", widgetBg: "FFFFFF", widgetBorder: "EBECF0", suggestSelected: "C5DEFC", scrollbar: "00000022",
  },
  darcula: {
    base: "vs-dark",
    bg: "2B2B2B", fg: "A9B7C6",
    comment: "808080", keyword: "CC7832", type: "A9B7C6", qpiType: "FFC66D", annotation: "BBB529",
    builtin: "9876AA", number: "6897BB", string: "6A8759", identifier: "A9B7C6",
    lineNr: "606366", lineNrActive: "A9B7C6", selection: "214283", lineHighlight: "323232",
    cursor: "BBBBBB", widgetBg: "3C3F41", widgetBorder: "4B4B4B", suggestSelected: "4B6EAF", scrollbar: "FFFFFF14",
  },
};

// Register the extra presets (the house qinit-dark / qinit-flat already live in monaco.ts setupMonaco).
export function registerEditorThemes(monaco: typeof Monaco): void {
  for (const [name, palette] of Object.entries(THEMES)) {
    monaco.editor.defineTheme(name, build(palette));
  }
}

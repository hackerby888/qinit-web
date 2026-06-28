import { useState } from "react";
import { applyTheme, type ThemeName } from "../landing/tokens";
import { type EditorThemeId } from "./editorThemes";

// IDE theming: the chrome palette (neo ↔ flat) and the editor syntax theme, both persisted to localStorage. The
// chrome initializer applies the persisted palette before the first paint (mutating the shared `color` singleton)
// so the whole subtree renders in the right theme on mount. Extracted from the Ide shell.
export interface IdeTheme {
  theme: ThemeName;
  editorTheme: EditorThemeId;
  toggleTheme: () => void;
  pickEditorTheme: (id: EditorThemeId) => void;
}

export function useIdeTheme(): IdeTheme {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const t = (localStorage.getItem("ide.theme") as ThemeName) || "flat";
    applyTheme(t);
    return t;
  });

  const [editorTheme, setEditorTheme] = useState<EditorThemeId>(() => (localStorage.getItem("ide.editorTheme") as EditorThemeId) || "match");

  // Flip neo ↔ flat: swap the palette in place (applyTheme) before re-rendering, persist, then let the resolved
  // theme flow into Monaco via the editor's theme prop.
  const toggleTheme = (): void => {
    const next: ThemeName = theme === "neo" ? "flat" : "neo";
    applyTheme(next);
    localStorage.setItem("ide.theme", next);
    setTheme(next);
  };

  const pickEditorTheme = (id: EditorThemeId): void => {
    localStorage.setItem("ide.editorTheme", id);
    setEditorTheme(id);
  };

  return { theme, editorTheme, toggleTheme, pickEditorTheme };
}

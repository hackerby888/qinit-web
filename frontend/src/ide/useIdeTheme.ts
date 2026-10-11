import { useState } from "react";
import { applyTheme, type ThemeName } from "../ui/tokens";
import { type EditorThemeId } from "./editorThemes";

// Apply the persisted IDE theme at module-import time — before any React component renders. The Ide chunk is
// lazy-loaded (React.lazy), so this runs after the main landing bundle. It switches the shared `color` singleton
// from NEO (set by the landing page at initial load) to the user's chosen IDE palette before the first <Ide>
// render. The inline <script> in index.html also sets window.__QINIT_IDE_THEME__ for the full-page-reload path
// (see tokens.ts readInitialTheme); this call covers the client-side navigation path where the module was
// already evaluated as NEO.
(function applyPersistedTheme() {
  try {
    applyTheme((localStorage.getItem("ide.theme") || "flat") as ThemeName);
  } catch {}
})();
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

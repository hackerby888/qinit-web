import { useState } from "react";
import { type EditorThemeId } from "./editor/themes";

export interface IdeTheme {
  editorTheme: EditorThemeId;
  pickEditorTheme: (id: EditorThemeId) => void;
}

// The editor syntax theme (persisted). The chrome itself has one palette — see ui/tokens.ts.
export function useIdeTheme(): IdeTheme {
  const [editorTheme, setEditorTheme] = useState<EditorThemeId>(() => (localStorage.getItem("ide.editorTheme") as EditorThemeId) || "match");

  const pickEditorTheme = (id: EditorThemeId): void => {
    localStorage.setItem("ide.editorTheme", id);
    setEditorTheme(id);
  };

  return { editorTheme, pickEditorTheme };
}

// The editor-theme resolver + registry are pure data — guard the "Match UI" follow behavior and the preset map.
import { test, expect, describe } from "bun:test";
import { resolveMonacoTheme, EDITOR_THEMES, type EditorThemeId } from "../../../src/ide/editor/themes";

describe("resolveMonacoTheme", () => {
  test("`match` is the house theme that matches the chrome", () => {
    expect(resolveMonacoTheme("match")).toBe("qinit-flat");
  });

  test("each preset resolves to its own monaco theme name", () => {
    const presets: [EditorThemeId, string][] = [
      ["qinit-dark", "qinit-dark"],
      ["qinit-light", "qinit-light"],
      ["qinit-flat", "qinit-flat"],
      ["monokai", "monokai"],
      ["dracula", "dracula"],
      ["solarized-dark", "solarized-dark"],
      ["intellij-light", "intellij-light"],
      ["darcula", "darcula"],
    ];

    for (const [id, name] of presets) {
      expect(resolveMonacoTheme(id)).toBe(name);
    }
  });

  test("an unknown id falls back to the house dark theme", () => {
    expect(resolveMonacoTheme("bogus" as EditorThemeId)).toBe("qinit-dark");
  });
});

describe("EDITOR_THEMES registry", () => {
  test("has Match UI first with no monaco name, all others named", () => {
    expect(EDITOR_THEMES[0].id).toBe("match");
    expect(EDITOR_THEMES[0].monacoName).toBeNull();

    for (const t of EDITOR_THEMES.slice(1)) {
      expect(typeof t.monacoName).toBe("string");
      expect(t.monacoName!.length).toBeGreaterThan(0);
    }
  });

  test("every entry has a 3-colour preview swatch", () => {
    for (const t of EDITOR_THEMES) {
      expect(t.swatch).toHaveLength(3);
      for (const c of t.swatch) {
        expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

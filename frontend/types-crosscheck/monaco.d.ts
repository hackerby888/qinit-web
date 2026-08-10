// Only for tsconfig.crosscheck.json, which excludes src/types/qinit-modules.d.ts (see that config). This
// restates the one declaration in there that is not about @qinit/*. It lives outside src/ so the primary
// program never sees both copies — two ambient declarations of one module collide on `conf`/`language`.
declare module "monaco-editor/esm/vs/basic-languages/cpp/cpp.js" {
  import type * as Monaco from "monaco-editor";
  export const conf: Monaco.languages.LanguageConfiguration;
  export const language: Monaco.languages.IMonarchLanguage;
}

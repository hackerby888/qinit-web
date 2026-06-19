// IDL hover (ported from the qinit VS Code extension's idl-hover): hovering a registered function or
// procedure name shows its on-chain index and input/output codec — from the SAME extractIdl the CLI
// uses. The fn/proc lookup is name-independent, so we pass a placeholder contract name.
import type * as Monaco from "monaco-editor";
import { extractIdl } from "@qinit/build/idl";

let registered = false;

export function registerQpiHover(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerHoverProvider("cpp", {
    provideHover(model, position) {
      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) {
        return null;
      }

      let idl;
      try {
        idl = extractIdl(model.getValue(), "Contract");
      } catch {
        return null;
      }

      const word = wordInfo.word;
      const fn = Object.entries(idl.functions).find(([, e]) => e.name === word);
      const pr = Object.entries(idl.procedures).find(([, e]) => e.name === word);
      const hit = fn
        ? { kind: "function", index: fn[0], entry: fn[1] }
        : pr
          ? { kind: "procedure", index: pr[0], entry: pr[1] }
          : null;
      if (!hit) {
        return null;
      }

      const io = `input  : ${hit.entry.in || "(empty)"}` + (hit.kind === "function" ? `\noutput : ${hit.entry.out || "(empty)"}` : "");
      return {
        contents: [
          { value: `**QPI ${hit.kind}** \`${hit.entry.name}\` · index **${hit.index}**` },
          { value: "```text\n" + io + "\n```" },
        ],
      };
    },
  });
}

// Hover — what's under the cursor, resolved in-page (no language server). Layered, most-specific first:
//   1. a registered function/procedure  -> on-chain index + input/output codec (from extractIdl)
//   2. a member in a chain (state.get().counter / balances.set / qpi.transfer) -> field type or method sig
//   3. a QPI builtin / type / macro keyword -> a short description
//   4. any struct field by name (fallback) -> "Struct.field : type"
import type * as Monaco from "monaco-editor";
import { isGtestModel } from "./gtest";
import { extractIdl } from "@qinit/build/idl";
import { QPI_API, CONTAINERS, collectStructs, containerKind, walkPath, enclosingEntryBase, type Method, type Field } from "./members";
import { QPI_TYPES, QPI_MACROS } from "./vocab";

const BUILTIN: Record<string, string> = {
  qpi: "the QPI host API — `transfer`, `invocator`, `getEntity`, …",
  state: "contract state — `.mut()` to write, `.get()` to read",
  input: "the call's input struct",
  output: "the call's output struct",
  locals: "the entry's locals struct (the WITH_LOCALS form)",
};

const CONTAINER_FORM: Record<string, string> = {
  Array: "`Array<T, L>` — fixed array of L (a power of two) elements",
  BitArray: "`BitArray<L>` — L bits packed into uint64 words",
  HashMap: "`HashMap<KeyT, ValueT, L>` — hash map, total capacity L",
  HashSet: "`HashSet<KeyT, L>` — hash set, total capacity L",
  Collection: "`Collection<T, L>` — one priority queue per id (point of view)",
};

// "transfer(destination, amount)" from a method's `${n:name}` insert snippet.
function sigLabel(m: Method): string {
  const names = [...m.insert.matchAll(/\$\{\d+:([^}]*)\}/g)].map((x) => x[1]);
  return `${m.label}(${names.join(", ")})`;
}

function hover(title: string, body?: string): Monaco.languages.Hover {
  const contents: Monaco.IMarkdownString[] = [{ value: title }];
  if (body) {
    contents.push({ value: body });
  }
  return { contents };
}

let registered = false;

export function registerQpiHover(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerHoverProvider("cpp", {
    provideHover(model, position) {
      if (isGtestModel(model)) {
        return null;
      }
      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) {
        return null;
      }
      const word = wordInfo.word;
      const src = model.getValue();

      // 1. a registered function / procedure — its on-chain index + codec
      try {
        const idl = extractIdl(src, "Contract");
        const fn = Object.entries(idl.functions).find(([, e]) => e.name === word);
        const pr = Object.entries(idl.procedures).find(([, e]) => e.name === word);
        const hit = fn ? { kind: "function", index: fn[0], entry: fn[1] } : pr ? { kind: "procedure", index: pr[0], entry: pr[1] } : null;
        if (hit) {
          const io = `input  : ${hit.entry.in || "(empty)"}` + (hit.kind === "function" ? `\noutput : ${hit.entry.out || "(empty)"}` : "");
          return hover(`**QPI ${hit.kind}** \`${hit.entry.name}\` · index **${hit.index}**`, "```text\n" + io + "\n```");
        }
      } catch {
        // incomplete source — fall through to the lighter resolvers
      }

      const structs = collectStructs(src);

      // 2. the trailing member of a chain — resolve the receiver, then the member precisely
      const before = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: wordInfo.startColumn });
      const chain = before.match(/(qpi|state\s*\.\s*(?:mut|get)\s*\(\s*\)|input|output|locals)((?:\s*\.\s*\w+)*)\s*\.\s*$/);
      if (chain) {
        if (chain[1] === "qpi") {
          const m = QPI_API.find((x) => x.label === word);
          if (m) {
            return hover(`**qpi** \`${sigLabel(m)}\``, m.detail);
          }
        } else {
          let rootType: string | null;
          if (chain[1].startsWith("state")) {
            rootType = "StateData";
          } else {
            const base = enclosingEntryBase(src, model.getOffsetAt(position));
            const suffix = chain[1] === "input" ? "_input" : chain[1] === "output" ? "_output" : "_locals";
            rootType = base ? base + suffix : null;
          }
          if (rootType) {
            const type = walkPath(rootType, chain[2].match(/\w+/g) ?? [], structs);
            const kind = type ? containerKind(type) : null;
            if (kind) {
              const m = CONTAINERS[kind].find((x) => x.label === word);
              if (m) {
                return hover(`**${kind}** \`${sigLabel(m)}\``, m.detail);
              }
            } else if (type) {
              const f = structs.get(type)?.find((x) => x.name === word);
              if (f) {
                return hover(`**field** \`${type}.${f.name}\``, `\`${f.type}\``);
              }
            }
          }
        }
      }

      // 3. a QPI builtin / type / macro keyword
      if (word in BUILTIN) {
        return hover(`**qpi** \`${word}\``, BUILTIN[word]);
      }
      if (QPI_TYPES.includes(word)) {
        return hover(`**QPI type** \`${word}\``, CONTAINER_FORM[word] ?? "a QPI fixed-width type");
      }
      if (QPI_MACROS.includes(word)) {
        return hover(`**QPI macro** \`${word}\``);
      }

      // 4. fallback — any struct field with this name
      let match: { struct: string; field: Field } | null = null;
      for (const [sname, fields] of structs) {
        const f = fields.find((x) => x.name === word);
        if (f) {
          match = { struct: sname, field: f };
          break;
        }
      }
      if (match) {
        return hover(`**field** \`${match.struct}.${match.field.name}\``, `\`${match.field.type}\``);
      }

      return null;
    },
  });
}

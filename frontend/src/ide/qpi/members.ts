// Member completion without a language server. clangd would resolve `state.mut().<field>` semantically;
// we get the same effect in-page by parsing the contract's structs ourselves (instant, zero network — the
// Remix approach to autocomplete). Triggered on `.`, we detect the receiver before the dot and offer its
// members:
//   state.            -> mut() / get()
//   state.mut()./get().  -> StateData fields
//   input. / output. / locals.  -> the enclosing entry's <Name>_input/_output/_locals fields
//   qpi.              -> the QPI host API (transfer, invocator, …)
import type * as Monaco from "monaco-editor";

interface Field {
  name: string;
  type: string;
}

// Drop nested `{…}` blocks so a struct's own field list isn't polluted by inner struct bodies.
function stripNestedBraces(body: string): string {
  let out = "";
  let depth = 0;
  for (const c of body) {
    if (c === "{") {
      depth++;
      continue;
    }
    if (c === "}") {
      depth--;
      continue;
    }
    if (depth === 0) {
      out += c;
    }
  }
  return out;
}

// Split on top-level `;` only (ignore separators inside template `<…>`).
function splitDecls(flat: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of flat) {
    if (c === "<") {
      depth++;
    } else if (c === ">") {
      depth = Math.max(0, depth - 1);
    }
    if (c === ";" && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  return out;
}

// `HashMap<id, sint64> balances` -> { type: "HashMap<id, sint64>", name: "balances" }. Skips methods,
// nested struct headers, and access labels.
function parseFields(body: string): Field[] {
  const out: Field[] = [];
  for (const raw of splitDecls(stripNestedBraces(body))) {
    const decl = raw.replace(/\/\/.*$/gm, "").trim();
    if (!decl || decl.includes("(") || /^(struct|public|private|protected|typedef|using)\b/.test(decl)) {
      continue;
    }
    const m = decl.match(/^([\s\S]*\S)\s+(\w+)$/);
    if (m) {
      out.push({ type: m[1].replace(/\s+/g, " ").trim(), name: m[2] });
    }
  }
  return out;
}

// All `struct <Name> … { … }` bodies in the source, name -> fields. Nested structs are captured under
// their own bare name too (the outer container's parsed fields are simply never looked up).
function collectStructs(src: string): Map<string, Field[]> {
  const map = new Map<string, Field[]>();
  const re = /\bstruct\s+(\w+)[^{};]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = re.lastIndex;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      const c = src[i++];
      if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
      }
    }
    map.set(m[1], parseFields(src.slice(start, i - 1)));
  }
  return map;
}

const ENTRY_RE = /\b((?:PUBLIC|PRIVATE)_(?:FUNCTION|PROCEDURE)(?:_WITH_LOCALS)?|INITIALIZE|BEGIN_EPOCH|END_EPOCH|BEGIN_TICK|END_TICK|POST_INCOMING_TRANSFER|PRE_ACQUIRE_SHARES|PRE_RELEASE_SHARES|POST_ACQUIRE_SHARES|POST_RELEASE_SHARES)\s*\(\s*(\w*)\s*\)/g;

// The entry body the cursor sits in -> its base name for <Name>_input/_output/_locals. For a lifecycle
// hook (INITIALIZE etc.) the macro itself is the base (e.g. INITIALIZE_locals).
function enclosingEntryBase(src: string, offset: number): string | null {
  let base: string | null = null;
  let m: RegExpExecArray | null;
  ENTRY_RE.lastIndex = 0;
  while ((m = ENTRY_RE.exec(src)) !== null) {
    if (m.index >= offset) {
      break;
    }
    base = m[2] || m[1];
  }
  return base;
}

// The QPI host API surface on `qpi.` — labels + arg snippets + a short return-type hint.
const QPI_API: { label: string; insert: string; detail: string }[] = [
  { label: "invocator", insert: "invocator()", detail: "id — the tx signer / calling contract" },
  { label: "originator", insert: "originator()", detail: "id — the root initiator of the call chain" },
  { label: "invocationReward", insert: "invocationReward()", detail: "sint64 — Qu sent with the invocation" },
  { label: "transfer", insert: "transfer(${1:destination}, ${2:amount})", detail: "sint64 — send Qu; returns remaining" },
  { label: "burn", insert: "burn(${1:amount})", detail: "sint64 — destroy Qu" },
  { label: "getEntity", insert: "getEntity(${1:id}, ${2:entity})", detail: "bit — spectrum balance lookup" },
  { label: "issueAsset", insert: "issueAsset(${1:name}, ${2:issuer}, ${3:decimals}, ${4:numberOfShares}, ${5:unitOfMeasurement})", detail: "sint64 — mint an asset" },
  { label: "isAssetIssued", insert: "isAssetIssued(${1:issuer}, ${2:assetName})", detail: "bit" },
  { label: "numberOfShares", insert: "numberOfShares(${1:asset}, ${2:ownership}, ${3:possession})", detail: "sint64" },
  { label: "numberOfPossessedShares", insert: "numberOfPossessedShares(${1:assetName}, ${2:issuer}, ${3:owner}, ${4:possessor}, ${5:ownershipManagingContract}, ${6:possessionManagingContract})", detail: "sint64" },
  { label: "transferShareOwnershipAndPossession", insert: "transferShareOwnershipAndPossession(${1:assetName}, ${2:issuer}, ${3:owner}, ${4:possessor}, ${5:numberOfShares}, ${6:newOwnerAndPossessor})", detail: "sint64" },
  { label: "distributeDividends", insert: "distributeDividends(${1:amountPerShare})", detail: "bit" },
  { label: "nextId", insert: "nextId(${1:currentId})", detail: "id — next occupied spectrum id" },
  { label: "prevId", insert: "prevId(${1:currentId})", detail: "id" },
  { label: "tick", insert: "tick()", detail: "uint32 — current tick" },
  { label: "epoch", insert: "epoch()", detail: "uint16 — current epoch" },
  { label: "year", insert: "year()", detail: "uint8" },
  { label: "month", insert: "month()", detail: "uint8" },
  { label: "day", insert: "day()", detail: "uint8" },
  { label: "hour", insert: "hour()", detail: "uint8" },
  { label: "minute", insert: "minute()", detail: "uint8" },
  { label: "second", insert: "second()", detail: "uint8" },
  { label: "millisecond", insert: "millisecond()", detail: "uint16" },
  { label: "arbitrator", insert: "arbitrator()", detail: "id" },
  { label: "computor", insert: "computor(${1:index})", detail: "id" },
];

const STATE_ACCESS = /\bstate\s*\.\s*(?:mut|get)\s*\(\s*\)\s*\.\s*(\w*)$/;
const STATE_BARE = /\bstate\s*\.\s*(\w*)$/;
const IO_ACCESS = /\b(input|output|locals)\s*\.\s*(\w*)$/;
const QPI_ACCESS = /\bqpi\s*\.\s*(\w*)$/;

let registered = false;

export function registerQpiMembers(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerCompletionItemProvider("cpp", {
    triggerCharacters: ["."],
    provideCompletionItems(model, position) {
      const line = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });

      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const field = (f: Field): Monaco.languages.CompletionItem => ({
        label: f.name,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: f.name,
        detail: f.type,
        range,
      });

      // qpi.<api>
      if (QPI_ACCESS.test(line)) {
        return {
          suggestions: QPI_API.map((a) => ({
            label: a.label,
            kind: monaco.languages.CompletionItemKind.Method,
            insertText: a.insert,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: a.detail,
            range,
          })),
        };
      }

      // state.mut()./state.get(). -> StateData fields
      if (STATE_ACCESS.test(line)) {
        const fields = collectStructs(model.getValue()).get("StateData") ?? [];
        return { suggestions: fields.map(field) };
      }

      // state. -> mut() / get()
      if (STATE_BARE.test(line)) {
        const accessor = (name: string, doc: string): Monaco.languages.CompletionItem => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Method,
          insertText: `${name}().`,
          detail: doc,
          range,
        });
        return { suggestions: [accessor("mut", "writable StateData (marks the slot dirty)"), accessor("get", "read-only StateData")] };
      }

      // input./output./locals. -> the enclosing entry's struct
      const io = line.match(IO_ACCESS);
      if (io) {
        const base = enclosingEntryBase(model.getValue(), model.getOffsetAt(position));
        if (!base) {
          return { suggestions: [] };
        }
        const suffix = io[1] === "input" ? "_input" : io[1] === "output" ? "_output" : "_locals";
        const fields = collectStructs(model.getValue()).get(base + suffix) ?? [];
        return { suggestions: fields.map(field) };
      }

      return { suggestions: [] };
    },
  });
}

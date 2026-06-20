// Member completion without a language server. clangd would resolve `state.mut().<field>` semantically;
// we get the same effect in-page by parsing the contract's structs ourselves (instant, zero network — the
// Remix approach to autocomplete). Triggered on `.`, we detect the receiver before the dot and offer its
// members:
//   state.            -> mut() / get()
//   state.mut()./get().  -> StateData fields
//   input. / output. / locals.  -> the enclosing entry's <Name>_input/_output/_locals fields
//   qpi.              -> the QPI host API (transfer, invocator, …)
import type * as Monaco from "monaco-editor";

export interface Field {
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
export function collectStructs(src: string): Map<string, Field[]> {
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
export function enclosingEntryBase(src: string, offset: number): string | null {
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
export const QPI_API: { label: string; insert: string; detail: string }[] = [
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

// The public method surface of the QPI container templates (qpi.h), offered when a member chain resolves
// to a container-typed field (e.g. `state.get().balances.` where `balances` is a HashMap).
export interface Method {
  label: string;
  insert: string;
  detail: string;
}

export const CONTAINERS: Record<string, Method[]> = {
  Array: [
    { label: "get", insert: "get(${1:index})", detail: "const T& — element at index" },
    { label: "set", insert: "set(${1:index}, ${2:value})", detail: "void" },
    { label: "setAll", insert: "setAll(${1:value})", detail: "void — fill every element" },
    { label: "setRange", insert: "setRange(${1:indexBegin}, ${2:indexEnd}, ${3:value})", detail: "void" },
    { label: "rangeEquals", insert: "rangeEquals(${1:indexBegin}, ${2:indexEnd}, ${3:value})", detail: "bit" },
    { label: "capacity", insert: "capacity()", detail: "uint64 — fixed N" },
  ],
  BitArray: [
    { label: "get", insert: "get(${1:index})", detail: "bit" },
    { label: "set", insert: "set(${1:index}, ${2:value})", detail: "void" },
    { label: "setAll", insert: "setAll(${1:value})", detail: "void" },
    { label: "capacity", insert: "capacity()", detail: "uint64" },
  ],
  HashMap: [
    { label: "get", insert: "get(${1:key}, ${2:value})", detail: "bit — reads value out-param" },
    { label: "set", insert: "set(${1:key}, ${2:value})", detail: "sint64 — slot index, or -1 if full" },
    { label: "contains", insert: "contains(${1:key})", detail: "bit" },
    { label: "removeByKey", insert: "removeByKey(${1:key})", detail: "sint64" },
    { label: "replace", insert: "replace(${1:key}, ${2:newValue})", detail: "bit" },
    { label: "population", insert: "population()", detail: "uint64 — number of entries" },
    { label: "capacity", insert: "capacity()", detail: "uint64" },
    { label: "reset", insert: "reset()", detail: "void — empty the map" },
  ],
  HashSet: [
    { label: "add", insert: "add(${1:key})", detail: "sint64" },
    { label: "contains", insert: "contains(${1:key})", detail: "bit" },
    { label: "remove", insert: "remove(${1:key})", detail: "sint64" },
    { label: "population", insert: "population()", detail: "uint64" },
    { label: "capacity", insert: "capacity()", detail: "uint64" },
    { label: "reset", insert: "reset()", detail: "void" },
  ],
  Collection: [
    { label: "add", insert: "add(${1:pov}, ${2:element}, ${3:priority})", detail: "sint64 — element index" },
    { label: "element", insert: "element(${1:elementIndex})", detail: "T" },
    { label: "pov", insert: "pov(${1:elementIndex})", detail: "id — point of view" },
    { label: "priority", insert: "priority(${1:elementIndex})", detail: "sint64" },
    { label: "population", insert: "population()", detail: "uint64" },
    { label: "capacity", insert: "capacity()", detail: "uint64" },
    { label: "remove", insert: "remove(${1:elementIndex})", detail: "sint64" },
    { label: "reset", insert: "reset()", detail: "void" },
  ],
};

// The container kind of a field type, if any — `HashMap<id, sint64>` -> "HashMap".
export function containerKind(type: string): string | null {
  const m = type.match(/^(Array|BitArray|HashMap|HashSet|Collection)\s*</);
  return m ? m[1] : null;
}

// The members offered for a resolved type: a container's method table, else a user struct's fields,
// else none (a scalar / unknown type has no `.` members).
function membersOfType(type: string, structs: Map<string, Field[]>): { fields: Field[]; methods: Method[] } {
  const kind = containerKind(type);
  if (kind) {
    return { fields: [], methods: CONTAINERS[kind] };
  }
  return { fields: structs.get(type) ?? [], methods: [] };
}

// Walk a dotted field path from a root struct to its final type. e.g. root "StateData" + ["config"]
// -> the type of StateData::config. Bails (null) on an unknown field or a non-struct mid-path.
export function walkPath(rootType: string, path: string[], structs: Map<string, Field[]>): string | null {
  let cur = rootType;
  for (const name of path) {
    const fields = structs.get(cur);
    const fld = fields?.find((f) => f.name === name);
    if (!fld) {
      return null;
    }
    cur = fld.type;
  }
  return cur;
}

// `state.mut()`/`state.get()` then any `.field.field…` chain, then the trailing partial word.
const CHAIN = /\b(state\s*\.\s*(?:mut|get)\s*\(\s*\)|input|output|locals)((?:\s*\.\s*\w+)*)\s*\.\s*(\w*)$/;
const STATE_BARE = /\bstate\s*\.\s*(\w*)$/;
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

      const fieldItem = (f: Field): Monaco.languages.CompletionItem => ({
        label: f.name,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: f.name,
        detail: f.type,
        range,
      });
      const methodItem = (m: Method): Monaco.languages.CompletionItem => ({
        label: m.label,
        kind: monaco.languages.CompletionItemKind.Method,
        insertText: m.insert,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: m.detail,
        range,
      });

      // qpi.<api>
      if (QPI_ACCESS.test(line)) {
        return { suggestions: QPI_API.map(methodItem) };
      }

      // state.mut()/get().<path>. | input/output/locals.<path>.  -> resolve the chain to a type, then
      // offer that type's members (a user struct's fields or a container's method table).
      const chain = line.match(CHAIN);
      if (chain) {
        const src = model.getValue();
        const structs = collectStructs(src);

        let rootType: string | null;
        if (chain[1].startsWith("state")) {
          rootType = "StateData";
        } else {
          const base = enclosingEntryBase(src, model.getOffsetAt(position));
          const suffix = chain[1] === "input" ? "_input" : chain[1] === "output" ? "_output" : "_locals";
          rootType = base ? base + suffix : null;
        }
        if (!rootType) {
          return { suggestions: [] };
        }

        const path = (chain[2].match(/\w+/g) ?? []); // the intermediate fields before the trailing partial
        const type = walkPath(rootType, path, structs);
        if (!type) {
          return { suggestions: [] };
        }

        const { fields, methods } = membersOfType(type, structs);
        return { suggestions: [...fields.map(fieldItem), ...methods.map(methodItem)] };
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

      return { suggestions: [] };
    },
  });
}

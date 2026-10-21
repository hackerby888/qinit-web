// Member completion without a language server. clangd would resolve `state.mut().<field>` semantically;
// we get the same effect in-page by parsing the contract's structs ourselves (instant, zero network — the
// Remix approach to autocomplete). Triggered on `.`, we detect the receiver before the dot and offer its
// members:
//   state.            -> mut() / get()
//   state.mut()./get().  -> StateData fields
//   input. / output. / locals.  -> the enclosing entry's <Name>_input/_output/_locals fields
//   qpi.              -> the QPI host API (transfer, invocator, …)
import type * as Monaco from "monaco-editor";
import { isGtestModel } from "./gtest";

export interface Field {
  name: string;
  type: string;
}

export interface TypeScope {
  type: string;
  structs: Map<string, Field[]>;
}

export type QualifiedTypeResolver = (type: string) => TypeScope | null;

// Replace the *contents* of comments and string/char literals with spaces, preserving every offset and
// newline. So a commented-out `INITIALIZE()` or a brace inside a string can't be mistaken for real code
// (a real bug found in qRWA.h: a `// INITIALIZE() …` comment hijacked the next entry's body).
export function maskComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") {
        out += " ";
        i++;
      }
    } else if (c === "/" && src[i + 1] === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
    } else if (c === '"' || c === "'") {
      out += c;
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i] === "{" || src[i] === "}" ? " " : src[i];
        i++;
      }
      if (i < n) {
        out += src[i];
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
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
    const cleaned = raw.replace(/\/\/.*$/gm, "").trim();
    if (!cleaned || cleaned.includes("(") || /^(struct|public|private|protected|typedef|using)\b/.test(cleaned)) {
      continue;
    }
    const decl = cleaned.replace(/\s*=\s*[\s\S]*$/, "").trim(); // drop a default initializer (`uint64 a = 5`)
    const m = decl.match(/^([\s\S]*\S)\s+(\w+)$/);
    if (m) {
      out.push({ type: m[1].replace(/\s+/g, " ").trim(), name: m[2] });
    }
  }
  return out;
}

// All `struct <Name> … { … }` bodies in the source, name -> fields. Nested structs are captured under
// their own bare name too (the outer container's parsed fields are simply never looked up).
export function collectStructs(rawSrc: string): Map<string, Field[]> {
  const src = maskComments(rawSrc);
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

// The entry whose `{ … }` body the cursor sits INSIDE — its declaring macro + the base name for
// <Name>_input/_output/_locals. Null when the cursor is outside every entry body (StateData, the REGISTER
// block, top level), where qpi / state / input / output / locals are all out of scope. For a lifecycle
// hook (INITIALIZE etc.) the macro itself is the base (e.g. INITIALIZE_locals).
export function enclosingEntry(rawSrc: string, offset: number): { macro: string; base: string } | null {
  const src = maskComments(rawSrc); // ignore entry macros / braces that live in comments or string literals
  let m: RegExpExecArray | null;
  ENTRY_RE.lastIndex = 0;
  while ((m = ENTRY_RE.exec(src)) !== null) {
    if (m.index >= offset) {
      break;
    }
    const braceStart = src.indexOf("{", ENTRY_RE.lastIndex);
    if (braceStart < 0) {
      continue;
    }
    let depth = 0;
    let end = src.length;
    for (let i = braceStart; i < src.length; i++) {
      if (src[i] === "{") {
        depth++;
      } else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (offset > braceStart && offset <= end) {
      return { macro: m[1], base: m[2] || m[1] };
    }
  }
  return null;
}

export function enclosingEntryBase(src: string, offset: number): string | null {
  return enclosingEntry(src, offset)?.base ?? null;
}

// A FUNCTION body is const — it can read state (`state.get()`) but not mutate it (`state.mut()`), and its
// qpi context is the read-only one (no transfer/burn/issueAsset/…).
export function isFunctionEntry(macro: string): boolean {
  return macro.includes("FUNCTION");
}

// A user PUBLIC_/PRIVATE_ function/procedure — the only entries with author-authored input/output structs.
// System hooks (INITIALIZE, BEGIN_TICK, …) carry NoData / qpi.h-defined IO instead.
export function isUserEntry(macro: string): boolean {
  return /^(?:PUBLIC|PRIVATE)_(?:FUNCTION|PROCEDURE)/.test(macro);
}

// The QPI host API surface on `qpi.` — labels + arg snippets + a short return-type hint.
export const QPI_API: Method[] = [
  { label: "invocator", insert: "invocator()", detail: "id — the tx signer / calling contract" },
  { label: "originator", insert: "originator()", detail: "id — the root initiator of the call chain" },
  { label: "invocationReward", insert: "invocationReward()", detail: "sint64 — Qu sent with the invocation" },
  { label: "transfer", insert: "transfer(${1:destination}, ${2:amount})", detail: "sint64 — send Qu; returns remaining", proc: true },
  { label: "burn", insert: "burn(${1:amount})", detail: "sint64 — destroy Qu", proc: true },
  { label: "getEntity", insert: "getEntity(${1:id}, ${2:entity})", detail: "bit — spectrum balance lookup" },
  { label: "issueAsset", insert: "issueAsset(${1:name}, ${2:issuer}, ${3:decimals}, ${4:numberOfShares}, ${5:unitOfMeasurement})", detail: "sint64 — mint an asset", proc: true },
  { label: "isAssetIssued", insert: "isAssetIssued(${1:issuer}, ${2:assetName})", detail: "bit" },
  { label: "numberOfShares", insert: "numberOfShares(${1:asset}, ${2:ownership}, ${3:possession})", detail: "sint64" },
  { label: "numberOfPossessedShares", insert: "numberOfPossessedShares(${1:assetName}, ${2:issuer}, ${3:owner}, ${4:possessor}, ${5:ownershipManagingContract}, ${6:possessionManagingContract})", detail: "sint64" },
  { label: "transferShareOwnershipAndPossession", insert: "transferShareOwnershipAndPossession(${1:assetName}, ${2:issuer}, ${3:owner}, ${4:possessor}, ${5:numberOfShares}, ${6:newOwnerAndPossessor})", detail: "sint64", proc: true },
  { label: "distributeDividends", insert: "distributeDividends(${1:amountPerShare})", detail: "bit", proc: true },
  { label: "nextId", insert: "nextId(${1:currentId})", detail: "id — next occupied spectrum id" },
  { label: "prevId", insert: "prevId(${1:currentId})", detail: "id" },
  { label: "isFrozenIdentity", insert: "isFrozenIdentity(${1:id})", detail: "bit — true if the id is on the frozen list" },
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
  proc?: boolean; // a mutating qpi method (QpiContextProcedureCall) — not available in a const function
  returnTypeArg?: number; // template argument returned by a container accessor (for chained completion)
}

export const CONTAINERS: Record<string, Method[]> = {
  Array: [
    { label: "get", insert: "get(${1:index})", detail: "const T& — element at index", returnTypeArg: 0 },
    { label: "set", insert: "set(${1:index}, ${2:value})", detail: "void — write element at index" },
    { label: "setAll", insert: "setAll(${1:value})", detail: "void — fill every element" },
    { label: "setRange", insert: "setRange(${1:indexBegin}, ${2:indexEnd}, ${3:value})", detail: "void — fill [begin, end)" },
    { label: "rangeEquals", insert: "rangeEquals(${1:indexBegin}, ${2:indexEnd}, ${3:value})", detail: "bool" },
    { label: "capacity", insert: "capacity()", detail: "uint64 — fixed N" },
  ],
  BitArray: [
    { label: "get", insert: "get(${1:index})", detail: "bit — bit at index" },
    { label: "set", insert: "set(${1:index}, ${2:value})", detail: "void" },
    { label: "setAll", insert: "setAll(${1:value})", detail: "void" },
    { label: "capacity", insert: "capacity()", detail: "uint64 — fixed L" },
  ],
  // HashMap.get fills `value` (an out-param reference) and returns whether the key was present.
  HashMap: [
    { label: "get", insert: "get(${1:key}, ${2:value})", detail: "bool — true if found; fills value (out-param)" },
    { label: "set", insert: "set(${1:key}, ${2:value})", detail: "sint64 — element index, or -1 if full" },
    { label: "contains", insert: "contains(${1:key})", detail: "bool" },
    { label: "removeByKey", insert: "removeByKey(${1:key})", detail: "sint64 — removed element index, or -1" },
    { label: "replace", insert: "replace(${1:key}, ${2:newValue})", detail: "bool — true if the key existed" },
    { label: "getElementIndex", insert: "getElementIndex(${1:key})", detail: "sint64 — index of key, or -1" },
    { label: "key", insert: "key(${1:elementIndex})", detail: "const KeyT& — key at element index", returnTypeArg: 0 },
    { label: "value", insert: "value(${1:elementIndex})", detail: "const ValueT& — value at element index", returnTypeArg: 1 },
    { label: "nextElementIndex", insert: "nextElementIndex(${1:elementIndex})", detail: "sint64 — next occupied index, or -1 (iteration)" },
    { label: "population", insert: "population()", detail: "uint64 — number of entries" },
    { label: "capacity", insert: "capacity()", detail: "uint64" },
    { label: "reset", insert: "reset()", detail: "void — empty the map" },
  ],
  HashSet: [
    { label: "add", insert: "add(${1:key})", detail: "sint64 — element index, or -1 if full" },
    { label: "contains", insert: "contains(${1:key})", detail: "bool" },
    { label: "remove", insert: "remove(${1:key})", detail: "sint64 — removed element index, or -1" },
    { label: "getElementIndex", insert: "getElementIndex(${1:key})", detail: "sint64 — index of key, or -1" },
    { label: "key", insert: "key(${1:elementIndex})", detail: "KeyT — key at element index", returnTypeArg: 0 },
    { label: "nextElementIndex", insert: "nextElementIndex(${1:elementIndex})", detail: "sint64 — next occupied index, or -1 (iteration)" },
    { label: "population", insert: "population()", detail: "uint64" },
    { label: "capacity", insert: "capacity()", detail: "uint64" },
    { label: "reset", insert: "reset()", detail: "void" },
  ],
  Collection: [
    { label: "add", insert: "add(${1:pov}, ${2:element}, ${3:priority})", detail: "sint64 — new element index, or -1 if full" },
    { label: "element", insert: "element(${1:elementIndex})", detail: "T — element at index", returnTypeArg: 0 },
    { label: "pov", insert: "pov(${1:elementIndex})", detail: "id — point of view of an element" },
    { label: "priority", insert: "priority(${1:elementIndex})", detail: "sint64 — priority of an element" },
    { label: "headIndex", insert: "headIndex(${1:pov})", detail: "sint64 — highest-priority element index for a pov" },
    { label: "nextElementIndex", insert: "nextElementIndex(${1:elementIndex})", detail: "sint64 — next element in the pov's queue, or -1" },
    { label: "prevElementIndex", insert: "prevElementIndex(${1:elementIndex})", detail: "sint64 — previous element in the queue, or -1" },
    { label: "population", insert: "population()", detail: "uint64 — total elements" },
    { label: "capacity", insert: "capacity()", detail: "uint64" },
    { label: "remove", insert: "remove(${1:elementIndex})", detail: "sint64 — next element index after removal" },
    { label: "replace", insert: "replace(${1:oldElementIndex}, ${2:newElement})", detail: "void" },
    { label: "reset", insert: "reset()", detail: "void — empty the collection" },
  ],
  // Like Array, but allows any capacity L (not restricted to a power of two) — slower; use only when needed.
  SlowAnySizeArray: [
    { label: "get", insert: "get(${1:index})", detail: "const T& — element at index", returnTypeArg: 0 },
    { label: "set", insert: "set(${1:index}, ${2:value})", detail: "void — write element at index" },
    { label: "setAll", insert: "setAll(${1:value})", detail: "void — fill every element" },
    { label: "capacity", insert: "capacity()", detail: "uint64 — any L (not restricted to 2^N)" },
  ],
  // Doubly-linked list with O(1) removal by element index and a recycling free list.
  LinkedList: [
    { label: "element", insert: "element(${1:elementIndex})", detail: "const T& — value at an element index", returnTypeArg: 0 },
    { label: "addHead", insert: "addHead(${1:value})", detail: "sint64 — new element index, or -1 if full" },
    { label: "addTail", insert: "addTail(${1:value})", detail: "sint64 — new element index, or -1 if full" },
    { label: "insertBefore", insert: "insertBefore(${1:elementIndex}, ${2:value})", detail: "sint64 — new element index, or -1" },
    { label: "insertAfter", insert: "insertAfter(${1:elementIndex}, ${2:value})", detail: "sint64 — new element index, or -1" },
    { label: "remove", insert: "remove(${1:elementIndex})", detail: "void" },
    { label: "replace", insert: "replace(${1:elementIndex}, ${2:newValue})", detail: "bool" },
    { label: "headIndex", insert: "headIndex()", detail: "sint64 — first element index, or -1" },
    { label: "tailIndex", insert: "tailIndex()", detail: "sint64 — last element index, or -1" },
    { label: "nextElementIndex", insert: "nextElementIndex(${1:elementIndex})", detail: "sint64 — next, or -1" },
    { label: "prevElementIndex", insert: "prevElementIndex(${1:elementIndex})", detail: "sint64 — previous, or -1" },
    { label: "population", insert: "population()", detail: "uint64" },
    { label: "capacity", insert: "capacity()", detail: "uint64" },
    { label: "reset", insert: "reset()", detail: "void — empty the list" },
  ],
  // NOTE: ProposalVoting is governance *storage* only — its getProposal/vote/… methods live on the
  // QpiContextProposalFunctionCall/ProcedureCall wrappers, not on the field itself, so it isn't a
  // direct-call container. It stays a known type (vocab/template hints) but offers no `.method()` set.
};

export interface ContainerType {
  kind: string;
  args: string[];
}

function splitTemplateArgs(source: string): string[] {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "<") {
      depth++;
    } else if (source[index] === ">") {
      depth = Math.max(0, depth - 1);
    } else if (source[index] === "," && depth === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  args.push(source.slice(start).trim());
  return args;
}

// `HashMap<id, Payload, 16>` -> its kind and top-level template arguments, including nested templates.
export function containerType(type: string): ContainerType | null {
  const match = type.trim().match(/^(\w+)\s*<([\s\S]*)>$/);
  if (!match || !(match[1] in CONTAINERS)) {
    return null;
  }
  return { kind: match[1], args: splitTemplateArgs(match[2]) };
}

// The container kind of a field type, if any — `HashMap<id, sint64, 16>` -> "HashMap".
export function containerKind(type: string): string | null {
  return containerType(type)?.kind ?? null;
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

const STATE_BARE = /\bstate\s*\.\s*(\w*)$/;
const QPI_ACCESS = /\bqpi\s*\.\s*(\w*)$/;

interface AccessSegment {
  name: string;
  call: boolean;
}

interface MemberChain {
  root: "state" | "input" | "output" | "locals";
  segments: AccessSegment[];
}

function parseSegments(source: string): AccessSegment[] | null {
  const segments: AccessSegment[] = [];
  let index = 0;
  const skipSpace = () => {
    while (/\s/.test(source[index] ?? "")) {
      index++;
    }
  };

  while (index < source.length) {
    skipSpace();
    if (source[index] !== ".") {
      return null;
    }
    index++;
    skipSpace();
    const name = source.slice(index).match(/^[A-Za-z_]\w*/)?.[0];
    if (!name) {
      return null;
    }
    index += name.length;
    skipSpace();

    let call = false;
    if (source[index] === "(") {
      call = true;
      let depth = 0;
      while (index < source.length) {
        const char = source[index++];
        if (char === "(") {
          depth++;
        } else if (char === ")" && --depth === 0) {
          break;
        }
      }
      if (depth !== 0) {
        return null;
      }
    }
    segments.push({ name, call });
  }
  return segments;
}

// Parse the receiver to the left of the final completion dot. Calls are kept as segments so container
// accessors such as `items.get(0).` can carry their template return type into the next lookup.
function memberChainAt(line: string): MemberChain | null {
  let depth = 0;
  let finalDot = -1;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === "(") {
      depth++;
    } else if (line[index] === ")") {
      depth = Math.max(0, depth - 1);
    } else if (line[index] === "." && depth === 0) {
      finalDot = index;
    }
  }
  if (finalDot < 0 || !/^\s*\w*$/.test(line.slice(finalDot + 1))) {
    return null;
  }

  const receiver = line.slice(0, finalDot).trimEnd();
  const roots = /\b(state\s*\.\s*(?:mut|get)\s*\(\s*\)|input\b|output\b|locals\b)/g;
  let parsed: MemberChain | null = null;
  for (const match of receiver.matchAll(roots)) {
    const segments = parseSegments(receiver.slice(match.index + match[0].length));
    if (!segments) {
      continue;
    }
    const root = match[1].startsWith("state") ? "state" : match[1].trim() as MemberChain["root"];
    parsed = { root, segments };
  }
  return parsed;
}

// A resolved completion entry, decoupled from Monaco. `method` picks the kind (Method vs Field); an insert
// containing `${…}` is a snippet.
export interface MemberItem {
  label: string;
  insert: string;
  detail: string;
  method: boolean;
}

function fieldMember(f: Field): MemberItem {
  return { label: f.name, insert: f.name, detail: f.type, method: false };
}

function methodMember(m: Method): MemberItem {
  return { label: m.label, insert: m.insert, detail: m.detail, method: true };
}

function resolveType(type: string, structs: Map<string, Field[]>, resolveQualified?: QualifiedTypeResolver): TypeScope {
  const normalized = type
    .trim()
    .replace(/^const\s+/, "")
    .replace(/\s*(?:const\s*)?[&*]+\s*$/, "")
    .replace(/\s*::\s*/g, "::")
    .trim();
  return /^\w+::\w+$/.test(normalized) && resolveQualified
    ? resolveQualified(normalized) ?? { type: normalized, structs }
    : { type: normalized, structs };
}

function resolveMemberChain(
  start: TypeScope,
  segments: AccessSegment[],
  resolveQualified?: QualifiedTypeResolver,
): TypeScope | null {
  let current = start;
  for (const segment of segments) {
    if (segment.call) {
      const container = containerType(current.type);
      const method = container && CONTAINERS[container.kind].find((candidate) => candidate.label === segment.name);
      const returned = method?.returnTypeArg === undefined ? undefined : container?.args[method.returnTypeArg];
      if (!returned) {
        return null;
      }
      current = resolveType(returned, current.structs, resolveQualified);
      continue;
    }

    const field = current.structs.get(current.type)?.find((candidate) => candidate.name === segment.name);
    if (!field) {
      return null;
    }
    current = resolveType(field.type, current.structs, resolveQualified);
  }
  return current;
}

// The member completion for a `.`-triggered position — the QPI access / member-chain / state-bare logic +
// every gating rule, pure (no Monaco). `line` is the line text up to the cursor; `offset` is the cursor's
// source offset. Returns null when this isn't a member-access position; an array (possibly empty when the
// context gates everything out) otherwise.
export function memberCompletionAt(
  src: string,
  line: string,
  offset: number,
  resolveQualified?: QualifiedTypeResolver,
): MemberItem[] | null {
  // qpi.<api> — only inside an entry body; a const function sees only the read-only host API.
  if (QPI_ACCESS.test(line)) {
    const entry = enclosingEntry(src, offset);
    if (!entry) {
      return [];
    }
    const api = isFunctionEntry(entry.macro) ? QPI_API.filter((m) => !m.proc) : QPI_API;
    return api.map(methodMember);
  }

  // state.mut()/get().<path>. | input/output/locals.<path>. -> resolve fields and modeled container calls,
  // crossing into another project contract when a field uses a qualified public IO type.
  const chain = memberChainAt(line);
  if (chain) {
    const structs = collectStructs(src);
    const entry = enclosingEntry(src, offset);
    if (!entry) {
      return []; // state / input / output / locals are only in scope in an entry body
    }

    let rootType: string;
    if (chain.root === "state") {
      rootType = "StateData";
    } else {
      const suffix = chain.root === "input" ? "_input" : chain.root === "output" ? "_output" : "_locals";
      // input/output are author-authored only in a user fn/proc; system hooks carry NoData / qpi.h IO.
      if ((chain.root === "input" || chain.root === "output") && !isUserEntry(entry.macro)) {
        return [];
      }
      // `locals` only exists in a _WITH_LOCALS entry that actually declares a <Name>_locals struct.
      if (chain.root === "locals" && !(entry.macro.endsWith("_WITH_LOCALS") && structs.has(entry.base + "_locals"))) {
        return [];
      }
      rootType = entry.base + suffix;
    }

    const resolved = resolveMemberChain({ type: rootType, structs }, chain.segments, resolveQualified);
    if (!resolved) {
      return [];
    }
    const { fields, methods } = membersOfType(resolved.type, resolved.structs);
    return [...fields.map(fieldMember), ...methods.map(methodMember)];
  }

  // state. -> get() always; mut() only where state may be mutated (not in a const FUNCTION body).
  if (STATE_BARE.test(line)) {
    const entry = enclosingEntry(src, offset);
    if (!entry) {
      return [];
    }
    const items: MemberItem[] = [];
    if (!isFunctionEntry(entry.macro)) {
      items.push({ label: "mut", insert: "mut().", detail: "writable StateData (marks the slot dirty)", method: true });
    }
    items.push({ label: "get", insert: "get().", detail: "read-only StateData", method: true });
    return items;
  }

  return null;
}

let registered = false;

export function registerQpiMembers(monaco: typeof Monaco, resolveQualified?: QualifiedTypeResolver): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerCompletionItemProvider("cpp", {
    triggerCharacters: ["."],
    provideCompletionItems(model, position) {
      if (isGtestModel(model)) {
        return { suggestions: [] }; // members like state./qpi. don't exist in a gtest test
      }
      const line = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
      const items = memberCompletionAt(model.getValue(), line, model.getOffsetAt(position), resolveQualified);
      if (!items) {
        return { suggestions: [] };
      }

      const word = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return {
        suggestions: items.map((it) => ({
          label: it.label,
          kind: it.method ? monaco.languages.CompletionItemKind.Method : monaco.languages.CompletionItemKind.Field,
          insertText: it.insert,
          insertTextRules: it.insert.includes("$") ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          detail: it.detail,
          range,
          // An item that lands the cursor right after a `.` (state.mut(). / get().) re-opens the suggest
          // widget on accept, so the StateData fields appear immediately instead of after the next keystroke.
          command: it.insert.endsWith(".") ? { id: "editor.action.triggerSuggest", title: "" } : undefined,
        })),
      };
    },
  });
}

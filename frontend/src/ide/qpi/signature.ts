// Signature help for QPI calls — the parameter hints that pop while you type inside `qpi.transfer(…)`, a
// container method like `balances.set(…)`, or a container type's template list `HashMap<…>`. No language
// server: we find the bracket the cursor sits in, resolve the receiver to its method (the same chain
// resolution member completion uses) or the container's template params, and read the parameter names
// straight out of the method's insert snippet. The active parameter tracks the commas you've typed.
import type * as Monaco from "monaco-editor";
import { isGtestModel } from "./gtest";
import { QPI_API, CONTAINERS, collectStructs, containerKind, walkPath, enclosingEntryBase, type Method } from "./members";

// The innermost unclosed `open` bracket before the cursor + the count of top-level commas after it (the
// active argument index). Used for both `(` calls and `<` template-argument lists.
function innermostOpen(line: string, open: string, close: string): { pos: number; arg: number } | null {
  let depth = 0;
  let arg = 0;
  for (let i = line.length - 1; i >= 0; i--) {
    const c = line[i];
    if (c === close) {
      depth++;
    } else if (c === open) {
      if (depth === 0) {
        return { pos: i, arg };
      }
      depth--;
    } else if (c === "," && depth === 0) {
      arg++;
    }
  }
  return null;
}

// `qpi`, or a state/io chain ending in `.method` immediately before the open paren.
const CALL_HEAD = /(qpi|state\s*\.\s*(?:mut|get)\s*\(\s*\)|input|output|locals)((?:\s*\.\s*\w+)*)\s*\.\s*(\w+)\s*$/;

// A container type name immediately before a `<` -> its template parameter list (qpi.h).
const TEMPLATE_HEAD = /(Array|BitArray|SlowAnySizeArray|HashMap|HashSet|Collection|LinkedList|ProposalVoting)\s*$/;
const TEMPLATES: Record<string, string[]> = {
  Array: ["T", "L"],
  BitArray: ["L"],
  SlowAnySizeArray: ["T", "L"],
  HashMap: ["KeyT", "ValueT", "L"],
  HashSet: ["KeyT", "L"],
  Collection: ["T", "L"],
  LinkedList: ["T", "L"],
  ProposalVoting: ["ProposerAndVoterHandlingT", "ProposalDataT"],
};
const TEMPLATE_DOC = "L is the total capacity (a power of two).";

// A resolved signature, decoupled from Monaco: the rendered label, the [start,end] ranges of each parameter
// within it (for active-arg highlighting), the active index, and the doc shown below.
export interface SignatureInfo {
  label: string;
  params: [number, number][];
  active: number;
  doc: string;
}

// `${1:name}, ${2:other}` -> ["name", "other"].
function paramNames(insert: string): string[] {
  return [...insert.matchAll(/\$\{\d+:([^}]*)\}/g)].map((x) => x[1]);
}

// Render `name<open>p1, p2<close>` and the [start,end] range of each parameter inside it.
function render(name: string, params: string[], open: string, close: string): { label: string; params: [number, number][] } {
  let label = name + open;
  const ranges: [number, number][] = [];
  params.forEach((p, i) => {
    if (i) {
      label += ", ";
    }
    const start = label.length;
    label += p;
    ranges.push([start, label.length]);
  });
  label += close;
  return { label, params: ranges };
}

// `qpi.method(…` / `chain.method(…` -> the receiver's method, or null.
function callMethodAt(src: string, line: string, offset: number, open: number): Method | null {
  const head = line.slice(0, open).match(CALL_HEAD);
  if (!head) {
    return null;
  }

  let methods: Method[] | null;
  if (head[1] === "qpi") {
    methods = QPI_API;
  } else {
    const structs = collectStructs(src);
    let rootType: string | null;
    if (head[1].startsWith("state")) {
      rootType = "StateData";
    } else {
      const base = enclosingEntryBase(src, offset);
      const suffix = head[1] === "input" ? "_input" : head[1] === "output" ? "_output" : "_locals";
      rootType = base ? base + suffix : null;
    }
    if (!rootType) {
      return null;
    }
    const type = walkPath(rootType, head[2].match(/\w+/g) ?? [], structs);
    const kind = type ? containerKind(type) : null;
    methods = kind ? CONTAINERS[kind] : null;
  }

  return methods?.find((x) => x.label === head[3]) ?? null;
}

// The signature for a `(` call or `<` template list the cursor is inside — pure, no Monaco. `line` is the
// line text up to the cursor; `offset` is the cursor's source offset. Null when not inside such a bracket.
export function signatureAt(src: string, line: string, offset: number): SignatureInfo | null {
  const call = innermostOpen(line, "(", ")");
  const tmpl = innermostOpen(line, "<", ">");
  const isTemplate = tmpl && (!call || tmpl.pos > call.pos);
  const ctx = isTemplate ? tmpl : call;
  if (!ctx) {
    return null;
  }

  if (isTemplate) {
    const head = line.slice(0, ctx.pos).match(TEMPLATE_HEAD);
    if (!head) {
      return null;
    }
    const params = TEMPLATES[head[1]];
    const r = render(head[1], params, "<", ">");
    return { ...r, active: Math.min(ctx.arg, Math.max(0, params.length - 1)), doc: TEMPLATE_DOC };
  }

  const method = callMethodAt(src, line, offset, ctx.pos);
  if (!method) {
    return null;
  }
  const names = paramNames(method.insert);
  const r = render(method.label, names, "(", ")");
  return { ...r, active: Math.min(ctx.arg, Math.max(0, names.length - 1)), doc: method.detail };
}

let registered = false;

export function registerQpiSignatureHelp(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerSignatureHelpProvider("cpp", {
    signatureHelpTriggerCharacters: ["(", ",", "<"],
    signatureHelpRetriggerCharacters: [",", "<"],
    provideSignatureHelp(model, position) {
      if (isGtestModel(model)) {
        return null;
      }
      const line = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
      const sig = signatureAt(model.getValue(), line, model.getOffsetAt(position));
      if (!sig) {
        return null;
      }

      return {
        value: {
          signatures: [{ label: sig.label, documentation: sig.doc, parameters: sig.params.map((r) => ({ label: r })) }],
          activeSignature: 0,
          activeParameter: sig.active,
        },
        dispose() {},
      };
    },
  });
}

// Signature help for QPI calls — the parameter hints that pop while you type inside `qpi.transfer(…)` or a
// container method like `balances.set(…)`. No language server: we find the call the cursor sits in, resolve
// the receiver to its API (the same chain resolution member completion uses), and read the parameter names
// straight out of the method's insert snippet. The active parameter tracks the commas you've typed.
import type * as Monaco from "monaco-editor";
import { QPI_API, CONTAINERS, collectStructs, containerKind, walkPath, enclosingEntryBase, type Method } from "./members";

// Build a Monaco SignatureInformation from a method's `${n:name}` insert snippet — precise [start,end]
// parameter ranges so the active argument highlights correctly.
function toSignature(m: Method): Monaco.languages.SignatureInformation {
  const names = [...m.insert.matchAll(/\$\{\d+:([^}]*)\}/g)].map((x) => x[1]);

  let label = m.label + "(";
  const parameters: Monaco.languages.ParameterInformation[] = [];
  names.forEach((name, i) => {
    if (i) {
      label += ", ";
    }
    const start = label.length;
    label += name;
    parameters.push({ label: [start, label.length] });
  });
  label += ")";

  return { label, parameters, documentation: m.detail };
}

// The innermost call the cursor is inside: the offset of its open `(` and the count of top-level commas
// before the cursor (the active argument index). Single line — contract calls don't wrap.
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
const TEMPLATE_HEAD = /(Array|BitArray|HashMap|HashSet|Collection)\s*$/;
const TEMPLATES: Record<string, string[]> = {
  Array: ["T", "L"],
  BitArray: ["L"],
  HashMap: ["KeyT", "ValueT", "L"],
  HashSet: ["KeyT", "L"],
  Collection: ["T", "L"],
};
const TEMPLATE_DOC = "L is the total capacity (a power of two).";

// A SignatureInformation for `Name<p1, p2, …>` with precise [start,end] parameter ranges.
function templateSignature(name: string, params: string[]): Monaco.languages.SignatureInformation {
  let label = name + "<";
  const parameters: Monaco.languages.ParameterInformation[] = [];
  params.forEach((p, i) => {
    if (i) {
      label += ", ";
    }
    const start = label.length;
    label += p;
    parameters.push({ label: [start, label.length] });
  });
  label += ">";

  return { label, parameters, documentation: TEMPLATE_DOC };
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
      const line = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });

      // Which bracket is the cursor innermost in — a `(` call or a `<` template list? Whichever opens
      // closer to the cursor wins.
      const call = innermostOpen(line, "(", ")");
      const tmpl = innermostOpen(line, "<", ">");
      const isTemplate = tmpl && (!call || tmpl.pos > call.pos);

      const ctx = isTemplate ? tmpl : call;
      if (!ctx) {
        return null;
      }

      const sig = isTemplate ? templateSig(line, ctx.pos) : callSig(model, position, line, ctx.pos);
      if (!sig) {
        return null;
      }

      return {
        value: {
          signatures: [sig],
          activeSignature: 0,
          activeParameter: Math.min(ctx.arg, Math.max(0, sig.parameters.length - 1)),
        },
        dispose() {},
      };
    },
  });
}

// `Container<…` -> the template-parameter signature.
function templateSig(line: string, open: number): Monaco.languages.SignatureInformation | null {
  const head = line.slice(0, open).match(TEMPLATE_HEAD);
  if (!head) {
    return null;
  }
  return templateSignature(head[1], TEMPLATES[head[1]]);
}

// `qpi.method(…` / `chain.method(…` -> the method's call signature.
function callSig(model: Monaco.editor.ITextModel, position: Monaco.Position, line: string, open: number): Monaco.languages.SignatureInformation | null {
  const head = line.slice(0, open).match(CALL_HEAD);
  if (!head) {
    return null;
  }

  let methods: Method[] | null;
  if (head[1] === "qpi") {
    methods = QPI_API;
  } else {
    const src = model.getValue();
    const structs = collectStructs(src);

    let rootType: string | null;
    if (head[1].startsWith("state")) {
      rootType = "StateData";
    } else {
      const base = enclosingEntryBase(src, model.getOffsetAt(position));
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

  const method = methods?.find((x) => x.label === head[3]);
  return method ? toSignature(method) : null;
}

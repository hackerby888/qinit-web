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
function activeCall(line: string): { open: number; arg: number } | null {
  let depth = 0;
  let arg = 0;
  for (let i = line.length - 1; i >= 0; i--) {
    const c = line[i];
    if (c === ")") {
      depth++;
    } else if (c === "(") {
      if (depth === 0) {
        return { open: i, arg };
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

let registered = false;

export function registerQpiSignatureHelp(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerSignatureHelpProvider("cpp", {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [","],
    provideSignatureHelp(model, position) {
      const line = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });

      const call = activeCall(line);
      if (!call) {
        return null;
      }

      const head = line.slice(0, call.open).match(CALL_HEAD);
      if (!head) {
        return null;
      }

      // Resolve the receiver to its method set: qpi -> the host API; a state/io chain -> the container
      // method table when the chain lands on a container-typed field.
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
      if (!method) {
        return null;
      }

      const sig = toSignature(method);
      return {
        value: {
          signatures: [sig],
          activeSignature: 0,
          activeParameter: Math.min(call.arg, Math.max(0, sig.parameters.length - 1)),
        },
        dispose() {},
      };
    },
  });
}

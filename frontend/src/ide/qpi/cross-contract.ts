// Workspace-aware IntelliSense for CALL/INVOKE_OTHER_CONTRACT. The browser editor has no clangd, so
// public callee entries and their IO types are indexed directly from the live project sources.
import type * as Monaco from "monaco-editor";
import { baseName } from "../workspace";
import { definitionOffset } from "./definition";
import { isGtestModel } from "./gtest";
import { maskComments } from "./members";

type EntryKind = "function" | "procedure";

export interface CrossContractEntry {
  name: string;
  kind: EntryKind;
}

export interface CrossContractSymbol {
  name: string;
  file: string;
  source: string;
  functions: CrossContractEntry[];
  procedures: CrossContractEntry[];
}

export interface CrossCompletion {
  label: string;
  detail: string;
  kind: "contract" | "function" | "procedure" | "type";
}

export interface CrossSignature {
  label: string;
  params: [number, number][];
  active: number;
  doc: string;
}

export interface CrossDefinition {
  file: string;
  source: string;
  offset: number;
  length: number;
}

export interface CrossHover {
  title: string;
  detail: string;
}

const MACROS = {
  CALL_OTHER_CONTRACT_FUNCTION: {
    kind: "function",
    params: ["contract", "function", "input", "output"],
  },
  CALL_OTHER_CONTRACT_FUNCTION_E: {
    kind: "function",
    params: ["contract", "function", "input", "output", "error"],
  },
  INVOKE_OTHER_CONTRACT_PROCEDURE: {
    kind: "procedure",
    params: ["contract", "procedure", "input", "output", "reward"],
  },
  INVOKE_OTHER_CONTRACT_PROCEDURE_E: {
    kind: "procedure",
    params: ["contract", "procedure", "input", "output", "reward", "error"],
  },
} as const;

type CrossMacro = keyof typeof MACROS;

interface ArgumentSpan {
  start: number;
  end: number;
  text: string;
}

interface CrossCall {
  macro: CrossMacro;
  open: number;
  close: number;
  args: ArgumentSpan[];
}

interface SymbolTarget {
  contract: CrossContractSymbol;
  entry?: CrossContractEntry;
  type?: string;
}

let contracts = new Map<string, CrossContractSymbol>();

const headerFile = (name: string): boolean => /\.(?:h|hh|hpp|hxx)$/i.test(name);

function registeredEntries(source: string, kind: EntryKind): CrossContractEntry[] {
  const code = maskComments(source);
  const upper = kind === "function" ? "FUNCTION" : "PROCEDURE";
  const declared = new Set(
    [...code.matchAll(new RegExp(`\\bPUBLIC_${upper}(?:_WITH_LOCALS)?\\s*\\(\\s*(\\w+)\\s*\\)`, "g"))]
      .map((match) => match[1]),
  );
  const out: CrossContractEntry[] = [];
  const seen = new Set<string>();
  const registration = new RegExp(`\\bREGISTER_USER_${upper}\\s*\\(\\s*(\\w+)\\s*,`, "g");
  for (const match of code.matchAll(registration)) {
    if (declared.has(match[1]) && !seen.has(match[1])) {
      seen.add(match[1]);
      out.push({ name: match[1], kind });
    }
  }
  return out;
}

export function setQpiWorkspaceFiles(files: { name: string; source: string }[]): void {
  const next = new Map<string, CrossContractSymbol>();
  for (const file of files) {
    if (!headerFile(file.name)) {
      continue;
    }
    const name = baseName(file.name);
    if (next.has(name)) {
      continue; // match the IDE compiler's first-basename-wins resolution
    }
    next.set(name, {
      name,
      file: file.name,
      source: file.source,
      functions: registeredEntries(file.source, "function"),
      procedures: registeredEntries(file.source, "procedure"),
    });
  }
  contracts = next;
}

export function qpiWorkspaceContracts(): CrossContractSymbol[] {
  return [...contracts.values()];
}

function parseArguments(source: string, open: number): { close: number; args: ArgumentSpan[] } {
  const args: ArgumentSpan[] = [];
  let start = open + 1;
  let parens = 0;
  let brackets = 0;
  let braces = 0;

  const push = (end: number) => {
    args.push({ start, end, text: source.slice(start, end).trim() });
  };

  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === "(") {
      parens++;
    } else if (char === ")") {
      if (parens === 0 && brackets === 0 && braces === 0) {
        push(index);
        return { close: index, args };
      }
      parens = Math.max(0, parens - 1);
    } else if (char === "[") {
      brackets++;
    } else if (char === "]") {
      brackets = Math.max(0, brackets - 1);
    } else if (char === "{") {
      braces++;
    } else if (char === "}") {
      braces = Math.max(0, braces - 1);
    } else if (char === "," && parens === 0 && brackets === 0 && braces === 0) {
      push(index);
      start = index + 1;
    }
  }

  push(source.length);
  return { close: source.length, args };
}

function crossCallAt(source: string, offset: number): CrossCall | null {
  const code = maskComments(source);
  const macroNames = Object.keys(MACROS).join("|");
  const matcher = new RegExp(`\\b(${macroNames})\\s*\\(`, "g");
  let found: CrossCall | null = null;

  for (const match of code.matchAll(matcher)) {
    const open = match.index + match[0].lastIndexOf("(");
    const parsed = parseArguments(code, open);
    if (offset >= open + 1 && offset <= parsed.close) {
      found = {
        macro: match[1] as CrossMacro,
        open,
        close: parsed.close,
        args: parsed.args,
      };
    }
  }
  return found;
}

function argumentAt(call: CrossCall, offset: number): number {
  const index = call.args.findIndex((arg) => offset >= arg.start && offset <= arg.end);
  return index < 0 ? Math.max(0, call.args.length - 1) : index;
}

function qualifiedContractAt(source: string, offset: number): string | null {
  const before = maskComments(source).slice(0, offset);
  return before.match(/\b(\w+)\s*::\s*\w*$/)?.[1] ?? null;
}

const currentContractName = (file?: string): string => baseName((file ?? "").replace(/^\/+/, ""));

export function isCrossContractCompletionAt(source: string, offset: number): boolean {
  if (qualifiedContractAt(source, offset)) {
    return true;
  }
  const call = crossCallAt(source, offset);
  return !!call && argumentAt(call, offset) <= 1;
}

export function crossContractCompletionAt(source: string, offset: number, currentFile?: string): CrossCompletion[] {
  const qualified = qualifiedContractAt(source, offset);
  if (qualified) {
    const contract = contracts.get(qualified);
    if (!contract) {
      return [];
    }
    return [...contract.functions, ...contract.procedures].flatMap((entry) => [
      { label: `${entry.name}_input`, detail: `${contract.name} ${entry.kind} input`, kind: "type" as const },
      { label: `${entry.name}_output`, detail: `${contract.name} ${entry.kind} output`, kind: "type" as const },
    ]);
  }

  const call = crossCallAt(source, offset);
  if (!call) {
    return [];
  }
  const arg = argumentAt(call, offset);
  if (arg === 0) {
    const current = currentContractName(currentFile);
    return [...contracts.values()]
      .filter((contract) => contract.name !== current)
      .map((contract) => ({ label: contract.name, detail: contract.file, kind: "contract" }));
  }
  if (arg === 1) {
    const contract = contracts.get(call.args[0]?.text ?? "");
    if (!contract) {
      return [];
    }
    const kind = MACROS[call.macro].kind;
    return (kind === "function" ? contract.functions : contract.procedures)
      .map((entry) => ({ label: entry.name, detail: `${contract.name} ${entry.kind}`, kind: entry.kind }));
  }
  return [];
}

function renderSignature(macro: CrossMacro): { label: string; params: [number, number][] } {
  let label = `${macro}(`;
  const ranges: [number, number][] = [];
  MACROS[macro].params.forEach((param, index) => {
    if (index > 0) {
      label += ", ";
    }
    const start = label.length;
    label += param;
    ranges.push([start, label.length]);
  });
  label += ")";
  return { label, params: ranges };
}

export function crossContractSignatureAt(source: string, offset: number): CrossSignature | null {
  const call = crossCallAt(source, offset);
  if (!call) {
    return null;
  }
  const rendered = renderSignature(call.macro);
  const kind = MACROS[call.macro].kind;
  return {
    ...rendered,
    active: Math.min(argumentAt(call, offset), rendered.params.length - 1),
    doc: `${kind === "function" ? "Read from" : "Invoke"} a project contract by its public registered ${kind}.`,
  };
}

function wordAt(source: string, offset: number): { word: string; start: number; end: number } | null {
  let start = Math.min(offset, source.length);
  let end = start;
  while (start > 0 && /\w/.test(source[start - 1])) {
    start--;
  }
  while (end < source.length && /\w/.test(source[end])) {
    end++;
  }
  return end > start ? { word: source.slice(start, end), start, end } : null;
}

function entryTypes(contract: CrossContractSymbol): string[] {
  return [...contract.functions, ...contract.procedures]
    .flatMap((entry) => [`${entry.name}_input`, `${entry.name}_output`]);
}

function qualifiedTarget(source: string, word: { word: string; start: number; end: number }): SymbolTarget | null {
  const code = maskComments(source);
  if (/^\s*::/.test(code.slice(word.end))) {
    const contract = contracts.get(word.word);
    return contract ? { contract } : null;
  }
  const qualifier = code.slice(0, word.start).match(/\b(\w+)\s*::\s*$/)?.[1];
  const contract = qualifier ? contracts.get(qualifier) : undefined;
  return contract && entryTypes(contract).includes(word.word) ? { contract, type: word.word } : null;
}

function macroTarget(source: string, word: { word: string; start: number; end: number }): SymbolTarget | null {
  const call = crossCallAt(source, word.start);
  if (!call) {
    return null;
  }
  const arg = argumentAt(call, word.start);
  if (arg === 0) {
    const contract = contracts.get(word.word);
    return contract ? { contract } : null;
  }
  if (arg === 1) {
    const contract = contracts.get(call.args[0]?.text ?? "");
    const kind = MACROS[call.macro].kind;
    const entry = contract
      ? (kind === "function" ? contract.functions : contract.procedures)
        .find((candidate) => candidate.name === word.word)
      : undefined;
    return contract && entry ? { contract, entry } : null;
  }
  return null;
}

export function crossContractDefinitionAt(source: string, offset: number): CrossDefinition | null {
  const word = wordAt(source, offset);
  if (!word) {
    return null;
  }
  const target = qualifiedTarget(source, word) ?? macroTarget(source, word);
  if (!target) {
    return null;
  }
  const symbol = target.entry?.name ?? target.type ?? "CONTRACT_STATE_TYPE";
  const targetOffset = definitionOffset(target.contract.source, symbol) ?? 0;
  return {
    file: target.contract.file,
    source: target.contract.source,
    offset: targetOffset,
    length: symbol.length,
  };
}

export function crossContractHoverAt(source: string, offset: number): CrossHover | null {
  const word = wordAt(source, offset);
  if (!word) {
    return null;
  }
  const target = qualifiedTarget(source, word) ?? macroTarget(source, word);
  if (!target) {
    return null;
  }
  if (target.entry) {
    return {
      title: `**${target.contract.name} ${target.entry.kind}** \`${target.entry.name}\``,
      detail: `Uses \`${target.contract.name}::${target.entry.name}_input\` and \`${target.contract.name}::${target.entry.name}_output\`.`,
    };
  }
  const type = target.type;
  return type
    ? { title: `**${target.contract.name} type** \`${type}\``, detail: target.contract.file }
    : { title: `**Project contract** \`${target.contract.name}\``, detail: target.contract.file };
}

function positionAt(source: string, offset: number): { lineNumber: number; column: number } {
  const before = source.slice(0, offset);
  const lines = before.split("\n");
  return { lineNumber: lines.length, column: lines[lines.length - 1].length + 1 };
}

let registered = false;

export function registerQpiCrossContracts(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerCompletionItemProvider("cpp", {
    triggerCharacters: ["(", ",", ":"],
    provideCompletionItems(model, position) {
      if (isGtestModel(model)) {
        return { suggestions: [] };
      }
      const offset = model.getOffsetAt(position);
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const kind = {
        contract: monaco.languages.CompletionItemKind.Class,
        function: monaco.languages.CompletionItemKind.Function,
        procedure: monaco.languages.CompletionItemKind.Method,
        type: monaco.languages.CompletionItemKind.Struct,
      };
      return {
        suggestions: crossContractCompletionAt(model.getValue(), offset, model.uri.path).map((item) => ({
          label: item.label,
          detail: item.detail,
          kind: kind[item.kind],
          insertText: item.label,
          range,
        })),
      };
    },
  });

  monaco.languages.registerSignatureHelpProvider("cpp", {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [","],
    provideSignatureHelp(model, position) {
      if (isGtestModel(model)) {
        return null;
      }
      const signature = crossContractSignatureAt(model.getValue(), model.getOffsetAt(position));
      if (!signature) {
        return null;
      }
      return {
        value: {
          signatures: [{
            label: signature.label,
            documentation: signature.doc,
            parameters: signature.params.map((range) => ({ label: range })),
          }],
          activeSignature: 0,
          activeParameter: signature.active,
        },
        dispose() {},
      };
    },
  });

  monaco.languages.registerHoverProvider("cpp", {
    provideHover(model, position) {
      if (isGtestModel(model)) {
        return null;
      }
      const value = crossContractHoverAt(model.getValue(), model.getOffsetAt(position));
      return value ? { contents: [{ value: value.title }, { value: value.detail }] } : null;
    },
  });

  monaco.languages.registerDefinitionProvider("cpp", {
    provideDefinition(model, position) {
      if (isGtestModel(model)) {
        return null;
      }
      const target = crossContractDefinitionAt(model.getValue(), model.getOffsetAt(position));
      if (!target) {
        return null;
      }
      const start = positionAt(target.source, target.offset);
      const end = positionAt(target.source, target.offset + target.length);
      return {
        uri: monaco.Uri.from({ scheme: "file", path: `/${target.file}` }),
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        },
      };
    },
  });
}

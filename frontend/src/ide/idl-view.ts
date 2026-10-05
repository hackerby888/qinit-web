import { analyzeContract } from "@qinit/compiler/analyzer";
import type { ContractIdl as CompilerContractIdl } from "@qinit/compiler/browser";
import type { StateLayoutView } from "@qinit/proto/state-carryover";

type CompilerEntry = CompilerContractIdl["functions"][number];
type CompilerAbiType = CompilerEntry["input"];
type CompilerAbiField = CompilerContractIdl["state"]["fields"][number];

export interface FieldView {
  name: string;
  type: string;
  container?: {
    kind: "hashmap" | "hashset" | "collection";
    keyFmt: string;
    valFmt?: string;
    capacity: number;
  };
  struct?: FieldView[];
  array?: boolean;
}

export interface EntryView {
  name: string;
  in: string;
  out?: string;
  inFields: FieldView[];
  outFields?: FieldView[];
}

export interface ContractIdlView {
  name: string;
  functions: Record<string, EntryView>;
  procedures: Record<string, EntryView>;
  state?: FieldView[];
  // StateData's size and format, and the OldStateData size a MIGRATE handler reads: what decides whether a redeploy keeps the state readable.
  layout?: StateLayoutView;
}

function fieldsOf(type: CompilerAbiType): FieldView[] {
  return type.kind === "struct" ? type.fields.map(fieldView) : [];
}

function nestedFieldsOf(type: CompilerAbiType): FieldView[] | undefined {
  if (type.kind === "struct") return fieldsOf(type);
  if (type.kind === "array") return nestedFieldsOf(type.element);
  return undefined;
}

function fieldView(field: CompilerAbiField): FieldView {
  const type = field.type;
  const view: FieldView = {
    name: field.name,
    type: type.format,
  };
  const struct = nestedFieldsOf(type);
  if (struct) view.struct = struct;
  if (type.kind === "array") view.array = true;
  if (type.kind === "hash_map") {
    view.container = {
      kind: "hashmap",
      keyFmt: type.key.format,
      valFmt: type.value.format,
      capacity: type.capacity,
    };
  } else if (type.kind === "hash_set") {
    view.container = {
      kind: "hashset",
      keyFmt: type.key.format,
      capacity: type.capacity,
    };
  } else if (type.kind === "collection") {
    view.container = {
      kind: "collection",
      keyFmt: "id",
      valFmt: type.value.format,
      capacity: type.capacity,
    };
  }
  return view;
}

function entryView(entry: CompilerEntry): EntryView {
  return {
    name: entry.name,
    in: entry.input.format,
    out: entry.output.format,
    inFields: fieldsOf(entry.input),
    outFields: fieldsOf(entry.output),
  };
}

export function toContractIdlView(idl: CompilerContractIdl): ContractIdlView {
  return {
    name: idl.name,
    functions: Object.fromEntries(
      idl.functions.map((entry) => [String(entry.inputType), entryView(entry)]),
    ),
    procedures: Object.fromEntries(
      idl.procedures.map((entry) => [String(entry.inputType), entryView(entry)]),
    ),
    state: fieldsOf(idl.state),
    layout: {
      state: { size: idl.state.size, format: idl.state.format },
      migration: idl.migration && { oldState: { size: idl.migration.oldState.size } },
    },
  };
}

export function extractContractIdlView(source: string, name: string): ContractIdlView {
  const result = analyzeContract({ source, contractName: name, slot: 0 });
  if (result.idl) return toContractIdlView(result.idl);

  const details = result.diagnostics
    .map((diagnostic) => `line ${diagnostic.span.line}: ${diagnostic.message}`)
    .join("\n");
  throw new Error(details || `Cannot extract IDL for ${name}`);
}

// Generate the ambient ".qinit" client types for the Monaco editor, from the deployed contracts' IDLs — so a
// test's `import { Counter, provider } from "./.qinit"` resolves to typed classes and `c.` completes. This is
// the editor-only mirror of the qinit CLI's `generateClient` (types, no runtime), and must stay its mirror: a
// call the editor accepts here is a call the CLI's client accepts under `bun test`.
import type { ContractIdlView as ContractIdl, FieldView } from "../calls/idl-view";
import { arrayType } from "../calls/input-values";

// qpi scalar -> TS type, as the CLI client maps it: 8/16/32-bit integers and `bit` are numbers, 64/128-bit are bigints, an id is its text.
function scalarType(type: string): string {
  const t = type.trim();
  if (/^[us]int(8|16|32)$/.test(t) || t === "bit") {
    return "number";
  }
  if (/^[us]int(64|128)$/.test(t)) {
    return "bigint";
  }
  if (t === "id" || t === "m256i") {
    return "string";
  }
  const array = arrayType(t);
  return array ? `${scalarType(array.element)}[]` : "any";
}

function fieldType(field: FieldView): string {
  if (field.struct) {
    return field.array ? `${iface(field.struct)}[]` : iface(field.struct);
  }
  return scalarType(field.type);
}

function iface(fields: FieldView[]): string {
  if (!fields.length) {
    return "{}";
  }
  return `{ ${fields.map((f) => `${f.name}: ${fieldType(f)}`).join("; ")} }`;
}

const OPTS = "{ seed?: string; amount?: number | bigint; confirm?: boolean }";
const TX = "{ ok: boolean; txId?: string; tick?: number; confirmed?: boolean; included?: boolean; moneyFlew?: boolean }";

// A .d.ts module declaring `provider()` + a typed class per contract — the same surface as the CLI's ./.qinit.
export function genQinitDts(idls: ContractIdl[]): string {
  const L: string[] = ["export function provider(): any;"];

  for (const idl of idls) {
    L.push(`export declare class ${idl.name} {`);
    L.push("  constructor(opts?: any);");

    for (const e of Object.values(idl.functions)) {
      const arg = e.inFields.length ? `args: ${iface(e.inFields)}` : "";
      L.push(`  ${e.name}(${arg}): Promise<${iface(e.outFields ?? [])}>;`);
    }

    for (const e of Object.values(idl.procedures)) {
      // an empty-input procedure takes `Name(opts)` and `Name({}, opts)` alike, as the CLI's client does: with only `(opts)`
      // declared, the uniform `Name({}, { amount })` was underlined while the form that typed clean sent no payment.
      const parameters = e.inFields.length ? `args: ${iface(e.inFields)}, opts?: ${OPTS}` : `argsOrOpts?: {} | ${OPTS}, maybeOpts?: ${OPTS}`;
      L.push(`  ${e.name}(${parameters}): Promise<${TX}>;`);
    }

    L.push("}");
  }

  return L.join("\n");
}

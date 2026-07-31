// Generate the ambient ".qinit" client types for the Monaco editor, from the deployed contracts' IDLs — so a
// test's `import { Counter, provider } from "./.qinit"` resolves to typed classes and `c.` completes. This is
// the editor-only mirror of the qinit CLI's `generateClient` (types, no runtime).
import type { ContractIdlView as ContractIdl } from "../idl-view";

interface Field {
  name: string;
  type: string;
}

// qpi codec type -> TS type. Integers decode to bigint, id to a string, bit to boolean; anything else is any.
function tsType(t: string): string {
  if (/^(u?int(8|16|32|64)|sint(8|16|32|64))$/.test(t)) {
    return "bigint";
  }
  if (t === "id") {
    return "string";
  }
  if (t === "bit") {
    return "boolean";
  }
  return "any";
}

function iface(fields: Field[]): string {
  if (!fields.length) {
    return "{}";
  }
  return `{ ${fields.map((f) => `${f.name}: ${tsType(f.type)}`).join("; ")} }`;
}

// A .d.ts module declaring `provider()` + a typed class per contract — the same surface as the CLI's ./.qinit.
export function genQinitDts(idls: ContractIdl[]): string {
  const TX = "{ ok: boolean; txId?: string; tick?: number; confirmed?: boolean; included?: boolean; moneyFlew?: boolean }";
  const L: string[] = ["export function provider(): any;"];

  for (const idl of idls) {
    L.push(`export declare class ${idl.name} {`);
    L.push("  constructor(opts?: any);");

    for (const e of Object.values(idl.functions)) {
      const arg = e.inFields.length ? `args: ${iface(e.inFields)}` : "";
      const out = e.outFields && e.outFields.length ? iface(e.outFields) : "void";
      L.push(`  ${e.name}(${arg}): Promise<${out}>;`);
    }

    for (const e of Object.values(idl.procedures)) {
      const arg = e.inFields.length ? `args: ${iface(e.inFields)}, ` : "";
      L.push(`  ${e.name}(${arg}opts?: { seed?: string; amount?: number; confirm?: boolean }): Promise<${TX}>;`);
    }

    L.push("}");
  }

  return L.join("\n");
}

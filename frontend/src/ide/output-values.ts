// A function's decoded output with its field names put back. Kept apart from idl-view.ts, which loads the
// compiler's analyzer: the shell imports this on its main path.
import type { EntryView, FieldView } from "./idl-view";

// decodeAbi returns a struct positionally; these put the field names back, at every depth, so a result reads `{balance: 800, found: 1}`.
function nameValue(field: FieldView, raw: unknown): unknown {
  if (!field.struct) return raw;
  if (field.array) return Array.isArray(raw) ? raw.map((item) => nameFields(field.struct!, item)) : raw;
  return nameFields(field.struct, raw);
}

function nameFields(fields: FieldView[], raw: unknown): Record<string, unknown> {
  const values = Array.isArray(raw) ? raw : [];
  return Object.fromEntries(fields.map((field, index) => [field.name, nameValue(field, values[index])]));
}

// A function's output as the generated client returns it: an object keyed by the output struct's fields, `{}` for an empty output.
export function nameOutput(entry: EntryView, raw: unknown): Record<string, unknown> {
  const fields = entry.outFields ?? [];
  if (fields.length !== 1) return nameFields(fields, raw);

  // One field decodes to that field's bare value — except a lone struct, whose format keeps its braces and so its one-element wrapper.
  const only = fields[0];
  const value = only.struct && !only.array && Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  return { [only.name]: nameValue(only, value) };
}

// The named output as one line, e.g. `{u8: 255, u64: 18446744073709551615}` — the form the call detail prints.
export function outputText(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return `[${value.map(outputText).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).map(([name, item]) => `${name}: ${outputText(item)}`).join(", ")}}`;
  }
  return String(value);
}

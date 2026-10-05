import type { FieldView as Field } from "./idl-view";

export const ZERO_IDENTITY = "A".repeat(60);

export type InputDraft = Record<string, string>;

// The most qu one transfer may carry (MAX_AMOUNT in the node). Kept here as a literal so this module loads without the engine.
export const MAX_QU = 1_000_000_000_000_000n;

// A qu amount typed into a field: digits only, so `1e3`, `0x10`, `1.5` and `abc` are refused instead of reshaped. Blank is 0.
export function parseQu(text: string, field: string): bigint {
  const typed = text.trim();
  if (typed === "") return 0n;
  if (!/^\d+$/.test(typed)) throw new Error(`${field} must be a whole number of qu (got '${typed}')`);
  const amount = BigInt(typed);
  if (amount > MAX_QU) throw new Error(`${field} ${typed} is above the most one transfer can carry (${MAX_QU.toLocaleString("en-US")} qu)`);
  return amount;
}

// `[1, 18446744073709551615]` as typed: JSON.parse would round the wide one, so every bare integer is quoted first and read back as text.
const parseIntegerArray = (text: string): unknown =>
  JSON.parse(text.replace(/"[^"]*"|-?\d+(?![\d.eE])/g, (token) => (token.startsWith('"') ? token : `"${token}"`)));

const INTEGER = /^(?:uint(?:8|16|32|64|128)|sint(?:8|16|32|64))$/;

const splitTop = (text: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
};

export const arrayType = (type: string): { count: number; element: string } | null => {
  const text = type.trim();
  if (!text.startsWith("[") || !text.endsWith("]")) return null;
  const inner = text.slice(1, -1);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
    else if (ch === ";" && depth === 0) {
      const count = Number(inner.slice(0, i).trim());
      if (!Number.isSafeInteger(count) || count < 0) throw new Error(`invalid QPI array type '${type}'`);
      return { count, element: inner.slice(i + 1).trim() };
    }
  }
  throw new Error(`invalid QPI array type '${type}'`);
};

const sampleValue = (type: string): unknown => {
  const t = type.trim();
  if (t === "id") return ZERO_IDENTITY;
  if (t === "bit" || INTEGER.test(t)) return 0;
  if (t === "m256i") throw new Error("m256i is not allowed in a QPI public interface");
  if (t === "sint128") throw new Error("sint128 is not a QPI type");
  const array = arrayType(t);
  if (array) return Array.from({ length: array.count }, () => sampleValue(array.element));
  if (t.startsWith("{") && t.endsWith("}")) return splitTop(t.slice(1, -1)).map(sampleValue);
  throw new Error(`unsupported QPI public input type '${t}'`);
};

const displaySampleValue = (type: string): unknown => {
  const t = type.trim();
  if (t === "id") return "AAA...AAA";
  const array = arrayType(t);
  if (array) return Array.from({ length: array.count }, () => displaySampleValue(array.element));
  if (t.startsWith("{") && t.endsWith("}")) return splitTop(t.slice(1, -1)).map(displaySampleValue);
  return sampleValue(t);
};

export const inputHint = (field: Field): string => {
  const sample = displaySampleValue(field.type);
  return typeof sample === "string" || typeof sample === "number" ? String(sample) : JSON.stringify(sample);
};

const defaultText = (type: string): string => {
  const sample = sampleValue(type);
  return typeof sample === "string" || typeof sample === "number" ? String(sample) : JSON.stringify(sample);
};

const keyOf = (path: Array<string | number>): string => path.join(".");

const normalizeValue = (type: string, value: unknown): unknown => {
  const t = type.trim();
  if (t === "m256i") throw new Error("m256i is not allowed in a QPI public interface");
  if (t === "sint128") throw new Error("sint128 is not a QPI type");
  if (t === "id") {
    const identity = String(value).trim();
    // `0` is the zero identity, as in the CLI and the test runner.
    if (identity === "0") return ZERO_IDENTITY;
    if (!/^[A-Z]{60}$/.test(identity)) throw new Error("id must be a 60-character uppercase Qubic identity, or 0");
    return identity;
  }
  if (t === "bit") {
    if (value === true || value === 1 || value === "1" || value === "true") return true;
    if (value === false || value === 0 || value === "0" || value === "false") return false;
    throw new Error("bit must be 0, 1, false, or true");
  }
  if (INTEGER.test(t)) {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) throw new Error(`${t} must be an exact integer`);
      return String(value);
    }
    const text = String(value).trim();
    if (!/^-?\d+$/.test(text)) throw new Error(`${t} must be an integer`);
    return text;
  }
  const array = arrayType(t);
  if (array) {
    if (!Array.isArray(value) || value.length !== array.count) {
      throw new Error(`${t} expects ${array.count} array elements`);
    }
    return value.map((item) => normalizeValue(array.element, item));
  }
  if (t.startsWith("{") && t.endsWith("}")) {
    const fields = splitTop(t.slice(1, -1));
    if (!Array.isArray(value) || value.length !== fields.length) {
      throw new Error(`${t} expects ${fields.length} positional values`);
    }
    return fields.map((fieldType, i) => normalizeValue(fieldType, value[i]));
  }
  throw new Error(`unsupported QPI public input type '${t}'`);
};

const structValue = (fields: Field[], draft: InputDraft, path: Array<string | number>): unknown[] =>
  fields.map((field) => fieldValue(field, draft, [...path, field.name]));

const fieldValue = (field: Field, draft: InputDraft, path: Array<string | number>): unknown => {
  if (field.array && field.struct) {
    const array = arrayType(field.type);
    if (!array) throw new Error(`missing array shape for '${field.name}'`);
    return Array.from({ length: array.count }, (_, index) => structValue(field.struct!, draft, [...path, index]));
  }
  if (field.struct) return structValue(field.struct, draft, path);

  const key = keyOf(path);
  const raw = (draft[key] ?? "").trim();
  if (field.array) {
    const text = raw || defaultText(field.type);
    let parsed: unknown;
    try {
      parsed = parseIntegerArray(text);
    } catch {
      throw new Error(`${field.name} must be a JSON array`);
    }
    return normalizeValue(field.type, parsed);
  }
  return normalizeValue(field.type, raw || defaultText(field.type));
};

export const buildInput = (fields: Field[], draft: InputDraft): Record<string, unknown> =>
  Object.fromEntries(fields.map((field) => [field.name, fieldValue(field, draft, [field.name])]));

const jsonText = (value: unknown): string =>
  JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);

const draftField = (field: Field, value: unknown, path: Array<string | number>, out: InputDraft): void => {
  if (field.array && field.struct) {
    const values = Array.isArray(value) ? value : [];
    const count = arrayType(field.type)?.count ?? values.length;
    for (let i = 0; i < count; i++) {
      const row = Array.isArray(values[i]) ? values[i] : [];
      field.struct.forEach((child, childIndex) => draftField(child, row[childIndex], [...path, i, child.name], out));
    }
    return;
  }
  if (field.struct) {
    const values = Array.isArray(value) ? value : [];
    field.struct.forEach((child, index) => draftField(child, values[index], [...path, child.name], out));
    return;
  }
  out[keyOf(path)] = field.array ? jsonText(value ?? sampleValue(field.type)) : String(value ?? defaultText(field.type));
};

export const inputToDraft = (fields: Field[], input: Record<string, unknown>): InputDraft => {
  const out: InputDraft = {};
  for (const field of fields) draftField(field, input[field.name], [field.name], out);
  return out;
};

// Lightweight symbol outline for a single qpi.h contract source — parsed by regex (no compile needed), so
// it tracks the live editor buffer. Names feed definitionOffset() for click-to-jump. Three groups: StateData
// fields, registered functions, registered procedures.

export interface Outline {
  state: string[];
  functions: string[];
  procedures: string[];
}

// Brace-match the body of `struct <name> { … }`, or null if absent.
function structBody(src: string, name: string): string | null {
  const re = new RegExp(`struct\\s+${name}\\s*\\{`);
  const m = re.exec(src);
  if (!m) {
    return null;
  }
  const open = m.index + m[0].length - 1;
  let depth = 1;
  let i = open + 1;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === "{") {
      depth++;
    } else if (src[i] === "}") {
      depth--;
    }
  }
  return src.slice(open + 1, i - 1);
}

// StateData field names: the identifier right before each `;` at the top level of the struct body (skips
// nested braces so an inline struct's members don't leak in).
function stateFields(src: string): string[] {
  const body = structBody(src, "StateData");
  if (body === null) {
    return [];
  }
  const out: string[] = [];
  let depth = 0;
  let stmt = "";
  for (const ch of body) {
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }
    if (depth === 0 && ch === ";") {
      const m = stmt.match(/(\w+)\s*(?:\[[^\]]*\])?\s*$/);
      if (m) {
        out.push(m[1]);
      }
      stmt = "";
    } else if (depth === 0) {
      stmt += ch;
    }
  }
  return out;
}

// Registered user entries by macro kind.
function entries(src: string, kind: "FUNCTION" | "PROCEDURE"): string[] {
  const re = new RegExp(`\\b(?:PUBLIC|PRIVATE)_${kind}(?:_WITH_LOCALS)?\\s*\\(\\s*(\\w+)\\s*\\)`, "g");
  const out: string[] = [];
  for (const m of src.matchAll(re)) {
    out.push(m[1]);
  }
  return out;
}

export function parseOutline(src: string): Outline {
  return {
    state: stateFields(src),
    functions: entries(src, "FUNCTION"),
    procedures: entries(src, "PROCEDURE"),
  };
}

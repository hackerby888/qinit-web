// Tier-A QPI rule: native C++ scalar types are forbidden in a contract — QPI mandates its own fixed-width
// types (sint8/uint8 … sint64/uint64, bit) so storage layout + arithmetic are deterministic across nodes.
// The vendored qpi-rules scanner only flags float/double; this catches the integer/bool/char family and
// suggests the QPI equivalent. Local (not vendored) so it lives with the browser IDE; pure + unit-tested.
import { blankCommentsAndStrings, type QpiFinding } from "./qpi-rules";

// Native type token -> the QPI fixed-width type to use instead. Keys double as the "is this native" set.
// float/double are intentionally omitted (the vendored scanner already flags them — avoid double squiggles).
const SUGGEST: Record<string, string> = {
  int: "sint32",
  unsigned: "uint32",
  signed: "sint32",
  short: "sint16",
  long: "sint64",
  char: "sint8",
  bool: "bit",
  wchar_t: "uint16",
  char8_t: "uint8",
  char16_t: "uint16",
  char32_t: "uint32",
  size_t: "uint64",
  ssize_t: "sint64",
  int8_t: "sint8",
  int16_t: "sint16",
  int32_t: "sint32",
  int64_t: "sint64",
  uint8_t: "uint8",
  uint16_t: "uint16",
  uint32_t: "uint32",
  uint64_t: "uint64",
  intptr_t: "sint64",
  uintptr_t: "uint64",
};

// Multi-word native types (e.g. `unsigned int`) map to one precise suggestion rather than the last token's.
const COMBO: Record<string, string> = {
  "unsigned int": "uint32",
  "unsigned char": "uint8",
  "unsigned short": "uint16",
  "unsigned long": "uint64",
  "unsigned long long": "uint64",
  "unsigned long int": "uint64",
  "signed char": "sint8",
  "signed int": "sint32",
  "long long": "sint64",
  "long int": "sint64",
  "long long int": "sint64",
  "short int": "sint16",
};

interface Tok {
  w: string;
  s: number;
  e: number;
}

export function scanNativeTypes(source: string): QpiFinding[] {
  const blanked = blankCommentsAndStrings(source); // never match inside comments / string literals
  const toks: Tok[] = [];
  const re = /[A-Za-z_]\w*/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(blanked)) !== null) {
    toks.push({ w: m[0], s: m.index, e: m.index + m[0].length });
  }

  const out: QpiFinding[] = [];

  for (let i = 0; i < toks.length; i++) {
    if (!(toks[i].w in SUGGEST)) {
      continue;
    }

    // Greedily extend across consecutive native tokens separated only by whitespace (`unsigned int`),
    // so the whole type spec is one finding instead of several.
    let j = i;
    while (j + 1 < toks.length && toks[j + 1].w in SUGGEST && /^\s*$/.test(blanked.slice(toks[j].e, toks[j + 1].s))) {
      j++;
    }

    const words = toks.slice(i, j + 1).map((t) => t.w);
    const joined = words.join(" ");
    const suggestion = COMBO[joined] ?? SUGGEST[words[words.length - 1]] ?? SUGGEST[words[0]];

    out.push({
      rule: "qpi/native-type",
      message: `Native C++ type \`${joined}\` is forbidden in QPI — use \`${suggestion}\` (a QPI fixed-width type: sint8/uint8 … sint64/uint64, or bit for booleans).`,
      offset: toks[i].s,
      length: toks[j].e - toks[i].s,
      severity: "warn",
    });

    i = j;
  }

  return out;
}

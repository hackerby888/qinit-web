// Workspace-wide static analysis. Runs every Tier-A scanner (the vendored qpi-rules + native-types +
// idl-checks, the context linter, and the extra sc-rules) over each contract file, maps each finding's
// byte offset to a line/column, tags it with a category, and returns a flat, sorted list the analysis
// panel renders. Pure — no Monaco, no IO — so it's unit-tested and reused by the panel.
import { scanQpi, scanLocals, scanLocalsForm } from "./lint/qpi-rules";
import { scanNativeTypes } from "./lint/native-types";
import { idlChecks } from "./lint/idl-checks";
import { scanScRules } from "./lint/sc-rules";
import { scanContext } from "./contextlint";

export type Severity = "error" | "warn" | "info";

export interface AnalysisFinding {
  file: string;
  rule: string;
  category: string;
  message: string;
  line: number; // 1-based
  col: number; // 1-based
  offset: number;
  length: number;
  severity: Severity;
}

// Rule id -> the panel category it groups under. Determinism is called out on its own because it's the
// invariant most particular to Qubic (every computor must compute the same result).
const CATEGORY: Record<string, string> = {
  "qpi/no-random": "Determinism",
  "qpi/no-time": "Determinism",
  "qpi/no-float": "Determinism",
  "qpi/native-type": "Types",
  "qpi/no-union": "Types",
  "qpi/no-string": "Types",
  "qpi/no-char": "Types",
  "qpi/no-brackets": "Types",
  "qpi/no-dynamic-memory": "Memory",
  "qpi/stack-local": "Memory",
  "qpi/no-division": "Language",
  "qpi/no-modulo": "Language",
  "qpi/no-varargs": "Language",
  "qpi/no-dunder": "Language",
  "qpi/no-preprocessor": "Language",
  "qpi/no-const-cast": "Language",
  "qpi/no-qpicontext": "Language",
  "qpi/no-global-typedef": "Language",
  "qpi/no-global-using": "Language",
  "qpi/no-exceptions": "Language",
  "qpi/no-rtti": "Language",
  "qpi/no-stl": "Language",
  "qpi/dup-fn-index": "Registration",
  "qpi/dup-proc-index": "Registration",
  "qpi/unregistered": "Registration",
  "qpi/needs-with-locals": "Registration",
  "qpi/public-complex-type": "Interface",
  "qpi/mut-in-function": "State",
  "qpi/mutate-in-function": "State",
};

export const categoryOf = (rule: string): string => CATEGORY[rule] ?? "Other";

// C/C++ contract sources only — skip the TypeScript test files, JSON, markdown, etc. in the workspace.
const CONTRACT_EXT = new Set(["h", "hpp", "hh", "cpp", "cc", "cxx", "c"]);
export const isContractFile = (name: string): boolean => {
  const dot = name.lastIndexOf(".");
  return dot >= 0 && CONTRACT_EXT.has(name.slice(dot + 1).toLowerCase());
};

// Offsets of the start of each line, for an O(log n) offset -> line/col lookup.
function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function locate(starts: number[], offset: number): { line: number; col: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return { line: lo + 1, col: offset - starts[lo] + 1 };
}

// All findings for one contract file, sorted by position.
export function analyzeFile(file: string, source: string): AnalysisFinding[] {
  const raw = [
    ...scanQpi(source),
    ...scanNativeTypes(source),
    ...scanLocals(source),
    ...scanLocalsForm(source),
    ...idlChecks(source),
    ...scanScRules(source),
    ...scanContext(source),
  ];

  const starts = lineStarts(source);
  return raw
    .map((f) => {
      const { line, col } = locate(starts, f.offset);
      return { file, rule: f.rule, category: categoryOf(f.rule), message: f.message, line, col, offset: f.offset, length: f.length, severity: f.severity as Severity };
    })
    .sort((a, b) => a.line - b.line || a.col - b.col);
}

// All findings across the workspace's contract files.
export function analyzeWorkspace(files: { name: string; source: string }[]): AnalysisFinding[] {
  return files.filter((f) => isContractFile(f.name)).flatMap((f) => analyzeFile(f.name, f.source));
}

// Count findings by severity (for the panel header / badges).
export function severityCounts(findings: AnalysisFinding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) {
    c[f.severity]++;
  }
  return c;
}

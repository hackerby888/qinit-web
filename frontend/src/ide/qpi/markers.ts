// Tier-A QPI diagnostics in Monaco: run the vendored pure scanners over the model and publish the
// findings as markers (squiggles). Debounced on edit; the `monaco` instance is the one handed to us at
// editor mount, so this module imports only TYPES from monaco-editor (no second runtime copy).
import type * as Monaco from "monaco-editor";
import { scanQpi, scanLocals, scanLocalsForm, type QpiFinding } from "./lint/qpi-rules";
import { scanNativeTypes } from "./lint/native-types";
import { scanScRules } from "./lint/sc-rules";
import { idlChecks } from "./lint/idl-checks";
import { scanContext, type ContextFinding } from "./contextlint";
import { isGtestModel } from "./gtest";

const OWNER = "qpi";

// The rules core's verifier refuses, which a build in the IDE refuses too: these are errors here, not warnings.
// A copy of VERIFIER_RULES in @qinit/compiler/analyzer, kept literal so the editor does not load the compiler; a test holds the two equal.
export const VERIFIER_RULE_IDS: ReadonlySet<string> = new Set([
  "qpi/no-float",
  "qpi/no-union",
  "qpi/no-const-cast",
  "qpi/no-qpicontext",
  "qpi/no-string",
  "qpi/no-char",
  "qpi/no-preprocessor",
  "qpi/no-division",
  "qpi/no-modulo",
  "qpi/no-brackets",
  "qpi/no-varargs",
  "qpi/no-dunder",
  "qpi/no-global-typedef",
  "qpi/no-global-using",
  "qpi/stack-local",
]);

// A finding's severity as the build sees it. The verifier reserves only names that start with `__`, so one in the middle stays a warning.
export function buildSeverity(finding: { rule: string; severity: string; offset: number }, src: string): "error" | "warn" | "info" {
  const refused = VERIFIER_RULE_IDS.has(finding.rule) && (finding.rule !== "qpi/no-dunder" || src.startsWith("__", finding.offset));
  return refused || finding.severity === "error" ? "error" : finding.severity === "info" ? "info" : "warn";
}

export function runQpiDiagnostics(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  // QPI lint is for qpi.h contracts only — never a .ts test file, never a .cpp gtest (its TEST()/EXPECT_*
  // macros + integer math would be flagged as contract-rule violations). Clear any stale markers and bail.
  if (model.getLanguageId() !== "cpp" || isGtestModel(model)) {
    monaco.editor.setModelMarkers(model, OWNER, []);
    return;
  }

  const src = model.getValue();
  const findings: (QpiFinding | ContextFinding)[] = [...scanQpi(src), ...scanNativeTypes(src), ...scanScRules(src), ...scanLocals(src), ...scanLocalsForm(src), ...idlChecks(src), ...scanContext(src)];

  const markers: Monaco.editor.IMarkerData[] = findings.map((f) => {
    const start = model.getPositionAt(f.offset);
    const end = model.getPositionAt(f.offset + f.length);
    const severity = buildSeverity(f, src);
    return {
      severity: severity === "error" ? monaco.MarkerSeverity.Error : severity === "info" ? monaco.MarkerSeverity.Info : monaco.MarkerSeverity.Warning,
      message: f.message,
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
      source: OWNER,
      code: f.rule,
    };
  });

  monaco.editor.setModelMarkers(model, OWNER, markers);
}

// Wire debounced diagnostics to the editor's current model; returns a disposer.
export function attachQpiDiagnostics(monaco: typeof Monaco, editor: Monaco.editor.IStandaloneCodeEditor): Monaco.IDisposable {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    const model = editor.getModel();
    if (!model) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => runQpiDiagnostics(monaco, model), 200);
  };

  const onContent = editor.onDidChangeModelContent(schedule);
  const onModel = editor.onDidChangeModel(schedule);

  const initial = editor.getModel();
  if (initial) {
    runQpiDiagnostics(monaco, initial);
  }

  return {
    dispose() {
      if (timer) {
        clearTimeout(timer);
      }
      onContent.dispose();
      onModel.dispose();
    },
  };
}

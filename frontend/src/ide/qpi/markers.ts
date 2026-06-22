// Tier-A QPI diagnostics in Monaco: run the vendored pure scanners over the model and publish the
// findings as markers (squiggles). Debounced on edit; the `monaco` instance is the one handed to us at
// editor mount, so this module imports only TYPES from monaco-editor (no second runtime copy).
import type * as Monaco from "monaco-editor";
import { scanQpi, scanLocals, scanLocalsForm, type QpiFinding } from "./lint/qpi-rules";
import { scanNativeTypes } from "./lint/native-types";
import { scanScRules } from "./lint/sc-rules";
import { idlChecks } from "./lint/idl-checks";
import { scanContext, type ContextFinding } from "./contextlint";

const OWNER = "qpi";

export function runQpiDiagnostics(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  // QPI lint is for qpi.h contracts only — never a .ts test file. Clear any stale qpi markers and bail.
  if (model.getLanguageId() !== "cpp") {
    monaco.editor.setModelMarkers(model, OWNER, []);
    return;
  }

  const src = model.getValue();
  const findings: (QpiFinding | ContextFinding)[] = [...scanQpi(src), ...scanNativeTypes(src), ...scanScRules(src), ...scanLocals(src), ...scanLocalsForm(src), ...idlChecks(src), ...scanContext(src)];

  const markers: Monaco.editor.IMarkerData[] = findings.map((f) => {
    const start = model.getPositionAt(f.offset);
    const end = model.getPositionAt(f.offset + f.length);
    return {
      severity: f.severity === "error" ? monaco.MarkerSeverity.Error : f.severity === "info" ? monaco.MarkerSeverity.Info : monaco.MarkerSeverity.Warning,
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

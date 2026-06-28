// QPI quick-fixes in Monaco: offer the vendored pure transforms (codefix.ts) for the matching Tier-A
// markers — `T[N]` → `Array<T, N>`, `a / b` → `div(a, b)` / `a % b` → `mod(a, b)`, and moving a
// stack-local into a `<fn>_locals` struct. Each transform self-declines when the rewrite isn't safe.
import type * as Monaco from "monaco-editor";
import { isGtestModel } from "./gtest";
import { arrayFixForLine, divModFixForLine, moveLocalToWithLocalsEdits, type SourceEdit } from "./codefix";

interface RangeText {
  range: Monaco.IRange;
  text: string;
}

function buildAction(
  model: Monaco.editor.ITextModel,
  title: string,
  marker: Monaco.editor.IMarkerData,
  edits: RangeText[],
): Monaco.languages.CodeAction {
  return {
    title,
    kind: "quickfix",
    diagnostics: [marker],
    isPreferred: true,
    edit: {
      edits: edits.map((e) => ({
        resource: model.uri,
        versionId: model.getVersionId(),
        textEdit: { range: e.range, text: e.text },
      })),
    },
  };
}

function sourceEditToRangeText(monaco: typeof Monaco, model: Monaco.editor.ITextModel, e: SourceEdit): RangeText {
  const start = model.getPositionAt(e.start);
  const end = model.getPositionAt(e.end);
  return { range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: e.newText };
}

let registered = false;

export function registerQpiCodeActions(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerCodeActionProvider("cpp", {
    provideCodeActions(model, _range, context) {
      if (isGtestModel(model)) {
        return { actions: [], dispose() {} };
      }
      const actions: Monaco.languages.CodeAction[] = [];

      for (const marker of context.markers) {
        if (marker.source !== "qpi") {
          continue;
        }
        const code = String(marker.code ?? "");

        if (code === "qpi/no-brackets") {
          const lineNo = marker.startLineNumber;
          const line = model.getLineContent(lineNo);
          const fixed = arrayFixForLine(line);
          if (fixed !== null && fixed !== line) {
            const range = new monaco.Range(lineNo, 1, lineNo, line.length + 1);
            actions.push(buildAction(model, "Convert to Array<T, N>", marker, [{ range, text: fixed }]));
          }
        } else if (code === "qpi/no-division" || code === "qpi/no-modulo") {
          const lineNo = marker.startLineNumber;
          const line = model.getLineContent(lineNo);
          const op = code === "qpi/no-division" ? "/" : "%";
          const fix = divModFixForLine(line, marker.startColumn - 1, op);
          if (fix) {
            const range = new monaco.Range(lineNo, fix.start + 1, lineNo, fix.end + 1);
            actions.push(buildAction(model, `Rewrite as ${op === "/" ? "div" : "mod"}(…)`, marker, [{ range, text: fix.text }]));
          }
        } else if (code === "qpi/mut-in-function") {
          // The marker covers the `mut` token — swap it for `get`.
          const range = new monaco.Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn);
          actions.push(buildAction(model, "Change to state.get() (a function can't mutate)", marker, [{ range, text: "get" }]));
        } else if (code === "qpi/stack-local") {
          const offset = model.getOffsetAt({ lineNumber: marker.startLineNumber, column: marker.startColumn });
          const endOffset = model.getOffsetAt({ lineNumber: marker.endLineNumber, column: marker.endColumn });
          const edits = moveLocalToWithLocalsEdits(model.getValue(), offset, endOffset - offset);
          if (edits) {
            actions.push(buildAction(model, "Move to <fn>_locals struct", marker, edits.map((e) => sourceEditToRangeText(monaco, model, e))));
          }
        }
      }

      return { actions, dispose() {} };
    },
  });
}

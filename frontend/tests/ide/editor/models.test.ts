// Monaco keeps one model per file path. A model that outlived its file or its project showed that old text under
// the same name, and the first keystroke saved it over the real file.
import { test, expect, describe } from "bun:test";
import { disposeStaleModels, fileOfModel } from "../../../src/ide/editor/models";

function model(path: string, scheme = "file") {
  return {
    uri: { scheme, path },
    disposed: false,
    dispose() {
      this.disposed = true;
    },
  };
}

function monacoWith(models: ReturnType<typeof model>[], shown: ReturnType<typeof model>[] = []) {
  return {
    editor: {
      getModels: () => models.filter((m) => !m.disposed),
      getEditors: () => shown.map((m) => ({ getModel: () => m })),
    },
  };
}

describe("fileOfModel", () => {
  test("is the model path without its leading slash", () => {
    expect(fileOfModel(model("/Counter.h"))).toBe("Counter.h");
    expect(fileOfModel(model("/lib/Thing.h"))).toBe("lib/Thing.h");
  });
});

describe("disposeStaleModels", () => {
  test("disposes the model of a file that is gone and keeps the ones still in the project", () => {
    const kept = model("/Counter.h");
    const gone = model("/CounterV2.h");
    disposeStaleModels(monacoWith([kept, gone]), new Set(["Counter.h"]));
    expect(kept.disposed).toBe(false);
    expect(gone.disposed).toBe(true);
  });

  test("an empty set clears every file model, which is what leaving a project does", () => {
    const a = model("/Counter.h");
    const b = model("/Counter.test.ts");
    disposeStaleModels(monacoWith([a, b]), new Set());
    expect([a.disposed, b.disposed]).toEqual([true, true]);
  });

  test("never disposes a model an editor is showing", () => {
    const system = model("/system/QX.h"); // the read-only system source viewer, not a workspace file
    disposeStaleModels(monacoWith([system], [system]), new Set());
    expect(system.disposed).toBe(false);
  });

  test("leaves models of other schemes alone", () => {
    const collab = model("/collab/Counter.h", "inmemory");
    disposeStaleModels(monacoWith([collab]), new Set());
    expect(collab.disposed).toBe(false);
  });
});

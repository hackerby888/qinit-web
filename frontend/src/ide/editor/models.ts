// Every workspace file gets a Monaco model keyed by its path. The editor wrapper reuses a model it finds
// under that path and disposes only the one it is showing, so a model that outlives its file or its project
// would show that old text under the same name. These helpers remove the ones nothing shows any more.

interface ModelLike {
  uri: { scheme: string; path: string };
  dispose(): void;
}

interface MonacoLike {
  editor: {
    getModels(): ModelLike[];
    getEditors(): readonly { getModel(): unknown }[];
  };
}

// The workspace file a model belongs to: its path without the leading slash.
export function fileOfModel(model: { uri: { path: string } }): string {
  return model.uri.path.replace(/^\/+/, "");
}

// Dispose each file model that no editor shows and that is not one of the `live` files.
export function disposeStaleModels(monaco: MonacoLike, live: ReadonlySet<string>): void {
  const shown = new Set(monaco.editor.getEditors().map((editor) => editor.getModel()));

  for (const model of monaco.editor.getModels()) {
    if (model.uri.scheme !== "file" || shown.has(model) || live.has(fileOfModel(model))) {
      continue;
    }
    model.dispose();
  }
}

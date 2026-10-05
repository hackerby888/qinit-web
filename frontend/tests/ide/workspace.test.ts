// workspace.ts persists the IDE file set to localStorage and shares it via a `#p=` URL hash. These cover the
// pure logic: basename derivation, the untrusted-input sanitizer (corrupt storage / hostile share), and the
// utf8-safe base64 share roundtrip. DOM globals (localStorage/location/history) are stubbed in-memory.
import { test, expect, beforeEach } from "bun:test";

// Stub the web globals the module reaches for, before importing it. In-memory so the suite never touches disk.
class MemStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const loc = { origin: "https://ide.test", hash: "", pathname: "/ide", search: "" };
(globalThis as Record<string, unknown>).localStorage = new MemStore();
(globalThis as Record<string, unknown>).location = loc;
(globalThis as Record<string, unknown>).history = { replaceState: (_s: unknown, _t: string, url: string) => { loc.hash = ""; void url; } };

const { baseName, contractFile, fileKind, newFileSource, loadWorkspace, saveWorkspace, resetWorkspace, shareUrl, decodeSharedWorkspace } = await import("../../src/ide/workspace");

beforeEach(() => {
  (globalThis as { localStorage: MemStore }).localStorage.clear();
  loc.hash = "";
});

// only a header is a contract; the IDE once built notes.md and helper.ts as one.
test("fileKind reads a file's role from its extension", () => {
  expect(["Counter.h", "lib/Token.hpp", "x.hh"].map(fileKind)).toEqual(["contract", "contract", "contract"]);
  expect(["Counter.test.ts", "ui.tsx"].map(fileKind)).toEqual(["test", "test"]);
  expect(["contract_counter.cpp", "a.cc"].map(fileKind)).toEqual(["gtest", "gtest"]);
  expect(["notes.md", "data.json", "lib/.keep", "Makefile"].map(fileKind)).toEqual(["other", "other", "other", "other"]);
});

test("a contract is found by its header's stem, never by a test or text file of the same name", () => {
  const files = [{ name: "Counter.md" }, { name: "Counter.test.ts" }, { name: "lib/Counter.h" }];
  expect(contractFile(files, "Counter")).toEqual({ name: "lib/Counter.h" });
  expect(contractFile(files, "Counter.test")).toBeUndefined();
  expect(contractFile(files, "Missing")).toBeUndefined();
});

test("a new file starts as what it is: a contract, a test, or empty", () => {
  expect(newFileSource("Vault.h")).toContain("struct CONTRACT_STATE_TYPE : public ContractBase");
  expect(newFileSource("vault.test.ts")).toStartWith('import { test, expect } from "bun:test";');
  expect(newFileSource("notes.md")).toBe("");
  expect(newFileSource("lib/.keep")).toBe("");
});

test("baseName strips folder prefix and extension to the contract stem", () => {
  expect(baseName("lib/Counter.h")).toBe("Counter");
  expect(baseName("Counter.h")).toBe("Counter");
  expect(baseName("a/b/c.cpp")).toBe("c");
});

test("loadWorkspace falls back to the seed when storage is corrupt", () => {
  (globalThis as { localStorage: MemStore }).localStorage.setItem("qinit-ide-workspace.v1", "{not json");
  const ws = loadWorkspace();
  expect(ws.files.length).toBeGreaterThan(0);
  expect(ws.files.some((f) => f.name === ws.active)).toBe(true); // active always resolves to a real file
});

test("a saved workspace round-trips, and the sanitizer drops malformed file entries", () => {
  const persisted = { files: [{ name: "A.h", source: "a" }, { bogus: true }, { name: "B.h", source: "b" }], active: "B.h" };
  (globalThis as { localStorage: MemStore }).localStorage.setItem("qinit-ide-workspace.v1", JSON.stringify(persisted));
  const ws = loadWorkspace();
  expect(ws.files).toEqual([{ name: "A.h", source: "a" }, { name: "B.h", source: "b" }]);
  expect(ws.active).toBe("B.h");
});

test("an active name pointing at no file is repaired to the first file", () => {
  saveWorkspace({ files: [{ name: "A.h", source: "a" }], active: "ghost.h" });
  expect(loadWorkspace().active).toBe("A.h");
});

test("shareUrl + decodeSharedWorkspace round-trips utf8 source through base64", () => {
  const ws = { files: [{ name: "Café.h", source: "// 文字 ☃ café\nuint64 x;" }], active: "Café.h" };
  const url = shareUrl(ws);
  expect(url.startsWith("https://ide.test/ide#p=")).toBe(true);

  loc.hash = url.slice(url.indexOf("#"));
  const decoded = decodeSharedWorkspace();
  expect(decoded).toEqual(ws);
  expect(loc.hash).toBe(""); // consuming a share clears the hash so a reload doesn't re-import
});

test("decodeSharedWorkspace returns null when no share hash is present", () => {
  loc.hash = "";
  expect(decodeSharedWorkspace()).toBeNull();
});

test("resetWorkspace persists and returns the seed", () => {
  saveWorkspace({ files: [{ name: "Z.h", source: "z" }], active: "Z.h" });
  const seeded = resetWorkspace();
  expect(seeded.files.length).toBeGreaterThan(0);
  expect(loadWorkspace().files).toEqual(seeded.files); // the seed was written back to storage
});

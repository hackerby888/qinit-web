// the local project store: two tabs are two copies of one record, and the index is only a summary of the records.
import { beforeEach, expect, test } from "bun:test";

// localStorage stand-in with the two members a rebuild walks (length, key).
class MemStore {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const storage = new MemStore();
(globalThis as Record<string, unknown>).localStorage = storage;

const { getLocalStore, projectStorageKey, StaleProjectError } = await import("../../../src/ide/projects/store");
const store = getLocalStore();

beforeEach(() => storage.clear());

const withFile = (source: string) => [{ name: "Counter.h", source }];

// W26: each tab saved its whole in-memory project, so the last one to save silently undid the other.
test("a save from a copy older than the stored record is refused, and hands back what is stored", async () => {
  const created = await store.create("Shared", withFile("// start"));
  const tabA = (await store.load(created.id))!;
  const tabB = (await store.load(created.id))!;

  tabA.files = withFile("// from tab A");
  await store.save(tabA);

  tabB.files = withFile("// from tab B");
  const refused = await store.save(tabB).then(() => null, (error) => error);
  expect(refused).toBeInstanceOf(StaleProjectError);
  expect(refused.stored.files).toEqual(withFile("// from tab A"));
  expect((await store.load(created.id))!.files).toEqual(withFile("// from tab A"));

  // the tab that chooses to keep its own version says so by taking the stored timestamp first.
  tabB.updatedAt = refused.stored.updatedAt;
  await store.save(tabB);
  expect((await store.load(created.id))!.files).toEqual(withFile("// from tab B"));
});

test("one copy saving twice in a row is never stale against itself", async () => {
  const p = await store.create("Solo", withFile("1"));
  p.files = withFile("2");
  await store.save(p);
  p.files = withFile("3");
  await store.save(p);

  const stored = (await store.load(p.id))!;
  expect(stored.files).toEqual(withFile("3"));
  expect(stored.updatedAt).toBe(p.updatedAt);
  expect(JSON.parse(storage.getItem(projectStorageKey(p.id))!).files).toEqual(withFile("3"));
});

// W-s19: a corrupt index showed "0 projects" while every record was still in storage.
test("a damaged index is rebuilt from the project records", async () => {
  const first = await store.create("First", withFile("a"));
  const second = await store.create("Second", withFile("b"));
  await store.setCurrentId(first.id);

  for (const damaged of ["{not json", '{"an":"object"}', "null"]) {
    storage.setItem("ide.projects.index", damaged);
    const listed = await store.list();
    expect(listed.map((meta) => meta.name).sort()).toEqual(["First", "Second"]);
    expect(listed.find((meta) => meta.id === second.id)?.fileCount).toBe(1);
  }
  // the current-project pointer shares the records' key prefix and is not a project.
  expect((await store.list()).some((meta) => meta.id === undefined)).toBe(false);
});

test("an absent index on a fresh browser is an empty gallery, not a rebuild of nothing", async () => {
  expect(await store.list()).toEqual([]);
  expect(storage.getItem("ide.projects.index")).toBeNull();
});

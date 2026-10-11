// With BACKEND_ENABLED off the IDE must stand alone: nobody is signed in, projects stay in the browser, and no
// gated call reaches the network. fetch is replaced by a function that throws, so one stray request fails here.
import { test, expect } from "bun:test";

class MemStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
const storage = new MemStore();
// a token left over from an earlier signed-in session
storage.setItem("qinit.token", "stale.jwt.token");
(globalThis as Record<string, unknown>).localStorage = storage;
(globalThis as Record<string, unknown>).location = { hash: "#token=fresh.jwt.token", pathname: "/ide", search: "" };
(globalThis as Record<string, unknown>).history = { replaceState: () => undefined };
(globalThis as Record<string, unknown>).fetch = () => {
  throw new Error("the IDE reached for the backend");
};

const { BACKEND_ENABLED } = await import("../../../src/ide/cloud/backend");
const { getToken, isAuthed, authHeaders, fetchMe, captureAuthRedirect } = await import("../../../src/ide/cloud/auth");
const { fetchSystemCatalog, fetchSystemSource, fetchSystemSources } = await import("../../../src/ide/cloud/system-api");
const { getStore, getLocalStore } = await import("../../../src/ide/projects/store");

test.skipIf(BACKEND_ENABLED)("a stored token is ignored, and kept for when the backend returns", async () => {
  expect(getToken()).toBeNull();
  expect(isAuthed()).toBe(false);
  expect(authHeaders()).toEqual({});
  expect(await fetchMe()).toBeNull();
  expect(storage.getItem("qinit.token")).toBe("stale.jwt.token");
});

test.skipIf(BACKEND_ENABLED)("an OAuth redirect fragment is not consumed", () => {
  expect(captureAuthRedirect()).toEqual({});
  expect(storage.getItem("qinit.token")).toBe("stale.jwt.token");
});

test.skipIf(BACKEND_ENABLED)("projects live in the browser", () => {
  expect(getStore()).toBe(getLocalStore());
});

test.skipIf(BACKEND_ENABLED)("system contracts answer without a request", async () => {
  expect(await fetchSystemCatalog()).toEqual([]);
  expect(await fetchSystemSource("QX")).toEqual({ error: expect.stringContaining("BACKEND_ENABLED") });
  expect(await fetchSystemSources()).toEqual({ error: expect.stringContaining("BACKEND_ENABLED") });
});

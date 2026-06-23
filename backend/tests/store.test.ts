// Data-layer unit tests against the in-memory fallback (setup.ts pins QINIT_NO_DB=1). Covers the share-link
// lifecycle (create/dedupe/list/resolve/revoke/expiry/ownership), project upsert/get/list/delete, the
// per-account "current project" pref, and user upsert createdAt stability.
import { test, expect, describe } from "bun:test";
import {
  createShare,
  getShare,
  listShares,
  deleteShare,
  saveProject,
  getProject,
  listProjects,
  deleteProject,
  getCurrentProject,
  setCurrentProject,
  upsertUser,
  getUser,
} from "../src/store";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("share lifecycle", () => {
  test("create returns a 12-char url-safe link id that resolves back to the share", async () => {
    const s = await createShare("owner:a", "proj-1", "edit");

    expect(s.linkId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(s.mode).toBe("edit");
    expect(s.ownerUserId).toBe("owner:a");
    expect(s.projectId).toBe("proj-1");

    const resolved = await getShare(s.linkId);
    expect(resolved?.linkId).toBe(s.linkId);
  });

  test("re-creating the same mode reuses the existing link; a different mode mints a new one", async () => {
    const edit1 = await createShare("owner:b", "proj-2", "edit");
    const edit2 = await createShare("owner:b", "proj-2", "edit");
    expect(edit2.linkId).toBe(edit1.linkId);

    const view = await createShare("owner:b", "proj-2", "view");
    expect(view.linkId).not.toBe(edit1.linkId);

    const links = await listShares("owner:b", "proj-2");
    expect(links.map((l) => l.mode).sort()).toEqual(["edit", "view"]);
  });

  test("listShares is scoped to one owner + project", async () => {
    await createShare("owner:c", "proj-3", "edit");
    await createShare("owner:c", "proj-4", "edit");
    await createShare("owner:d", "proj-3", "edit");

    const c3 = await listShares("owner:c", "proj-3");
    expect(c3).toHaveLength(1);
    expect(c3[0].projectId).toBe("proj-3");
    expect(c3[0].ownerUserId).toBe("owner:c");
  });

  test("revoke removes the link; a non-owner cannot revoke it", async () => {
    const s = await createShare("owner:e", "proj-5", "edit");

    await deleteShare("intruder:x", s.linkId);
    expect(await getShare(s.linkId)).not.toBeNull();

    await deleteShare("owner:e", s.linkId);
    expect(await getShare(s.linkId)).toBeNull();
    expect(await listShares("owner:e", "proj-5")).toHaveLength(0);
  });

  test("a TTL sets expiresAt and an expired share resolves as missing", async () => {
    const live = await createShare("owner:f", "proj-6", "edit");
    expect(live.expiresAt).toBeUndefined();

    const ttl = await createShare("owner:f", "proj-7", "edit", 30);
    expect(ttl.expiresAt).toBeGreaterThan(Date.now());
    expect(await getShare(ttl.linkId)).not.toBeNull();

    await sleep(45);
    expect(await getShare(ttl.linkId)).toBeNull();
    expect(await listShares("owner:f", "proj-7")).toHaveLength(0);
  });
});

describe("projects", () => {
  test("save then get round-trips the full doc; get for another user is null", async () => {
    const doc = { id: "p1", name: "Counter", createdAt: 1, updatedAt: 2, files: [{ name: "a.h", source: "x" }] };
    await saveProject("u1", doc);

    expect(await getProject("u1", "p1")).toEqual(doc);
    expect(await getProject("u2", "p1")).toBeNull();
  });

  test("list returns meta with a file count; delete removes the row", async () => {
    await saveProject("u3", { id: "pa", name: "A", createdAt: 1, updatedAt: 1, files: [{ name: "x" }, { name: "y" }] } as never);
    await saveProject("u3", { id: "pb", name: "B", createdAt: 1, updatedAt: 1, files: [] } as never);

    const rows = await listProjects("u3");
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.id === "pa");
    expect(a?.fileCount).toBe(2);
    expect(a?.name).toBe("A");

    await deleteProject("u3", "pa");
    const after = await listProjects("u3");
    expect(after.map((r) => r.id)).toEqual(["pb"]);
  });

  test("current project is per-account and round-trips", async () => {
    expect(await getCurrentProject("u4")).toBeNull();

    await upsertUser({ id: "u4", provider: "google", providerId: "u4", name: "U4", createdAt: 1 });
    await setCurrentProject("u4", "p-current");
    expect(await getCurrentProject("u4")).toBe("p-current");
    expect(await getCurrentProject("u5")).toBeNull();
  });
});

describe("users", () => {
  test("upsert inserts then updates, preserving the original createdAt", async () => {
    const first = await upsertUser({ id: "google:1", provider: "google", providerId: "1", name: "First", createdAt: 100 });
    expect(first.createdAt).toBe(100);

    const second = await upsertUser({ id: "google:1", provider: "google", providerId: "1", name: "Renamed", createdAt: 999 });
    expect(second.createdAt).toBe(100);
    expect(second.name).toBe("Renamed");

    expect((await getUser("google:1"))?.name).toBe("Renamed");
    expect(await getUser("google:missing")).toBeNull();
  });
});

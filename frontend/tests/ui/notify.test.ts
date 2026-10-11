// Toast pub/sub + the dead-backend message translation.
import { test, expect, describe, beforeEach } from "bun:test";
import { notify, subscribeToasts, dismissToast, errorMessage, _resetToasts, type Toast } from "../../src/ui/notify";

beforeEach(() => {
  _resetToasts();
});

describe("notify pub/sub", () => {
  test("a subscriber receives pushed toasts and the current state on subscribe", () => {
    let seen: Toast[] = [];
    const unsub = subscribeToasts((t) => { seen = t; });
    expect(seen).toEqual([]);
    notify.error("boom");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "error", message: "boom" });
    unsub();
  });

  test("identical messages de-dupe (same id, no stacking)", () => {
    const a = notify.error("backend down");
    const b = notify.error("backend down");
    expect(a).toBe(b);
    let seen: Toast[] = [];
    subscribeToasts((t) => { seen = t; });
    expect(seen).toHaveLength(1);
  });

  test("different kinds with the same text are distinct", () => {
    notify.error("x");
    notify.warn("x");
    let seen: Toast[] = [];
    subscribeToasts((t) => { seen = t; });
    expect(seen).toHaveLength(2);
  });

  test("dismiss removes one toast and notifies", () => {
    const id = notify.error("a");
    notify.warn("b");
    let seen: Toast[] = [];
    subscribeToasts((t) => { seen = t; });
    dismissToast(id);
    expect(seen.map((t) => t.message)).toEqual(["b"]);
  });

  test("the visible stack is capped at 5", () => {
    for (let i = 0; i < 8; i++) {
      notify.info(`m${i}`);
    }
    let seen: Toast[] = [];
    subscribeToasts((t) => { seen = t; });
    expect(seen).toHaveLength(5);
    expect(seen[0].message).toBe("m3"); // oldest three dropped
  });

  test("unsubscribe stops delivery", () => {
    let count = 0;
    const unsub = subscribeToasts(() => { count++; });
    count = 0;
    unsub();
    notify.error("after");
    expect(count).toBe(0);
  });
});

describe("errorMessage", () => {
  test("translates the opaque fetch failures of a dead backend", () => {
    for (const raw of ["Failed to fetch", "NetworkError when attempting to fetch resource", "Load failed", "fetch failed"]) {
      expect(errorMessage(new Error(raw))).toBe("Can't reach the server — is the backend running?");
    }
  });

  test("passes through a meaningful server error", () => {
    expect(errorMessage(new Error("projects API 500 Internal Server Error"))).toBe("projects API 500 Internal Server Error");
  });

  test("prefixes with a context", () => {
    expect(errorMessage(new Error("Failed to fetch"), "Couldn't open the project")).toBe("Couldn't open the project: Can't reach the server — is the backend running?");
    expect(errorMessage(new Error("nope"), "Save failed")).toBe("Save failed: nope");
  });

  test("handles non-Error throwables and empties", () => {
    expect(errorMessage("plain string")).toBe("plain string");
    expect(errorMessage(undefined)).toBe("Something went wrong.");
    expect(errorMessage(new Error(""))).toBe("Something went wrong.");
  });
});

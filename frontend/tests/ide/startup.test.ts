import { describe, expect, test } from "bun:test";
import { ideStartupPending, ideStartupSteps, type IdeStartupState } from "../../src/ide/startup";

const initial: IdeStartupState = {
  projectReady: false,
  editorReady: false,
  compiler: "loading",
  engine: "loading",
};

describe("IDE startup loading log", () => {
  test("reports the real startup tasks in display order", () => {
    expect(ideStartupSteps(initial)).toEqual([
      { label: "project files", status: "loading" },
      { label: "editor engine", status: "pending" },
      { label: "Qinit compiler", status: "loading" },
      { label: "virtual node", status: "loading" },
    ]);
    expect(ideStartupPending(initial)).toBe(true);
  });

  test("stops the loading screen only when every required task has settled", () => {
    const ready: IdeStartupState = {
      projectReady: true,
      editorReady: true,
      compiler: "done",
      engine: "done",
    };

    expect(ideStartupSteps(ready).every((step) => step.status === "done")).toBe(true);
    expect(ideStartupPending(ready)).toBe(false);
  });

  test("a failed optional service does not leave the startup screen stuck", () => {
    const degraded: IdeStartupState = {
      projectReady: true,
      editorReady: true,
      compiler: "error",
      engine: "error",
    };

    expect(ideStartupPending(degraded)).toBe(false);
  });
});

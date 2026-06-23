// The structured log formatter: JSON in production, a terse human line otherwise.
import { test, expect, describe } from "bun:test";
import { formatLine } from "../src/log";

describe("formatLine", () => {
  test("production form is one JSON object with level/ts/msg + fields", () => {
    const line = formatLine("info", "hello", { a: 1, b: "x" }, 0, false);
    const obj = JSON.parse(line);

    expect(obj).toEqual({ level: "info", ts: "1970-01-01T00:00:00.000Z", msg: "hello", a: 1, b: "x" });
  });

  test("production form with no fields", () => {
    expect(JSON.parse(formatLine("error", "boom", undefined, 0, false))).toEqual({ level: "error", ts: "1970-01-01T00:00:00.000Z", msg: "boom" });
  });

  test("dev form is a terse line with level + key=val", () => {
    const line = formatLine("warn", "careful", { code: 7 }, 0, true);
    expect(line).toContain("WARN");
    expect(line).toContain("careful");
    expect(line).toContain("code=7");
  });
});

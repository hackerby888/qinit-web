// a project import is someone else's file: its names, tabs and scenarios are cleaned before a project is made of them.
import { expect, test } from "bun:test";

(globalThis as Record<string, unknown>).localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const { cleanImport, exportName } = await import("../../src/ide/projects/io");

const file = (name: string, source = "") => ({ name, source });

// W-s19: an import took `..` segments, an empty name and duplicate names as they came.
test("imported file names are cleaned, and a name already taken gets a free one", () => {
  const cleaned = cleanImport({
    files: [file("../../etc/passwd", "a"), file("", "b"), file("///", "c"), file("Counter.h", "d"), file("Counter.h", "e"), file("lib/Counter.h", "f"), file("notes.md", "g"), { name: 7, source: "h" }, null],
    active: "Counter.h",
    openTabs: ["Counter.h", "gone.h", "notes.md", "Counter.h"],
  });

  expect(cleaned.files).toEqual([
    file("etc/passwd.h", "a"),
    file("Counter.h", "d"),
    file("Counter-2.h", "e"),
    file("lib/Counter-3.h", "f"),
    file("notes.md", "g"),
  ]);
  expect(cleaned.active).toBe("Counter.h");
  expect(cleaned.openTabs).toEqual(["Counter.h", "notes.md"]);
});

test("the active file and tabs follow a renamed file, and fall back to the first file", () => {
  const renamed = cleanImport({ files: [file("my token.h")], active: "my token.h", openTabs: ["my token.h"] });
  expect(renamed).toMatchObject({ files: [file("mytoken.h")], active: "mytoken.h", openTabs: ["mytoken.h"] });

  const lost = cleanImport({ files: [file("A.h"), file("B.h")], active: "Missing.h", openTabs: "not a list" });
  expect(lost).toMatchObject({ active: "A.h", openTabs: ["A.h"] });
});

test("malformed scenarios are dropped, well-formed ones kept", () => {
  const good = { id: "s1", name: "Counter test 1", contract: "Counter", calls: [], asserts: [] };
  const cleaned = cleanImport({ files: [file("Counter.h")], scenarios: [good, { id: "s2" }, "text", null, { ...good, id: 5 }] });
  expect(cleaned.scenarios).toEqual([good]);
});

test("an import with no usable file is refused", () => {
  expect(() => cleanImport({ files: [] })).toThrow("not a valid qinit project file");
  expect(() => cleanImport({ files: [file("..")] })).toThrow("not a valid qinit project file");
  expect(() => cleanImport({})).toThrow("not a valid qinit project file");
});

// W-s20: a project named in another script exported as `_.qinit.json`.
test("an export name keeps letters and digits of any script", () => {
  expect(exportName("My Project")).toBe("My_Project");
  expect(exportName("проект 1")).toBe("проект_1");
  expect(exportName("合约")).toBe("合约");
  expect(exportName("über/../x")).toBe("über_.._x");
  expect(exportName("???")).toBe("project");
  expect(exportName("")).toBe("project");
});

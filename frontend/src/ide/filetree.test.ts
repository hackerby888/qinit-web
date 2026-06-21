// Folder tree: path labelling, normalisation (incl. traversal guards), and nested tree assembly.
import { test, expect, describe } from "bun:test";
import { fileLabel, dirOf, normalizePath, buildFileTree, type TreeDir, type TreeFile } from "./filetree";

describe("fileLabel / dirOf", () => {
  test("root-level file has no dir and labels itself", () => {
    expect(fileLabel("Counter.h")).toBe("Counter.h");
    expect(dirOf("Counter.h")).toBe("");
  });

  test("nested path splits at the final slash", () => {
    expect(fileLabel("lib/net/Socket.h")).toBe("Socket.h");
    expect(dirOf("lib/net/Socket.h")).toBe("lib/net");
  });
});

describe("normalizePath", () => {
  test("defaults a bare name to a .h file", () => {
    expect(normalizePath("Token")).toBe("Token.h");
  });

  test("keeps an explicit extension and a folder prefix", () => {
    expect(normalizePath("lib/utils.cpp")).toBe("lib/utils.cpp");
    expect(normalizePath("a/b/c")).toBe("a/b/c.h");
  });

  test("strips traversal and empty segments", () => {
    expect(normalizePath("../../etc/passwd")).toBe("etc/passwd.h");
    expect(normalizePath("a//b/./c.h")).toBe("a/b/c.h");
    expect(normalizePath("/lib/x.h")).toBe("lib/x.h");
  });

  test("removes illegal characters per segment", () => {
    expect(normalizePath("li b/u@t#il.h")).toBe("lib/util.h");
  });

  test("empty / junk input yields empty string", () => {
    expect(normalizePath("")).toBe("");
    expect(normalizePath("///")).toBe("");
    expect(normalizePath("..")).toBe("");
  });
});

describe("buildFileTree", () => {
  test("groups paths into folders, dirs before files, alpha within", () => {
    const tree = buildFileTree(["Counter.h", "lib/net/Socket.h", "lib/Util.h", "Adder.h"]);

    // root: lib (dir) before Adder.h, Counter.h (files, alpha)
    expect(tree.map((n) => n.label)).toEqual(["lib", "Adder.h", "Counter.h"]);
    expect(tree[0].kind).toBe("dir");

    const lib = tree[0] as TreeDir;
    expect(lib.path).toBe("lib");
    // lib: net (dir) before Util.h (file)
    expect(lib.children.map((n) => n.label)).toEqual(["net", "Util.h"]);

    const net = lib.children[0] as TreeDir;
    const socket = net.children[0] as TreeFile;
    expect(socket.kind).toBe("file");
    expect(socket.path).toBe("lib/net/Socket.h");
  });

  test("ignores duplicate and empty paths", () => {
    const tree = buildFileTree(["a.h", "a.h", ""]);
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe("a.h");
  });
});

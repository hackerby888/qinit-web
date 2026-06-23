// Folder tree: path labelling, normalisation (incl. traversal guards), and nested tree assembly.
import { test, expect, describe } from "bun:test";
import { fileLabel, dirOf, normalizePath, normalizeDir, occupiedNames, freeName, buildFileTree, type TreeDir, type TreeFile } from "../../src/ide/filetree";

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

describe("normalizeDir", () => {
  test("cleans segments without forcing an extension", () => {
    expect(normalizeDir("lib")).toBe("lib");
    expect(normalizeDir("lib/net")).toBe("lib/net");
    expect(normalizeDir("li b/n@et")).toBe("lib/net");
  });

  test("strips traversal and empty segments", () => {
    expect(normalizeDir("../lib//")).toBe("lib");
    expect(normalizeDir("..")).toBe("");
    expect(normalizeDir("")).toBe("");
  });
});

describe("occupiedNames / freeName", () => {
  test("occupiedNames includes files and every folder prefix", () => {
    const taken = occupiedNames(["lib/net/a.h", "b.h"]);
    expect([...taken].sort()).toEqual(["b.h", "lib", "lib/net", "lib/net/a.h"]);
  });

  test("freeName returns the path when free", () => {
    const taken = occupiedNames(["a.h"]);
    expect(freeName(taken, "b.h", false)).toBe("b.h");
  });

  test("freeName suffixes a colliding file before the extension, in the same folder", () => {
    const taken = occupiedNames(["lib/a.h", "lib/a-2.h"]);
    expect(freeName(taken, "lib/a.h", false)).toBe("lib/a-3.h");
  });

  test("freeName suffixes a colliding folder at the end", () => {
    const taken = occupiedNames(["lib/x.h"]); // folder "lib" is occupied
    expect(freeName(taken, "lib", true)).toBe("lib-2");
  });
});

describe("buildFileTree", () => {
  test("a lone .keep placeholder renders an empty folder, not a file", () => {
    const tree = buildFileTree(["lib/.keep"]);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind).toBe("dir");
    expect((tree[0] as TreeDir).children).toHaveLength(0);
  });

  test(".keep is hidden once the folder holds a real file", () => {
    const tree = buildFileTree(["lib/.keep", "lib/a.h"]);
    const lib = tree[0] as TreeDir;
    expect(lib.children.map((n) => n.label)).toEqual(["a.h"]);
  });

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

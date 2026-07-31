// Robustness against reality + drift detection. Two tiers, both gated on the core-lite snapshot being
// present (skipped cleanly otherwise — e.g. a CI box without `qinit up`):
//   1. the parser survives every real system contract (Qx, Quottery, Qearn, …);
//   2. our hand-written qpi tables (CONTAINERS / QPI_API) don't drift from what qpi.h actually declares.
import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { loadQpiHeader } from "@qinit/compiler";
import { collectStructs, enclosingEntry, maskComments, QPI_API, CONTAINERS } from "../../../src/ide/qpi/members";
import { scanContext } from "../../../src/ide/qpi/contextlint";
import { coreContractsDir, listContracts, readFile } from "./test-helpers";

const DIR = coreContractsDir();
// Mask comments/strings so a brace inside one can't throw off the class-body brace matching below.
const QPI = DIR ? maskComments(loadQpiHeader(join(DIR, "..", ".."))) : "";

const ENTRY = /\b((?:PUBLIC|PRIVATE)_(?:FUNCTION|PROCEDURE)(?:_WITH_LOCALS)?)\s*\(\s*(\w+)\s*\)/g;

// The brace-delimited body of a `struct`/`class Name`, or null.
function classBody(src: string, name: string): string | null {
  const m = new RegExp(`\\b(?:struct|class)\\s+${name}\\b[^;{]*\\{`).exec(src);
  if (!m) {
    return null;
  }
  const open = src.indexOf("{", m.index);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
    } else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        return src.slice(open + 1, i);
      }
    }
  }
  return null;
}

// Method names declared directly in a class body. Strip nested `{…}` (method bodies / nested types) first
// so we see signatures, not the names called inside them.
function methodNames(body: string): Set<string> {
  let flat = "";
  let depth = 0;
  for (const c of body) {
    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
    } else if (depth === 0) {
      flat += c;
    }
  }
  const names = new Set<string>();
  for (const m of flat.matchAll(/\b([a-z]\w*)\s*\(/g)) {
    names.add(m[1]);
  }
  return names;
}

describe("corpus: parser survives the real system contracts", () => {
  test.skipIf(!DIR)("every contract parses; every user entry's body is attributed to it", () => {
    const files = listContracts(DIR!);
    expect(files.length).toBeGreaterThan(10); // sanity: we actually found the corpus

    const failures: string[] = [];
    for (const file of files) {
      const src = readFile(DIR!, file);

      let structs: Map<string, { name: string; type: string }[]>;
      try {
        structs = collectStructs(src);
      } catch (e) {
        failures.push(`${file}: collectStructs threw ${(e as Error).message}`);
        continue;
      }
      if (structs.size === 0) {
        continue; // a few headers (math_lib etc.) have no structs — fine
      }

      ENTRY.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ENTRY.exec(src)) !== null) {
        const bodyOpen = src.indexOf("{", ENTRY.lastIndex);
        if (bodyOpen < 0) {
          continue;
        }
        const entry = enclosingEntry(src, bodyOpen + 1);
        if (!entry || entry.base !== m[2] || entry.macro !== m[1]) {
          failures.push(`${file}: ${m[1]}(${m[2]}) body not attributed (got ${JSON.stringify(entry)})`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test.skipIf(!DIR)("the context-aware diagnostics flag nothing in the (correct) real contracts", () => {
    const violations: string[] = [];
    for (const file of listContracts(DIR!)) {
      for (const f of scanContext(readFile(DIR!, file))) {
        violations.push(`${file}: ${f.rule} @ ${f.offset}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test.skipIf(!DIR)("container fields in real contracts are parsed with their template types", () => {
    // Qx declares `Collection`/`Array` state; just assert at least one real container field round-trips.
    const withContainers = listContracts(DIR!)
      .map((f) => readFile(DIR!, f))
      .flatMap((src) => [...collectStructs(src).values()].flat())
      .filter((field) => /^(Array|HashMap|HashSet|Collection|BitArray)\s*</.test(field.type));

    expect(withContainers.length).toBeGreaterThan(0);
  });
});

describe("drift: our qpi tables match qpi.h", () => {
  test.skipIf(!DIR)("every CONTAINERS method exists on its container in qpi.h", () => {
    const drift: string[] = [];
    for (const kind of Object.keys(CONTAINERS)) {
      const body = classBody(QPI, kind);
      expect(body, `${kind} not found in qpi.h`).not.toBeNull();
      const real = methodNames(body!);
      for (const m of CONTAINERS[kind]) {
        if (!real.has(m.label)) {
          drift.push(`${kind}.${m.label}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  test.skipIf(!DIR)("every qpi.* method exists in the right context (function vs procedure)", () => {
    const base = methodNames(classBody(QPI, "QpiContext")!);
    const fn = methodNames(classBody(QPI, "QpiContextFunctionCall")!);
    const proc = methodNames(classBody(QPI, "QpiContextProcedureCall")!);
    const funcAvailable = new Set([...base, ...fn]);

    const missing: string[] = [];
    const misclassified: string[] = [];
    for (const m of QPI_API) {
      const known = funcAvailable.has(m.label) || proc.has(m.label);
      if (!known) {
        missing.push(m.label);
        continue;
      }
      if (m.proc && !proc.has(m.label)) {
        misclassified.push(`${m.label} marked proc but not in QpiContextProcedureCall`);
      }
      if (!m.proc && !funcAvailable.has(m.label)) {
        misclassified.push(`${m.label} not marked proc but missing from the function context`);
      }
    }

    expect(missing).toEqual([]);
    expect(misclassified).toEqual([]);
  });
});

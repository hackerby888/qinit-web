// Coverage + cross-table consistency for the QPI container set. Guards the maintenance hazard where a
// container is added to one table (e.g. CONTAINERS) but missed in another (containerKind / templates /
// the type vocab), and documents exactly which containers are supported.
import { test, expect, describe } from "bun:test";
import { CONTAINERS, containerKind } from "../../../src/ide/qpi/members";
import { QPI_TYPES } from "../../../src/ide/qpi/vocab";
import { signatureAt } from "../../../src/ide/qpi/signature";

describe("container coverage", () => {
  const keys = Object.keys(CONTAINERS);

  test("the supported direct-call container set (update deliberately)", () => {
    expect(keys.sort()).toEqual(["Array", "BitArray", "Collection", "HashMap", "HashSet", "LinkedList", "SlowAnySizeArray"]);
  });

  test("each container is detected by containerKind, is a known type, and has a template hint", () => {
    for (const k of keys) {
      expect(containerKind(`${k}<x>`), `containerKind misses ${k}`).toBe(k);
      expect(QPI_TYPES, `${k} not in QPI_TYPES (no highlighting/type completion)`).toContain(k);
      const tmpl = `${k}<`;
      expect(signatureAt("", tmpl, tmpl.length), `${k} has no template-argument hint`).not.toBeNull();
    }
  });

  test("ProposalVoting is a known type + template, but not a direct-call container (storage only)", () => {
    expect(QPI_TYPES).toContain("ProposalVoting");
    expect(signatureAt("", "ProposalVoting<", "ProposalVoting<".length)).not.toBeNull();
    expect(containerKind("ProposalVoting<A, B>")).toBeNull();
  });
});

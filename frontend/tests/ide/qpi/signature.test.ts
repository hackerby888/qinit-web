// Signature help: call signatures (qpi + container methods, active arg by comma) and template-argument
// hints. Asserts the rendered label, the active parameter's name, and the doc.
import { test, expect, describe } from "bun:test";
import { signatureAt, type SignatureInfo } from "../../../src/ide/qpi/signature";
import { at } from "./test-helpers";

// A procedure body with a HashMap field, `recv` dropped in at the cursor.
const inBody = (recv: string): string =>
  `struct S : public ContractBase { struct StateData { HashMap<id, sint64> balances; }; PUBLIC_PROCEDURE(M) { ${recv}| } };`;

function sig(fixture: string): SignatureInfo | null {
  const { src, offset, line } = at(fixture);
  return signatureAt(src, line, offset);
}

const activeName = (s: SignatureInfo): string => s.label.slice(s.params[s.active][0], s.params[s.active][1]);

describe("qpi call signatures", () => {
  test("qpi.transfer( -> label + first arg active", () => {
    const s = sig(inBody("qpi.transfer("))!;
    expect(s.label).toBe("transfer(destination, amount)");
    expect(activeName(s)).toBe("destination");
  });

  test("the active arg advances past a comma", () => {
    const s = sig(inBody("qpi.transfer(dest, "))!;
    expect(activeName(s)).toBe("amount");
  });

  test("multi-arg method tracks the right active index", () => {
    const s = sig(inBody("qpi.issueAsset(a, b, "))!;
    expect(s.label).toBe("issueAsset(name, issuer, decimals, numberOfShares, unitOfMeasurement)");
    expect(activeName(s)).toBe("decimals");
  });
});

describe("container call signatures", () => {
  test("HashMap.get exposes the value out-param in the doc", () => {
    const s = sig(inBody("state.get().balances.get("))!;
    expect(s.label).toBe("get(key, value)");
    expect(activeName(s)).toBe("key");
    expect(s.doc).toContain("out-param");
  });

  test("active arg advances to value after the comma", () => {
    const s = sig(inBody("state.get().balances.get(k, "))!;
    expect(activeName(s)).toBe("value");
  });
});

describe("template argument hints", () => {
  test("HashMap< -> the three template params, first active", () => {
    const s = sig("HashMap<|")!;
    expect(s.label).toBe("HashMap<KeyT, ValueT, L>");
    expect(activeName(s)).toBe("KeyT");
  });

  test("after the first template comma -> ValueT", () => {
    const s = sig("HashMap<id, |")!;
    expect(activeName(s)).toBe("ValueT");
  });

  test("Array< has element type + capacity", () => {
    const s = sig("Array<uint64, |")!;
    expect(s.label).toBe("Array<T, L>");
    expect(activeName(s)).toBe("L");
  });
});

describe("not in a call", () => {
  test("plain expression -> null", () => {
    expect(sig(inBody("state.mut().counter = 1 "))).toBeNull();
  });

  test("an unknown receiver method -> null", () => {
    expect(sig(inBody("qpi.nonexistentMethod("))).toBeNull();
  });
});

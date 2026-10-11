import { test, expect } from "bun:test";
import type { FieldView as Field } from "../../../src/ide/calls/idl-view";
import {
  MAX_QU,
  ZERO_IDENTITY,
  buildInput,
  inputHint,
  inputToDraft,
  parseQu,
  type InputDraft,
} from "../../../src/ide/calls/input-values";

const asset: Field = {
  name: "asset",
  type: "{ id, uint64 }",
  struct: [
    { name: "issuer", type: "id" },
    { name: "assetName", type: "uint64" },
  ],
};

test("input hints match the QPI public scalar vocabulary", () => {
  expect(inputHint({ name: "who", type: "id" })).toBe("AAA...AAA");
  expect(inputHint({ name: "amount", type: "uint64" })).toBe("0");
  expect(inputHint({ name: "wide", type: "uint128" })).toBe("0");
  expect(inputHint({ name: "enabled", type: "bit" })).toBe("0");
  expect(inputHint({ name: "values", type: "[3; uint64]", array: true })).toBe("[0,0,0]");
});

test("buildInput reconstructs a named Asset subsection as positional ABI data", () => {
  const draft: InputDraft = {
    "asset.issuer": ZERO_IDENTITY,
    "asset.assetName": "18446744073709551615",
  };
  expect(buildInput([asset], draft)).toEqual({
    asset: [ZERO_IDENTITY, "18446744073709551615"],
  });
});

test("buildInput recursively reconstructs user structs and arrays of structs", () => {
  const order: Field = {
    name: "order",
    type: "{ { id, uint64 }, [2; { uint32, bit }] }",
    struct: [
      { name: "asset", type: "{ id, uint64 }", struct: asset.struct },
      {
        name: "legs",
        type: "[2; { uint32, bit }]",
        array: true,
        struct: [
          { name: "price", type: "uint32" },
          { name: "active", type: "bit" },
        ],
      },
    ],
  };
  const draft: InputDraft = {
    "order.asset.issuer": ZERO_IDENTITY,
    "order.asset.assetName": "7",
    "order.legs.0.price": "10",
    "order.legs.0.active": "true",
    "order.legs.1.price": "20",
    "order.legs.1.active": "0",
  };
  expect(buildInput([order], draft)).toEqual({
    order: [[ZERO_IDENTITY, "7"], [["10", true], ["20", false]]],
  });
});

test("scalar array JSON is checked and wide integers remain lossless strings", () => {
  const fields: Field[] = [{ name: "values", type: "[2; uint64]", array: true }];
  expect(buildInput(fields, { values: '["18446744073709551615",2]' })).toEqual({
    values: ["18446744073709551615", "2"],
  });
  // unquoted, as the field's own placeholder shows it: the digits typed are the digits sent.
  expect(buildInput(fields, { values: "[9007199254740993, 18446744073709551615]" })).toEqual({
    values: ["9007199254740993", "18446744073709551615"],
  });
  expect(() => buildInput(fields, { values: "[1.5,2]" })).toThrow("values must be a JSON array");
  expect(() => buildInput(fields, { values: "[1e3,2]" })).toThrow("values must be a JSON array");
});

test("0 is the zero identity; any other short text is refused", () => {
  const who: Field[] = [{ name: "who", type: "id" }];
  expect(buildInput(who, { who: "0" })).toEqual({ who: ZERO_IDENTITY });
  expect(buildInput(who, {})).toEqual({ who: ZERO_IDENTITY });
  expect(() => buildInput(who, { who: "1" })).toThrow("id must be a 60-character uppercase Qubic identity, or 0");
});

test("a qu amount is digits only, exact, and capped at what one transfer can carry", () => {
  expect(parseQu("", "value")).toBe(0n);
  expect(parseQu(" 100 ", "value")).toBe(100n);
  expect(parseQu(MAX_QU.toString(), "value")).toBe(MAX_QU);

  for (const typed of ["abc", "1e3", "0x10", "1.5", "-5", "1,000"]) {
    expect(() => parseQu(typed, "value")).toThrow(`value must be a whole number of qu (got '${typed}')`);
  }
  expect(() => parseQu("9007199254740993", "value")).toThrow("value 9007199254740993 is above the most one transfer can carry");
  expect(() => parseQu("99999999999999999999999", "faucet amount")).toThrow("faucet amount 99999999999999999999999 is above the most one transfer can carry (1,000,000,000,000,000 qu)");
});

// the literal exists so this module loads without the engine; it must not drift from the node's.
test("MAX_QU is the node's MAX_AMOUNT", async () => {
  expect(MAX_QU).toBe((await import("@qinit/engine")).MAX_AMOUNT);
});

test("blank controls use the displayed zero-value hints", () => {
  expect(buildInput([asset], {})).toEqual({ asset: [ZERO_IDENTITY, "0"] });
});

test("inputToDraft preserves structured captured calls for scenario replay", () => {
  const input = { asset: [ZERO_IDENTITY, "18446744073709551615"] };
  const draft = inputToDraft([asset], input);
  expect(draft).toEqual({
    "asset.issuer": ZERO_IDENTITY,
    "asset.assetName": "18446744073709551615",
  });
  expect(buildInput([asset], draft)).toEqual(input);
});

test("non-QPI public types are rejected instead of receiving misleading hints", () => {
  expect(() => inputHint({ name: "digest", type: "m256i" })).toThrow(/not allowed in a QPI public interface/);
  expect(() => inputHint({ name: "signed", type: "sint128" })).toThrow(/not a QPI type/);
});

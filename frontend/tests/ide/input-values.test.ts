import { test, expect } from "bun:test";
import type { FieldView as Field } from "../../src/ide/idl-view";
import {
  ZERO_IDENTITY,
  buildInput,
  inputHint,
  inputToDraft,
  type InputDraft,
} from "../../src/ide/input-values";

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
  expect(() => buildInput(fields, { values: "[9007199254740993,2]" })).toThrow(/quote wide integer/);
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

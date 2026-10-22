// The IDE chrome is monochrome: its signal colour is the text colour, green is reserved for ok status, and no file
// still carries the retired pixel font or the mint, cyan or teal literals (hex, rgb triples or the old Tailwind names).
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { color, font } from "../../src/ui/tokens";

test("the chrome signal is the text colour and ok is the only green", () => {
  expect(color.accent).toBe(color.textLightHi);
  expect(color.ok).toBe("#3fb950");
  expect(font.display).not.toMatch(/Pixelify/);
});

const RETIRED = /Pixelify|19E0B4|12B891|0B7A63|073A30|3CE8C4|0C9C80|56C8FF|1E7FA8|6DF2D6|9FEFE0|3ECF8E|60,\s*232,\s*196|12,\s*156,\s*128|\b(?:text|bg|border|hover:text|hover:border)-mint\b/i;
const SOURCE = /\.(?:tsx?|css|svg|html|js)$/;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SOURCE.test(name)) yield path;
  }
}

test("no retired literal is left in the frontend", () => {
  const root = new URL("../..", import.meta.url).pathname;
  const hits: string[] = [];
  for (const path of [...walk(join(root, "src")), ...walk(join(root, "public")), join(root, "index.html"), join(root, "tailwind.config.js")]) {
    readFileSync(path, "utf8").split("\n").forEach((line, index) => {
      if (RETIRED.test(line)) hits.push(`${path.slice(root.length)}:${index + 1}: ${line.trim()}`);
    });
  }
  expect(hits).toEqual([]);
});

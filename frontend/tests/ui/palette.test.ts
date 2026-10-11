// the brand accent is one green on every surface: the neo and flat palettes share it, and no file still carries
// the retired mint, cyan or teal literals (hex, rgb triples or the old Tailwind class names).
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { applyTheme, color } from "../../src/ui/tokens";

const ACCENT_KEYS = ["accent", "accentMid", "accentDeep", "accentShadow"] as const;

test("neo and flat share the accent family", () => {
  applyTheme("neo");
  const neo = Object.fromEntries(ACCENT_KEYS.map((key) => [key, color[key]]));
  applyTheme("flat");
  const flat = Object.fromEntries(ACCENT_KEYS.map((key) => [key, color[key]]));
  expect(flat).toEqual(neo);
  expect(neo.accent).toBe("#3FB950");
  for (const key of ACCENT_KEYS) expect(neo[key]).toMatch(/^#[0-9A-F]{6}$/);
});

const RETIRED = /19E0B4|12B891|0B7A63|073A30|3CE8C4|0C9C80|56C8FF|1E7FA8|6DF2D6|9FEFE0|3ECF8E|60,\s*232,\s*196|12,\s*156,\s*128|\b(?:text|bg|border|hover:text|hover:border)-mint\b/i;
const SOURCE = /\.(?:tsx?|css|svg|html|js)$/;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SOURCE.test(name)) yield path;
  }
}

test("no retired mint literal is left in the frontend", () => {
  const root = new URL("../..", import.meta.url).pathname;
  const hits: string[] = [];
  for (const path of [...walk(join(root, "src")), ...walk(join(root, "public")), join(root, "index.html"), join(root, "tailwind.config.js")]) {
    readFileSync(path, "utf8").split("\n").forEach((line, index) => {
      if (RETIRED.test(line)) hits.push(`${path.slice(root.length)}:${index + 1}: ${line.trim()}`);
    });
  }
  expect(hits).toEqual([]);
});

// The CLI reference is written by hand; the CLI's own command table (meta.ts in the sibling Qinit checkout) is the
// truth. This fails when a command or flag is missing from the page, or the page names one the CLI no longer has.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { COMMANDS, META, type CommandMeta } from "../../../Qinit/packages/cli/src/meta";

const UNIVERSAL = ["help", "json", "plain"];

interface Section { command: string; sub?: string; text: string }

// a "### qinit <command> [<subcommand>]" heading opens a section; the next heading of any level closes it
function sections(body: string): Section[] {
  const found: Section[] = [];
  let open: Section | null = null;
  for (const line of body.split("\n")) {
    const heading = /^### qinit (\S+)(?: (\S+))?$/.exec(line);
    if (heading) {
      open = { command: heading[1], sub: heading[2], text: "" };
      found.push(open);
    } else if (/^#{2,3} /.test(line)) {
      open = null;
    } else if (open) {
      open.text += line + "\n";
    }
  }
  return found;
}

const flagNames = (meta: CommandMeta): string[] => [
  ...(meta.options ?? []),
  ...Object.values(meta.subcommands ?? {}).flatMap((sub) => sub.options),
].map((option) => option.name);

const mentions = (text: string, flag: string): boolean => new RegExp(`--${flag}(?![\\w-])`).test(text);

test("the CLI reference covers every command and flag, and names none that are gone", () => {
  const all = sections(readFileSync(new URL("../src/content/cli-reference.md", import.meta.url), "utf8"));
  const errors: string[] = [];

  for (const command of COMMANDS) {
    const meta: CommandMeta = META[command];
    if (meta.hidden) continue;
    const own = all.filter((section) => section.command === command);
    if (own.length === 0) {
      errors.push(`${command}: no "### qinit ${command}" section`);
      continue;
    }
    const text = own.map((section) => section.text).join("\n");
    for (const option of meta.options ?? []) {
      if (!mentions(text, option.name)) errors.push(`${command}: --${option.name} is not documented`);
    }
    for (const [sub, subMeta] of Object.entries(meta.subcommands ?? {})) {
      const section = own.find((candidate) => candidate.sub === sub);
      if (!section) {
        errors.push(`${command} ${sub}: no "### qinit ${command} ${sub}" section`);
        continue;
      }
      for (const option of subMeta.options) {
        if (!mentions(section.text, option.name)) errors.push(`${command} ${sub}: --${option.name} is not documented`);
      }
    }
  }

  for (const section of all) {
    const name = `${section.command}${section.sub ? ` ${section.sub}` : ""}`;
    const meta: CommandMeta | undefined = (META as Record<string, CommandMeta>)[section.command];
    if (!meta || meta.hidden) {
      errors.push(`${name}: the CLI has no such command`);
      continue;
    }
    if (section.sub && meta.subcommands && !Object.hasOwn(meta.subcommands, section.sub)) {
      errors.push(`${name}: the CLI has no such subcommand`);
    }
    // the first cell of a flags-table row lists the flags that row documents
    const known = new Set([...flagNames(meta), ...UNIVERSAL]);
    for (const row of section.text.matchAll(/^\| (`--[^|]*)\|/gm)) {
      for (const flag of row[1].matchAll(/--([a-z][a-z-]*)/g)) {
        if (!known.has(flag[1])) errors.push(`${name}: --${flag[1]} is not a flag of this command`);
      }
    }
  }

  expect(errors).toEqual([]);
});

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const GROUPS = ["Getting Started", "Guides", "Reference", "Concepts"];
const ALIASES: Record<string, string> = {
  installation: "overview",
  templates: "writing-a-contract",
};

test("developer docs are internally consistent", () => {
  const content = new URL("../src/content/", import.meta.url);
  const errors: string[] = [];
  const docs = readdirSync(content)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const raw = readFileSync(new URL(file, content), "utf8");
      const frontmatter = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
      if (!frontmatter) {
        errors.push(`${file}: missing front matter`);
        return null;
      }

      const meta: Record<string, string> = {};
      for (const line of frontmatter[1].split("\n")) {
        const separator = line.indexOf(":");
        if (separator < 1) {
          errors.push(`${file}: invalid front matter line ${line}`);
          continue;
        }
        meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
      }
      const slug = file.replace(/\.md$/, "");
      const order = Number(meta.order);

      if (!meta.title) errors.push(`${file}: missing title`);
      if (!GROUPS.includes(meta.group)) errors.push(`${file}: unknown group ${meta.group}`);
      if (!Number.isInteger(order) || order < 1) errors.push(`${file}: invalid order ${meta.order}`);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push(`${file}: invalid slug`);
      if ((raw.match(/^```/gm)?.length ?? 0) % 2 !== 0) errors.push(`${file}: unbalanced code fence`);
      if (/\bqinit\s+(?:up|sync)\b/.test(frontmatter[2])) errors.push(`${file}: uses removed qinit command`);

      return { file, slug, group: meta.group, order, body: frontmatter[2] };
    })
    .filter((doc) => doc !== null);

  expect(docs).toHaveLength(13);

  const slugs = new Set<string>();
  const positions = new Set<string>();
  for (const doc of docs) {
    if (slugs.has(doc.slug)) errors.push(`${doc.file}: duplicate slug ${doc.slug}`);
    slugs.add(doc.slug);

    const position = `${doc.group}:${doc.order}`;
    if (positions.has(position)) errors.push(`${doc.file}: duplicate group/order ${position}`);
    positions.add(position);
  }

  for (const [alias, target] of Object.entries(ALIASES)) {
    if (!slugs.has(target)) errors.push(`${alias}: alias target ${target} is missing`);
  }

  for (const doc of docs) {
    for (const link of doc.body.matchAll(/\]\(\/docs\/([^\s)?#]+)(?:[?#][^)]*)?\)/g)) {
      const slug = link[1];
      if (!slugs.has(slug) && !Object.hasOwn(ALIASES, slug)) errors.push(`${doc.file}: broken /docs/${slug} link`);
    }
  }

  expect(errors).toEqual([]);
});

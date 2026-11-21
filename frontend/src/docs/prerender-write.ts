// build step, run by bun after both vite builds: one static html file per docs page in dist/, plus sitemap.xml and robots.txt.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { prerenderedPage, robotsTxt, sitemapXml } from "./seo";

const dist = new URL("../../dist/", import.meta.url);
const entry = (await import(new URL("../../dist-ssr/prerender.js", import.meta.url).href)) as typeof import("./prerender");
const template = readFileSync(new URL("index.html", dist), "utf8");

mkdirSync(new URL("docs/", dist), { recursive: true });
for (const page of entry.pages) {
  const path = `/docs/${page.slug}`;
  const markup = entry.render(page.slug);
  if (!markup.includes("<h1")) throw new Error(`prerender of ${path} has no heading`);
  writeFileSync(new URL(`docs/${page.slug}.html`, dist), prerenderedPage(template, { title: page.title, description: page.description, path }, markup));
}

writeFileSync(new URL("sitemap.xml", dist), sitemapXml(["/", "/ide", ...entry.pages.map((page) => `/docs/${page.slug}`)]));
writeFileSync(new URL("robots.txt", dist), robotsTxt());
console.log(`prerendered ${entry.pages.length} docs pages`);

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SITE_ORIGIN, SITE_TITLE, prerenderedPage, robotsTxt, sitemapXml } from "../../src/docs/seo";

const template = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const head = { title: "Deploy & call", description: 'Build <it> and "call" it.', path: "/docs/deploy-and-call" };

test("a prerendered page carries its own head tags and its markup", () => {
  const html = prerenderedPage(template, head, "<h1>Deploy</h1>");

  expect(html).toContain("<title>Deploy &amp; call — qinit docs</title>");
  expect(html).toContain('<meta name="description" content="Build &lt;it&gt; and &quot;call&quot; it." />');
  expect(html).toContain('<meta property="og:title" content="Deploy &amp; call — qinit docs" />');
  expect(html).toContain('<meta property="og:description" content="Build &lt;it&gt; and &quot;call&quot; it." />');
  expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/docs/deploy-and-call" />`);
  expect(html).toContain(`<meta property="og:url" content="${SITE_ORIGIN}/docs/deploy-and-call" />`);
  expect(html).toContain('<div id="root"><h1>Deploy</h1></div>');
  expect(html).not.toContain(SITE_TITLE);
});

// the docs page puts this title back when the reader leaves for the landing page
test("the site title is the one index.html ships", () => {
  expect(template).toContain(`<title>${SITE_TITLE}</title>`);
});

test("a template missing a tag, or a page with no description, is refused", () => {
  expect(() => prerenderedPage(template.replace(/<title>.*<\/title>/, ""), head, "")).toThrow("prerender template has no");
  expect(() => prerenderedPage(template.replace('<div id="root"></div>', ""), head, "")).toThrow("prerender template has no");
  expect(() => prerenderedPage(template, { ...head, description: "" }, "")).toThrow("/docs/deploy-and-call has no description");
});

test("the sitemap and robots.txt name absolute addresses", () => {
  expect(sitemapXml(["/", "/docs/quickstart"])).toContain(`<url><loc>${SITE_ORIGIN}/</loc></url>\n  <url><loc>${SITE_ORIGIN}/docs/quickstart</loc></url>`);
  expect(robotsTxt()).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
});

// head tags, sitemap and robots.txt for the prerendered docs. pure, so the page, the build step and the tests share it.
export const SITE_ORIGIN = "https://qinit.dev";
export const SITE_TITLE = "qinit — Qubic contracts framework";

export interface PageHead { title: string; description: string; path: string }

export const pageTitle = (title: string): string => `${title} — qinit docs`;

const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// a template without the tag is a build error, never a page that keeps the landing's text
function swap(html: string, pattern: RegExp, replace: (...groups: string[]) => string): string {
  if (!pattern.test(html)) throw new Error(`prerender template has no ${pattern.source}`);
  return html.replace(pattern, (_match, ...groups) => replace(...groups));
}

const swapContent = (html: string, attribute: string, value: string): string =>
  swap(html, new RegExp(`(<meta ${attribute} content=")[^"]*`), (open) => `${open}${value}`);

// index.html with one docs page's head tags and its rendered markup inside the root element.
export function prerenderedPage(template: string, head: PageHead, markup: string): string {
  if (!head.description) throw new Error(`${head.path} has no description`);
  const title = escapeHtml(pageTitle(head.title));
  const description = escapeHtml(head.description);
  const url = `${SITE_ORIGIN}${head.path}`;

  let html = swap(template, /<title>[^<]*<\/title>/, () => `<title>${title}</title>`);
  html = swapContent(html, 'name="description"', description);
  html = swapContent(html, 'property="og:title"', title);
  html = swapContent(html, 'property="og:description"', description);
  html = swap(html, /( *)<\/head>/, (indent) => `${indent}  <link rel="canonical" href="${url}" />\n${indent}  <meta property="og:url" content="${url}" />\n${indent}</head>`);
  return swap(html, /<div id="root"><\/div>/, () => `<div id="root">${markup}</div>`);
}

export const sitemapXml = (paths: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${SITE_ORIGIN}${path}</loc></url>`).join("\n")}\n</urlset>\n`;

export const robotsTxt = (): string => `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;

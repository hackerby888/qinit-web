// Heading ids for the docs. The renderer, the "On this page" list and the tests share this one slug rule,
// so a link to /docs/page#section can be checked without rendering the page.
export interface PageHeading { level: 2 | 3; text: string; id: string }

export const slugifyHeading = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The ## and ### headings of a page, in order. Fenced code is skipped: a "## comment" in a shell block is not a heading.
export function pageHeadings(body: string): PageHeading[] {
  const headings: PageHeading[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const m = fenced ? null : /^(#{2,3}) +(.+?) *$/.exec(line);
    if (!m) continue;
    // drop inline markup, so the text matches what the renderer shows
    const text = m[2].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "");
    headings.push({ level: m[1].length as 2 | 3, text, id: slugifyHeading(text) });
  }
  return headings;
}

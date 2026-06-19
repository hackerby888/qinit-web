import type { ReactNode } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { CodeBlock } from "./components/CodeBlock";
import { ThemeToggle } from "./components/ThemeToggle";

const GROUPS = ["Getting Started", "Guides", "Reference", "Concepts"];

// Load every doc as raw markdown at build time (Vite glob).
const files = import.meta.glob("./content/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function parseFm(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { meta, body: m[2] };
}

interface Doc { slug: string; title: string; group: string; order: number; body: string }
const DOCS: Doc[] = Object.entries(files)
  .map(([path, raw]) => {
    const slug = path.split("/").pop()!.replace(/\.md$/, "");
    const { meta, body } = parseFm(raw);
    return { slug, title: meta.title ?? slug, group: meta.group ?? "Docs", order: Number(meta.order ?? 99), body };
  })
  .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.order - b.order);
const bySlug = Object.fromEntries(DOCS.map((d) => [d.slug, d]));

// Markdown -> styled React. Fenced code -> terminal CodeBlock; inline -> chip; links -> Router for internal.
const md: Components = {
  h2: ({ children }) => <h2 className="mb-3 mt-12 font-display text-2xl font-bold text-ink">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-7 font-display text-lg font-semibold text-ink">{children}</h3>,
  p: ({ children }) => <p className="mb-4 leading-relaxed text-slate">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-1.5 pl-6 text-slate marker:text-ink/25">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1.5 pl-6 text-slate marker:text-ink/25">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  a: ({ href, children }) =>
    href?.startsWith("/")
      ? <Link to={href} className="text-ink underline underline-offset-2 transition hover:text-mint-deep">{children}</Link>
      : <a href={href} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2 transition hover:text-mint-deep">{children}</a>,
  blockquote: ({ children }) => <div className="my-5 rounded-xl border-l-2 border-ink/25 bg-snow/60 px-4 py-3 text-sm text-ink [&_p]:my-0 [&_p]:text-slate">{children}</div>,
  code: ({ className, children }) => {
    const lang = /language-(\w+)/.exec(className ?? "")?.[1];
    if (lang) {
      const code = String(children).replace(/\n$/, "");
      return <div className="my-5"><CodeBlock code={code} label={lang} prompt={["bash", "sh", "zsh", "shell"].includes(lang) && !code.includes("\n")} /></div>;
    }
    return <code className="rounded bg-snow px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>;
  },
  pre: ({ children }) => <>{children}</>, // code component renders the block; don't double-wrap
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="bg-fx" />
      <div className="bg-grid" />
      <header className="sticky top-0 z-20 border-b border-ink/[.08] bg-paper/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink font-mono text-sm font-black text-paper">q</span>
            <span className="font-display text-lg font-bold tracking-tight text-ink">qinit</span>
            <span className="ml-1 rounded bg-ink/[.06] px-2 py-0.5 font-mono text-xs text-slate">docs</span>
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate">
            <Link to="/" className="transition hover:text-ink">Home</Link>
            <ThemeToggle />
            <a href="https://github.com/hackerby888/qinit" className="btn-ghost px-4 py-2 text-sm">GitHub ↗</a>
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}

export function Docs() {
  const { slug } = useParams();
  const active = slug ?? DOCS[0]?.slug ?? "overview";
  if (slug && !bySlug[slug]) return <Navigate to={`/docs/${DOCS[0]?.slug ?? "overview"}`} replace />;
  const page = bySlug[active];
  const idx = DOCS.findIndex((d) => d.slug === active);
  const prev = DOCS[idx - 1], next = DOCS[idx + 1];

  return (
    <Shell>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-10 md:flex-row">
        <aside className="md:w-60 md:shrink-0">
          <div className="space-y-6 md:sticky md:top-24">
            {GROUPS.filter((g) => DOCS.some((d) => d.group === g)).map((g) => (
              <div key={g}>
                <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-faint">{g}</div>
                <ul className="space-y-1">
                  {DOCS.filter((d) => d.group === g).map((d) => (
                    <li key={d.slug}>
                      <Link to={`/docs/${d.slug}`}
                        className={`block rounded-lg px-3 py-1.5 text-sm transition ${d.slug === active ? "bg-ink/[.06] font-medium text-ink" : "text-slate hover:bg-ink/[.05] hover:text-ink"}`}>
                        {d.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 max-w-3xl flex-1">
          <div className="eyebrow">// {page.group}</div>
          <h1 className="mt-2 font-display text-4xl font-bold text-ink">{page.title}</h1>
          <article className="mt-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{page.body}</ReactMarkdown>
          </article>

          <div className="mt-16 flex justify-between gap-4 border-t border-ink/[.08] pt-6">
            {prev ? <Link to={`/docs/${prev.slug}`} className="glass glass-hover rounded-xl px-4 py-3 text-sm"><div className="font-mono text-xs text-faint">← Prev</div><div className="text-ink">{prev.title}</div></Link> : <span />}
            {next ? <Link to={`/docs/${next.slug}`} className="glass glass-hover rounded-xl px-4 py-3 text-right text-sm"><div className="font-mono text-xs text-faint">Next →</div><div className="text-ink">{next.title}</div></Link> : <span />}
          </div>
        </main>
      </div>
    </Shell>
  );
}

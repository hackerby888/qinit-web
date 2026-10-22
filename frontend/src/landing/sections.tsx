import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "../docs/ThemeToggle";
import { CHIPS, FEATURES, IDE_URL, NAV, PATH, PILLARS, REPO, TYPE_SEG } from "./content";
import { Terminal } from "./Terminal";
import { Typewriter, VoteDots, Window } from "./illustrations";

// Router links for app routes, plain anchors for in-page hashes and external URLs.
function Go({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return href.startsWith("/") ? <Link to={href} className={className}>{children}</Link> : <a href={href} className={className}>{children}</a>;
}

function Wordmark() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink font-mono text-sm font-black text-paper">q</span>
      <span className="font-display text-lg font-bold tracking-tight text-ink">qinit</span>
    </Link>
  );
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-green-deep/10 text-green-deep">
      <Icon className="h-5 w-5" strokeWidth={1.8} />
    </span>
  );
}

function CheckRow({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px] text-slate">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-deep" strokeWidth={2.5} />
      <span>{children}</span>
    </li>
  );
}

export function Heading({ chip, title, sub }: { chip?: string; title: string; sub: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {chip && <span className="chip">{chip}</span>}
      <h2 className={`font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl ${chip ? "mt-5" : ""}`}>{title}</h2>
      <p className="mt-4 text-lg leading-relaxed text-slate">{sub}</p>
    </div>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-ink/[.08] bg-paper/80 backdrop-blur-xl">
      <nav aria-label="Primary" className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
        <div className="flex items-center">
          <Wordmark />
          <span className="ml-4 hidden border-l border-ink/[.12] pl-4 font-mono text-[11px] uppercase tracking-[0.18em] text-faint lg:inline">built for Qubic</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-6 pr-3 text-sm font-medium text-slate md:flex">
            {NAV.map((n) => <Go key={n.label} href={n.href} className="transition hover:text-ink">{n.label}</Go>)}
          </div>
          <ThemeToggle />
          <a href={REPO} aria-label="qinit on GitHub" className="btn-ghost px-3 py-2 sm:px-4">
            <span className="hidden sm:inline">GitHub</span>
            <span aria-hidden="true">↗</span>
          </a>
          <Link to="/docs" className="btn-primary px-4 py-2">Get started</Link>
        </div>
      </nav>
    </header>
  );
}

export function Hero() {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:gap-16 lg:pb-24 lg:pt-24">
      <div className="animate-fadeup">
        <span className="chip"><span className="h-2 w-2 rounded-full bg-green-deep" />Framework + browser IDE</span>
        <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
          A <span className="text-green-deep">framework</span> and an <span className="text-green-deep">IDE</span> for Qubic smart contracts.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate">
          qinit is two tools in one: a CLI that builds, tests, and deploys Qubic contracts from your terminal, and an IDE that does the same in your browser.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#ways" className="btn-primary">Start building →</a>
          <Link to="/docs" className="btn-ghost">Read the docs</Link>
        </div>
        <ul className="mt-8 flex flex-wrap gap-2">
          {CHIPS.map((c) => <li key={c} className="chip"><span className="h-1.5 w-1.5 rounded-full bg-green-deep" />{c}</li>)}
        </ul>
      </div>
      <Terminal className="animate-fadeup [animation-delay:120ms]" />
    </section>
  );
}

export function Pillars() {
  return (
    <section id="ways" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
      <p className="eyebrow text-center">// one toolkit, two ways to build</p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {PILLARS.map((p) => (
          <article key={p.title} className="glass glass-hover p-7 sm:p-8">
            <div className="flex items-center gap-4">
              <IconTile icon={p.icon} />
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{p.kicker}</div>
                <h3 className="font-display text-2xl font-bold text-ink">{p.title}</h3>
              </div>
            </div>
            <p className="mt-5 leading-relaxed text-slate">{p.body}</p>
            <ul className="mt-5 space-y-2.5">{p.points.map((pt) => <CheckRow key={pt}>{pt}</CheckRow>)}</ul>
            <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ink2 px-3.5 py-2 font-mono text-[13px] text-bone">
              <span className="text-green">{p.cmdmark}</span>{p.cmd}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function NetworkStrip() {
  return (
    <section className="border-y border-white/10 bg-ink2 text-bone">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-12">
        <div className="max-w-md">
          <h3 className="font-display text-xl font-bold text-bone">Built for how Qubic runs.</h3>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            On mainnet, <span className="text-green">676 computors</span> run every contract as native code, and a tick is final once a quorum of 451 agrees. qinit gives you that chain on your laptop, one tick at a time.
          </p>
        </div>
        <div className="w-full max-w-xl md:flex-1"><VoteDots count={40} cols={20} dur={2.4} /></div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
      <Heading title="Everything in the box." sub="Batteries included, tuned for Qubic." />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article key={f.title} className="glass glass-hover p-6">
            <IconTile icon={f.icon} />
            <h3 className="mt-5 font-display text-lg font-bold text-ink">{f.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-slate">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CodeShowcase() {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-20">
      <div>
        <span className="chip">Write less</span>
        <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">A contract is a file. Deploy is a command.</h2>
        <p className="mt-5 leading-relaxed text-slate">
          No boilerplate. Define your contract, run <code className="rounded bg-snow px-1.5 py-0.5 font-mono text-[13px] text-ink">qinit deploy</code>, and qinit compiles it, deploys it to your local node, and checks the code hash.
        </p>
        <ul className="mt-6 space-y-3">
          <CheckRow>One header, no project wiring.</CheckRow>
          <CheckRow>Running on a local node in seconds.</CheckRow>
          <CheckRow>State decoded by field name.</CheckRow>
        </ul>
      </div>
      <Window title="Counter.h" className="min-w-0">
        <Typewriter segs={TYPE_SEG} className="h-[330px] overflow-hidden px-5 py-4 text-[13px] leading-[1.85]" />
      </Window>
    </section>
  );
}

export function Path() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
      <Heading chip="The path" title="From first line to mainnet." sub="Every step has a command and a guide." />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PATH.map((p) => (
          <Link key={p.title} to={p.href} className="glass glass-hover block p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-green-deep/10 font-mono text-sm font-semibold text-green-deep">{p.step}</span>
              <span className="font-display text-xl font-bold text-ink">{p.title}</span>
            </div>
            <div className="mt-4 inline-block rounded-md bg-snow px-2 py-1 font-mono text-xs text-ink">{p.cmd}</div>
            <p className="mt-3 text-[15px] leading-relaxed text-slate">{p.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      <div className="gborder rounded-2xl">
        <div className="relative overflow-hidden rounded-2xl screen px-6 py-16 text-center sm:py-20">
          <div className="pointer-events-none absolute -top-48 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-green/20 blur-3xl" />
          <h2 className="relative font-display text-3xl font-bold tracking-tight text-bone sm:text-4xl">Ship your first Qubic contract today.</h2>
          <p className="relative mx-auto mt-4 max-w-md text-mist">Free, open source, and ready the moment you install it.</p>
          <Link to="/docs" className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-green px-6 py-3 text-sm font-semibold text-ink2 transition hover:bg-green/90">Install qinit</Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-ink/[.08]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Wordmark />
          <span className="font-mono text-[11px] text-faint">independent · community framework · not affiliated with Qubic</span>
        </div>
        <nav aria-label="Footer" className="flex gap-6 text-sm text-slate">
          <Link to="/docs" className="transition hover:text-ink">Docs</Link>
          <a href={REPO} className="transition hover:text-ink">GitHub</a>
          <a href={`${REPO}/releases`} className="transition hover:text-ink">Releases</a>
          <Link to={IDE_URL} className="transition hover:text-ink">IDE</Link>
        </nav>
      </div>
    </footer>
  );
}

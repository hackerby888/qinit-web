import React, { type ReactNode } from "react";
import { type Seg } from "./content";

// seeded PRNG so dot fields are stable across renders.
function makeRng(seed = 19) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// A dark terminal / editor window: the same chrome as the docs' CodeBlock.
export function Window({ title, right, className = "", children }: { title: string; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`gborder rounded-2xl ${className}`}>
      <div className="overflow-hidden rounded-2xl screen">
        <div className="flex items-center gap-2 border-b border-white/[.07] px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-faint/70" />
          <span className="h-3 w-3 rounded-full bg-amber/70" />
          <span className="h-3 w-3 rounded-full bg-green/70" />
          <span className="ml-2 font-mono text-xs text-faint">{title}</span>
          {right && <span className="ml-auto font-mono text-[11px] text-mist">{right}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

// The CLI's default gradient. Vote grids always sit on a dark surface, so the dark-theme ends apply in both themes.
const GRAD = ["#7c5cff", "#22d3ee"];
function lerp(from: string, to: string, t: number): string {
  const ch = (i: number) => Math.round(parseInt(from.slice(i, i + 2), 16) * (1 - t) + parseInt(to.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0");
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

// a grid of vote/execution cells — most lit (active, the gradient sweeping left to right), a few off — fading in (vote).
export function VoteDots({ count, cols, seed = 7, dur = 2.3 }: { count: number; cols: number; seed?: number; dur?: number }) {
  const rng = makeRng(seed);
  const cells = Array.from({ length: count }, () => ({ on: rng() > 0.16, delay: (rng() * 2).toFixed(2) }));
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>
      {cells.map((c, i) => (
        <div
          key={i}
          className={`aspect-square animate-vote rounded-[3px] ${c.on ? "" : "bg-white/10"}`}
          style={{ background: c.on ? lerp(GRAD[0], GRAD[1], (i % cols) / (cols - 1)) : undefined, animationDuration: `${dur}s`, animationDelay: `${c.delay}s` }}
        />
      ))}
    </div>
  );
}

// segment role -> the docs' highlight.js classes, so the landing code uses the same palette as the docs.
const SEG_CLASS: Record<Seg["r"], string> = { def: "", sec: "hljs-keyword", acc: "hljs-title", mut: "hljs-comment", str: "hljs-string" };

// render colored code segments (optionally a prefix length for the typewriter).
function renderSegs(segs: Seg[], shown: number, withCursor: boolean) {
  let rem = shown;
  const parts: ReactNode[] = [];
  segs.forEach((s, i) => {
    if (rem <= 0 && shown !== Infinity) return;
    const text = shown === Infinity ? s.t : s.t.slice(0, rem);
    if (shown !== Infinity) rem -= s.t.length;
    parts.push(<span key={i} className={`${SEG_CLASS[s.r]} ${s.b ? "font-semibold" : ""}`}>{text}</span>);
  });
  if (withCursor) {
    parts.push(<span key="cur" className="ml-0.5 inline-block h-[15px] w-2 translate-y-[2px] animate-blink bg-grape" />);
  }
  return parts;
}

export function Segments({ segs }: { segs: Seg[] }) {
  return <>{renderSegs(segs, Infinity, false)}</>;
}

// auto-typing code: ~26ms/char, types the contract once and holds (blinking cursor, no reset). The
// viewport is a fixed height with overflow clipped; as the cursor types past the bottom we scroll to follow
// it, so the box never resizes and earlier lines slide up out of view instead of growing the panel.
export function Typewriter({ segs, className = "" }: { segs: Seg[]; className?: string }) {
  const full = segs.reduce((n, s) => n + s.t.length, 0);
  const [n, setN] = React.useState(0);
  const ref = React.useRef<HTMLPreElement>(null);

  // Type once each time the panel scrolls into view — so it re-animates whenever the user comes back to it.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(full);
      return;
    }

    let iv: ReturnType<typeof setInterval> | undefined;
    const startTyping = () => {
      clearInterval(iv);
      setN(0);
      iv = setInterval(() => {
        setN((cur) => {
          if (cur >= full) {
            clearInterval(iv);
            return full;
          }
          return cur + 1;
        });
      }, 26);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            startTyping();
          } else {
            clearInterval(iv);
          }
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);

    return () => {
      clearInterval(iv);
      obs.disconnect();
    };
  }, [full]);

  // Keep the newest line (and the cursor) in view as the code grows past the fixed-height viewport.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [n]);

  return (
    <pre ref={ref} className={`m-0 whitespace-pre font-mono ${className}`}>
      <code className="hljs">{renderSegs(segs, n, true)}</code>
    </pre>
  );
}

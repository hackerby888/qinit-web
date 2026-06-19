import React, { type CSSProperties } from "react";
import { color, font } from "./tokens";
import { type Seg, SEG_COLOR } from "./content";

// seeded PRNG so dot fields are stable across renders.
function makeRng(seed = 19) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// §6a — the isometric "quorum block" voxel stack (hero, right).
export function VoxelStack() {
  const hw = 32, hh = 16, vh = 40, cx = 120;
  const palettes = [
    { top: color.accent, left: color.accentMid, right: color.accentDeep },
    { top: color.secondary, left: color.secondaryDeep, right: color.secondaryDk },
    { top: color.accent, left: color.accentMid, right: color.accentDeep },
  ];
  const cubes = [0, 1, 2].map((i) => {
    const cy = 160 - i * vh;
    const p = palettes[i];
    return {
      top: `${cx},${cy} ${cx + hw},${cy + hh} ${cx},${cy + 2 * hh} ${cx - hw},${cy + hh}`,
      left: `${cx - hw},${cy + hh} ${cx},${cy + 2 * hh} ${cx},${cy + 2 * hh + vh} ${cx - hw},${cy + hh + vh}`,
      right: `${cx + hw},${cy + hh} ${cx},${cy + 2 * hh} ${cx},${cy + 2 * hh + vh} ${cx + hw},${cy + hh + vh}`,
      p, dotX: cx - 3, dotY: cy + hh - 3,
    };
  });
  const ringDots = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round(120 + Math.cos(a) * 58) - 3, y: Math.round(64 + Math.sin(a) * 58 * 0.62) - 3, delay: (i * 0.4).toFixed(2) };
  });

  return (
    <svg viewBox="0 0 240 320" width="290" height="387" fill="none" style={{ animation: "bob 6.5s ease-in-out infinite" }}>
      <ellipse cx="120" cy="290" rx="80" ry="20" fill="#000000" opacity="0.35" />
      {ringDots.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width="6" height="6" fill={color.accent} style={{ animation: "nodePulse 2.8s ease-in-out infinite", animationDelay: `${r.delay}s` }} />
      ))}
      {cubes.map((c, i) => (
        <g key={i}>
          <polygon points={c.left} fill={c.p.left} stroke={color.void} strokeWidth="2" />
          <polygon points={c.right} fill={c.p.right} stroke={color.void} strokeWidth="2" />
          <polygon points={c.top} fill={c.p.top} stroke={color.void} strokeWidth="2" />
          <rect x={c.dotX} y={c.dotY} width="6" height="6" fill={color.void} opacity="0.3" />
        </g>
      ))}
      <rect x="108" y="20" width="22" height="22" rx="2" transform="rotate(45 119 31)" fill={color.accent} stroke={color.void} strokeWidth="2"
        style={{ transformBox: "fill-box", transformOrigin: "center", animation: "twk 2.6s ease-in-out infinite" }} />
    </svg>
  );
}

// scattered animated dot field — decorative background for dark bands.
export function DotField({ opacity = 0.7 }: { opacity?: number }) {
  const rng = makeRng(19);
  const cols = 11, rows = 6, W = 1280, H = 560;
  const dots: { x: number; y: number; s: number; fill: string; delay: string }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.32) continue;
      const big = rng() < 0.16;
      dots.push({
        x: Math.round(20 + (c * (W - 40)) / (cols - 1) + (rng() - 0.5) * 44),
        y: Math.round(20 + (r * (H - 40)) / (rows - 1) + (rng() - 0.5) * 38),
        s: big ? 7 : 4,
        fill: rng() < 0.18 ? color.secondary : color.accent,
        delay: (rng() * 4).toFixed(2),
      });
    }
  }
  return (
    <svg viewBox="0 0 1280 560" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity }}>
      {dots.map((d, i) => (
        <rect key={i} x={d.x} y={d.y} width={d.s} height={d.s} fill={d.fill} style={{ animation: "nodePulse 5s ease-in-out infinite", animationDelay: `${d.delay}s` }} />
      ))}
    </svg>
  );
}

// a grid of vote/execution cells — most accent (active), a few off — fading in (voteIn).
export function VoteDots({ count, cols, seed = 7, dur = 2.3 }: { count: number; cols: number; seed?: number; dur?: number }) {
  const rng = makeRng(seed);
  const cells = Array.from({ length: count }, () => ({ on: rng() > 0.16, delay: (rng() * 2).toFixed(2) }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 4 }}>
      {cells.map((c, i) => (
        <div key={i} style={{ aspectRatio: "1", background: c.on ? color.accent : color.dotOff, animation: `voteIn ${dur}s ease-in-out infinite`, animationDelay: `${c.delay}s` }} />
      ))}
    </div>
  );
}

// render colored code segments (optionally a prefix length for the typewriter).
function renderSegs(segs: Seg[], shown: number, withCursor: boolean) {
  let rem = shown;
  const parts: React.ReactNode[] = [];
  segs.forEach((s, i) => {
    if (rem <= 0 && shown !== Infinity) return;
    const text = shown === Infinity ? s.t : s.t.slice(0, rem);
    if (shown !== Infinity) rem -= s.t.length;
    parts.push(<span key={i} style={{ color: SEG_COLOR[s.r], fontWeight: s.b ? 700 : 400 }}>{text}</span>);
  });
  if (withCursor) {
    parts.push(<span key="cur" style={{ display: "inline-block", width: 8, height: 15, background: color.accent, marginLeft: 2, transform: "translateY(2px)", animation: "qblink 1.1s steps(1) infinite" }} />);
  }
  return parts;
}

export function Segments({ segs }: { segs: Seg[] }) {
  return <>{renderSegs(segs, Infinity, false)}</>;
}

// §6b — auto-typing code (loops): ~26ms/char, pause 2800ms, restart.
export function Typewriter({ segs, style }: { segs: Seg[]; style?: CSSProperties }) {
  const full = segs.reduce((n, s) => n + s.t.length, 0);
  const [n, setN] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(full);
      return;
    }

    let iv: ReturnType<typeof setInterval>;
    let to: ReturnType<typeof setTimeout>;
    const start = () => {
      iv = setInterval(() => {
        setN((cur) => {
          if (cur >= full) {
            clearInterval(iv);
            to = setTimeout(() => {
              setN(0);
              start();
            }, 2800);
            return full;
          }
          return cur + 1;
        });
      }, 26);
    };

    start();
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [full]);

  return <pre style={{ margin: 0, fontFamily: font.mono, color: "#C9D1CB", ...style }}>{renderSegs(segs, n, true)}</pre>;
}

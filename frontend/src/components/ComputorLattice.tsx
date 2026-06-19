import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * The signature graphic: Qubic's quorum is exactly 676 computors (26×26).
 * We render that lattice on a canvas. A "tick" ripple periodically sweeps the
 * grid — the wavefront flashes amber→mint then decays, standing in for the
 * quorum confirming a tick. `pulse()` fires an extra amber ripple from the
 * centre; the hero terminal calls it on `qinit deploy` to link "you ship" to
 * "the 676 computors confirm".
 */
export interface LatticeHandle { pulse: () => void }

const COLS = 26, ROWS = 26; // 26 × 26 = 676 computors

// palette (rgb) per theme. light: faint grey dots that darken toward teal/amber
// as the tick wave passes (Aleo dotted-map). dark: phosphor mint/amber on graphite.
type Pal = { base: number[]; mint: number[]; amber: number[]; aBase: number; aSpan: number };
const PAL: { light: Pal; dark: Pal } = {
  light: { base: [206, 207, 200], mint: [12, 156, 128], amber: [214, 138, 30], aBase: 0.28, aSpan: 0.6 },
  dark: { base: [26, 34, 29], mint: [60, 232, 196], amber: [255, 179, 71], aBase: 0.5, aSpan: 0.5 },
};

type Ripple = { cx: number; cy: number; t: number; strength: number; amber: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: number[], b: number[], t: number): [number, number, number] =>
  [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export const ComputorLattice = forwardRef<LatticeHandle, { className?: string }>(({ className = "" }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripples = useRef<Ripple[]>([]);

  const spawn = (cx: number, cy: number, strength: number, amber: number) =>
    ripples.current.push({ cx, cy, t: 0, strength, amber });

  useImperativeHandle(ref, () => ({
    pulse: () => spawn(COLS / 2 - 0.5, ROWS / 2 - 0.5, 1, 1),
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, lastTick = 0, cell = 0, ox = 0, oy = 0, gap = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cell = Math.floor(Math.min(w, h) / COLS);
      gap = Math.max(1, Math.round(cell * 0.16));
      ox = (w - cell * COLS) / 2;
      oy = (h - cell * ROWS) / 2;
    };

    const energyAt = (col: number, row: number) => {
      let e = 0.1 + 0.04 * Math.sin((col * 7 + row * 13) * 0.6); // faint idle baseline
      let amber = 0;
      for (const r of ripples.current) {
        const d = Math.hypot(col - r.cx, row - r.cy);
        const radius = r.t * 11;             // wavefront speed (cells/sec scaled by t)
        const band = Math.exp(-((d - radius) ** 2) / 7); // gaussian wavefront
        const life = Math.max(0, 1 - r.t / 1.5);          // ripple fades over ~1.5s
        const contrib = r.strength * band * life;
        e += contrib;
        amber += contrib * r.amber;
      }
      return { e: Math.min(1, e), amber: e > 0 ? Math.min(1, amber / e) : 0 };
    };

    const draw = (now: number) => {
      const dt = lastTick ? (now - lastTick) / 1000 : 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const p = document.documentElement.classList.contains("dark") ? PAL.dark : PAL.light;
      const size = cell - gap;
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const { e, amber } = energyAt(col, row);
          const target = mix(p.mint, p.amber, amber);
          const [r, g, b] = mix(p.base, target, e);
          ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${p.aBase + p.aSpan * e})`;
          const x = ox + col * cell, y = oy + row * cell;
          const rad = Math.min(2, size * 0.28);
          ctx.beginPath();
          const rr = (ctx as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect;
          if (typeof rr === "function") rr.call(ctx, x, y, size, size, rad);
          else ctx.rect(x, y, size, size);
          ctx.fill();
        }
      }
      // advance ripples
      for (const rp of ripples.current) rp.t += dt;
      ripples.current = ripples.current.filter((rp) => rp.t < 1.6);
    };

    if (reduce) {
      resize();
      // static frame: one quiet confirmed ripple, no animation
      spawn(COLS / 2 - 0.5, ROWS / 2 - 0.5, 0.7, 0.4);
      ripples.current[0].t = 0.8;
      draw(0);
      ripples.current = [];
      const onResize = () => { resize(); spawn(COLS / 2, ROWS / 2, 0.7, 0.4); ripples.current[0].t = 0.8; draw(0); ripples.current = []; };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    resize();
    const loop = (now: number) => {
      if (now - lastTick > 3400) { // a fresh tick every ~3.4s from a random computor
        spawn(Math.random() * COLS, Math.random() * ROWS, 0.85, Math.random() < 0.35 ? 1 : 0.15);
      }
      draw(now);
      lastTick = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        width: "100%",
        height: "100%",
        WebkitMaskImage: "radial-gradient(ellipse 78% 78% at 60% 45%, #000 45%, transparent 88%)",
        maskImage: "radial-gradient(ellipse 78% 78% at 60% 45%, #000 45%, transparent 88%)",
      }}
    />
  );
});

ComputorLattice.displayName = "ComputorLattice";

import { useEffect, useRef, useState } from "react";

/**
 * Hero terminal that types the qinit loop. When the `deploy` line confirms it
 * calls `onDeploy` so the lattice ripples — wiring "you ship" to "the quorum
 * confirms". Honors prefers-reduced-motion by rendering the whole transcript
 * at once, with no typing or blink.
 */
type Line = { prompt?: boolean; text: string; tone?: "ok" | "dim"; confirm?: boolean };

const LINES: Line[] = [
  { prompt: true, text: "qinit new my-sc --template counter" },
  { text: "✓ scaffolded my-sc", tone: "ok" },
  { prompt: true, text: "qinit up" },
  { text: "↑ core headers synced · dev node live", tone: "dim" },
  { prompt: true, text: "qinit dev" },
  { text: "⟳ watching contracts/My_sc.h …", tone: "dim" },
  { prompt: true, text: "qinit deploy" },
  { text: "✓ deployed · arm-verified by codeHash", tone: "ok", confirm: true },
];

const toneClass = (t?: Line["tone"]) => (t === "ok" ? "text-green" : t === "dim" ? "text-mist" : "text-bone");

function Cursor() {
  return <span className="ml-0.5 inline-block h-[14px] w-[7px] translate-y-[2px] animate-blink bg-green align-middle" aria-hidden />;
}

function Row({ line, partial, cursor }: { line: Line; partial?: string; cursor?: boolean }) {
  const text = partial ?? line.text;
  return (
    <div className="whitespace-pre-wrap break-words">
      {line.prompt && <span className="select-none text-green">$ </span>}
      <span className={toneClass(line.tone)}>{text}</span>
      {cursor && <Cursor />}
    </div>
  );
}

export function TypingTerminal({ onDeploy, className = "" }: { onDeploy?: () => void; className?: string }) {
  const [done, setDone] = useState<number>(0); // fully rendered line count
  const [partial, setPartial] = useState<string | null>(null); // chars typed for line[done]
  const [reduce, setReduce] = useState(false);
  const onDeployRef = useRef(onDeploy);
  onDeployRef.current = onDeploy;

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setReduce(true);
      setDone(LINES.length);
      onDeployRef.current?.();
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const at = (ms: number, fn: () => void) => { timer = setTimeout(() => { if (alive) fn(); }, ms); };

    const run = (i: number) => {
      if (!alive) return;
      if (i >= LINES.length) { at(2600, () => { setDone(0); setPartial(null); run(0); }); return; }
      const line = LINES[i];
      if (line.prompt) {
        let c = 0;
        const type = () => {
          c++;
          setPartial(line.text.slice(0, c));
          if (c < line.text.length) at(34, type);
          else at(360, () => { setPartial(null); setDone(i + 1); run(i + 1); });
        };
        setDone(i); setPartial("");
        at(120, type);
      } else {
        at(line.confirm ? 520 : 300, () => {
          setDone(i + 1); setPartial(null);
          if (line.confirm) onDeployRef.current?.();
          run(i + 1);
        });
      }
    };

    setDone(0); setPartial(null);
    at(500, () => run(0));
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const typingActive = !reduce && partial !== null && done < LINES.length;
  const idleCursor = !reduce && partial === null && done >= LINES.length;

  return (
    <div className={`gborder rounded-2xl ${className}`}>
      <div className="overflow-hidden rounded-2xl screen">
        <div className="flex items-center gap-2 border-b border-white/[.07] px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-faint/70" />
          <span className="h-3 w-3 rounded-full bg-amber/70" />
          <span className="h-3 w-3 rounded-full bg-green/70" />
          <span className="ml-2 font-mono text-xs text-faint">zsh — qinit</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-mist">
            <span className="h-1.5 w-1.5 rounded-full bg-amber animate-tick-pulse" /> live
          </span>
        </div>
        <div className="min-h-[208px] px-5 py-4 font-mono text-[13px] leading-relaxed">
          {LINES.slice(0, done).map((line, idx) => <Row key={idx} line={line} />)}
          {typingActive && <Row line={LINES[done]} partial={partial!} cursor />}
          {idleCursor && <Row line={{ prompt: true, text: "" }} cursor />}
        </div>
      </div>
    </div>
  );
}

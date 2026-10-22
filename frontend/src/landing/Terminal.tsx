import { useEffect, useState } from "react";
import { Window } from "./illustrations";

// Hero terminal that types the qinit loop: scaffold, deploy, call. Every echoed line is one the CLI prints
// (see docs/content/quickstart.md). Honors prefers-reduced-motion by rendering the whole transcript at once.
type Line = { prompt?: boolean; text: string; tone?: "ok" | "dim" };

const LINES: Line[] = [
  { prompt: true, text: "qinit new counter" },
  { text: "✓ created counter/  (template: counter)", tone: "ok" },
  { prompt: true, text: "qinit deploy" },
  { text: "  Counter     31  main  deployed  contracts/Counter.h", tone: "dim" },
  { text: "[deployed ✓]", tone: "ok" },
  { prompt: true, text: "qinit call --proc Counter Inc" },
  { text: "✓ Counter.Inc   processed", tone: "ok" },
  { prompt: true, text: "qinit call --fn Counter Get" },
  { text: "✓ Counter.Get", tone: "ok" },
  { text: "  out 1", tone: "dim" },
];

const toneClass = (t?: Line["tone"]) => (t === "ok" ? "text-green" : t === "dim" ? "text-mist" : "text-bone");

function Row({ line, partial, cursor }: { line: Line; partial?: string; cursor?: boolean }) {
  return (
    <div className="whitespace-pre-wrap break-words">
      {line.prompt && <span className="select-none text-green">$ </span>}
      <span className={toneClass(line.tone)}>{partial ?? line.text}</span>
      {cursor && <span className="ml-0.5 inline-block h-[14px] w-[7px] translate-y-[2px] animate-blink bg-green align-middle" aria-hidden />}
    </div>
  );
}

export function Terminal({ className = "" }: { className?: string }) {
  const [done, setDone] = useState(0); // fully rendered line count
  const [partial, setPartial] = useState<string | null>(null); // chars typed for line[done]
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setReduce(true);
      setDone(LINES.length);
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const at = (ms: number, fn: () => void) => { timer = setTimeout(() => { if (alive) fn(); }, ms); };

    const run = (i: number) => {
      if (!alive) return;
      if (i >= LINES.length) { at(3200, () => { setDone(0); setPartial(null); run(0); }); return; }
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
        at(300, () => { setDone(i + 1); setPartial(null); run(i + 1); });
      }
    };

    setDone(0); setPartial(null);
    at(500, () => run(0));
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const typingActive = !reduce && partial !== null && done < LINES.length;
  const idleCursor = !reduce && partial === null && done >= LINES.length;

  return (
    <Window title="zsh — qinit" className={className} right={<span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-tick-pulse rounded-full bg-amber" /> live</span>}>
      <div className="min-h-[262px] px-5 py-4 font-mono text-[13px] leading-relaxed">
        {LINES.slice(0, done).map((line, idx) => <Row key={idx} line={line} />)}
        {typingActive && <Row line={LINES[done]} partial={partial!} cursor />}
        {idleCursor && <Row line={{ prompt: true, text: "" }} cursor />}
      </div>
    </Window>
  );
}

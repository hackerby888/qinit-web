import { useEffect, useMemo, useState } from "react";
import hljs from "highlight.js/lib/core";
import cpp from "highlight.js/lib/languages/cpp";

hljs.registerLanguage("cpp", cpp);

// Pre-tokenize the highlighted code into per-character {char, class} pairs so we
// can reveal it one char at a time without re-highlighting incomplete syntax —
// colours stay stable as it "writes itself".
type Tok = { ch: string; cls: string };

function tokenize(code: string): Tok[] {
  let html: string;
  try { html = hljs.highlight(code, { language: "cpp" }).value; }
  catch { html = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const out: Tok[] = [];
  const walk = (node: Node, cls: string) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        for (const ch of child.textContent ?? "") out.push({ ch, cls });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        walk(el, el.className || cls);
      }
    });
  };
  walk(tmp, "");
  return out;
}

// Merge consecutive same-class chars into spans (fewer DOM nodes per frame).
function group(toks: Tok[]) {
  const parts: { cls: string; text: string }[] = [];
  for (const t of toks) {
    const last = parts[parts.length - 1];
    if (last && last.cls === t.cls) last.text += t.ch;
    else parts.push({ cls: t.cls, text: t.ch });
  }
  return parts;
}

export function CodeTyper({ code, file = "contracts/Counter.h", className = "" }: { code: string; file?: string; className?: string }) {
  const toks = useMemo(() => tokenize(code), [code]);
  const total = toks.length;
  const lines = useMemo(() => code.split("\n").length, [code]);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(total); return; }
    let i = 0, alive = true;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      if (!alive) return;
      i = Math.min(total, i + 2);
      setN(i);
      if (i < total) t = setTimeout(step, 14);
    };
    setN(0);
    t = setTimeout(step, 650);
    return () => { alive = false; clearTimeout(t); };
  }, [total]);

  const parts = group(toks.slice(0, n));
  const typing = n < total;

  return (
    <div className={`gborder rounded-2xl ${className}`}>
      <div className="overflow-hidden rounded-2xl screen">
        <div className="flex items-center gap-2 border-b border-white/[.07] px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-faint/70" />
          <span className="h-3 w-3 rounded-full bg-amber/70" />
          <span className="h-3 w-3 rounded-full bg-mint/70" />
          <span className="ml-2 font-mono text-xs text-faint">{file}</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-mist">
            {typing
              ? <><span className="h-1.5 w-1.5 rounded-full bg-amber animate-tick-pulse" /> writing</>
              : <><span className="text-mint">✓</span> saved</>}
          </span>
        </div>
        <div className="flex gap-4 px-4 py-4 font-mono text-[12.5px] leading-[1.65]">
          <div className="select-none text-right tabular-nums text-faint/45" aria-hidden>
            {Array.from({ length: lines }).map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <pre className="flex-1 overflow-x-auto whitespace-pre">
            <code className="hljs">
              {parts.map((p, i) => (p.cls ? <span key={i} className={p.cls}>{p.text}</span> : <span key={i}>{p.text}</span>))}
              {typing && <span className="ml-px inline-block h-[14px] w-[7px] translate-y-[2px] animate-blink bg-mint align-middle" aria-hidden />}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import json from "highlight.js/lib/languages/json";
import powershell from "highlight.js/lib/languages/powershell";
import typescript from "highlight.js/lib/languages/typescript";

// Only the languages the docs use (keeps the bundle small).
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("zsh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("json", json);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function highlight(code: string, lang?: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try { return hljs.highlight(code, { language: lang }).value; } catch { /* fall through */ }
  }
  return escapeHtml(code);
}

// Terminal-window code block with traffic-light chrome, copy button, and syntax highlighting.
export function CodeBlock({ code, label, prompt }: { code: string; label?: string; prompt?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1300); } catch {}
  };
  const html = highlight(code, label);
  return (
    <div className="gborder rounded-2xl">
      <div className="overflow-hidden rounded-2xl screen">
        <div className="flex items-center gap-2 border-b border-white/[.07] px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-faint/70" />
          <span className="h-3 w-3 rounded-full bg-amber/70" />
          <span className="h-3 w-3 rounded-full bg-green/70" />
          {label && <span className="ml-2 font-mono text-xs text-faint">{label}</span>}
          <button
            onClick={copy}
            className="ml-auto rounded-md border border-white/10 bg-white/[.04] px-2.5 py-1 font-mono text-xs text-mist transition hover:border-grape/40 hover:text-bone"
          >
            {copied ? "copied ✓" : "copy"}
          </button>
        </div>
        <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-relaxed">
          <code className="hljs">
            {prompt && <span className="select-none text-grape">$ </span>}
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </code>
        </pre>
      </div>
    </div>
  );
}

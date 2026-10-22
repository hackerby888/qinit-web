import { Play } from "lucide-react";
import { IDE_FIRST_LINE, IDE_LINE_COUNT, IDE_SEG, IDE_TREE, type TreeRow } from "./content";
import { Segments, VoteDots, Window } from "./illustrations";
import { Heading } from "./sections";

// what the engine panel shows after one Inc and one Get on the starter contract.
const STATS: [string, string, boolean][] = [
  ["contract", "Counter", false],
  ["Inc()", "processed ✓", true],
  ["Get()", "1", true],
  ["state", "counter 1", false],
];

const DOT: Record<TreeRow["kind"], string> = { dir: "bg-faint", contract: "bg-green", test: "bg-amber" };

export function IdeShowcase() {
  return (
    <section id="ide" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
      <Heading
        chip="Browser IDE"
        title="Write, test, deploy — all in your browser."
        sub={<>A full IDE with the Qubic <span className="text-green-deep">contract engine built in</span>. Your contract compiles and runs in the page, with the same compiler and engine as the CLI. No installs, no setup.</>}
      />

      <Window title="qinit ide — counter" right="ide.qinit.dev" className="mt-12">
        {/* body: file tree | editor | engine panel */}
        <div className="grid min-h-[340px] md:grid-cols-[180px_1fr_220px]">
          <div className="hidden border-r border-white/[.07] py-4 font-mono text-[12.5px] text-mist md:block">
            <div className="px-4 pb-2 text-[10.5px] uppercase tracking-[0.12em] text-faint">Explorer</div>
            {IDE_TREE.map((t) => (
              <div key={t.label} style={{ paddingLeft: t.pad }} className={`flex items-center gap-2 py-1 pr-4 ${t.active ? "bg-green/10 text-green" : ""}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[t.kind]}`} />{t.label}
              </div>
            ))}
          </div>

          <div className="flex min-w-0 overflow-hidden font-mono text-[13px] leading-[1.85] md:border-r md:border-white/[.07]">
            <div className="select-none px-3 py-4 text-right text-faint/60">
              {Array.from({ length: IDE_LINE_COUNT }, (_, i) => <div key={i}>{IDE_FIRST_LINE + i}</div>)}
            </div>
            <pre className="m-0 min-w-0 overflow-x-auto py-4 pr-4"><code className="hljs"><Segments segs={IDE_SEG} /></code></pre>
          </div>

          <div className="hidden flex-col gap-4 p-4 md:flex">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">Engine</div>
            <VoteDots count={52} cols={13} seed={11} dur={2.2} />
            <div className="font-mono text-[11.5px] leading-7 text-mist">
              {STATS.map(([k, v, hot]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-faint">{k}</span>
                  <span className={hot ? "text-green" : ""}>{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-green py-2 text-sm font-semibold text-ink2">
              <Play className="h-3.5 w-3.5" fill="currentColor" /> Compile
            </div>
          </div>
        </div>

        {/* status bar */}
        <div className="flex items-center gap-4 whitespace-nowrap border-t border-white/[.07] px-4 py-2 font-mono text-[11px] text-faint">
          <span className="text-green">● ready</span>
          <span className="hidden sm:inline">Counter.h</span>
          <span className="hidden sm:inline">C++ (QPI)</span>
          <span className="ml-auto">✓ compiled in 0.6s</span>
        </div>
      </Window>
    </section>
  );
}

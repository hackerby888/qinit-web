// Landing data. qinit = a CLI framework + a browser IDE; both run the same compiler and contract engine.
// Every claim here is one the CLI or Qubic Core backs: keep it that way when editing.
import { AppWindow, Clock, Cpu, GitCompareArrows, Network, RefreshCw, Rocket, Terminal, type LucideIcon } from "lucide-react";

export const REPO = "https://github.com/hackerby888/qinit";
export const IDE_URL = "/ide"; // the in-browser IDE route (ide.qinit.dev once live)

export const NAV: { href: string; label: string }[] = [
  { href: "/docs", label: "Docs" },
  { href: "#ways", label: "Build" },
  { href: "/ide", label: "Browser IDE" },
  { href: "#features", label: "Features" },
];

// Qubic network capability chips (properties of the chain you ship to).
export const CHIPS = ["676 COMPUTORS", "INSTANT FINALITY", "15.5M TPS", "USEFUL POW"];

// Two co-equal pillars: the CLI framework + the browser IDE.
export type Pillar = { kicker: string; title: string; icon: LucideIcon; body: string; points: string[]; cmdmark: string; cmd: string; href: string };
export const PILLARS: Pillar[] = [
  {
    kicker: "01 · TERMINAL",
    title: "qinit CLI",
    icon: Terminal,
    body: "The command-line framework. Scaffold, build, test, and deploy Qubic contracts against a local node, all from one binary.",
    points: ["Built-in compiler, cross-checked with Clang", "Local node with hot reload", "C++ and TypeScript tests from the start"],
    cmdmark: "$",
    cmd: "qinit new counter",
    href: "/docs",
  },
  {
    kicker: "02 · BROWSER",
    title: "qinit IDE",
    icon: AppWindow,
    body: "The browser IDE. The same compiler and engine run in the page, so you write, test, and call a contract with nothing installed.",
    points: ["Full editor with QPI diagnostics", "Qubic contract engine in the page", "Compile, deploy, and test with no setup"],
    cmdmark: "→",
    cmd: "ide.qinit.dev",
    href: IDE_URL,
  },
];

export type Feature = { icon: LucideIcon; title: string; body: string };
export const FEATURES: Feature[] = [
  { icon: Rocket, title: "One-command deploy", body: "qinit deploy builds the contract, deploys what it depends on first, and verifies the live code hash." },
  { icon: GitCompareArrows, title: "Two compilers, one source", body: "A built-in compiler for instant builds, and Clang to cross-check before you ship. Same C++ header." },
  { icon: Cpu, title: "In-process engine", body: "A Qubic node simulator inside the same binary. Nothing to download, nothing to configure." },
  { icon: RefreshCw, title: "Hot reload", body: "qinit dev redeploys on every save and keeps the state. Tight feedback loops." },
  { icon: Network, title: "Inter-contract calls", body: "Call QX, QUTIL, or your own contracts through the upstream QPI macros." },
  { icon: Clock, title: "Ticks, epochs, oracles", body: "Qubic contracts run code on every tick and epoch and can ask oracles for real-world data. Skip time and answer oracle queries on your own node." },
];

// The IDE file tree: the starter project the web IDE opens (STARTER in ide/examples.ts).
export type TreeRow = { label: string; pad: number; kind: "dir" | "contract" | "test"; active?: boolean };
export const IDE_TREE: TreeRow[] = [
  { label: "counter", pad: 16, kind: "dir" },
  { label: "Counter.h", pad: 30, kind: "contract", active: true },
  { label: "Counter.test.ts", pad: 30, kind: "test" },
];

// The road from an empty folder to a pull request on Qubic Core, one command per step.
export type PathStep = { step: string; title: string; cmd: string; body: string; href: string };
export const PATH: PathStep[] = [
  { step: "01", title: "Write", cmd: "qinit new counter", body: "One QPI C++ header. Templates for counters, maps, assets, and contract-to-contract calls.", href: "/docs/writing-a-contract" },
  { step: "02", title: "Test", cmd: "qinit gtest · qinit test", body: "Core-style C++ tests on an isolated chain, TypeScript tests through a generated client.", href: "/docs/testing" },
  { step: "03", title: "Run", cmd: "qinit deploy · qinit call", body: "A local Qubic node in one command. Call entries, read decoded state, trace every call.", href: "/docs/deploy-and-call" },
  { step: "04", title: "Ship", cmd: "qinit integrate", body: "Puts the contract into a Qubic Core checkout, ready for your pull request.", href: "/docs/core-integration" },
];

// Code segments — role: def (default), sec (keyword), acc (identifier), mut (comment), str (string).
export type Seg = { t: string; r: "def" | "sec" | "acc" | "mut" | "str"; b?: boolean };

// The contract `qinit new counter` writes, verbatim.
export const COUNTER_H = `using namespace QPI;

struct Counter2
{
};

struct Counter : public ContractBase
{
    struct StateData
    {
        uint64 counter;
    };

    struct Inc_input {};
    struct Inc_output {};
    struct Get_input {};
    struct Get_output { uint64 value; };

    PUBLIC_PROCEDURE(Inc)
    {
        state.mut().counter += 1;
    }

    PUBLIC_FUNCTION(Get)
    {
        output.value = state.get().counter;
    }

    REGISTER_USER_FUNCTIONS_AND_PROCEDURES()
    {
        REGISTER_USER_PROCEDURE(Inc, 1);
        REGISTER_USER_FUNCTION(Get, 1);
    }

    INITIALIZE()
    {
        state.mut().counter = 0;
    }
};`;

// comment | keyword or QPI type | QPI macro (all caps) | number
const CPP_TOKEN = /(\/\/[^\n]*)|\b(using|namespace|struct|public|uint64)\b|\b([A-Z][A-Z0-9_]{3,})\b|\b(\d+)\b/g;

// C++ source -> coloured segments, e.g. "uint64 counter;" -> [{ t: "uint64", r: "sec" }, { t: " counter;", r: "def" }]
export function cppSegs(source: string): Seg[] {
  const segs: Seg[] = [];
  let last = 0;
  for (const match of source.matchAll(CPP_TOKEN)) {
    if (match.index > last) segs.push({ t: source.slice(last, match.index), r: "def" });
    segs.push(match[1] ? { t: match[0], r: "mut" } : match[3] ? { t: match[0], r: "sec", b: true } : match[4] ? { t: match[0], r: "acc" } : { t: match[0], r: "sec" });
    last = match.index + match[0].length;
  }
  if (last < source.length) segs.push({ t: source.slice(last), r: "def" });
  return segs;
}

// Typewriter (code showcase): the whole file.
export const TYPE_SEG: Seg[] = cppSegs(COUNTER_H);

// IDE editor (static): the same file scrolled to the contract struct, lines 7-27, numbered as in the file.
export const IDE_FIRST_LINE = 7;
const IDE_LAST_LINE = 27;
export const IDE_LINE_COUNT = IDE_LAST_LINE - IDE_FIRST_LINE + 1;
export const IDE_SEG: Seg[] = cppSegs(COUNTER_H.split("\n").slice(IDE_FIRST_LINE - 1, IDE_LAST_LINE).join("\n"));

// Landing data — technically accurate for qinit + Qubic. qinit = a CLI framework + a browser IDE;
// the IDE runs the Qubic SC engine in TypeScript (the contract's wasm executes in the page,
// byte-identical to the node — a single-authority dev testnet, NOT live network consensus).
import { color } from "./tokens";

export const REPO = "https://github.com/hackerby888/qinit";
export const IDE_URL = "/ide"; // the in-browser IDE route (ide.qinit.dev once live)

export const NAV: { href: string; label: string }[] = [
  { href: "/docs", label: "Docs" },
  { href: "#ways", label: "Build" },
  { href: "/ide", label: "Browser IDE" },
  { href: "#features", label: "Features" },
];

// Qubic network capability chips (properties of the chain you ship to).
export const CHIPS = ["FEELESS", "INSTANT FINALITY", "15.5M TPS", "USEFUL POW"];

// Two co-equal pillars: the CLI framework + the browser IDE.
export type Pillar = { kicker: string; title: string; glyph: string; tint: string; body: string; points: string[]; cmdmark: string; cmd: string };
export const PILLARS: Pillar[] = [
  {
    kicker: "01 · TERMINAL",
    title: "qinit CLI",
    glyph: "⌘",
    tint: color.accent,
    body: "The smart-contract development framework. Type-safe contracts, an in-process engine, and one-command deploy — right in your terminal.",
    points: ["Type-safe contract toolkit", "In-process engine + hot reload", "Feeless one-command deploy"],
    cmdmark: "$ ",
    cmd: "npx qinit create",
  },
  {
    kicker: "02 · BROWSER",
    title: "qinit IDE",
    glyph: "▢",
    tint: color.secondary,
    body: "The browser-based IDE. A Remix-style editor running the Qubic SC engine in TypeScript — write, test, and ship with zero install.",
    points: ["Remix-style in-browser editor", "Qubic SC engine in TypeScript", "Deploy + test with no setup"],
    cmdmark: "→ ",
    cmd: "ide.qinit.dev",
  },
];

export type Feature = { glyph: string; tint: string; title: string; body: string };
export const FEATURES: Feature[] = [
  { glyph: "⌘", tint: color.accent, title: "One-command deploy", body: "qinit deploy compiles, runs a local node, and broadcasts to Qubic — nothing to babysit." },
  { glyph: "{}", tint: color.yellow, title: "Type-safe contracts", body: "Catch mistakes at compile time. Your editor knows your contract's shape." },
  { glyph: "◇", tint: color.secondary, title: "In-process engine", body: "The Qubic SC engine in TypeScript — run and test contracts instantly, byte-identical to the node." },
  { glyph: "↻", tint: color.yellow, title: "Hot reload", body: "Edit a contract and re-deploy in milliseconds. Tight feedback loops." },
  { glyph: "⊞", tint: color.secondary, title: "Inter-contract calls", body: "Call QX, QUTIL, or your own contracts through the upstream QPI macros." },
  { glyph: "★", tint: color.accent, title: "Feeless by design", body: "Target Qubic's feeless network — deploy and call with instant finality." },
];

// The IDE file tree.
export type TreeRow = { label: string; pad: number; color: string; dot: string; active?: boolean };
export const IDE_TREE: TreeRow[] = [
  { label: "my-contract", pad: 16, color: color.textLight, dot: color.textGhostDk },
  { label: "contracts", pad: 30, color: color.textMutedDk, dot: color.secondary },
  { label: "Counter.h", pad: 46, color: color.accent, dot: color.accent, active: true },
  { label: "Vault.h", pad: 46, color: color.textMutedDk, dot: color.textGhostDk },
  { label: "engine.test.ts", pad: 30, color: color.textMutedDk, dot: color.accent },
  { label: "qinit.config.ts", pad: 30, color: color.textMutedDk, dot: color.textGhostDk },
];

// Built-for-the-ecosystem tiles (real Qubic ecosystem, not "investors").
export type Eco = { glyph: string; name: string; tint: string };
export const ECOSYSTEM: Eco[] = [
  { glyph: "Q", name: "Qubic", tint: color.accent },
  { glyph: "X", name: "QX", tint: color.yellow },
  { glyph: "U", name: "QUTIL", tint: color.secondary },
  { glyph: "A", name: "Aigarth", tint: color.accent },
  { glyph: "E", name: "Qearn", tint: color.yellow },
  { glyph: "V", name: "Vottun", tint: color.secondary },
  { glyph: "M", name: "MMID", tint: color.accent },
  { glyph: "◆", name: "QVault", tint: color.yellow },
];

// Code segments — role → color: def (default), sec (keyword), acc (identifier), mut (comment), str (string).
export type Seg = { t: string; r: "def" | "sec" | "acc" | "mut" | "str"; b?: boolean };

// Typewriter (code showcase): a REAL Qubic contract (qpi.h) — not Solidity.
export const TYPE_SEG: Seg[] = [
  { t: "struct ", r: "sec", b: true },
  { t: "Counter", r: "acc", b: true },
  { t: " : ", r: "def" },
  { t: "public ContractBase", r: "sec" },
  { t: " {\n  ", r: "def" },
  { t: "// state lives on-chain", r: "mut" },
  { t: "\n  uint64", r: "sec" },
  { t: " counter;\n\n  ", r: "def" },
  { t: "PUBLIC_PROCEDURE", r: "sec", b: true },
  { t: "(Inc)", r: "acc", b: true },
  { t: " {\n    state.mut().counter += ", r: "def" },
  { t: "1", r: "acc" },
  { t: ";\n  }\n  ", r: "def" },
  { t: "PUBLIC_FUNCTION", r: "sec", b: true },
  { t: "(Get)", r: "acc", b: true },
  { t: " {\n    output.value = state.get().counter;\n  }\n}", r: "def" },
];

// IDE editor (static): REAL @qinit/engine usage — the TS SC engine, not a fake "@qinit/qubic" quorum.
export const IDE_SEG: Seg[] = [
  { t: "import", r: "sec" }, { t: " { VirtualNode } ", r: "def" }, { t: "from", r: "sec" }, { t: ' "@qinit/engine"', r: "str" }, { t: "\n\n", r: "def" },
  { t: "// the Qubic SC engine in TypeScript — single authority", r: "mut" }, { t: "\n", r: "def" },
  { t: "const", r: "sec" }, { t: " engine = ", r: "def" }, { t: "new", r: "sec" }, { t: " ", r: "def" }, { t: "VirtualNode", r: "acc" }, { t: "()\n\n", r: "def" },
  { t: "await", r: "sec" }, { t: " engine.", r: "def" }, { t: "deploy", r: "acc" }, { t: "(Counter)", r: "def" }, { t: "     ", r: "def" }, { t: "// runs the real wasm", r: "mut" }, { t: "\n", r: "def" },
  { t: "await", r: "sec" }, { t: " engine.", r: "def" }, { t: "invoke", r: "acc" }, { t: '("Inc")', r: "def" }, { t: "      ", r: "def" }, { t: "// tx applied in-page", r: "mut" }, { t: "\n", r: "def" },
  { t: "const", r: "sec" }, { t: " v = ", r: "def" }, { t: "await", r: "sec" }, { t: " engine.", r: "def" }, { t: "call", r: "acc" }, { t: '("Get")', r: "def" }, { t: " ", r: "def" }, { t: "// → 1 · digest = node", r: "mut" },
];

export const SEG_COLOR: Record<Seg["r"], string> = {
  def: "#C9D1CB",
  sec: color.secondary,
  acc: color.accent,
  mut: color.textGhostDk,
  str: color.yellow,
};

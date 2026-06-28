// The qinit browser IDE — a Remix-style editor for Qubic dynamic contracts. Write qpi.h C++, get live
// QPI diagnostics + IDL hover (./qpi), compile on the backend (./api), and deploy + test the wasm in
// this page via @qinit/engine (./engine). The engine/crypto modules are dynamically imported so a load
// failure degrades to "compile only" rather than breaking the editor.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import type { OnMount } from "@monaco-editor/react";
import type { IdlEntry, ContractIdl } from "@qinit/build/idl";
import { bytesToIdentity } from "@qinit/core";
import { color, font, themeFlags } from "../landing/tokens";
import { PixelQMark, KEYFRAMES } from "../landing/components";
import { NeoBtn, Section } from "./ui";
import { CodeEditor } from "./editor";
import { resolveMonacoTheme, EDITOR_THEMES, type EditorThemeId } from "./editorThemes";
import { FileExplorer } from "./FileExplorer";
import { shareUrl, baseName, NEW_CONTRACT, type Workspace, type WorkspaceFile } from "./workspace";
import { fileLabel, dirOf, freeName, occupiedNames, KEEP_FILE } from "./filetree";
import { AnalysisPanel } from "./AnalysisPanel";
import { analyzeWorkspace, severityCounts } from "./qpi/analyze";
import { Toasts } from "./Toasts";
import { OfflineBanner } from "./OfflineBanner";
import { notify, errorMessage } from "./notify";
import { useCollab, type CollabCtx, type Peer } from "./useCollab";
import { colorFor, type CollabStatus } from "./collab";
import { ShareDialog } from "./ShareDialog";
import { Copy, Check } from "lucide-react";
import { getToken, fetchMe, login, type Me } from "./auth";
import { GitHubDialog } from "./GitHubDialog";
import type { RepoFile } from "./githubApi";
import { setupQpi } from "./qpi";
import { definitionOffset } from "./qpi/definition";
import { compileContract, base64ToBytes, fetchBuildQueue, fetchSystemCatalog, compileSystem, type CompileResult, type BuildQueue, type SystemContractEntry } from "./api";
import type { IdeEngine, Account, TxDetail, DeployImage, ReplayStep, DebugStep, AssetView, EngineLogEvent } from "./engine";
import { Debugger } from "./Debugger";
import { TxExplorer, type TxRow } from "./TxExplorer";
import { EngineLog } from "./EngineLog";
import { runTests, type TestContract } from "./tests/runner";
import { TestPanel } from "./tests/TestPanel";
import { useIdeLayout } from "./useIdeLayout";
import { useIdeTheme } from "./useIdeTheme";
import { useWorkspaceSearch } from "./useWorkspaceSearch";
import { useProblemsPanel, type ProblemItem } from "./useProblemsPanel";
import { useOverlays } from "./useOverlays";
import { useTestRunner } from "./useTestRunner";
import { genQinitDts } from "./tests/dts";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { SearchPanel } from "./SearchPanel";
import { ScenarioPanel, compare, uid, type Scenario, type AssertStep, type AssertResult, type CallStep } from "./scenarios";
import { getStore } from "./projects/store";
import type { Project } from "./projects/types";
import type { StateDump } from "@qinit/inspector";
import "../landing/pixel.css";

// Structural borders, read live at render so a theme swap (neo 3px ↔ flat 1px) takes effect without a
// reload. Used across Ide() and the sibling EditorTabs(), so they stay module-level helpers rather than
// per-component consts.
const frame = (): string => `${themeFlags.flat ? 1 : 3}px solid ${color.ink}`;
const hair = (): string => `${themeFlags.flat ? 1 : 3}px solid ${color.hair}`;

const SLOT_BASE = 28; // first dynamic slot; each distinct contract gets the next free one

type DeployedContract = { name: string; slot: number; address: string; idl: ContractIdl; source: string; wasm: Uint8Array; calls?: string[] };

// A compact toolbar toggle that hides/shows the left file explorer or the right engine panel.
function PanelToggle({ hidden, side, onClick }: { hidden: boolean; side: "left" | "right"; onClick: () => void }) {
  const label = side === "left" ? (hidden ? "❯ files" : "❮ files") : (hidden ? "engine ❮" : "engine ❯");
  return (
    <button
      onClick={onClick}
      title={`${hidden ? "Show" : "Hide"} ${side === "left" ? "file explorer" : "engine panel"}`}
      style={{ border: `1px solid ${color.hair2}`, background: hidden ? "transparent" : color.void, color: hidden ? color.textGhostDk : color.textLight, fontFamily: font.mono, fontSize: 11, padding: "3px 8px", cursor: "pointer", flex: "none" }}
    >
      {label}
    </button>
  );
}

// The collab presence strip — stacked peer avatars + a connection/live status pill in the editor toolbar.
function CollabBar({ status, peers, mode, selfName, selfColor }: { status: CollabStatus; peers: Peer[]; mode: "view" | "edit"; selfName: string; selfColor: string }) {
  const dot = status === "connected" ? "#3ECF8E" : status === "connecting" ? color.yellow : "#f85149";
  const label = status === "connected" ? (mode === "view" ? "viewing" : "live") : status === "connecting" ? "connecting…" : "reconnecting…";
  const all = [{ name: `${selfName} (you)`, color: selfColor }, ...peers];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex" }}>
        {all.slice(0, 6).map((u, i) => (
          <span key={i} title={u.name} style={{ width: 22, height: 22, marginLeft: i ? -6 : 0, borderRadius: "50%", background: u.color, color: "#0B0B0B", border: `2px solid ${color.panel}`, fontFamily: font.mono, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {u.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
        ))}
      </div>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
        {label}{peers.length ? ` · ${peers.length + 1} editing` : ""}
      </span>
    </div>
  );
}

const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);
const fmtQus = (b?: string): string => (b === undefined ? "…" : Number(b).toLocaleString("en-US"));

// A 32-byte id as hex → bytes. Asset issuer/owner ids cross from the engine as hex; the panel needs raw bytes
// to tell a contract id apart from a wallet and to derive the Qubic identity.
const hexToBytes = (hex: string): Uint8Array => {
  const n = (hex.length / 2) | 0;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

// A contract id is id(slot, 0, 0, 0): only the leading 8-byte slot index is non-zero. Returns the slot, or
// null for a real wallet identity.
const contractSlotOf = (hex: string): number | null => {
  const b = hexToBytes(hex);
  for (let i = 8; i < 32; i++) {
    if (b[i] !== 0) {
      return null;
    }
  }
  return b.length >= 32 ? Number(new DataView(b.buffer).getBigUint64(0, true)) : null;
};

const assignSlot = (reg: Record<string, DeployedContract>, name: string): number => {
  if (reg[name]) {
    return reg[name].slot;
  }
  const used = new Set(Object.values(reg).map((d) => d.slot));
  let s = SLOT_BASE;
  while (used.has(s)) {
    s++;
  }
  return s;
};

// First free slot at or above `floor`, reusing the contract's current slot when it already clears the floor.
// A caller must land above all its callees (the qubic lower-index rule), so floor = maxCalleeSlot + 1.
const slotAtOrAbove = (reg: Record<string, DeployedContract>, name: string, floor: number): number => {
  const cur = reg[name]?.slot;
  if (cur !== undefined && cur >= floor) {
    return cur;
  }
  const used = new Set(Object.values(reg).map((d) => d.slot));
  let s = Math.max(SLOT_BASE, floor);
  while (used.has(s)) {
    s++;
  }
  return s;
};

// Inter-contract callee type names referenced by CALL/INVOKE_OTHER_CONTRACT(<Name>, …) in a source.
const scanCallees = (src: string): string[] =>
  [...new Set([...src.matchAll(/(?:CALL|INVOKE)_OTHER_CONTRACT_\w+\s*\(\s*(\w+)/g)].map((m) => m[1]))];

// Resolve a source's callees to the source that defines them, for passing to the compiler. Prefer an open
// project file; else fall back to the source the in-page node stored when the callee was deployed — so a
// deployed-but-not-open callee still resolves (the same way `qinit deploy` pulls callees off the node registry).
// The slot is the deployed index when known, else a provisional ascending one — its value only affects the
// emitted index constants, so the contract compiles either way (used for live diagnostics before a deploy).
const resolveCallees = (files: { name: string; source: string }[], reg: Record<string, DeployedContract>, src: string): { name: string; source: string; slot: number }[] => {
  const out: { name: string; source: string; slot: number }[] = [];
  let provisional = SLOT_BASE;
  for (const name of scanCallees(src)) {
    const source = files.find((x) => baseName(x.name) === name)?.source ?? reg[name]?.source;
    if (!source) {
      continue; // unresolved — let clang report the missing callee type
    }
    out.push({ name, source, slot: reg[name]?.slot ?? provisional++ });
  }
  return out;
};

type Phase = "idle" | "compiling" | "ready" | "error";
type MonacoNS = Parameters<OnMount>[1];
type EditorRef = Parameters<OnMount>[0];


// One row of the Problems panel — a marker (qpi lexical/context, or clang) on the active model.
function TrafficLights() {
  return (
    <div style={{ display: "flex", gap: 7 }}>
      <span style={{ width: 11, height: 11, background: color.accent }} />
      <span style={{ width: 11, height: 11, background: color.swatchOff }} />
      <span style={{ width: 11, height: 11, background: color.swatchOff }} />
    </div>
  );
}

// In-process engine clock — the single-authority dev testnet your contracts deploy to. Time is
// explicit (advances on tick/invoke), so this reflects engine state, not a wall clock.
function EngineStrip({ info, mempool = 0 }: { info: { tick: number; epoch: number } | null; mempool?: number }) {
  const live = !!info;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: font.mono, fontSize: 11, color: color.textFaintDk }}>
      <span style={{ width: 7, height: 7, flex: "none", background: live ? color.accent : color.swatchOff, animation: live ? "nodePulse 2s ease-in-out infinite" : undefined }} />
      <span style={{ color: color.textMutedDk, letterSpacing: ".14em" }}>IN-PROCESS</span>
      {info ? (
        <>
          <span><span style={{ color: color.textGhostDk }}>tick </span><span style={{ color: color.accent }}>{info.tick.toLocaleString("en-US")}</span></span>
          <span><span style={{ color: color.textGhostDk }}>epoch </span><span style={{ color: color.textMutedDk }}>{info.epoch}</span></span>
          {mempool > 0 && (
            <span><span style={{ color: color.textGhostDk }}>mempool </span><span style={{ color: color.yellow }}>{mempool}</span></span>
          )}
        </>
      ) : (
        <span style={{ color: color.textGhostDk }}>idle · compile to start</span>
      )}
    </div>
  );
}

type ToolButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "accent" | "ghost";
  disabled?: boolean;
};

function ToolButton({ children, onClick, variant = "ghost", disabled = false }: ToolButtonProps) {
  const [press, setPress] = useState(0);
  const off = disabled ? 0 : press === 2 ? 0 : press === 1 ? 2 : 3;
  const accent = variant === "accent";
  const bg = disabled ? color.swatchOff : accent ? color.accent : color.panel;
  const fg = disabled ? color.textFaintDk : accent ? color.void : color.textLight;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setPress(1)}
      onMouseLeave={() => setPress(0)}
      onMouseDown={() => setPress(2)}
      onMouseUp={() => setPress(1)}
      disabled={disabled}
      style={{
        border: "none",
        background: accent ? color.accentDeep : color.ink,
        padding: 2,
        cursor: disabled ? "default" : "pointer",
        filter: themeFlags.flat ? "none" : `drop-shadow(${off}px ${off}px 0 ${accent ? color.accentShadow : "#000"})`,
        transform: themeFlags.flat ? "none" : `translate(${3 - off}px,${3 - off}px)`,
        transition: "transform .1s steps(2), filter .1s steps(2)",
      }}
    >
      <span style={{ display: "block", background: bg, color: fg, fontFamily: font.display, fontSize: 14, padding: "6px 16px" }}>
        {children}
      </span>
    </button>
  );
}

// Editor syntax-theme dropdown. A compact toolbar button (active label + 3-dot swatch) opening a popover of
// presets; picking one persists + live-applies via the editor's theme prop.
function ThemePicker({ value, onPick }: { value: EditorThemeId; onPick: (id: EditorThemeId) => void }) {
  const [open, setOpen] = useState(false);
  const current = EDITOR_THEMES.find((t) => t.id === value) ?? EDITOR_THEMES[0];

  const Dots = ({ colors }: { colors: [string, string, string] }) => (
    <span style={{ display: "inline-flex", gap: 2, flex: "none" }}>
      {colors.map((c, i) => (
        <span key={i} style={{ width: 7, height: 7, background: c }} />
      ))}
    </span>
  );

  const row = (t: (typeof EDITOR_THEMES)[number]) => (
    <button
      key={t.id}
      onClick={() => {
        onPick(t.id);
        setOpen(false);
      }}
      style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", border: "none", background: t.id === value ? "#ffffff10" : "transparent", color: t.id === value ? color.textLightHi : color.textLight, fontFamily: font.mono, fontSize: 11.5, padding: "6px 9px", cursor: "pointer", textAlign: "left" }}
    >
      <Dots colors={t.swatch} />
      <span style={{ flex: 1 }}>{t.label}</span>
      {t.id === value && <span style={{ color: color.accent }}>✓</span>}
    </button>
  );

  const heading = (label: string) => (
    <div style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: color.textGhostDk, padding: "8px 9px 3px" }}>
      {label}
    </div>
  );

  const section = (label: string, group: "light" | "dark") => (
    <>
      {heading(label)}
      {EDITOR_THEMES.filter((t) => t.group === group).map(row)}
    </>
  );

  return (
    <div style={{ position: "relative", flex: "none" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Editor syntax theme"
        style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${color.hair2}`, background: color.panel, color: color.textMutedDk, fontFamily: font.mono, fontSize: 11, padding: "5px 9px", cursor: "pointer" }}
      >
        <Dots colors={current.swatch} />
        <span>{current.label}</span>
        <span style={{ color: color.textGhostDk }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 41, minWidth: 184, background: color.panelDeep, border: `1px solid ${color.hair2}`, boxShadow: "4px 4px 0 #000", padding: 4 }}>
            {EDITOR_THEMES.filter((t) => t.group === "auto").map(row)}
            {section("Light", "light")}
            {section("Dark", "dark")}
          </div>
        </>
      )}
    </div>
  );
}

// Built per render (a function, not a const) so a live theme swap recolors the input — the same reason
// the structural border helpers above are functions. Consumed by sibling components (CallRow, AccountsBar).
const fieldInput = (): CSSProperties => ({
  flex: 1,
  minWidth: 0,
  background: color.void,
  border: `1px solid ${color.hair2}`,
  color: color.textLight,
  fontFamily: font.mono,
  fontSize: 11.5,
  padding: "4px 7px",
  outline: "none",
});

function CallRow({ kind, id, entry, busy, output, pending = false, detail, onRun, onDebug }: {
  kind: "function" | "procedure";
  id: string;
  entry: IdlEntry;
  busy: boolean;
  output?: string;
  pending?: boolean;
  detail?: TxDetail;
  onRun: (input: Record<string, string>, value: number) => void;
  onDebug?: (steps: DebugStep[], title: string) => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [value, setValue] = useState("0");
  const accent = kind === "function" ? color.accent : color.secondary;

  return (
    <div style={{ borderLeft: `3px solid ${accent}`, border: `1px solid ${color.hair}`, borderLeftWidth: 3, background: color.panel, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 7, height: 7, background: accent, flex: "none" }} />
        <span style={{ fontFamily: font.mono, fontSize: 12.5, color: color.textLight }}>{entry.name}</span>
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>#{id} · {kind === "function" ? "read" : "write"}</span>
        <button
          onClick={() => onRun(vals, Number(value) || 0)}
          disabled={busy}
          style={{ marginLeft: "auto", border: `2px solid ${color.ink}`, background: accent, color: color.void, fontFamily: font.display, fontSize: 12, padding: "3px 12px", cursor: busy ? "default" : "pointer" }}
        >
          {kind === "function" ? "Call" : "Run"}
        </button>
      </div>

      {entry.inFields.map((f) => (
        <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textMutedDk, minWidth: 64 }}>{f.name}</span>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk, minWidth: 44 }}>{f.type}</span>
          <input
            value={vals[f.name] ?? ""}
            onChange={(e) => setVals((p) => ({ ...p, [f.name]: e.target.value }))}
            placeholder="0"
            style={fieldInput()}
          />
        </div>
      ))}

      {kind === "procedure" && (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textMutedDk, minWidth: 64 }}>value</span>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk, minWidth: 44 }}>qus</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" style={fieldInput()} />
        </div>
      )}

      {output !== undefined && (
        <div style={{ fontFamily: font.mono, fontSize: 11.5, color: pending ? color.yellow : accent, wordBreak: "break-all" }}>{pending ? "⏳" : "→"} {output}</div>
      )}

      {detail && (
        <div style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textFaintDk, lineHeight: 1.6, borderTop: `1px solid ${color.hair}`, paddingTop: 5, display: "flex", flexDirection: "column", gap: 1 }}>
          {onDebug && detail.steps && detail.steps.length > 0 && (
            <button onClick={() => onDebug(detail.steps, `${entry.name}()`)} title="Step through this transaction" style={{ alignSelf: "flex-start", border: `1px solid ${color.hair2}`, background: color.void, color: color.accent, fontFamily: font.mono, fontSize: 10.5, padding: "2px 8px", cursor: "pointer", marginBottom: 4 }}>🐞 step debug</button>
          )}
          {detail.caller && detail.caller !== "(none)" && <div>caller <span style={{ color: color.textMutedDk }}>{shortId(detail.caller)}</span></div>}
          {detail.in && detail.in !== "(none)" && <div>in <span style={{ color: color.textMutedDk }}>{detail.in}</span></div>}
          {detail.diff.map((d, i) => <div key={i} style={{ color: color.accent }}>Δ {d.label}: {d.before} → {d.after}</div>)}
          {detail.hostCalls.map((h, i) => <div key={`h${i}`} style={{ color: color.textMutedDk }}>host {h}</div>)}
          {detail.logs.map((l, i) => <div key={`l${i}`} style={{ color: color.secondary }}>log {l}</div>)}
        </div>
      )}
    </div>
  );
}

// The qinit `state` inspector inline — a deployed contract's decoded StateData (scalars + container
// columns), refreshed each tick. Reuses the CLI's readState decoder.
function StatePanel({ dump }: { dump?: StateDump }) {
  if (!dump) {
    return null;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {dump.fields.map((f) => (
          <div key={f.name} style={{ display: "flex", gap: 8, fontFamily: font.mono, fontSize: 11.5 }}>
            <span style={{ color: color.textMutedDk, minWidth: 78 }}>{f.name}</span>
            <span style={{ color: color.accent, wordBreak: "break-all" }}>{f.value}</span>
          </div>
        ))}
        {dump.cols.map((c) => (
          <div key={c.name} style={{ fontFamily: font.mono, fontSize: 11 }}>
            <div style={{ color: color.secondary }}>{c.name} <span style={{ color: color.textGhostDk }}>({c.entries.length})</span></div>
            {c.entries.map((e, i) => (
              <div key={i} style={{ color: color.textMutedDk, paddingLeft: 10, wordBreak: "break-all" }}>{e}</div>
            ))}
          </div>
        ))}
    </div>
  );
}

// True when a state dump has anything worth showing (gates the STATE section).
function hasState(dump?: StateDump): boolean {
  return !!dump && (dump.fields.length > 0 || dump.cols.length > 0);
}

// The asset universe — every issued asset (qpi.issueAsset) and its share holdings. Global, not per-contract:
// assets live in the spectrum universe, not a contract's state. `mgr` is the contract managing a holding
// (the ownership-management slot). Refreshes each tick like balances/state.
function AssetsPanel({ assets, slotName, fmtHolder }: { assets: AssetView[]; slotName: (slot: number) => string; fmtHolder: (hex: string) => string }) {
  if (assets.length === 0) {
    return null;
  }
  const num = (s: string): string => Number(s).toLocaleString("en-US");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {assets.map((a) => (
          <div key={a.issuer + a.name} style={{ fontFamily: font.mono, fontSize: 11, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ color: color.yellow, fontSize: 12 }}>{a.name}</span>
              <span style={{ color: color.textGhostDk }}>by {fmtHolder(a.issuer)}</span>
              <span style={{ marginLeft: "auto", color: color.accent }}>{num(a.totalShares)} sh</span>
            </div>
            {a.holdings.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 8, paddingLeft: 12, color: color.textMutedDk }}>
                <span style={{ color: color.textGhostDk }}>{fmtHolder(h.owner)}</span>
                <span style={{ color: color.secondary }}>{num(h.shares)}</span>
                <span style={{ marginLeft: "auto", color: color.textGhostDk }}>mgr {slotName(h.ownMgmt)}</span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function PanelHint() {
  return (
    <div style={{ fontFamily: font.body, fontSize: 13, lineHeight: 1.6, color: color.textMutedDk }}>
      The Qubic SC engine runs in this page. Hit <span style={{ color: color.accent }}>Compile</span> to build your
      contract to wasm and deploy it in-browser — byte-identical to the node, feeless, instant.
    </div>
  );
}

const selectStyle = (): CSSProperties => ({
  flex: 1,
  minWidth: 0,
  background: color.void,
  color: color.textLight,
  border: `1px solid ${color.hair2}`,
  fontFamily: font.mono,
  fontSize: 11.5,
  padding: "4px 7px",
  outline: "none",
});

// Pick the caller for a write + see its balance (Remix's account dropdown). Dev accounts are funded by
// the engine faucet; the +fund control tops the selected account up with more qus straight from it.
function AccountsBar({ accounts, caller, onSelect, balances, onFund }: {
  accounts: Account[];
  caller: string;
  onSelect: (id: string) => void;
  balances: Record<string, string>;
  onFund: (id: string, qus: number) => void;
}) {
  const [amount, setAmount] = useState("1000000000");
  const [copied, setCopied] = useState(false);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(caller);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select value={caller} onChange={(e) => onSelect(e.target.value)} style={{ ...selectStyle(), flex: 1, minWidth: 0 }}>
            {accounts.map((a, i) => (
              <option key={a.id} value={a.id}>{`acct ${i} · ${shortId(a.id)}`}</option>
            ))}
          </select>
          <button
            onClick={() => void copyId()}
            title={copied ? "Copied!" : "Copy the full 60-char account id"}
            style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${color.hair2}`, background: color.panel, color: copied ? color.accent : color.textMutedDk, cursor: "pointer" }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textMutedDk }}>
          balance <span style={{ color: color.accent }}>{fmtQus(balances[caller])}</span> qus
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>faucet</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="qus" style={fieldInput()} />
          <NeoBtn onClick={() => onFund(caller, Number(amount) || 0)} active title="Credit this account from the testnet faucet">+Fund</NeoBtn>
        </div>
    </div>
  );
}

// Deterministic testnet controls (Remix has none — we own the chain in-page). Pause/step time, jump an
// epoch to fire BEGIN/END_EPOCH hooks, and reset/replay the whole session against a fresh chain.
function EngineControls({ paused, speed, info, epochLen, onToggle, onStep, onEpoch, onReset, onReplay, onSpeed }: {
  paused: boolean;
  speed: number;
  info: { tick: number; epoch: number } | null;
  epochLen: number;
  onToggle: () => void;
  onStep: (n: number) => void;
  onEpoch: () => void;
  onReset: () => void;
  onReplay: () => void;
  onSpeed: (ticksPerSec: number) => void;
}) {
  const tick = info?.tick ?? 0;
  const within = epochLen > 0 ? tick % epochLen : 0;
  const nextBoundary = tick + (epochLen > 0 ? epochLen - within : 1);
  const pct = epochLen > 0 ? (within / epochLen) * 100 : 0;
  return (
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textGhostDk }}>
          tick <span style={{ color: color.accent }}>{tick}</span> · epoch <span style={{ color: color.textMutedDk }}>{info?.epoch ?? 0}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: font.mono, fontSize: 9.5, color: color.textGhostDk }}>
          <span style={{ flex: 1, height: 8, background: color.void, border: `1px solid ${color.hair}`, position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", inset: 0, width: `${pct}%`, background: color.accentDeep }} />
          </span>
          <span>{within}/{epochLen}</span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
          <NeoBtn onClick={onToggle} active={paused} title={paused ? "Resume auto-tick" : "Pause auto-tick"}>{paused ? "▶ run" : "⏸ pause"}</NeoBtn>
          <NeoBtn onClick={() => onStep(1)} title="Advance 1 tick">⏭ +1</NeoBtn>
          <NeoBtn onClick={() => onStep(10)} title="Advance 10 ticks">⏩ +10</NeoBtn>
          <NeoBtn onClick={onEpoch} accent={color.secondary} title={`Jump to tick ${nextBoundary} (the next epoch boundary) — fires END_EPOCH → BEGIN_EPOCH`}>⤓ epoch</NeoBtn>
          <NeoBtn onClick={onReset} title="Reset chain to genesis (re-deploy, re-run INITIALIZE)">↺ reset</NeoBtn>
          <NeoBtn onClick={onReplay} title="Replay every tx this session from genesis">↻ replay</NeoBtn>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>
            speed
            <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))} style={{ border: `1px solid ${color.hair2}`, background: color.void, color: color.textLight, fontFamily: font.mono, fontSize: 10.5, padding: "2px 4px", outline: "none" }}>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={5}>5×</option>
              <option value={10}>10×</option>
            </select>
          </span>
        </div>
      </div>
  );
}

// The deployed-contracts list (Remix's "Deployed Contracts") — each compile&deploy registers one; click
// to drive its call form.
function DeployedList({ deployed, selected, onSelect }: {
  deployed: Record<string, DeployedContract>;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Object.values(deployed).map((d) => {
        const on = d.name === selected;
        return (
          <div
            key={d.name}
            onClick={() => onSelect(d.name)}
            style={{ display: "flex", flexDirection: "column", gap: 3, padding: "6px 9px", cursor: "pointer", borderLeft: `3px solid ${on ? color.accent : color.hair2}`, border: `1px solid ${on ? color.accent : color.hair}`, borderLeftWidth: 3, background: on ? `${color.accent}14` : color.panel, fontFamily: font.mono, fontSize: 11.5 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 7, height: 7, flex: "none", background: on ? color.accent : color.textGhostDk }} />
              <span style={{ color: on ? color.accent : color.textLight }}>{d.name}</span>
              <span style={{ color: color.textGhostDk, fontSize: 10 }}>slot {d.slot}</span>
              <span style={{ marginLeft: "auto", color: color.textGhostDk, fontSize: 10 }}>{shortId(d.address)}</span>
            </div>
            {d.calls && d.calls.length > 0 && (
              <div style={{ color: color.secondary, fontSize: 10, paddingLeft: 14 }}>→ calls {d.calls.join(", ")}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Built-in system contracts (QX, QEARN, …) the user can host on the in-browser virtual node — toggle chips.
// On = selected/deployed (compiled by the backend, run in-page). A real node embeds these; this is dev-only.
function SystemPicker({ catalog, selected, deployed, onToggle }: {
  catalog: SystemContractEntry[];
  selected: string[];
  deployed: Record<string, DeployedContract>;
  onToggle: (name: string) => void;
}) {
  if (!catalog.length) {
    return null;
  }
  const sel = new Set(selected);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {catalog.map((c) => {
        const on = sel.has(c.name) || c.name in deployed;
        return (
          <button
            key={c.name}
            onClick={() => onToggle(c.name)}
            title={`${c.name} · slot ${c.index} — ${on ? "deployed (click to remove)" : "click to compile + deploy"}`}
            style={{ padding: "2px 7px", border: `1px solid ${on ? color.accent : color.hair}`, background: on ? `${color.accent}14` : color.panel, color: on ? color.accent : color.textLight, cursor: "pointer", fontFamily: font.mono, fontSize: 10.5, lineHeight: 1.5 }}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

// Open-file tabs over the editor (VSCode's editor tabs). The active file is always an open tab; a tab
// shows a dirty dot when its source has edits not yet built, and a close ✕ on hover. The last tab can't
// be closed — the editor always needs an active file.
function EditorTabs({ tabs, active, dirty, onSelect, onClose }: {
  tabs: string[];
  active: string;
  dirty: (name: string) => boolean;
  onSelect: (name: string) => void;
  onClose: (name: string, e: { stopPropagation(): void }) => void;
}) {
  return (
    <div className="pix-tabs" style={{ display: "flex", height: 36, flex: "none", borderBottom: hair(), background: color.panelDeep, overflowX: "auto", overflowY: "hidden" }}>
      {tabs.map((name) => {
        const on = name === active;
        const d = dirty(name);
        return (
          <div
            key={name}
            className="pix-tab"
            onClick={() => onSelect(name)}
            onMouseDown={(e) => { if (e.button === 1) { onClose(name, e); } }}
            title={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 10px",
              flex: "none",
              maxWidth: 200,
              cursor: "pointer",
              borderRight: `1px solid ${color.hair}`,
              borderBottom: on ? `2px solid ${color.accent}` : "2px solid transparent",
              background: on ? color.panel : "transparent",
              color: on ? color.accent : color.textMutedDk,
              fontFamily: font.mono,
              fontSize: 12,
            }}
          >
            <span style={{ width: 7, height: 7, flex: "none", background: on ? color.accent : color.textGhostDk }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileLabel(name)}</span>
            <span style={{ position: "relative", width: 14, height: 14, flex: "none" }}>
              {d && (
                <span className="pix-tab-dot" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: color.yellow, fontSize: 10 }}>●</span>
              )}
              <button
                className="pix-tab-x"
                onClick={(e) => onClose(name, e)}
                title="Close"
                style={{ position: "absolute", inset: 0, border: "none", background: "transparent", color: color.textGhostDk, cursor: "pointer", fontFamily: font.mono, fontSize: 14, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Ide({ collab: initialCollab }: { collab?: CollabCtx } = {}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Collaboration: null for plain local/owner editing; set when opened via a share link or when the owner
  // goes live (Share → edit). `editorReady` lets the collab binding wait for Monaco to mount.
  const [collab, setCollab] = useState<CollabCtx | null>(initialCollab ?? null);
  const [editorReady, setEditorReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  // IDE chrome palette + editor syntax theme (persisted; the chrome initializer applies the palette pre-paint).
  const { theme, editorTheme, toggleTheme, pickEditorTheme } = useIdeTheme();

  const [ws, setWs] = useState<Workspace>({ files: [], active: "" });
  const [projectName, setProjectName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false); // brief "✓ saved" flash after Ctrl+S
  const { debug, setDebug, palette, setPalette, github, setGithub, showTxs, setShowTxs, shareOpen, setShareOpen } = useOverlays();
  const { searchOpen, setSearchOpen, searchQuery, setSearchQuery, searchCase, setSearchCase, searchRegex, setSearchRegex } = useWorkspaceSearch();
  const [phase, setPhase] = useState<Phase>("idle");
  const [buildQueue, setBuildQueue] = useState<BuildQueue | null>(null); // backend pool state while a compile is pending
  const [result, setResult] = useState<CompileResult | null>(null);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [engineInfo, setEngineInfo] = useState<{ tick: number; epoch: number } | null>(null);
  const [pending, setPending] = useState<Record<string, { name: string; targetTick: number }>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [caller, setCaller] = useState<string>("");
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [deployed, setDeployed] = useState<Record<string, DeployedContract>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [sysCatalog, setSysCatalog] = useState<SystemContractEntry[]>([]); // built-in system contracts (QX, …)
  const [sysSel, setSysSel] = useState<string[]>([]); // names the user chose to host on the in-browser node
  const [stateView, setStateView] = useState<Record<string, StateDump>>({});
  const [assetsView, setAssetsView] = useState<AssetView[]>([]); // the engine's asset universe (issued assets + shares)
  const [idNames, setIdNames] = useState<Record<string, string>>({}); // hex id → Qubic identity, resolved async for the assets panel
  const [txDetail, setTxDetail] = useState<Record<string, TxDetail>>({});
  const [txLog, setTxLog] = useState<TxRow[]>([]); // every processed tx this session, for the tx/tick explorer
  const [engineLog, setEngineLog] = useState<EngineLogEvent[]>([]); // the virtual engine's diagnostic stream, for the ENGINE-log popup
  const [engineLogOpen, setEngineLogOpen] = useState(false);
  const { testRun, setTestRun, scenarios, setScenarios, scenResults, setScenResults, runningScen, setRunningScen } = useTestRunner();
  const [diag, setDiag] = useState<{ state: "idle" | "checking" | "ok" | "error"; count: number }>({ state: "idle", count: 0 });
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1); // auto-ticks per second
  const [epochLen, setEpochLen] = useState(3000); // ticks per epoch (from the engine)
  const { problems, setProblems, problemsOpen, setProblemsOpen, bottomTab, setBottomTab } = useProblemsPanel();
  const { explorerW, setExplorerW, engineW, setEngineW, consoleH, setConsoleH, leftHidden, rightHidden, toggleLeft, toggleRight, collapsed, toggleSection } = useIdeLayout();
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [built, setBuilt] = useState<Record<string, string>>({}); // last source per file that compiled clean — drives the dirty dot

  const editorRef = useRef<EditorRef | null>(null);
  const monacoRef = useRef<MonacoNS | null>(null);
  const pendingJumpRef = useRef<{ file: string; offset: number } | null>(null); // goto-source target awaiting its file's model swap
  const qinitLibRef = useRef<{ dispose(): void } | null>(null); // the ./.qinit ambient types extralib (regenerated on deploy)
  const engineRef = useRef<IdeEngine | null>(null);
  const engineInitRef = useRef<Promise<IdeEngine> | null>(null); // dedupe concurrent starts (StrictMode / fast compile)
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const deployedRef = useRef<Record<string, DeployedContract>>({});
  const stateRef = useRef<Record<string, StateDump>>({});
  const projectRef = useRef<Project | null>(null); // the loaded project doc (carries id/createdAt for save)

  // Auto-compile coordination (Remix-style background diagnostics). Refs so the debounce reads fresh
  // values without re-creating the callback.
  const sourceRef = useRef("");
  const contractNameRef = useRef("");
  const activeNameRef = useRef(""); // active file name (with extension) — keys the dirty-tracking `built` map
  const filesRef = useRef<{ name: string; source: string }[]>([]); // live workspace files, for resolving callees off the render path
  const autoSeqRef = useRef(0);
  const autoSentRef = useRef<string>("");   // last source we POSTed — dedupe undo/redo/whitespace churn
  const autoBusyRef = useRef(false);        // single in-flight
  const autoDirtyRef = useRef(false);       // an edit landed mid-compile -> trailing re-run
  const warmRef = useRef<{ source: string; name: string; res: CompileResult } | null>(null); // warm deploy artifact

  const appendLog = (line: string) => setLog((l) => [...l.slice(-200), line]);

  const activeFile = ws.files.find((f) => f.name === ws.active) ?? ws.files[0];
  const source = activeFile?.source ?? "";
  const contractName = baseName(ws.active);

  sourceRef.current = source;
  contractNameRef.current = contractName;
  activeNameRef.current = ws.active;
  filesRef.current = ws.files;

  const activeIsTest = /\.tsx?$/.test(ws.active); // a .ts test file -> run-tests, not compile

  // Collab identity for the awareness name (the signed-in user, else "You").
  useEffect(() => {
    void fetchMe().then(setMe);
  }, []);

  // The collaborative session (no-op when `collab` is null). It seeds the file list from the shared doc on
  // sync (onInit) and keeps it live (onFiles), so the explorer / tabs / auto-compile run against live content.
  const collabApi = useCollab({
    ctx: collab,
    token: collab?.projectId ? getToken() ?? undefined : undefined,
    editorRef,
    monacoRef,
    editorReady,
    active: ws.active,
    onInit: (files) => {
      setWs((w) => ({ files, active: w.active || files[0]?.name || "" }));
      setOpenTabs((t) => (t.length ? t : files.slice(0, 1).map((f) => f.name)));
      setLoaded(true);
    },
    onFiles: (files) => {
      setWs((w) => ({ files, active: files.some((f) => f.name === w.active) ? w.active : files[0]?.name ?? "" }));
    },
  });

  // Load the project for this route. Seeds the editor (files/active), open tabs and saved scenarios; an
  // unknown id bounces back to the gallery. Async by design — the same call shape a cloud store would use.
  useEffect(() => {
    if (collab) {
      return; // collab seeds the workspace from the shared doc (useCollab onInit), not the local store
    }
    let cancelled = false;
    void (async () => {
      if (!id) {
        navigate("/ide");
        return;
      }
      let p: Project | null;
      try {
        p = await getStore().load(id);
      } catch (e) {
        if (!cancelled) {
          notify.error(errorMessage(e, "Couldn't load the project"));
          navigate("/ide");
        }
        return;
      }
      if (cancelled) {
        return;
      }
      if (!p) {
        notify.error("That project couldn't be found — it may have been deleted.");
        navigate("/ide");
        return;
      }
      projectRef.current = p;
      setWs({ files: p.files, active: p.active });
      setScenarios(p.scenarios ?? []);
      setSysSel(p.systemContracts ?? []);
      setOpenTabs(p.openTabs ?? []);
      setProjectName(p.name);
      void getStore().setCurrentId(p.id);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate, collab]);

  // Write the current editor state into the loaded project document and persist it. Shared by the debounced
  // auto-save and the Ctrl+S handler.
  const persistProject = useCallback((): void => {
    if (collab) {
      return; // in collab the server is the sole cloud writer (avoids double-write clobber)
    }
    const p = projectRef.current;
    if (!p) {
      return;
    }
    p.files = ws.files;
    p.active = ws.active;
    p.openTabs = openTabs;
    p.scenarios = scenarios;
    p.systemContracts = sysSel;
    p.name = projectName;
    void getStore().save(p).catch((e) => notify.error(errorMessage(e, "Auto-save failed — your latest changes aren't saved")));
  }, [ws, openTabs, scenarios, sysSel, projectName, collab]);

  // Persist the whole project document (debounced) whenever its contents change.
  useEffect(() => {
    if (!loaded) {
      return;
    }
    const t = setTimeout(persistProject, 400);
    return () => clearTimeout(t);
  }, [persistProject, loaded]);

  // Ctrl/Cmd+S — save now (flush the debounce) and swallow the browser's save dialog. Works IDE-wide, not
  // just when the editor is focused. A ref keeps the listener registered once while always running the
  // latest closure.
  const persistRef = useRef(persistProject);
  persistRef.current = persistProject;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        persistRef.current();
        setSaved(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clear the "saved" flash shortly after it shows.
  useEffect(() => {
    if (!saved) {
      return;
    }
    const t = setTimeout(() => setSaved(false), 1300);
    return () => clearTimeout(t);
  }, [saved]);

  // Keep the console pinned to the newest line.
  useEffect(() => {
    const el = consoleRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [log]);

  // Stop the engine's auto-ticker when leaving the IDE.
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  // Resolve the asset universe's wallet ids (hex) to Qubic identities for display — async (the identity
  // checksum needs crypto), cached in idNames so each id resolves once. Contract ids are skipped (the panel
  // shows the managing contract's name instead).
  useEffect(() => {
    let cancelled = false;
    const pending = new Set<string>();
    for (const a of assetsView) {
      for (const hex of [a.issuer, ...a.holdings.map((h) => h.owner)]) {
        if (hex && !idNames[hex] && contractSlotOf(hex) === null) {
          pending.add(hex);
        }
      }
    }
    if (pending.size === 0) {
      return;
    }
    void (async () => {
      const resolved: Record<string, string> = {};
      for (const hex of pending) {
        try {
          resolved[hex] = await bytesToIdentity(hexToBytes(hex));
        } catch {}
      }
      if (!cancelled && Object.keys(resolved).length > 0) {
        setIdNames((prev) => ({ ...prev, ...resolved }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetsView, idNames]);

  // Format an asset holder id: a contract → its name; a wallet → its Qubic identity (short), pending resolve.
  const fmtHolder = useCallback(
    (hex: string): string => {
      const slot = contractSlotOf(hex);
      if (slot !== null) {
        return Object.values(deployed).find((d) => d.slot === slot)?.name ?? `slot ${slot}`;
      }
      return idNames[hex] ? shortId(idNames[hex]) : shortId(hex);
    },
    [idNames, deployed],
  );


  const selectFile = (name: string) => {
    setOpenTabs((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setWs((w) => ({ ...w, active: name }));
  };

  // Picking a contract in the deployed list opens its source tab; the sync effect then points the panel
  // at it. Falls back to a bare select if no open file matches (e.g. the source was renamed/closed).
  const selectDeployed = (cn: string) => {
    // Always select the clicked contract — `sel` (the CALLS form + the deployed highlight) is derived from
    // `selected`, so this must run even when a matching editor file is already active (selectFile would no-op
    // and leave the previous selection, e.g. a system contract, stuck).
    setSelected(deployed[cn] ? cn : null);
    const file = ws.files.find((f) => baseName(f.name) === cn);
    if (file) {
      selectFile(file.name); // a user contract: also focus its editor tab
    }
  };

  const editSource = (src: string) => {
    if (collab) {
      return; // collab: the shared doc (observeDeep → onFiles) is the source of truth, not this handler
    }
    setWs((w) => ({ ...w, files: w.files.map((f) => (f.name === w.active ? { ...f, source: src } : f)) }));
  };

  const createFile = (name: string) => {
    setOpenTabs((prev) => (prev.includes(name) ? prev : [...prev, name]));
    if (collab) {
      collabApi.ops.create(name, NEW_CONTRACT); // files come back via onFiles; active is local
      setWs((w) => ({ ...w, active: name }));
      return;
    }
    setWs((w) => ({ files: [...w.files, { name, source: NEW_CONTRACT }], active: name }));
  };

  // Merge files imported from GitHub into the workspace: existing names are overwritten, new ones appended,
  // and the first import becomes the active tab. Works in both the local and collab modes.
  const importFiles = (incoming: RepoFile[]) => {
    if (incoming.length === 0) {
      return;
    }

    const first = incoming[0].name;
    setOpenTabs((prev) => (prev.includes(first) ? prev : [...prev, first]));

    if (collab) {
      for (const f of incoming) {
        if (ws.files.some((x) => x.name === f.name)) {
          collabApi.ops.remove(f.name);
        }
        collabApi.ops.create(f.name, f.source);
      }
      setWs((w) => ({ ...w, active: first }));
    } else {
      setWs((w) => {
        const byName = new Map(w.files.map((f) => [f.name, f]));
        for (const f of incoming) {
          byName.set(f.name, { name: f.name, source: f.source });
        }
        return { files: [...byName.values()], active: first };
      });
    }

    appendLog(`Imported ${incoming.length} file${incoming.length === 1 ? "" : "s"} from GitHub`);
  };

  // Create an empty folder by writing a hidden `.keep` placeholder (folders are virtual — a folder with no
  // files wouldn't render). Doesn't change the active file or open a tab.
  const createFolder = (dir: string) => {
    const placeholder = `${dir}/${KEEP_FILE}`;
    if (ws.files.some((f) => f.name === placeholder)) {
      return;
    }

    if (collab) {
      collabApi.ops.create(placeholder, "");
      return;
    }

    setWs((w) => ({ ...w, files: [...w.files, { name: placeholder, source: "" }] }));
  };

  // Delete a folder and everything under it. Refuses to empty the workspace; moves focus off a deleted file.
  const deleteFolder = (dir: string) => {
    const prefix = `${dir}/`;
    const victims = ws.files.filter((f) => f.name.startsWith(prefix));
    const remaining = ws.files.filter((f) => !f.name.startsWith(prefix));
    if (victims.length === 0 || remaining.length === 0) {
      return;
    }

    if (collab) {
      for (const f of victims) {
        collabApi.ops.remove(f.name);
      }
      setWs((w) => ({ ...w, active: w.active.startsWith(prefix) ? remaining[0].name : w.active }));
    } else {
      setWs((w) => {
        const files = w.files.filter((f) => !f.name.startsWith(prefix));
        const active = w.active.startsWith(prefix) ? files[0].name : w.active;
        return { files, active };
      });
    }

    setOpenTabs((prev) => prev.filter((n) => !n.startsWith(prefix)));
  };

  const renameFile = (oldName: string, newName: string) => {
    if (collab) {
      collabApi.ops.rename(oldName, newName);
      setWs((w) => ({ ...w, active: w.active === oldName ? newName : w.active }));
    } else {
      setWs((w) => ({
        files: w.files.map((f) => (f.name === oldName ? { ...f, name: newName } : f)),
        active: w.active === oldName ? newName : w.active,
      }));
    }
    setBuilt((b) => {
      if (!(oldName in b)) {
        return b;
      }
      const { [oldName]: src, ...rest } = b;
      return { ...rest, [newName]: src };
    });
  };

  const deleteFile = (name: string) => {
    if (collab) {
      collabApi.ops.remove(name);
      setWs((w) => ({ ...w, active: w.active === name ? "" : w.active }));
      return;
    }
    setWs((w) => {
      const files = w.files.filter((f) => f.name !== name);
      const active = w.active === name ? (files[0]?.name ?? "") : w.active;
      return { files, active };
    });
  };

  // Copy a file to a fresh "<stem>-copy.<ext>" name (next free suffix) in the same folder, and open it.
  const duplicateFile = (path: string) => {
    const f = ws.files.find((x) => x.name === path);
    if (!f) {
      return;
    }

    const dir = dirOf(path);
    const label = fileLabel(path);
    const dot = label.lastIndexOf(".");
    const stem = dot > 0 ? label.slice(0, dot) : label;
    const ext = dot > 0 ? label.slice(dot) : "";

    let name = "";
    for (let i = 1; ; i++) {
      const candidate = `${dir ? `${dir}/` : ""}${stem}-copy${i > 1 ? i : ""}${ext}`;
      if (!ws.files.some((x) => x.name === candidate)) {
        name = candidate;
        break;
      }
    }

    setOpenTabs((prev) => (prev.includes(name) ? prev : [...prev, name]));
    if (collab) {
      collabApi.ops.create(name, f.source);
      setWs((w) => ({ ...w, active: name }));
    } else {
      setWs((w) => ({ files: [...w.files, { name, source: f.source }], active: name }));
    }
  };

  // Rename a folder by moving every file under its prefix (folders are virtual). Keeps the active file, open
  // tabs, and dirty-tracking pointed at the moved paths.
  const renameFolder = (oldDir: string, newDir: string) => {
    const op = `${oldDir}/`;
    const np = `${newDir}/`;
    const move = (n: string): string => (n.startsWith(op) ? np + n.slice(op.length) : n);
    if (!ws.files.some((f) => f.name.startsWith(op))) {
      return;
    }

    if (collab) {
      for (const f of ws.files.filter((x) => x.name.startsWith(op))) {
        collabApi.ops.rename(f.name, move(f.name));
      }
      setWs((w) => ({ ...w, active: move(w.active) }));
    } else {
      setWs((w) => ({ files: w.files.map((f) => ({ ...f, name: move(f.name) })), active: move(w.active) }));
    }

    setOpenTabs((prev) => prev.map(move));
    setBuilt((b) => {
      const out: Record<string, string> = {};
      for (const k of Object.keys(b)) {
        out[move(k)] = b[k];
      }
      return out;
    });
  };

  // ---- batch ops (multi-select, drag-many, cut/copy/paste) ----
  const pathFiles = (p: string): WorkspaceFile[] => ws.files.filter((f) => f.name === p || f.name.startsWith(`${p}/`));

  const isFolder = (p: string): boolean => ws.files.some((f) => f.name.startsWith(`${p}/`)) && !ws.files.some((f) => f.name === p);

  // Drop any selected path that lives inside another selected folder — the folder already covers it.
  const topLevel = (paths: string[]): string[] => [...new Set(paths)].filter((p, _i, arr) => !arr.some((q) => q !== p && p.startsWith(`${q}/`)));

  const addOccupied = (taken: Set<string>, path: string): void => {
    taken.add(path);
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      taken.add(parts.slice(0, i).join("/"));
    }
  };

  const applyRenames = (renames: [string, string][]) => {
    if (renames.length === 0) {
      return;
    }

    const map = new Map(renames);
    const mv = (n: string): string => map.get(n) ?? n;
    if (collab) {
      for (const [o, n] of renames) {
        collabApi.ops.rename(o, n);
      }
      setWs((w) => ({ ...w, active: mv(w.active) }));
    } else {
      setWs((w) => ({ files: w.files.map((f) => ({ ...f, name: mv(f.name) })), active: mv(w.active) }));
    }

    setOpenTabs((prev) => prev.map(mv));
    setBuilt((b) => {
      const out: Record<string, string> = {};
      for (const k of Object.keys(b)) {
        out[mv(k)] = b[k];
      }
      return out;
    });
  };

  const applyCreates = (creates: WorkspaceFile[]) => {
    if (creates.length === 0) {
      return;
    }

    const first = creates.find((f) => fileLabel(f.name) !== KEEP_FILE)?.name ?? creates[0].name;
    setOpenTabs((prev) => (prev.includes(first) ? prev : [...prev, first]));
    if (collab) {
      for (const f of creates) {
        collabApi.ops.create(f.name, f.source);
      }
      setWs((w) => ({ ...w, active: first }));
    } else {
      setWs((w) => ({ files: [...w.files, ...creates], active: first }));
    }
  };

  // Move files/folders into targetDir ("" = root). Auto-suffixes on a clash; skips a folder dropped into
  // itself or a descendant.
  const movePaths = (paths: string[], targetDir: string) => {
    const items = topLevel(paths);
    const movingNames = new Set(items.flatMap((p) => pathFiles(p).map((f) => f.name)));
    const taken = occupiedNames(ws.files.filter((f) => !movingNames.has(f.name)).map((f) => f.name));
    const renames: [string, string][] = [];

    for (const p of items) {
      const folder = isFolder(p);
      if (folder && (targetDir === p || targetDir.startsWith(`${p}/`))) {
        continue;
      }
      const wanted = targetDir ? `${targetDir}/${fileLabel(p)}` : fileLabel(p);
      if (wanted === p) {
        continue;
      }
      const dest = freeName(taken, wanted, folder);
      addOccupied(taken, dest);
      if (folder) {
        for (const f of pathFiles(p)) {
          renames.push([f.name, dest + f.name.slice(p.length)]);
        }
      } else {
        renames.push([p, dest]);
      }
    }

    applyRenames(renames);
  };

  // Copy files/folders into targetDir ("" = root), de-duplicating names.
  const copyPaths = (paths: string[], targetDir: string) => {
    const items = topLevel(paths);
    const taken = occupiedNames(ws.files.map((f) => f.name));
    const creates: WorkspaceFile[] = [];

    for (const p of items) {
      const folder = isFolder(p);
      const wanted = targetDir ? `${targetDir}/${fileLabel(p)}` : fileLabel(p);
      const dest = freeName(taken, wanted, folder);
      addOccupied(taken, dest);
      if (folder) {
        for (const f of pathFiles(p)) {
          creates.push({ name: dest + f.name.slice(p.length), source: f.source });
        }
      } else {
        const src = ws.files.find((f) => f.name === p);
        creates.push({ name: dest, source: src?.source ?? "" });
      }
    }

    applyCreates(creates);
  };

  // Delete files/folders. Refuses to empty the workspace.
  const deletePaths = (paths: string[]) => {
    const victims = new Set(topLevel(paths).flatMap((p) => pathFiles(p).map((f) => f.name)));
    const remaining = ws.files.filter((f) => !victims.has(f.name));
    if (victims.size === 0 || remaining.length === 0) {
      return;
    }

    if (collab) {
      for (const n of victims) {
        collabApi.ops.remove(n);
      }
      setWs((w) => ({ ...w, active: victims.has(w.active) ? remaining[0].name : w.active }));
    } else {
      setWs((w) => {
        const files = w.files.filter((f) => !victims.has(f.name));
        const active = victims.has(w.active) ? files[0].name : w.active;
        return { files, active };
      });
    }

    setOpenTabs((prev) => prev.filter((n) => !victims.has(n)));
  };

  const copyLink = async (url: string, note: string) => {
    try {
      await navigator.clipboard.writeText(url);
      appendLog(`${note}: ${url}`);
    } catch {
      appendLog(`${note}: ${url}`);
    }
  };

  // Owner of a signed-in cloud project opens the share dialog (view/edit links, expiry, revoke, go live).
  // Anonymous / local projects fall back to the legacy self-contained link.
  const share = async () => {
    if (getToken() && id) {
      setShareOpen(true);
      return;
    }
    await copyLink(shareUrl(ws), "share link copied to clipboard");
  };

  // Flush the latest edits so the server seeds the collab room from current content, then join the room live.
  const goLive = async () => {
    if (!id) {
      return;
    }
    try {
      if (projectRef.current) {
        await getStore().save(projectRef.current);
      }
    } catch {
      // best-effort flush; the server falls back to the last saved snapshot
    }
    setCollab({ projectId: id, mode: "edit", displayName: me?.name ?? "You", color: colorFor(id) });
  };

  const callerSeed = (): string => accounts.find((a) => a.id === caller)?.seed ?? "";

  const refreshBalances = async (accs: Account[]) => {
    const eng = engineRef.current;
    if (!eng) {
      return;
    }
    const next: Record<string, string> = {};
    for (const a of accs) {
      next[a.id] = (await eng.balanceOf(a.id)).toString();
    }
    setBalances(next);
  };

  const refreshState = async (name: string) => {
    const eng = engineRef.current;
    const d = deployedRef.current[name];
    if (!eng || !d) {
      return;
    }
    try {
      const dump = await eng.stateOf(d.slot, d.source, d.name);
      stateRef.current[name] = dump;
      setStateView((s) => ({ ...s, [name]: dump }));
    } catch {
      // best-effort decode
    }
  };


  const deployImages = (): DeployImage[] =>
    Object.values(deployedRef.current).map((d) => ({ slot: d.slot, wasm: d.wasm, name: d.name }));

  // Re-pull everything the engine panel shows after a manual time change (step/epoch/reset/replay) — the
  // auto-ticker's onTick/onTxProcessed callbacks don't fire for these.
  const refreshEngineViews = async () => {
    const eng = engineRef.current;
    if (!eng) {
      return;
    }
    setEngineInfo(await eng.info());
    await refreshBalances(await eng.ensureAccounts());
    for (const name of Object.keys(deployedRef.current)) {
      await refreshState(name);
    }
    setAssetsView(eng.assets());
  };

  const togglePause = () => {
    const eng = engineRef.current;
    if (!eng) {
      return;
    }
    if (eng.isRunning()) {
      eng.pause();
      setPaused(true);
      appendLog("engine paused — drive time with +1 / +10 / epoch");
    } else {
      eng.resume();
      setPaused(false);
      appendLog("engine resumed");
    }
  };

  const stepTicks = async (n: number) => {
    const eng = engineRef.current;
    if (!eng) {
      return;
    }
    await eng.step(n);
    await refreshEngineViews();
  };

  const advanceEpoch = async () => {
    const eng = engineRef.current;
    if (!eng) {
      return;
    }
    const info = await eng.advanceEpoch();
    appendLog(`advanced to epoch ${info.epoch} — fired END_EPOCH → BEGIN_EPOCH`);
    await refreshEngineViews();
  };

  const resetChain = async () => {
    const eng = engineRef.current;
    if (!eng) {
      return;
    }
    await eng.reset(deployImages());
    setPaused(false);
    setPending({});
    setTxLog([]);
    appendLog("chain reset to genesis — contracts re-deployed, INITIALIZE re-run");
    await refreshEngineViews();
  };

  const replayChain = async () => {
    const eng = engineRef.current;
    if (!eng) {
      return;
    }
    appendLog("replaying the session from genesis…");
    setTxLog([]);
    await eng.replay(deployImages());
    setPaused(false);
    setPending({});
    appendLog("replay complete");
    await refreshEngineViews();
  };

  const changeSpeed = (ticksPerSec: number) => {
    setSpeed(ticksPerSec);
    engineRef.current?.setSpeed(Math.round(1000 / ticksPerSec));
  };

  const fundFromFaucet = async (id: string, qus: number) => {
    const eng = engineRef.current;
    if (!eng || qus <= 0) {
      return;
    }
    eng.fundAccount(id, BigInt(qus));
    appendLog(`faucet → ${shortId(id)} +${qus.toLocaleString("en-US")} qus`);
    await refreshBalances(await eng.ensureAccounts());
  };

  // ---- scenario runner (saved contract tests built on reset/replay) ----

  const acctLabel = (seed: string): string => {
    const i = accounts.findIndex((a) => a.seed === seed);
    return i >= 0 ? `acct ${i}` : "acct";
  };

  // Snapshot the writes you ran on the selected contract into a new saved scenario.
  const captureScenario = () => {
    const d = sel;
    if (!d) {
      return;
    }
    const mine = (engineRef.current?.exportHistory() ?? []).filter((h) => h.contract.name === d.name);
    if (!mine.length) {
      appendLog("nothing to capture — run a procedure on this contract first");
      return;
    }
    const calls: CallStep[] = mine.map((h) => ({
      procId: h.procId,
      procName: h.entry.name,
      input: Object.fromEntries(Object.entries(h.input).map(([k, v]) => [k, String(v)])),
      callerSeed: h.caller.seed,
      callerLabel: acctLabel(h.caller.seed),
      value: h.caller.amount,
    }));
    const n = scenarios.filter((x) => x.contract === d.name).length + 1;
    const s: Scenario = { id: uid(), name: `${d.name} test ${n}`, contract: d.name, calls, asserts: [] };
    setScenarios((xs) => [...xs, s]);
    appendLog(`captured ${calls.length} call(s) into "${s.name}" — add assertions, then run`);
  };

  // Reset the chain, replay the scenario's calls, then evaluate its assertions against the result.
  const runScenario = async (s: Scenario) => {
    const eng = engineRef.current;
    const d = deployedRef.current[s.contract];
    if (!eng) {
      return;
    }
    if (!d) {
      setScenResults((r) => ({ ...r, [s.id]: { results: [], error: `${s.contract} not deployed` } }));
      return;
    }
    if (s.calls.some((c) => !d.idl.procedures[c.procId])) {
      setScenResults((r) => ({ ...r, [s.id]: { results: [], error: "contract changed — a captured procedure is gone" } }));
      return;
    }

    setRunningScen(s.id);
    try {
      const steps: ReplayStep[] = s.calls.map((c) => {
        const entry = d.idl.procedures[c.procId];
        return {
          slot: d.slot,
          procId: c.procId,
          entry,
          input: coerce(entry, c.input),
          key: `${d.name}:scenario:${c.procId}`,
          caller: { seed: c.callerSeed, amount: c.value },
          contract: { name: d.name, source: d.source },
        };
      });
      await eng.runSteps(deployImages(), steps);

      const out: AssertResult[] = [];
      for (const a of s.asserts) {
        const entry = d.idl.functions[a.fnId];
        if (!entry) {
          out.push({ ok: false, actual: "(no such function)" });
          continue;
        }
        const res = await eng.callFunction(d.slot, a.fnId, entry, coerce(entry, a.input));
        const actual = res && typeof res === "object" ? (res as Record<string, unknown>)[a.field] : res;
        out.push({ ok: compare(a.op, actual, a.expected), actual: actual === undefined ? "undefined" : String(actual) });
      }
      setScenResults((r) => ({ ...r, [s.id]: { results: out } }));
      appendLog(`scenario "${s.name}": ${out.filter((x) => x.ok).length}/${out.length} assertions passed`);
    } catch (e) {
      setScenResults((r) => ({ ...r, [s.id]: { results: [], error: (e as Error).message } }));
    } finally {
      setRunningScen(null);
      await refreshEngineViews();
    }
  };

  const deleteScenario = (id: string) => {
    setScenarios((xs) => xs.filter((x) => x.id !== id));
    setScenResults((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  };

  const addAssert = (id: string, a: AssertStep) => {
    setScenarios((xs) => xs.map((s) => (s.id === id ? { ...s, asserts: [...s.asserts, a] } : s)));
  };

  const deleteAssert = (id: string, idx: number) => {
    setScenarios((xs) => xs.map((s) => (s.id === id ? { ...s, asserts: s.asserts.filter((_, i) => i !== idx) } : s)));
  };

  // Live label for a queued tx — counts down as the chain ticks toward its target.
  const pendingLabel = (targetTick: number): string => {
    const cur = engineInfo?.tick ?? 0;
    const left = Math.max(0, targetTick - cur);
    return left > 0 ? `pending · ${left} tick${left > 1 ? "s" : ""} left → tick ${targetTick}` : "pending · landing…";
  };

  // Feed Monaco the ./.qinit client types (built from the deployed IDLs) so `c.` completes in .ts tests. The
  // test model is file:///<name>.test.ts, so "./.qinit" resolves to file:///.qinit.d.ts.
  const updateQinitTypes = () => {
    const monaco = monacoRef.current;
    if (!monaco) {
      return;
    }
    qinitLibRef.current?.dispose();
    const idls = Object.values(deployedRef.current).map((d) => d.idl);
    qinitLibRef.current = monaco.languages.typescript.typescriptDefaults.addExtraLib(genQinitDts(idls), "file:///.qinit.d.ts");
  };

  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setupQpi(monaco, editor);
    import("./qpi/hover").then((m) => m.registerQpiHover(monaco)).catch(() => undefined);

    // Type the bun:test surface for .ts test files (the same module the qinit CLI tests import). The
    // per-project "./.qinit" client module can't be typed here — its module-not-found is ignored below.
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare module "bun:test" {
  export function test(name: string, fn: () => any): void;
  export function expect(actual: any): { toBe(v: any): void; toEqual(v: any): void; toBeGreaterThan(v: any): void; toBeLessThan(v: any): void; toBeTruthy(): void; toBeFalsy(): void };
  export function beforeAll(fn: () => any): void;
  export function beforeEach(fn: () => any): void;
  export function afterEach(fn: () => any): void;
  export function describe(name: string, fn: () => any): void;
}`,
      "qinit-bun-test.d.ts",
    );
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      lib: ["es2020", "dom"],
    });
    // 2307 / 2792 = "cannot find module" (the second is the nodenext-suggestion variant) — the generated
    // "./.qinit" client only exists in a qinit project, not here.
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ diagnosticCodesToIgnore: [2307, 2792] });

    // Aggregate all markers on the active model (qpi lexical + context, and clang) into the Problems panel.
    const refreshProblems = () => {
      const model = editor.getModel();
      if (!model) {
        return;
      }
      type Marker = { severity: number; message: string; startLineNumber: number; startColumn: number; source?: string; code?: unknown };
      const ms = monaco.editor.getModelMarkers({ resource: model.uri }) as Marker[];
      setProblems(ms.map((m): ProblemItem => ({ severity: m.severity, message: m.message, line: m.startLineNumber, col: m.startColumn, source: String(m.source ?? ""), code: String((m.code as { value?: unknown })?.value ?? m.code ?? "") })));
    };
    monaco.editor.onDidChangeMarkers(refreshProblems);
    editor.onDidChangeModel(refreshProblems);

    updateQinitTypes();
    setEditorReady(true);
  };

  // Jump the editor to a problem's location.
  const goToProblem = (p: ProblemItem) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.setPosition({ lineNumber: p.line, column: p.col });
    editor.revealLineInCenter(p.line);
    editor.focus();
  };

  // Move the cursor to a source offset in the active model and center it.
  const applyJump = (offset: number) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      return;
    }
    const pos = model.getPositionAt(offset);
    editor.setPosition(pos);
    editor.revealLineInCenter(pos.lineNumber);
    editor.focus();
  };

  // Workspace-search result click: jump to file:line:col (switching tabs via the pending-jump path if needed).
  const jumpToMatch = (name: string, line: number, col: number) => {
    const file = ws.files.find((f) => f.name === name);
    if (!file) {
      return;
    }
    const lines = file.source.split("\n");
    let off = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) {
      off += lines[i].length + 1;
    }
    off += col - 1;

    setSearchOpen(false);
    if (ws.active === name) {
      applyJump(off);
    } else {
      pendingJumpRef.current = { file: name, offset: off };
      selectFile(name);
    }
  };

  // Outline click: jump to a symbol's declaration in the active file (StateData field, function, procedure).
  const jumpToSymbol = (name: string) => {
    const off = definitionOffset(source, name);
    if (off !== null) {
      applyJump(off);
    }
  };

  // Debugger goto-source: a step -> its PUBLIC_*/PRIVATE_* declaration in the editor. The entry name comes
  // from the deployed contract's IDL (keyed by entry-point id); the offset is located in the LIVE file
  // source so it tracks edits made since deploy. System procedures (kind 2) have no user declaration to jump
  // to. If the contract lives in another tab, defer the cursor move until that file's model has swapped in.
  const jumpToStep = (step: DebugStep) => {
    const d = deployedRef.current[step.contract];
    if (!d) {
      return;
    }
    const entry = step.kind === 1 ? d.idl.procedures[String(step.entry)] : step.kind === 0 ? d.idl.functions[String(step.entry)] : undefined;
    const name = entry?.name;
    const file = ws.files.find((f) => baseName(f.name) === step.contract);
    if (!name || !file) {
      return;
    }
    const off = definitionOffset(file.source, name);
    if (off === null) {
      return;
    }
    setDebug(null);
    if (ws.active === file.name) {
      applyJump(off);
    } else {
      pendingJumpRef.current = { file: file.name, offset: off };
      selectFile(file.name);
    }
  };

  // A goto-source jump that had to switch tabs fires once the target file's model is live.
  useEffect(() => {
    const pend = pendingJumpRef.current;
    if (!pend || pend.file !== ws.active) {
      return;
    }
    pendingJumpRef.current = null;
    const id = requestAnimationFrame(() => applyJump(pend.offset));
    return () => cancelAnimationFrame(id);
  }, [ws.active]);

  const errorCount = problems.filter((p) => p.severity === 8).length;
  const warnCount = problems.filter((p) => p.severity === 4).length;

  // Static analysis of the OTHER contract files — the active file is already covered live by the Problems
  // panel + in-editor squiggles, so excluding it keeps the two panels disjoint (no duplicated rows).
  const analysis = useMemo(() => analyzeWorkspace(ws.files.filter((f) => f.name !== ws.active)), [ws.files, ws.active]);
  const analysisCounts = severityCounts(analysis);

  // Open the bottom panel on a given tab (used by the toolbar / command palette).
  const openBottom = (tab: "problems" | "analysis") => {
    setBottomTab(tab);
    setProblemsOpen(true);
  };

  // While a compile is pending, poll the backend build pool so the status line can show "waiting for a build
  // slot" when the box is saturated by other builds.
  useEffect(() => {
    if (phase !== "compiling") {
      setBuildQueue(null);
      return;
    }
    let alive = true;
    const tick = () => {
      void fetchBuildQueue().then((q) => {
        if (alive) {
          setBuildQueue(q);
        }
      });
    };
    tick();
    const iv = setInterval(tick, 600);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [phase]);

  // Keep the open-tabs list self-consistent with the workspace: drop tabs whose file is gone, and make
  // sure the active file is always an open tab. This lets the file handlers stay simple — selecting,
  // creating or deleting a file just updates `ws`, and the right tabs follow.
  useEffect(() => {
    if (!loaded) {
      return;
    }
    setOpenTabs((prev) => {
      const valid = prev.filter((n) => ws.files.some((f) => f.name === n));
      const next = valid.includes(ws.active) ? valid : [...valid, ws.active];
      const same = next.length === prev.length && next.every((v, i) => v === prev[i]);
      return same ? prev : next;
    });
  }, [ws.files, ws.active, loaded]);

  // The right-hand ENGINE panel mirrors the file you're editing: switching tab/file points it at that
  // contract's deployment (state + call forms), or clears it when the active contract isn't deployed yet.
  useEffect(() => {
    const cn = baseName(ws.active);
    setSelected(deployed[cn] ? cn : null);
  }, [ws.active, deployed]);

  // Close a tab. The last tab can't be closed (the editor always needs an active file); closing the
  // active tab moves focus to the nearest surviving neighbour.
  const closeTab = (name: string, e: { stopPropagation(): void }) => {
    e.stopPropagation();
    if (openTabs.length <= 1) {
      return;
    }
    const idx = openTabs.indexOf(name);
    const remaining = openTabs.filter((n) => n !== name);
    setOpenTabs(remaining);
    if (name === ws.active) {
      const fallback = remaining[Math.min(idx, remaining.length - 1)];
      setWs((w) => ({ ...w, active: fallback }));
    }
  };

  // Latest "close the active tab" closure, read by the once-registered keybind listener below.
  const closeActiveTabRef = useRef<() => void>(() => undefined);
  closeActiveTabRef.current = () => closeTab(ws.active, { stopPropagation() {} });

  // IDE-wide keybinds. Capture phase so these beat Monaco's own Ctrl+P / Ctrl+Shift+P when the editor is
  // focused. Ctrl+P = quick-open files; Ctrl+Shift+P = command palette; Ctrl+W = close the active tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "p") {
        e.preventDefault();
        e.stopPropagation();
        setPalette(e.shiftKey ? "command" : "file");
      } else if (k === "f" && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
      } else if (k === "w" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        closeActiveTabRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // A tab is dirty when its source has unbuilt edits — i.e. it compiled clean once, then changed.
  const isDirty = (name: string): boolean =>
    name in built && built[name] !== (ws.files.find((f) => f.name === name)?.source ?? "");

  // Drag a column splitter. The explorer grows with the cursor; the engine (right) grows as it moves left.
  const startResize = (which: "explorer" | "engine", e: { clientX: number; preventDefault(): void }) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = which === "explorer" ? explorerW : engineW;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (which === "explorer") {
        setExplorerW(Math.max(160, Math.min(380, startW + dx)));
      } else {
        setEngineW(Math.max(280, Math.min(560, startW - dx)));
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // Drag the console's top edge — moving up grows the console (and shrinks the engine views above it).
  const startResizeConsole = (e: { clientY: number; preventDefault(): void }) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = consoleH;

    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      setConsoleH(Math.max(120, Math.min(window.innerHeight - 220, startH + dy)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const applyClangMarkers = (res: CompileResult) => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) {
      return;
    }
    monaco.editor.setModelMarkers(model, "clang", res.diagnostics.map((d) => ({
      severity: d.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: d.message,
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.line,
      endColumn: d.column + 1,
      source: "clang",
    })));
  };

  // Remix's loop, compiler out-of-band: on an idle pause the editor source is compiled in the background
  // (one POST, non-blocking — typing is fed by the instant local QPI layer) and the real clang diagnostics
  // land as "clang" markers. Coalesced (single in-flight + trailing re-run), deduped (skip unchanged
  // buffers), and the wasm/idl is kept warm so ▶ Deploy & Run needs no extra compile.
  const runAutoCompile = useCallback(async () => {
    const src = sourceRef.current;
    const name = contractNameRef.current;
    const fileName = activeNameRef.current;
    if (/\.tsx?$/.test(fileName)) {
      setDiag({ state: "idle", count: 0 }); // .ts test files aren't clang-compiled
      return;
    }
    if (!src.trim() || src === autoSentRef.current) {
      return;
    }
    if (autoBusyRef.current) {
      autoDirtyRef.current = true; // an edit is mid-flight; re-run once the current pass finishes
      return;
    }

    autoBusyRef.current = true;
    autoSentRef.current = src;
    const seq = ++autoSeqRef.current;
    setDiag((d) => ({ ...d, state: "checking" }));

    let res: CompileResult | null = null;
    try {
      const slot = assignSlot(deployedRef.current, name);
      const callees = resolveCallees(filesRef.current, deployedRef.current, src);
      res = await compileContract({ source: src, name, slot, skipVerify: true, callees });
    } catch {
      res = null;
    }
    autoBusyRef.current = false;

    if (autoDirtyRef.current) {
      autoDirtyRef.current = false;
      void runAutoCompile(); // pick up the newest buffer
    }
    if (seq !== autoSeqRef.current || !res) {
      return; // superseded by a newer run, or the request failed — don't flap the markers
    }

    applyClangMarkers(res);
    const errs = res.diagnostics.filter((d) => d.severity === "error").length;
    setDiag({ state: errs ? "error" : "ok", count: errs });

    if (res.ok && res.wasm && res.idl) {
      warmRef.current = { source: src, name, res }; // warm artifact for an instant deploy
      setBuilt((b) => ({ ...b, [fileName]: src })); // clears this file's dirty dot
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads only refs; intentionally stable
  }, []);

  // Debounce: re-arm on each edit / file switch, fire the background compile after an idle pause.
  useEffect(() => {
    const t = setTimeout(() => {
      void runAutoCompile();
    }, 800);
    return () => clearTimeout(t);
  }, [source, contractName, runAutoCompile]);

  // Spin up the in-process engine: create it, start the auto-ticker, fund the dev accounts, publish the
  // first tick. Idempotent — returns the running engine if already up. Called on mount (so the testnet
  // panel is live from the start) and before the first deploy.
  // Compile (on the backend) + deploy a built-in system contract (QX, …) into the in-browser virtual node at its
  // canonical index, then register it like any deployed contract so the call forms + inspector work.
  const deploySystem = useCallback(async (eng: IdeEngine, name: string): Promise<boolean> => {
    appendLog(`compiling system contract ${name}…`);
    const res = await compileSystem(name);
    if (!res.ok || !res.wasm || !res.idl || res.index === undefined) {
      const why = res.error ?? "compile failed";
      appendLog(`✗ ${name}: ${why}`);
      notify.error(errorMessage(why, `Deploy of system contract ${name} failed`));
      return false;
    }
    // Wrap the in-engine deploy: a throw here (e.g. wasm instantiation) must not leave the UI stuck on
    // "compiling…" with no feedback — surface it as an error like a compile failure.
    try {
      const wasm = base64ToBytes(res.wasm);
      await eng.deploy(res.index, wasm, res.idl);
      const address = await eng.addressOf(res.index);
      deployedRef.current = { ...deployedRef.current, [name]: { name, slot: res.index, address, idl: res.idl, source: "", wasm, calls: [] } };
      setDeployed({ ...deployedRef.current });
      appendLog(`deployed system ${name} → slot ${res.index}`);
      return true;
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      appendLog(`✗ ${name}: deploy failed — ${why}`);
      notify.error(errorMessage(why, `Deploy of system contract ${name} failed`));
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads only refs / stable setters
  }, []);

  // Toggle a system contract on the in-browser node (deploy + persist when adding; remove + undeploy when off).
  const toggleSystem = async (name: string): Promise<void> => {
    if (sysSel.includes(name) || name in deployedRef.current) {
      // Drop it from the selection + the deployed view; it stays armed in the engine until the next reload (the
      // in-browser node has no live undeploy), and re-adding redeploys over the same slot.
      setSysSel((s) => s.filter((n) => n !== name));
      setDeployed((d) => { const next = { ...d }; delete next[name]; return next; });
      delete deployedRef.current[name];
    } else if (await deploySystem(await ensureEngine(), name)) {
      setSysSel((s) => [...new Set([...s, name])]);
    }
  };

  const ensureEngine = useCallback((): Promise<IdeEngine> => {
    if (engineRef.current) {
      return Promise.resolve(engineRef.current);
    }
    if (engineInitRef.current) {
      return engineInitRef.current; // a start is already in flight — share it
    }
    engineInitRef.current = (async () => {
      const { IdeEngine } = await import("./engine");
      const eng = new IdeEngine();
      eng.onTick = (info) => setEngineInfo(info);
      eng.onLog = (e) => setEngineLog((l) => [...l.slice(-999), e]); // buffer the engine's diagnostic stream for the popup

      eng.onTxProcessed = ({ key, name, tick, moneyFlew, detail }) => {
        setPending((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
        setOutputs((o) => ({ ...o, [key]: `applied ✓ @ tick ${tick}${moneyFlew ? " · moneyFlew" : ""}` }));
        appendLog(`${name}() processed @ tick ${tick}`);
        setTxLog((l) => [{ key, name, tick, moneyFlew, contract: key.split(":")[0], detail }, ...l].slice(0, 300));
        if (detail) {
          setTxDetail((t) => ({ ...t, [key]: detail }));
          if (detail.caller !== "(none)") appendLog(`  caller ${shortId(detail.caller)}`);
          if (detail.in !== "(none)") appendLog(`  in ${detail.in}`);
          detail.diff.forEach((d) => appendLog(`  Δ ${d.label}: ${d.before} → ${d.after}`));
          detail.hostCalls.forEach((h) => appendLog(`  host ${h}`));
          detail.logs.forEach((l) => appendLog(`  log ${l}`));
        }
        eng.ensureAccounts().then((a) => refreshBalances(a)).catch(() => undefined);
        void refreshState(key.split(":")[0]);
        setAssetsView(eng.assets());
      };
      eng.start();
      engineRef.current = eng;
      setEpochLen(eng.epochLength());
      const accs = await eng.ensureAccounts();
      setAccounts(accs);
      setCaller(accs[0]?.id ?? "");
      void refreshBalances(accs);
      setEngineInfo(await eng.info());
      // Re-seed the project's chosen system contracts onto the fresh node (compiled by the backend, cached).
      for (const name of projectRef.current?.systemContracts ?? []) {
        await deploySystem(eng, name).catch(() => false);
      }
      return eng;
    })();
    return engineInitRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads only refs / stable setters; intentionally stable
  }, []);

  // Bring the testnet panel up on load — accounts funded, clock ticking, controls usable before any deploy.
  useEffect(() => {
    void ensureEngine().catch(() => undefined);
  }, [ensureEngine]);

  // System-contract catalog for the picker (backend-served; [] if the backend/snapshot isn't available).
  useEffect(() => {
    void fetchSystemCatalog().then(setSysCatalog).catch(() => undefined);
  }, []);

  // Compile + deploy the active contract and the whole graph it calls. Each CALL/INVOKE_OTHER_CONTRACT(<Name>)
  // resolves to the project's <Name>.h, which is deployed FIRST at a lower slot (the qubic lower-index rule),
  // so a single ▶ brings up the whole graph. Post-order DFS: callees land before their callers.
  const runCompile = async () => {
    setPhase("compiling");

    const done = new Map<string, number>(); // name -> slot deployed this pass
    const visiting = new Set<string>(); // cycle guard

    const deployNode = async (eng: IdeEngine, name: string, src: string): Promise<number> => {
      const seen = done.get(name);
      if (seen !== undefined) {
        return seen;
      }
      if (visiting.has(name)) {
        throw new Error(`circular inter-contract calls involving ${name}`);
      }
      visiting.add(name);

      // Deploy every callee first; the caller must sit above the highest of them.
      const calleeArgs: { name: string; source: string; slot: number }[] = [];
      let floor = SLOT_BASE;
      for (const cn of scanCallees(src)) {
        const f = filesRef.current.find((x) => baseName(x.name) === cn);
        if (!f) {
          throw new Error(`${name} calls '${cn}', but there's no ${cn}.h in this project`);
        }
        const cslot = await deployNode(eng, cn, f.source);
        calleeArgs.push({ name: cn, source: f.source, slot: cslot });
        floor = Math.max(floor, cslot + 1);
      }

      const slot = slotAtOrAbove(deployedRef.current, name, floor);
      appendLog(calleeArgs.length
        ? `compiling ${name} (slot ${slot}) → calls ${calleeArgs.map((c) => c.name).join(", ")}…`
        : `compiling ${name} (slot ${slot})…`);

      // A leaf contract with a warm background-compiled artifact deploys instantly; everything else builds fresh.
      const warm = warmRef.current;
      const cached = calleeArgs.length === 0 && warm && warm.source === src && warm.name === name ? warm.res : null;
      const res = cached ?? await compileContract({ source: src, name, slot, skipVerify: true, callees: calleeArgs });
      if (name === contractName) {
        setResult(res);
        applyClangMarkers(res);
      }
      if (!res.ok || !res.wasm || !res.idl) {
        // Surface the Problems panel automatically when the built contract has compile errors.
        if (name === contractName && res.diagnostics.some((d) => d.severity === "error")) {
          setProblemsOpen(true);
        }

        const why = res.error ?? (res.diagnostics.length ? `${res.diagnostics.length} compile problem(s) — see the editor` : "compile failed");
        appendLog(`✗ ${name}: ${why}`);

        // A transport / toolchain failure (backend down, server error) carries an `error` but no located
        // diagnostics — surface it loudly. Real compile errors (with diagnostics) already open the editor.
        if (res.error && res.diagnostics.length === 0) {
          notify.error(errorMessage(res.error, `Build of ${name} failed`));
        }

        // Detail: the per-line clang diagnostics, then the tail of the raw toolchain stderr.
        res.diagnostics.slice(0, 8).forEach((d) => appendLog(`  ${d.severity} ${name}.h:${d.line}:${d.column} — ${d.message}`));
        if (res.verify && res.verify.ok === false && res.verify.errors?.length) {
          res.verify.errors.slice(0, 8).forEach((e) => appendLog(`  protocol: ${e}`));
        }
        if (res.stderr) {
          res.stderr.split("\n").map((l) => l.trimEnd()).filter(Boolean).slice(-14).forEach((l) => appendLog(`  ${l}`));
        }
        throw new Error(why);
      }

      const wasmBytes = base64ToBytes(res.wasm);
      await eng.deploy(slot, wasmBytes, res.idl);
      eng.registerSource(slot, src, name); // so the step debugger decodes this contract's StateData
      const address = await eng.addressOf(slot);
      deployedRef.current = { ...deployedRef.current, [name]: { name, slot, address, idl: res.idl, source: src, wasm: wasmBytes, calls: calleeArgs.map((c) => c.name) } };
      appendLog(`deployed ${res.idl.name} → slot ${slot} · ${res.size} B · ${shortId(address)}`);

      visiting.delete(name);
      done.set(name, slot);
      return slot;
    };

    try {
      const eng = await ensureEngine();
      await deployNode(eng, contractName, source);

      setDeployed(deployedRef.current);
      setSelected(contractName);
      setEngineInfo(await eng.info());
      setPhase("ready");
      setBuilt((b) => {
        const next = { ...b };
        for (const nm of done.keys()) {
          const file = ws.files.find((f) => baseName(f.name) === nm);
          if (file) {
            next[file.name] = deployedRef.current[nm].source; // clear each deployed file's dirty dot
          }
        }
        return next;
      });
      void refreshBalances(await eng.ensureAccounts());
      for (const nm of done.keys()) {
        void refreshState(nm);
      }
      setAssetsView(eng.assets()); // INITIALIZE may have issued assets on deploy
      updateQinitTypes(); // refresh the ./.qinit client types for .ts test completion
    } catch (e) {
      setPhase("error");
      appendLog("deploy failed: " + (e as Error).message);
    }
  };

  // Build entry point. In a collab session, only one build per project may run at a time — claim the shared
  // lock first (deterministic tiebreak for simultaneous clicks) and release it when the build settles.
  const compile = async () => {
    if (collab) {
      if (collabApi.building.byOther) {
        appendLog(`${collabApi.building.by} is building — one build per project at a time`);
        return;
      }
      const granted = await collabApi.claimBuild();
      if (!granted) {
        appendLog("another collaborator just started a build — try again in a moment");
        return;
      }
    }
    try {
      await runCompile();
    } finally {
      if (collab) {
        collabApi.releaseBuild();
      }
    }
  };

  // Run the active .ts test file in-page against the engine. Contracts must have been built (Compile & Run)
  // so deployedRef has their wasm/idl; the runner deploys each on a fresh chain per test.
  const runTestFile = async () => {
    const eng = await ensureEngine();
    const accs = await eng.ensureAccounts();
    const contracts: Record<string, TestContract> = {};
    for (const d of Object.values(deployedRef.current)) {
      contracts[d.name] = { name: d.name, slot: d.slot, idl: d.idl, source: d.source, wasm: d.wasm };
    }

    setTestRun({ results: [], running: true, title: ws.active });
    try {
      const results = await runTests(source, { eng, contracts, accounts: accs });
      setTestRun({ results, running: false, title: ws.active });
    } catch (e) {
      setTestRun({ results: [{ name: "(runner)", ok: false, ms: 0, error: (e as Error).message, logs: [] }], running: false, title: ws.active });
    } finally {
      void refreshEngineViews();
    }
  };

  const coerce = (entry: IdlEntry, input: Record<string, string>): Record<string, unknown> => {
    const json: Record<string, unknown> = {};
    for (const f of entry.inFields) {
      const raw = (input[f.name] ?? "").trim();
      json[f.name] = raw === "" ? 0 : /^-?\d+$/.test(raw) ? Number(raw) : raw;
    }
    return json;
  };

  const formatOut = (out: unknown): string =>
    JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) ?? String(out);

  const sel = selected ? deployed[selected] : null;

  const runFunction = async (id: string, entry: IdlEntry, input: Record<string, string>) => {
    const eng = engineRef.current;
    if (!eng || !sel) {
      return;
    }
    setBusy(true);
    try {
      const out = await eng.callFunction(sel.slot, id, entry, coerce(entry, input));
      const text = formatOut(out);
      setOutputs((p) => ({ ...p, [`${sel.name}:f:${id}`]: text }));
      appendLog(`${sel.name}.${entry.name}() → ${text}`);
    } catch (e) {
      appendLog(`${entry.name} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const runProcedure = async (id: string, entry: IdlEntry, input: Record<string, string>, value: number) => {
    const eng = engineRef.current;
    if (!eng || !sel) {
      return;
    }
    setBusy(true);
    try {
      const key = `${sel.name}:p:${id}`;
      const { targetTick } = await eng.submitProcedure(sel.slot, id, entry, coerce(entry, input), key, { seed: callerSeed(), amount: value }, { name: sel.name, source: sel.source });
      setPending((p) => ({ ...p, [key]: { name: entry.name, targetTick } }));
      setOutputs((o) => {
        const next = { ...o };
        delete next[key];
        return next;
      });
      appendLog(`${sel.name}.${entry.name}() from acct ${shortId(caller)}${value ? ` · ${value} qus` : ""} → lands @ tick ${targetTick}`);
    } catch (e) {
      appendLog(`${entry.name} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const idl = sel?.idl ?? null;
  const procedures = idl ? Object.entries(idl.procedures) : [];
  const functions = idl ? Object.entries(idl.functions) : [];

  // The new-file action: prompt for a name, default-extend with `.h`.
  const promptNewFile = () => {
    const raw = window.prompt("New file name", "Contract.h");
    if (!raw) {
      return;
    }
    const name = /\.\w+$/.test(raw) ? raw : `${raw}.h`;
    createFile(name);
  };

  // Quick-open lists the workspace files; the command palette lists IDE actions. Built only while open.
  const paletteItems: PaletteItem[] =
    palette === "file"
      ? ws.files.filter((f) => fileLabel(f.name) !== KEEP_FILE).map((f) => ({ id: f.name, label: f.name, hint: f.name === ws.active ? "open" : undefined, run: () => selectFile(f.name) }))
      : palette === "command"
        ? [
            { id: "compile", label: "Compile & Run", run: () => void compile() },
            { id: "pause", label: paused ? "Engine: resume auto-tick" : "Engine: pause auto-tick", run: togglePause },
            { id: "step1", label: "Engine: step +1 tick", run: () => void stepTicks(1) },
            { id: "step10", label: "Engine: step +10 ticks", run: () => void stepTicks(10) },
            { id: "epoch", label: "Engine: advance epoch", run: () => void advanceEpoch() },
            { id: "reset", label: "Engine: reset chain", run: () => void resetChain() },
            { id: "replay", label: "Engine: replay session", run: () => void replayChain() },
            { id: "save", label: "Save project", hint: "Ctrl S", run: () => { persistRef.current(); setSaved(true); } },
            { id: "format", label: "Format document", hint: "Shift Alt F", run: () => void editorRef.current?.getAction("editor.action.formatDocument")?.run() },
            { id: "search", label: "Search in files", hint: "Ctrl Shift F", run: () => setSearchOpen(true) },
            { id: "analysis", label: "Static analysis: scan workspace", run: () => openBottom("analysis") },
            { id: "gh-import", label: "Import from GitHub…", run: () => setGithub("import") },
            { id: "gh-export", label: "Export as Gist…", run: () => setGithub("export") },
            { id: "newfile", label: "New file…", run: promptNewFile },
            { id: "close", label: "Close active tab", hint: "Ctrl W", run: () => closeActiveTabRef.current() },
            { id: "share", label: "Share workspace link", run: () => void share() },
            { id: "projects", label: "Go to projects home", run: () => navigate("/ide") },
            ...EDITOR_THEMES.map((t) => ({ id: `etheme-${t.id}`, label: `Editor theme: ${t.label}`, run: () => pickEditorTheme(t.id) })),
          ]
        : [];

  if (!loaded) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: color.void, color: color.textGhostDk, fontFamily: font.mono, fontSize: 13 }}>
        loading project…
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: color.void, color: color.textLight, fontFamily: font.body, overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <style dangerouslySetInnerHTML={{ __html: `::-webkit-scrollbar{width:11px;height:11px}::-webkit-scrollbar-track{background:${color.void}}::-webkit-scrollbar-thumb{background:${color.hair2};border:3px solid ${color.void}}::-webkit-scrollbar-thumb:hover{background:${color.accent}}::-webkit-scrollbar-corner{background:${color.void}}*{scrollbar-width:thin;scrollbar-color:${color.hair2} ${color.void}}.pix-resizer{transition:background .1s}.pix-resizer:hover{background:${color.accent}66}.pix-problem-row:hover{background:#ffffff0a}.pix-tabs::-webkit-scrollbar{height:0}.pix-tab:hover{background:#ffffff08}.pix-tab-x{opacity:0;transition:opacity .1s}.pix-tab:hover .pix-tab-x{opacity:1}.pix-tab:hover .pix-tab-dot{opacity:0}` }} />
      <Toasts />
      <OfflineBanner />

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 16px", height: 54, borderBottom: frame(), background: color.panelDeep, flex: "none" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <PixelQMark size={22} />
          <span style={{ fontFamily: font.display, fontSize: 19, color: color.textLightHi }}>qinit <span style={{ color: color.accent }}>ide</span></span>
        </Link>
        <span style={{ width: 1, height: 22, background: color.hair2 }} />
        <Link to="/ide" title="All projects" style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk, textDecoration: "none" }}>← projects</Link>
        <span style={{ width: 8, height: 8, background: color.accent }} />
        <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>{projectName || "…"}</span>
        {saved && <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent }}>✓ saved</span>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {activeIsTest ? (
            <ToolButton variant="accent" onClick={() => void runTestFile()} disabled={!!testRun?.running}>
              {testRun?.running ? "Running…" : "▶ Run tests"}
            </ToolButton>
          ) : (
            <ToolButton variant="accent" onClick={compile} disabled={phase === "compiling" || collabApi.building.byOther}>
              {phase === "compiling" ? "Compiling…" : collabApi.building.byOther ? `${collabApi.building.by} building…` : "▶ Compile & Run"}
            </ToolButton>
          )}
          <ToolButton onClick={share}>Share</ToolButton>
          <ToolButton onClick={() => setShowTxs(true)}>≡ txs{txLog.length ? ` ${txLog.length}` : ""}</ToolButton>
          <ThemePicker value={editorTheme} onPick={pickEditorTheme} />
          <button
            onClick={toggleTheme}
            title={theme === "flat" ? "Switch the UI chrome to neo-brutalist" : "Switch the UI chrome to flat minimal"}
            style={{ border: `1px solid ${color.hair2}`, background: color.panel, color: color.textMutedDk, fontFamily: font.mono, fontSize: 11, padding: "5px 9px", cursor: "pointer", flex: "none" }}
          >
            {theme === "flat" ? "◐ flat" : "◑ neo"}
          </button>
          <Link to="/docs" style={{ fontFamily: font.mono, fontSize: 12, color: color.textMutedDk, textDecoration: "none", marginLeft: 4 }}>Docs</Link>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: hair(), background: color.panel, flex: "none" }}>
        <TrafficLights />
        <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textFaintDk, marginLeft: 6 }}>qinit ide — my-contract</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
          <PanelToggle hidden={leftHidden} side="left" onClick={toggleLeft} />
          <PanelToggle hidden={rightHidden} side="right" onClick={toggleRight} />
          <button
            onClick={() => setSearchOpen(true)}
            title="Search files (Ctrl+Shift+F)"
            style={{ display: "flex", alignItems: "center", gap: 6, width: 200, height: 24, flex: "none", border: `1px solid ${color.hair2}`, background: color.void, fontFamily: font.mono, fontSize: 11.5, cursor: "text", padding: "0 8px", textAlign: "left" }}
          >
            <span style={{ color: color.textFaintDk }}>⌕</span>
            <span style={{ flex: 1, color: color.textGhostDk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Search files…</span>
            <span style={{ color: color.textFaintDk, fontSize: 9.5 }}>⌃⇧F</span>
          </button>
          <button
            onClick={() => setGithub("import")}
            title="Import from GitHub / export as Gist"
            style={{ display: "flex", alignItems: "center", gap: 6, height: 24, flex: "none", border: `1px solid ${color.hair2}`, background: color.void, color: color.textGhostDk, fontFamily: font.mono, fontSize: 11.5, cursor: "pointer", padding: "0 9px" }}
          >
            <span style={{ color: color.textFaintDk }}>⎇</span>
            GitHub
          </button>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          {collab && <CollabBar status={collabApi.status} peers={collabApi.peers} mode={collab.mode} selfName={collab.displayName} selfColor={collab.color} />}
          <EngineStrip info={engineInfo} mempool={Object.keys(pending).length} />
        </div>
      </div>

      <div className="pix-ide-body" style={{ flex: 1, display: "grid", gridTemplateColumns: `${leftHidden ? 0 : explorerW}px ${leftHidden ? 0 : 5}px 1fr ${rightHidden ? 0 : 5}px ${rightHidden ? 0 : engineW}px`, minHeight: 0 }}>
        {/* Explorer + its resizer stay grid items even when hidden (col widths collapse to 0, content clips) —
            display:none here would remove them and shift the editor into the 0px column. */}
        <div style={{ minWidth: 0, overflow: "hidden", display: "grid" }}>
          <FileExplorer
            files={ws.files}
            active={ws.active}
            source={source}
            onSelect={selectFile}
            onCreate={createFile}
            onRename={renameFile}
            onDelete={deleteFile}
            onCreateFolder={createFolder}
            onDeleteFolder={deleteFolder}
            onRenameFolder={renameFolder}
            onDuplicate={duplicateFile}
            onMovePaths={movePaths}
            onCopyPaths={copyPaths}
            onDeletePaths={deletePaths}
            onJump={jumpToSymbol}
          />
        </div>

        <div className="pix-resizer" onMouseDown={(e) => startResize("explorer", e)} style={{ cursor: "col-resize", pointerEvents: leftHidden ? "none" : "auto" }} />

        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: color.panel }}>
          <EditorTabs tabs={openTabs} active={ws.active} dirty={isDirty} onSelect={selectFile} onClose={closeTab} />
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor value={source} path={ws.active} collab={!!collab} readOnly={collab?.mode === "view"} theme={resolveMonacoTheme(editorTheme, theme)} onChange={editSource} onMount={onEditorMount} />
          </div>

          {/* bottom panel — Problems (active file markers) + Analysis (workspace-wide static analysis) */}
          <div style={{ flex: "none", borderTop: hair(), background: color.panelDeep, display: "flex", flexDirection: "column", height: problemsOpen ? 190 : 30, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "stretch", height: 30, flex: "none", userSelect: "none", fontFamily: font.display, fontSize: 12.5 }}>
              <div onClick={() => { if (problemsOpen && bottomTab === "problems") { setProblemsOpen(false); } else { openBottom("problems"); } }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 12px", cursor: "pointer", color: bottomTab === "problems" ? color.textLightHi : color.textMutedDk, borderBottom: `2px solid ${problemsOpen && bottomTab === "problems" ? color.accent : "transparent"}` }}>
                <span style={{ width: 8, height: 8, flex: "none", background: errorCount ? "#f85149" : warnCount ? color.yellow : color.textGhostDk }} />
                <span>PROBLEMS</span>
                <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textGhostDk }}>{problems.length || ""}</span>
              </div>
              <div onClick={() => { if (problemsOpen && bottomTab === "analysis") { setProblemsOpen(false); } else { openBottom("analysis"); } }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 12px", cursor: "pointer", color: bottomTab === "analysis" ? color.textLightHi : color.textMutedDk, borderBottom: `2px solid ${problemsOpen && bottomTab === "analysis" ? color.accent : "transparent"}` }}>
                <span style={{ width: 8, height: 8, flex: "none", background: analysisCounts.error ? "#f85149" : analysisCounts.warn ? color.yellow : color.textGhostDk }} />
                <span>ANALYSIS</span>
                <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textGhostDk }}>{analysis.length || ""}</span>
              </div>
              <div onClick={() => setProblemsOpen((o) => !o)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, padding: "0 14px", cursor: "pointer", fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>
                {bottomTab === "analysis"
                  ? <><span style={{ color: analysisCounts.error ? "#f85149" : color.textGhostDk }}>⊘ {analysisCounts.error}</span><span style={{ color: analysisCounts.warn ? color.yellow : color.textGhostDk }}>⚠ {analysisCounts.warn}</span></>
                  : <><span style={{ color: errorCount ? "#f85149" : color.textGhostDk }}>⊘ {errorCount}</span><span style={{ color: warnCount ? color.yellow : color.textGhostDk }}>⚠ {warnCount}</span></>}
                <span style={{ fontSize: 10 }}>{problemsOpen ? "▾" : "▸"}</span>
              </div>
            </div>
            {problemsOpen && (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 0 8px" }}>
                {bottomTab === "analysis" ? (
                  <AnalysisPanel findings={analysis} onJump={jumpToMatch} />
                ) : problems.length === 0 ? (
                  <div style={{ padding: "4px 14px", fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>no problems detected</div>
                ) : (
                  [...problems].sort((a, b) => b.severity - a.severity || a.line - b.line).map((p, i) => (
                    <div key={i} onClick={() => goToProblem(p)} className="pix-problem-row" style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 14px", cursor: "pointer", fontFamily: font.mono, fontSize: 11, lineHeight: 1.5 }}>
                      <span style={{ flex: "none", color: p.severity === 8 ? "#f85149" : p.severity === 4 ? color.yellow : color.textMutedDk }}>{p.severity === 8 ? "⊘" : p.severity === 4 ? "⚠" : "ⓘ"}</span>
                      <span style={{ color: color.textMutedDk, wordBreak: "break-word" }}>{p.message}</span>
                      <span style={{ marginLeft: "auto", flex: "none", color: color.textGhostDk }}>{p.source}{p.code ? ` (${p.code})` : ""} · {p.line}:{p.col}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pix-resizer" onMouseDown={(e) => startResize("engine", e)} style={{ cursor: "col-resize", display: rightHidden ? "none" : "block" }} />

        <div style={{ borderLeft: hair(), background: color.panelDeep, display: rightHidden ? "none" : "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "11px 14px 9px", display: "flex", alignItems: "center", gap: 8, borderBottom: hair() }}>
            <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
            <span style={{ fontFamily: font.display, fontSize: 14, letterSpacing: ".02em", color: color.textLightHi }}>ENGINE</span>
            {collab && <span title="In collab the engine runs in your browser only — deploys, ticks and accounts aren't shared" style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>· local to you</span>}
            {sel && <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11, color: color.accent }}>{sel.name} · slot {sel.slot}</span>}
            <button
              onClick={() => setEngineLogOpen(true)}
              title="Virtual-engine log — ticks, epochs, deploys, txs, faults, dormant + digest skips"
              style={{ marginLeft: sel ? 8 : "auto", flex: "none", border: `1px solid ${color.hair2}`, background: color.panel, color: color.textMutedDk, fontFamily: font.mono, fontSize: 10.5, padding: "3px 8px", cursor: "pointer" }}
            >
              ⊟ log{engineLog.length ? ` ${engineLog.length}` : ""}
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {engineInfo && (
              <Section label="TESTNET" accent={color.hair2} borderWidth={2} open={!collapsed.testnet} onToggle={() => toggleSection("testnet")}>
                <EngineControls
                  paused={paused}
                  speed={speed}
                  info={engineInfo}
                  epochLen={epochLen}
                  onToggle={togglePause}
                  onStep={(n) => void stepTicks(n)}
                  onEpoch={() => void advanceEpoch()}
                  onReset={() => void resetChain()}
                  onReplay={() => void replayChain()}
                  onSpeed={changeSpeed}
                />
              </Section>
            )}

            {accounts.length > 0 && (
              <Section label="ACCOUNTS" accent={color.hair2} borderWidth={2} open={!collapsed.accounts} onToggle={() => toggleSection("accounts")}>
                <AccountsBar accounts={accounts} caller={caller} onSelect={setCaller} balances={balances} onFund={(id, qus) => void fundFromFaucet(id, qus)} />
              </Section>
            )}

            {phase === "compiling" && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: font.mono, fontSize: 12, color: buildQueue && buildQueue.active >= buildQueue.limit ? color.yellow : color.textMutedDk }}>
                <span style={{ width: 7, height: 7, flex: "none", background: buildQueue && buildQueue.active >= buildQueue.limit ? color.yellow : color.accent, animation: "nodePulse 1.4s ease-in-out infinite" }} />
                {buildQueue && buildQueue.active >= buildQueue.limit
                  ? `waiting for a build slot — ${buildQueue.queued} queued · ${buildQueue.active}/${buildQueue.limit} building`
                  : "compiling on the node toolchain…"}
              </div>
            )}

            {phase === "error" && (
              <div style={{ fontFamily: font.mono, fontSize: 11.5, color: "#f85149", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {result?.error ?? `${result?.diagnostics.length ?? 0} compile problem(s) — see the editor.`}
              </div>
            )}

            {sysCatalog.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: 0.5, color: color.textGhostDk, marginBottom: 5 }}>SYSTEM CONTRACTS</div>
                <SystemPicker catalog={sysCatalog} selected={sysSel} deployed={deployed} onToggle={(n) => void toggleSystem(n)} />
              </div>
            )}

            {Object.keys(deployed).length > 0 ? (
              <>
                <Section label="DEPLOYED" accent={color.hair2} open={!collapsed.deployed} onToggle={() => toggleSection("deployed")}>
                  <DeployedList deployed={deployed} selected={selected} onSelect={selectDeployed} />
                </Section>

                {!sel && (
                  <div style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textGhostDk, lineHeight: 1.6, padding: "2px 0" }}>
                    {contractName} isn't deployed yet — hit <span style={{ color: color.accent }}>▶ Compile &amp; Run</span> to deploy this contract.
                  </div>
                )}

                {sel && hasState(stateView[sel.name]) && (
                  <Section label="STATE" accent={color.hair2} open={!collapsed.state} onToggle={() => toggleSection("state")}>
                    <StatePanel dump={stateView[sel.name]} />
                  </Section>
                )}

                {assetsView.length > 0 && (
                  <Section label="ASSETS" accent={color.hair2} open={!collapsed.assets} onToggle={() => toggleSection("assets")}>
                    <AssetsPanel assets={assetsView} slotName={(slot) => Object.values(deployed).find((d) => d.slot === slot)?.name ?? `slot ${slot}`} fmtHolder={fmtHolder} />
                  </Section>
                )}

                {Object.keys(pending).length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${color.yellow}`, background: `${color.yellow}14`, fontFamily: font.mono, fontSize: 11, color: color.yellow }}>
                    <span style={{ width: 7, height: 7, flex: "none", background: color.yellow, animation: "nodePulse 1.4s ease-in-out infinite" }} />
                    {Object.keys(pending).length} tx in mempool — waiting for its tick
                  </div>
                )}

                {sel && (procedures.length > 0 || functions.length > 0) && (
                  <Section label="CALLS" accent={color.hair2} open={!collapsed.calls} onToggle={() => toggleSection("calls")}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {procedures.length > 0 && <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk }}>PROCEDURES</div>}
                      {procedures.map(([id, entry]) => {
                        const key = `${sel.name}:p:${id}`;
                        const pend = pending[key];
                        return (
                          <CallRow
                            key={`p${id}`}
                            kind="procedure"
                            id={id}
                            entry={entry}
                            busy={busy}
                            pending={!!pend}
                            output={pend ? pendingLabel(pend.targetTick) : outputs[key]}
                            detail={txDetail[key]}
                            onRun={(input, value) => runProcedure(id, entry, input, value)}
                            onDebug={(steps, title) => setDebug({ steps, title })}
                          />
                        );
                      })}

                      {functions.length > 0 && <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk, marginTop: 4 }}>FUNCTIONS</div>}
                      {functions.map(([id, entry]) => (
                        <CallRow key={`f${id}`} kind="function" id={id} entry={entry} busy={busy} output={outputs[`${sel.name}:f:${id}`]} onRun={(input) => runFunction(id, entry, input)} />
                      ))}
                    </div>
                  </Section>
                )}
              </>
            ) : (
              phase === "idle" && <PanelHint />
            )}

            {(sel || scenarios.some((s) => s.contract === contractName)) && (
              <Section label="SCENARIOS" accent={color.hair2} open={!collapsed.scenarios} onToggle={() => toggleSection("scenarios")}>
                <ScenarioPanel
                  scenarios={scenarios.filter((s) => s.contract === contractName)}
                  results={scenResults}
                  running={runningScen}
                  idl={sel?.idl ?? null}
                  contractName={contractName}
                  canCapture={!!sel}
                  onCapture={captureScenario}
                  onRun={(s) => void runScenario(s)}
                  onDelete={deleteScenario}
                  onAddAssert={addAssert}
                  onDeleteAssert={deleteAssert}
                />
              </Section>
            )}
          </div>

          {/* draggable divider — resize the console height */}
          <div onMouseDown={startResizeConsole} title="Drag to resize the console" style={{ height: 7, flex: "none", cursor: "row-resize", borderTop: frame(), background: color.panelDeep, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ width: 34, height: 2, background: color.hair2 }} />
          </div>

          {/* console — contract logs / run output, its own region with real room */}
          <div style={{ flex: `0 0 ${consoleH}px`, minHeight: 120, display: "flex", flexDirection: "column", background: color.void }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 7px" }}>
              <span style={{ width: 8, height: 8, flex: "none", background: color.secondary }} />
              <span style={{ fontFamily: font.display, fontSize: 13, letterSpacing: ".02em", color: color.textLightHi }}>CONSOLE</span>
              {log.length > 0 && (
                <button onClick={() => setLog([])} style={{ marginLeft: "auto", border: "none", background: "transparent", color: color.textGhostDk, fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", cursor: "pointer" }}>
                  CLEAR
                </button>
              )}
            </div>
            <div ref={consoleRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 14px 12px", fontFamily: font.mono, fontSize: 11, color: color.textMutedDk, lineHeight: 1.8 }}>
              {log.length === 0 ? (
                <div style={{ color: color.textGhostDk }}>— compile &amp; run to see output —</div>
              ) : (
                log.map((line, i) => (
                  <div key={i} style={{ wordBreak: "break-word", color: line.includes("failed") || line.includes("error") ? "#f85149" : line.startsWith("deployed") ? color.accent : color.textMutedDk }}>
                    <span style={{ color: color.textGhostDk }}>›</span> {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 16px", height: 30, borderTop: frame(), background: color.panelDeep, fontFamily: font.mono, fontSize: 11, color: color.textFaintDk, flex: "none" }}>
        <span style={{ color: phase === "ready" ? color.accent : phase === "error" ? "#f85149" : color.textFaintDk }}>
          ● {phase === "ready" ? "deployed" : phase === "compiling" ? "building" : phase === "error" ? "error" : "ready"}
        </span>
        <span>{contractName}</span>
        <span>C++ · qpi.h</span>
        {diag.state !== "idle" && (
          <span style={{ color: diag.state === "error" ? "#f85149" : diag.state === "ok" ? color.accent : color.textMutedDk }}>
            {diag.state === "checking" ? "◌ checking…" : diag.state === "ok" ? "✓ no errors" : `✕ ${diag.count} error${diag.count === 1 ? "" : "s"}`}
          </span>
        )}
        {result?.hash && <span>hash {result.hash.slice(0, 12)}</span>}
        <span style={{ marginLeft: "auto" }}>in-process engine</span>
      </div>

      {debug && <Debugger steps={debug.steps} title={debug.title} onClose={() => setDebug(null)} onJump={jumpToStep} onBack={debug.onBack} />}

      {showTxs && <TxExplorer txs={txLog} onClose={() => setShowTxs(false)} onDebug={(steps, title) => { setShowTxs(false); setDebug({ steps, title, onBack: () => { setDebug(null); setShowTxs(true); } }); }} />}
      {engineLogOpen && <EngineLog log={engineLog} onClose={() => setEngineLogOpen(false)} onClear={() => setEngineLog([])} />}

      {shareOpen && id && <ShareDialog projectId={id} isLive={!!collab} peerCount={collabApi.peers.length} onGoLive={() => { void goLive(); }} onClose={() => setShareOpen(false)} />}

      {testRun && <TestPanel results={testRun.results} running={testRun.running} title={testRun.title} onClose={() => setTestRun(null)} onRerun={() => void runTestFile()} />}

      {palette && (
        <CommandPalette
          items={paletteItems}
          placeholder={palette === "file" ? "Go to file…" : "Run a command…"}
          onClose={() => setPalette(null)}
        />
      )}

      {searchOpen && (
        <SearchPanel
          files={ws.files}
          query={searchQuery}
          caseSensitive={searchCase}
          regex={searchRegex}
          onQuery={setSearchQuery}
          onCase={setSearchCase}
          onRegex={setSearchRegex}
          onJump={jumpToMatch}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {github && (
        <GitHubDialog
          files={ws.files}
          signedIn={!!getToken()}
          initialTab={github}
          onImport={importFiles}
          onSignIn={() => login("github")}
          onClose={() => setGithub(null)}
        />
      )}
    </div>
  );
}

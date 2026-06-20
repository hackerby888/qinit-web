// The qinit browser IDE — a Remix-style editor for Qubic dynamic contracts. Write qpi.h C++, get live
// QPI diagnostics + IDL hover (./qpi), compile on the backend (./api), and deploy + test the wasm in
// this page via @qinit/engine (./engine). The engine/crypto modules are dynamically imported so a load
// failure degrades to "compile only" rather than breaking the editor.
import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { OnMount } from "@monaco-editor/react";
import type { IdlEntry, ContractIdl } from "@qinit/build/idl";
import { color, font } from "../landing/tokens";
import { PixelQMark, KEYFRAMES } from "../landing/components";
import { CodeEditor } from "./editor";
import { FileExplorer } from "./FileExplorer";
import { loadWorkspace, saveWorkspace, shareUrl, baseName, NEW_CONTRACT, type Workspace } from "./workspace";
import { setupQpi } from "./qpi";
import { compileContract, base64ToBytes, type CompileResult } from "./api";
import type { IdeEngine, Account, TxDetail, DeployImage, ReplayStep } from "./engine";
import { ScenarioPanel, loadScenarios, saveScenarios, compare, uid, type Scenario, type ScenarioResult, type AssertStep, type AssertResult, type CallStep } from "./scenarios";
import type { StateDump } from "@qinit/inspector";
import "../landing/pixel.css";

const FRAME = `3px solid ${color.ink}`;
const HAIR = `3px solid ${color.hair}`;
const SLOT_BASE = 28; // first dynamic slot; each distinct contract gets the next free one

type DeployedContract = { name: string; slot: number; address: string; idl: ContractIdl; source: string; wasm: Uint8Array };

const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);
const fmtQus = (b?: string): string => (b === undefined ? "…" : Number(b).toLocaleString("en-US"));

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

type Phase = "idle" | "compiling" | "ready" | "error";
type MonacoNS = Parameters<OnMount>[1];
type EditorRef = Parameters<OnMount>[0];

// One row of the Problems panel — a marker (qpi lexical/context, or clang) on the active model.
interface ProblemItem {
  severity: number; // monaco MarkerSeverity: 8 error, 4 warning, 2 info, 1 hint
  message: string;
  line: number;
  col: number;
  source: string;
  code: string;
}

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
        filter: `drop-shadow(${off}px ${off}px 0 ${accent ? color.accentShadow : "#000"})`,
        transform: `translate(${3 - off}px,${3 - off}px)`,
        transition: "transform .1s steps(2), filter .1s steps(2)",
      }}
    >
      <span style={{ display: "block", background: bg, color: fg, fontFamily: font.display, fontSize: 14, padding: "6px 16px" }}>
        {children}
      </span>
    </button>
  );
}

const fieldInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: color.void,
  border: `1px solid ${color.hair2}`,
  color: color.textLight,
  fontFamily: font.mono,
  fontSize: 11.5,
  padding: "4px 7px",
  outline: "none",
};

function CallRow({ kind, id, entry, busy, output, pending = false, detail, onRun }: {
  kind: "function" | "procedure";
  id: string;
  entry: IdlEntry;
  busy: boolean;
  output?: string;
  pending?: boolean;
  detail?: TxDetail;
  onRun: (input: Record<string, string>, value: number) => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [value, setValue] = useState("0");
  const accent = kind === "function" ? color.accent : color.secondary;

  return (
    <div style={{ border: `1px solid ${color.hair}`, background: color.panel, padding: 10, display: "flex", flexDirection: "column", gap: 7 }}>
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
            style={fieldInput}
          />
        </div>
      ))}

      {kind === "procedure" && (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textMutedDk, minWidth: 64 }}>value</span>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk, minWidth: 44 }}>qus</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" style={fieldInput} />
        </div>
      )}

      {output !== undefined && (
        <div style={{ fontFamily: font.mono, fontSize: 11.5, color: pending ? color.yellow : accent, wordBreak: "break-all" }}>{pending ? "⏳" : "→"} {output}</div>
      )}

      {detail && (
        <div style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textFaintDk, lineHeight: 1.6, borderTop: `1px solid ${color.hair}`, paddingTop: 5, display: "flex", flexDirection: "column", gap: 1 }}>
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
  if (!dump || (dump.fields.length === 0 && dump.cols.length === 0)) {
    return null;
  }
  return (
    <div style={{ border: `1px solid ${color.hair}`, background: color.panel, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk }}>STATE</div>
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

function PanelHint() {
  return (
    <div style={{ fontFamily: font.body, fontSize: 13, lineHeight: 1.6, color: color.textMutedDk }}>
      The Qubic SC engine runs in this page. Hit <span style={{ color: color.accent }}>Compile</span> to build your
      contract to wasm and deploy it in-browser — byte-identical to the node, feeless, instant.
    </div>
  );
}

const selectStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: color.void,
  color: color.textLight,
  border: `1px solid ${color.hair2}`,
  fontFamily: font.mono,
  fontSize: 11.5,
  padding: "4px 7px",
  outline: "none",
};

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
  return (
    <div style={{ border: `1px solid ${color.hair}`, background: color.panel, padding: 10, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk }}>ACCOUNTS · caller</div>
      <select value={caller} onChange={(e) => onSelect(e.target.value)} style={selectStyle}>
        {accounts.map((a, i) => (
          <option key={a.id} value={a.id}>{`acct ${i} · ${shortId(a.id)}`}</option>
        ))}
      </select>
      <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textMutedDk }}>
        balance <span style={{ color: color.accent }}>{fmtQus(balances[caller])}</span> qus
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>faucet</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="qus" style={fieldInput} />
        <button
          onClick={() => onFund(caller, Number(amount) || 0)}
          title="Credit this account from the testnet faucet"
          style={{ border: `2px solid ${color.ink}`, background: color.accent, color: color.void, fontFamily: font.display, fontSize: 12, padding: "3px 12px", cursor: "pointer", flex: "none" }}
        >
          +Fund
        </button>
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
  const ctlBtn: CSSProperties = {
    border: `1px solid ${color.hair2}`,
    background: color.void,
    color: color.textLight,
    fontFamily: font.mono,
    fontSize: 11,
    padding: "3px 8px",
    cursor: "pointer",
    flex: "none",
  };
  return (
    <div style={{ border: `1px solid ${color.hair}`, background: color.panel, padding: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk, width: "100%" }}>
        TESTNET · tick <span style={{ color: color.accent }}>{tick}</span> · epoch <span style={{ color: color.textMutedDk }}>{info?.epoch ?? 0}</span> <span style={{ color: color.textGhostDk }}>· {within}/{epochLen} to next</span>
      </span>
      <button onClick={onToggle} title={paused ? "Resume auto-tick" : "Pause auto-tick"} style={{ ...ctlBtn, background: paused ? color.accent : color.void, color: paused ? color.void : color.textLight }}>
        {paused ? "▶ run" : "⏸ pause"}
      </button>
      <button onClick={() => onStep(1)} title="Advance 1 tick" style={ctlBtn}>⏭ +1</button>
      <button onClick={() => onStep(10)} title="Advance 10 ticks" style={ctlBtn}>⏩ +10</button>
      <button onClick={onEpoch} title={`Jump to tick ${nextBoundary} (the next epoch boundary) — fires END_EPOCH → BEGIN_EPOCH`} style={ctlBtn}>⤓ epoch</button>
      <button onClick={onReset} title="Reset chain to genesis (re-deploy, re-run INITIALIZE)" style={ctlBtn}>↺ reset</button>
      <button onClick={onReplay} title="Replay every tx this session from genesis" style={ctlBtn}>↻ replay</button>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>
        speed
        <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))} style={{ ...ctlBtn, padding: "2px 4px" }}>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={5}>5×</option>
          <option value={10}>10×</option>
        </select>
      </span>
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
      <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk }}>DEPLOYED CONTRACTS</div>
      {Object.values(deployed).map((d) => {
        const on = d.name === selected;
        return (
          <div
            key={d.name}
            onClick={() => onSelect(d.name)}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", cursor: "pointer", border: `1px solid ${on ? color.accent : color.hair}`, background: on ? `${color.accent}12` : color.panel, fontFamily: font.mono, fontSize: 11.5 }}
          >
            <span style={{ width: 7, height: 7, flex: "none", background: on ? color.accent : color.textGhostDk }} />
            <span style={{ color: on ? color.accent : color.textLight }}>{d.name}</span>
            <span style={{ color: color.textGhostDk, fontSize: 10 }}>slot {d.slot}</span>
            <span style={{ marginLeft: "auto", color: color.textGhostDk, fontSize: 10 }}>{shortId(d.address)}</span>
          </div>
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
    <div className="pix-tabs" style={{ display: "flex", height: 36, flex: "none", borderBottom: HAIR, background: color.panelDeep, overflowX: "auto", overflowY: "hidden" }}>
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
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
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

export default function Ide() {
  const [ws, setWs] = useState<Workspace>(() => loadWorkspace());
  const [phase, setPhase] = useState<Phase>("idle");
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
  const [stateView, setStateView] = useState<Record<string, StateDump>>({});
  const [txDetail, setTxDetail] = useState<Record<string, TxDetail>>({});
  const [diag, setDiag] = useState<{ state: "idle" | "checking" | "ok" | "error"; count: number }>({ state: "idle", count: 0 });
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1); // auto-ticks per second
  const [epochLen, setEpochLen] = useState(3000); // ticks per epoch (from the engine)
  const [scenarios, setScenarios] = useState<Scenario[]>(() => loadScenarios());
  const [scenResults, setScenResults] = useState<Record<string, ScenarioResult>>({});
  const [runningScen, setRunningScen] = useState<string | null>(null);
  const [problems, setProblems] = useState<ProblemItem[]>([]);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [explorerW, setExplorerW] = useState(() => Number(localStorage.getItem("ide.explorerW")) || 210);
  const [engineW, setEngineW] = useState(() => Number(localStorage.getItem("ide.engineW")) || 340);
  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    try {
      const arr = JSON.parse(localStorage.getItem("ide.openTabs") ?? "null");
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
        return arr;
      }
    } catch {
      // corrupt storage — start empty, the reconcile effect seeds from the active file
    }
    return [];
  });
  const [built, setBuilt] = useState<Record<string, string>>({}); // last source per file that compiled clean — drives the dirty dot

  const editorRef = useRef<EditorRef | null>(null);
  const monacoRef = useRef<MonacoNS | null>(null);
  const engineRef = useRef<IdeEngine | null>(null);
  const engineInitRef = useRef<Promise<IdeEngine> | null>(null); // dedupe concurrent starts (StrictMode / fast compile)
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const deployedRef = useRef<Record<string, DeployedContract>>({});
  const stateRef = useRef<Record<string, StateDump>>({});

  // Auto-compile coordination (Remix-style background diagnostics). Refs so the debounce reads fresh
  // values without re-creating the callback.
  const sourceRef = useRef("");
  const contractNameRef = useRef("");
  const activeNameRef = useRef(""); // active file name (with extension) — keys the dirty-tracking `built` map
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

  // Persist the workspace (debounced) on every edit.
  useEffect(() => {
    const t = setTimeout(() => saveWorkspace(ws), 400);
    return () => clearTimeout(t);
  }, [ws]);

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

  const selectFile = (name: string) => {
    setOpenTabs((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setWs((w) => ({ ...w, active: name }));
  };

  // Picking a contract in the deployed list opens its source tab; the sync effect then points the panel
  // at it. Falls back to a bare select if no open file matches (e.g. the source was renamed/closed).
  const selectDeployed = (cn: string) => {
    const file = ws.files.find((f) => baseName(f.name) === cn);
    if (file) {
      selectFile(file.name);
    } else {
      setSelected(cn);
    }
  };

  const editSource = (src: string) => {
    setWs((w) => ({ ...w, files: w.files.map((f) => (f.name === w.active ? { ...f, source: src } : f)) }));
  };

  const createFile = (name: string) => {
    setOpenTabs((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setWs((w) => ({ files: [...w.files, { name, source: NEW_CONTRACT }], active: name }));
  };

  const renameFile = (oldName: string, newName: string) => {
    setWs((w) => ({
      files: w.files.map((f) => (f.name === oldName ? { ...f, name: newName } : f)),
      active: w.active === oldName ? newName : w.active,
    }));
    setBuilt((b) => {
      if (!(oldName in b)) {
        return b;
      }
      const { [oldName]: src, ...rest } = b;
      return { ...rest, [newName]: src };
    });
  };

  const deleteFile = (name: string) => {
    setWs((w) => {
      const files = w.files.filter((f) => f.name !== name);
      const active = w.active === name ? (files[0]?.name ?? "") : w.active;
      return { files, active };
    });
  };

  const share = async () => {
    const url = shareUrl(ws);
    try {
      await navigator.clipboard.writeText(url);
      appendLog("share link copied to clipboard");
    } catch {
      appendLog("share link: " + url);
    }
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
    appendLog("chain reset to genesis — contracts re-deployed, INITIALIZE re-run");
    await refreshEngineViews();
  };

  const replayChain = async () => {
    const eng = engineRef.current;
    if (!eng) {
      return;
    }
    appendLog("replaying the session from genesis…");
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

  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setupQpi(monaco, editor);
    import("./qpi/hover").then((m) => m.registerQpiHover(monaco)).catch(() => undefined);

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

  const errorCount = problems.filter((p) => p.severity === 8).length;
  const warnCount = problems.filter((p) => p.severity === 4).length;

  useEffect(() => {
    localStorage.setItem("ide.explorerW", String(explorerW));
  }, [explorerW]);
  useEffect(() => {
    localStorage.setItem("ide.engineW", String(engineW));
  }, [engineW]);
  useEffect(() => {
    localStorage.setItem("ide.openTabs", JSON.stringify(openTabs));
  }, [openTabs]);
  useEffect(() => {
    saveScenarios(scenarios);
  }, [scenarios]);

  // Keep the open-tabs list self-consistent with the workspace: drop tabs whose file is gone, and make
  // sure the active file is always an open tab. This lets the file handlers stay simple — selecting,
  // creating or deleting a file just updates `ws`, and the right tabs follow.
  useEffect(() => {
    setOpenTabs((prev) => {
      const valid = prev.filter((n) => ws.files.some((f) => f.name === n));
      const next = valid.includes(ws.active) ? valid : [...valid, ws.active];
      const same = next.length === prev.length && next.every((v, i) => v === prev[i]);
      return same ? prev : next;
    });
  }, [ws.files, ws.active]);

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
      res = await compileContract({ source: src, name, slot, skipVerify: true });
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
      eng.onTxProcessed = ({ key, name, tick, moneyFlew, detail }) => {
        setPending((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
        setOutputs((o) => ({ ...o, [key]: `applied ✓ @ tick ${tick}${moneyFlew ? " · moneyFlew" : ""}` }));
        appendLog(`${name}() processed @ tick ${tick}`);
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
      };
      eng.start();
      engineRef.current = eng;
      setEpochLen(eng.epochLength());
      const accs = await eng.ensureAccounts();
      setAccounts(accs);
      setCaller(accs[0]?.id ?? "");
      void refreshBalances(accs);
      setEngineInfo(await eng.info());
      return eng;
    })();
    return engineInitRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads only refs / stable setters; intentionally stable
  }, []);

  // Bring the testnet panel up on load — accounts funded, clock ticking, controls usable before any deploy.
  useEffect(() => {
    void ensureEngine().catch(() => undefined);
  }, [ensureEngine]);

  const compile = async () => {
    setPhase("compiling");
    const slot = assignSlot(deployed, contractName);

    // Reuse the background auto-compile's warm artifact when the source is unchanged — deploy is instant.
    const warm = warmRef.current;
    const cached = warm && warm.source === source && warm.name === contractName ? warm.res : null;
    if (cached) {
      appendLog(`deploying ${contractName} (slot ${slot}) — already built`);
    } else {
      appendLog(`compiling ${contractName} (slot ${slot})…`);
    }

    const res = cached ?? await compileContract({ source, name: contractName, slot, skipVerify: true });
    setResult(res);
    applyClangMarkers(res);

    if (!res.ok || !res.wasm || !res.idl) {
      setPhase("error");
      appendLog(res.error ?? `compile failed — ${res.diagnostics.length} problem(s)`);
      return;
    }
    const idlData = res.idl;

    try {
      const eng = await ensureEngine();
      const wasmBytes = base64ToBytes(res.wasm);
      await eng.deploy(slot, wasmBytes, idlData);
      const address = await eng.addressOf(slot);
      const reg = { ...deployedRef.current, [contractName]: { name: contractName, slot, address, idl: idlData, source, wasm: wasmBytes } };
      deployedRef.current = reg;
      setDeployed(reg);
      setSelected(contractName);
      setEngineInfo(await eng.info());
      setPhase("ready");
      setBuilt((b) => ({ ...b, [ws.active]: source })); // clears the active tab's dirty dot
      void refreshBalances(await eng.ensureAccounts());
      void refreshState(contractName);
      appendLog(`deployed ${idlData.name} → slot ${slot} · ${res.size} B · ${shortId(address)}`);
    } catch (e) {
      setPhase("error");
      appendLog("engine error: " + (e as Error).message);
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

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: color.void, color: color.textLight, fontFamily: font.body, overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <style dangerouslySetInnerHTML={{ __html: `.pix-resizer{transition:background .1s}.pix-resizer:hover{background:${color.accent}66}.pix-problem-row:hover{background:#ffffff0a}.pix-tabs::-webkit-scrollbar{height:0}.pix-tab:hover{background:#ffffff08}.pix-tab-x{opacity:0;transition:opacity .1s}.pix-tab:hover .pix-tab-x{opacity:1}.pix-tab:hover .pix-tab-dot{opacity:0}` }} />

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 16px", height: 54, borderBottom: FRAME, background: color.panelDeep, flex: "none" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <PixelQMark size={22} />
          <span style={{ fontFamily: font.display, fontSize: 19, color: color.textLightHi }}>qinit <span style={{ color: color.accent }}>ide</span></span>
        </Link>
        <span style={{ width: 1, height: 22, background: color.hair2 }} />
        <span style={{ fontFamily: font.mono, fontSize: 12.5, color: color.textMutedDk }}>{ws.active}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <ToolButton variant="accent" onClick={compile} disabled={phase === "compiling"}>
            {phase === "compiling" ? "Compiling…" : "▶ Compile & Run"}
          </ToolButton>
          <ToolButton onClick={share}>Share</ToolButton>
          <Link to="/docs" style={{ fontFamily: font.mono, fontSize: 12, color: color.textMutedDk, textDecoration: "none", marginLeft: 4 }}>Docs</Link>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: HAIR, background: color.panel, flex: "none" }}>
        <TrafficLights />
        <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textFaintDk, marginLeft: 6 }}>qinit ide — my-contract</span>
        <div style={{ marginLeft: "auto" }}>
          <EngineStrip info={engineInfo} mempool={Object.keys(pending).length} />
        </div>
      </div>

      <div className="pix-ide-body" style={{ flex: 1, display: "grid", gridTemplateColumns: `${explorerW}px 5px 1fr 5px ${engineW}px`, minHeight: 0 }}>
        <FileExplorer
          files={ws.files}
          active={ws.active}
          onSelect={selectFile}
          onCreate={createFile}
          onRename={renameFile}
          onDelete={deleteFile}
        />

        <div className="pix-resizer" onMouseDown={(e) => startResize("explorer", e)} style={{ cursor: "col-resize" }} />

        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: color.panel }}>
          <EditorTabs tabs={openTabs} active={ws.active} dirty={isDirty} onSelect={selectFile} onClose={closeTab} />
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor value={source} path={ws.active} onChange={editSource} onMount={onEditorMount} />
          </div>

          {/* problems panel — aggregated diagnostics (qpi + clang) under the editor; click a row to jump */}
          <div style={{ flex: "none", borderTop: HAIR, background: color.panelDeep, display: "flex", flexDirection: "column", height: problemsOpen ? 190 : 30, overflow: "hidden" }}>
            <div onClick={() => setProblemsOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, height: 30, padding: "0 14px", flex: "none", cursor: "pointer", userSelect: "none", fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".1em", color: color.textGhostDk }}>
              <span>{problemsOpen ? "▾" : "▸"} PROBLEMS</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                <span style={{ color: errorCount ? "#FF8B7E" : color.textGhostDk }}>⊘ {errorCount}</span>
                <span style={{ color: warnCount ? color.yellow : color.textGhostDk }}>⚠ {warnCount}</span>
              </span>
            </div>
            {problemsOpen && (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 6px 8px" }}>
                {problems.length === 0 ? (
                  <div style={{ padding: "4px 8px", fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>no problems detected</div>
                ) : (
                  [...problems].sort((a, b) => b.severity - a.severity || a.line - b.line).map((p, i) => (
                    <div key={i} onClick={() => goToProblem(p)} className="pix-problem-row" style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 8px", cursor: "pointer", fontFamily: font.mono, fontSize: 11, lineHeight: 1.5 }}>
                      <span style={{ flex: "none", color: p.severity === 8 ? "#FF8B7E" : p.severity === 4 ? color.yellow : color.textMutedDk }}>{p.severity === 8 ? "⊘" : p.severity === 4 ? "⚠" : "ⓘ"}</span>
                      <span style={{ color: color.textMutedDk, wordBreak: "break-word" }}>{p.message}</span>
                      <span style={{ marginLeft: "auto", flex: "none", color: color.textGhostDk }}>{p.source}{p.code ? ` (${p.code})` : ""} · {p.line}:{p.col}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pix-resizer" onMouseDown={(e) => startResize("engine", e)} style={{ cursor: "col-resize" }} />

        <div style={{ borderLeft: HAIR, background: color.panelDeep, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "12px 14px 8px", fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".12em", color: color.textGhostDk, display: "flex", justifyContent: "space-between" }}>
            <span>ENGINE</span>
            {sel && <span style={{ color: color.accent }}>{sel.name} · slot {sel.slot}</span>}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {engineInfo && (
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
            )}

            {phase === "compiling" && <div style={{ fontFamily: font.mono, fontSize: 12, color: color.textMutedDk }}>compiling on the node toolchain…</div>}

            {phase === "error" && (
              <div style={{ fontFamily: font.mono, fontSize: 11.5, color: "#FF8B7E", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {result?.error ?? `${result?.diagnostics.length ?? 0} compile problem(s) — see the editor.`}
              </div>
            )}

            {accounts.length > 0 && <AccountsBar accounts={accounts} caller={caller} onSelect={setCaller} balances={balances} onFund={(id, qus) => void fundFromFaucet(id, qus)} />}

            {Object.keys(deployed).length > 0 ? (
              <>
                <DeployedList deployed={deployed} selected={selected} onSelect={selectDeployed} />

                {!sel && (
                  <div style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textGhostDk, lineHeight: 1.6, padding: "2px 0" }}>
                    {contractName} isn't deployed yet — hit <span style={{ color: color.accent }}>▶ Compile &amp; Run</span> to deploy this contract.
                  </div>
                )}

                {sel && <StatePanel dump={stateView[sel.name]} />}

                {Object.keys(pending).length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${color.yellow}`, background: `${color.yellow}14`, fontFamily: font.mono, fontSize: 11, color: color.yellow }}>
                    <span style={{ width: 7, height: 7, flex: "none", background: color.yellow, animation: "nodePulse 1.4s ease-in-out infinite" }} />
                    {Object.keys(pending).length} tx in mempool — waiting for its tick
                  </div>
                )}

                {sel && procedures.length > 0 && (
                  <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk }}>PROCEDURES</div>
                )}
                {sel && procedures.map(([id, entry]) => {
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
                    />
                  );
                })}

                {sel && functions.length > 0 && (
                  <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk, marginTop: 4 }}>FUNCTIONS</div>
                )}
                {sel && functions.map(([id, entry]) => (
                  <CallRow key={`f${id}`} kind="function" id={id} entry={entry} busy={busy} output={outputs[`${sel.name}:f:${id}`]} onRun={(input) => runFunction(id, entry, input)} />
                ))}
              </>
            ) : (
              phase === "idle" && <PanelHint />
            )}

            {(sel || scenarios.some((s) => s.contract === contractName)) && (
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
            )}
          </div>

          {/* console — contract logs / run output, its own region with real room */}
          <div style={{ flex: "0 0 42%", minHeight: 160, display: "flex", flexDirection: "column", borderTop: FRAME, background: color.void }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px 6px", fontFamily: font.mono, fontSize: 10, letterSpacing: ".12em", color: color.textGhostDk }}>
              <span>CONSOLE</span>
              {log.length > 0 && (
                <button onClick={() => setLog([])} style={{ border: "none", background: "transparent", color: color.textGhostDk, fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", cursor: "pointer" }}>
                  CLEAR
                </button>
              )}
            </div>
            <div ref={consoleRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 14px 12px", fontFamily: font.mono, fontSize: 11, color: color.textMutedDk, lineHeight: 1.8 }}>
              {log.length === 0 ? (
                <div style={{ color: color.textGhostDk }}>— compile &amp; run to see output —</div>
              ) : (
                log.map((line, i) => (
                  <div key={i} style={{ wordBreak: "break-word", color: line.includes("failed") || line.includes("error") ? "#FF8B7E" : line.startsWith("deployed") ? color.accent : color.textMutedDk }}>
                    <span style={{ color: color.textGhostDk }}>›</span> {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 16px", height: 30, borderTop: FRAME, background: color.panelDeep, fontFamily: font.mono, fontSize: 11, color: color.textFaintDk, flex: "none" }}>
        <span style={{ color: phase === "ready" ? color.accent : phase === "error" ? "#FF8B7E" : color.textFaintDk }}>
          ● {phase === "ready" ? "deployed" : phase === "compiling" ? "building" : phase === "error" ? "error" : "ready"}
        </span>
        <span>{contractName}</span>
        <span>C++ · qpi.h</span>
        {diag.state !== "idle" && (
          <span style={{ color: diag.state === "error" ? "#FF8B7E" : diag.state === "ok" ? color.accent : color.textMutedDk }}>
            {diag.state === "checking" ? "◌ checking…" : diag.state === "ok" ? "✓ no errors" : `✕ ${diag.count} error${diag.count === 1 ? "" : "s"}`}
          </span>
        )}
        {result?.hash && <span>hash {result.hash.slice(0, 12)}</span>}
        <span style={{ marginLeft: "auto" }}>in-process engine</span>
      </div>
    </div>
  );
}

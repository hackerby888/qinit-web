// The qinit browser IDE — a Remix-style editor for Qubic dynamic contracts. Write qpi.h C++, get live
// QPI diagnostics + IDL hover (./qpi), compile on the backend (./api), and deploy + test the wasm in
// this page via @qinit/engine (./engine). The engine/crypto modules are dynamically imported so a load
// failure degrades to "compile only" rather than breaking the editor.
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
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
import type { IdeEngine, Account, TxDetail } from "./engine";
import type { StateDump } from "@qinit/inspector";
import "../landing/pixel.css";

const FRAME = `3px solid ${color.ink}`;
const HAIR = `3px solid ${color.hair}`;
const SLOT_BASE = 28; // first dynamic slot; each distinct contract gets the next free one

type DeployedContract = { name: string; slot: number; address: string; idl: ContractIdl; source: string };

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
// the engine faucet.
function AccountsBar({ accounts, caller, onSelect, balances }: {
  accounts: Account[];
  caller: string;
  onSelect: (id: string) => void;
  balances: Record<string, string>;
}) {
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

  const editorRef = useRef<EditorRef | null>(null);
  const monacoRef = useRef<MonacoNS | null>(null);
  const engineRef = useRef<IdeEngine | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const deployedRef = useRef<Record<string, DeployedContract>>({});
  const stateRef = useRef<Record<string, StateDump>>({});

  const appendLog = (line: string) => setLog((l) => [...l.slice(-200), line]);

  const activeFile = ws.files.find((f) => f.name === ws.active) ?? ws.files[0];
  const source = activeFile?.source ?? "";
  const contractName = baseName(ws.active);

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
    setWs((w) => ({ ...w, active: name }));
  };

  const editSource = (src: string) => {
    setWs((w) => ({ ...w, files: w.files.map((f) => (f.name === w.active ? { ...f, source: src } : f)) }));
  };

  const createFile = (name: string) => {
    setWs((w) => ({ files: [...w.files, { name, source: NEW_CONTRACT }], active: name }));
  };

  const renameFile = (oldName: string, newName: string) => {
    setWs((w) => ({
      files: w.files.map((f) => (f.name === oldName ? { ...f, name: newName } : f)),
      active: w.active === oldName ? newName : w.active,
    }));
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

  const compile = async () => {
    setPhase("compiling");
    const slot = assignSlot(deployed, contractName);
    appendLog(`compiling ${contractName} (slot ${slot})…`);

    const res = await compileContract({ source, name: contractName, slot });
    setResult(res);
    applyClangMarkers(res);

    if (!res.ok || !res.wasm || !res.idl) {
      setPhase("error");
      appendLog(res.error ?? `compile failed — ${res.diagnostics.length} problem(s)`);
      return;
    }
    const idlData = res.idl;

    try {
      const { IdeEngine } = await import("./engine");
      if (!engineRef.current) {
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
            detail.logs.forEach((l) => appendLog(`  log ${l}`));
          }
          eng.ensureAccounts().then((a) => refreshBalances(a)).catch(() => undefined);
          void refreshState(key.split(":")[0]);
        };
        eng.start();
        engineRef.current = eng;
        const accs = await eng.ensureAccounts();
        setAccounts(accs);
        setCaller(accs[0]?.id ?? "");
        void refreshBalances(accs);
      }

      const eng = engineRef.current;
      await eng.deploy(slot, base64ToBytes(res.wasm), idlData);
      const address = await eng.addressOf(slot);
      const reg = { ...deployedRef.current, [contractName]: { name: contractName, slot, address, idl: idlData, source } };
      deployedRef.current = reg;
      setDeployed(reg);
      setSelected(contractName);
      setEngineInfo(await eng.info());
      setPhase("ready");
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

      <div className="pix-ide-body" style={{ flex: 1, display: "grid", gridTemplateColumns: "210px 1fr 340px", minHeight: 0 }}>
        <FileExplorer
          files={ws.files}
          active={ws.active}
          onSelect={selectFile}
          onCreate={createFile}
          onRename={renameFile}
          onDelete={deleteFile}
        />

        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, background: color.panel }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderBottom: HAIR, background: color.panelDeep, fontFamily: font.mono, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, background: color.accent }} />
            <span style={{ color: color.textLight }}>{ws.active}</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor value={source} path={ws.active} onChange={editSource} onMount={onEditorMount} />
          </div>
        </div>

        <div style={{ borderLeft: HAIR, background: color.panelDeep, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "12px 14px 8px", fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".12em", color: color.textGhostDk, display: "flex", justifyContent: "space-between" }}>
            <span>ENGINE</span>
            {sel && <span style={{ color: color.accent }}>{sel.name} · slot {sel.slot}</span>}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {phase === "compiling" && <div style={{ fontFamily: font.mono, fontSize: 12, color: color.textMutedDk }}>compiling on the node toolchain…</div>}

            {phase === "error" && (
              <div style={{ fontFamily: font.mono, fontSize: 11.5, color: "#FF8B7E", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {result?.error ?? `${result?.diagnostics.length ?? 0} compile problem(s) — see the editor.`}
              </div>
            )}

            {accounts.length > 0 && <AccountsBar accounts={accounts} caller={caller} onSelect={setCaller} balances={balances} />}

            {Object.keys(deployed).length > 0 ? (
              <>
                <DeployedList deployed={deployed} selected={selected} onSelect={setSelected} />

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
        {result?.hash && <span>hash {result.hash.slice(0, 12)}</span>}
        <span style={{ marginLeft: "auto" }}>in-process engine</span>
      </div>
    </div>
  );
}

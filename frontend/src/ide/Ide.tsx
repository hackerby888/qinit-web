// The qinit browser IDE — a Remix-style editor for Qubic dynamic contracts. Write qpi.h C++, get live
// QPI diagnostics + IDL hover (./qpi), compile on the backend (./api), and deploy + test the wasm in
// this page via @qinit/engine (./engine). The engine/crypto modules are dynamically imported so a load
// failure degrades to "compile only" rather than breaking the editor.
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { OnMount } from "@monaco-editor/react";
import type { IdlEntry } from "@qinit/build/idl";
import { color, font } from "../landing/tokens";
import { PixelQMark, KEYFRAMES } from "../landing/components";
import { CodeEditor } from "./editor";
import { EXAMPLES, type Example } from "./examples";
import { setupQpi } from "./qpi";
import { compileContract, base64ToBytes, type CompileResult } from "./api";
import type { IdeEngine } from "./engine";
import "../landing/pixel.css";

const FRAME = `3px solid ${color.ink}`;
const HAIR = `3px solid ${color.hair}`;

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

function FileTree({ active, onPick }: { active: string; onPick: (e: Example) => void }) {
  return (
    <div style={{ borderRight: HAIR, background: color.panelDeep, padding: "14px 0", fontFamily: font.mono, fontSize: 12.5, overflowY: "auto" }}>
      <div style={{ padding: "0 14px 10px", color: color.textGhostDk, letterSpacing: ".12em", fontSize: 10.5 }}>EXPLORER</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px", color: color.textMutedDk }}>
        <span style={{ width: 8, height: 8, background: color.textGhostDk, flex: "none" }} />my-contract
      </div>
      <div style={{ paddingLeft: 26, padding: "2px 0 2px 26px", color: color.textGhostDk, fontSize: 11 }}>contracts</div>
      {EXAMPLES.map((e) => {
        const on = e.file === active;
        return (
          <div
            key={e.file}
            onClick={() => onPick(e)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", paddingLeft: 40, cursor: "pointer", background: on ? `${color.accent}1a` : "transparent", color: on ? color.accent : color.textMutedDk }}
          >
            <span style={{ width: 8, height: 8, background: on ? color.accent : color.textGhostDk, flex: "none" }} />{e.file}
          </div>
        );
      })}
    </div>
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

function CallRow({ kind, id, entry, busy, output, pending = false, onRun }: {
  kind: "function" | "procedure";
  id: string;
  entry: IdlEntry;
  busy: boolean;
  output?: string;
  pending?: boolean;
  onRun: (input: Record<string, string>) => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const accent = kind === "function" ? color.accent : color.secondary;

  return (
    <div style={{ border: `1px solid ${color.hair}`, background: color.panel, padding: 10, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 7, height: 7, background: accent, flex: "none" }} />
        <span style={{ fontFamily: font.mono, fontSize: 12.5, color: color.textLight }}>{entry.name}</span>
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>#{id} · {kind === "function" ? "read" : "write"}</span>
        <button
          onClick={() => onRun(vals)}
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

      {output !== undefined && (
        <div style={{ fontFamily: font.mono, fontSize: 11.5, color: pending ? color.yellow : accent, wordBreak: "break-all" }}>{pending ? "⏳" : "→"} {output}</div>
      )}
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

export default function Ide() {
  const [active, setActive] = useState<Example>(EXAMPLES[0]);
  const [source, setSource] = useState<string>(EXAMPLES[0].source);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<CompileResult | null>(null);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [engineInfo, setEngineInfo] = useState<{ tick: number; epoch: number } | null>(null);
  const [pending, setPending] = useState<Record<string, { name: string; targetTick: number }>>({});

  const editorRef = useRef<EditorRef | null>(null);
  const monacoRef = useRef<MonacoNS | null>(null);
  const engineRef = useRef<IdeEngine | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);

  const appendLog = (line: string) => setLog((l) => [...l.slice(-200), line]);

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

  const pick = (e: Example) => {
    setActive(e);
    setSource(e.source);
    setPhase("idle");
    setResult(null);
    setOutputs({});
    setPending({});
    clearClangMarkers();
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

  const clearClangMarkers = () => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (monaco && model) {
      monaco.editor.setModelMarkers(model, "clang", []);
    }
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
    setOutputs({});
    setLog([]);
    appendLog(`compiling ${active.name}…`);

    const res = await compileContract({ source, name: active.name, slot: active.slot });
    setResult(res);
    applyClangMarkers(res);

    if (!res.ok || !res.wasm || !res.idl) {
      setPhase("error");
      appendLog(res.error ?? `compile failed — ${res.diagnostics.length} problem(s)`);
      return;
    }

    try {
      const { IdeEngine } = await import("./engine");
      if (!engineRef.current) {
        const eng = new IdeEngine();
        eng.onTick = (info) => setEngineInfo(info);
        eng.onTxProcessed = ({ key, name, tick, moneyFlew }) => {
          setPending((p) => {
            const next = { ...p };
            delete next[key];
            return next;
          });
          setOutputs((o) => ({ ...o, [key]: `applied ✓ @ tick ${tick}${moneyFlew ? " · moneyFlew" : ""}` }));
          appendLog(`${name}() processed @ tick ${tick} — invocation ran in tickdata`);
        };
        eng.start();
        engineRef.current = eng;
      }
      await engineRef.current.deploy(active.slot, base64ToBytes(res.wasm), res.idl);
      setEngineInfo(await engineRef.current.info());
      setPhase("ready");
      appendLog(`deployed ${res.idl.name} → slot ${active.slot} · ${res.size} B · hash ${res.hash?.slice(0, 12)}`);
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

  const runFunction = async (id: string, entry: IdlEntry, input: Record<string, string>) => {
    if (!engineRef.current) {
      return;
    }
    setBusy(true);
    try {
      const out = await engineRef.current.callFunction(active.slot, id, entry, coerce(entry, input));
      const text = formatOut(out);
      setOutputs((p) => ({ ...p, [`f:${id}`]: text }));
      appendLog(`${entry.name}() → ${text}`);
    } catch (e) {
      appendLog(`${entry.name} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const runProcedure = async (id: string, entry: IdlEntry, input: Record<string, string>) => {
    if (!engineRef.current) {
      return;
    }
    setBusy(true);
    try {
      const { targetTick } = await engineRef.current.submitProcedure(active.slot, id, entry, coerce(entry, input), `p:${id}`);
      setPending((p) => ({ ...p, [`p:${id}`]: { name: entry.name, targetTick } }));
      setOutputs((o) => {
        const next = { ...o };
        delete next[`p:${id}`];
        return next;
      });
      appendLog(`${entry.name}() submitted to mempool → lands @ tick ${targetTick}`);
    } catch (e) {
      appendLog(`${entry.name} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const idl = result?.idl;
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
        <span style={{ fontFamily: font.mono, fontSize: 12.5, color: color.textMutedDk }}>{active.file}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <ToolButton variant="accent" onClick={compile} disabled={phase === "compiling"}>
            {phase === "compiling" ? "Compiling…" : "▶ Compile & Run"}
          </ToolButton>
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

      <div className="pix-ide-body" style={{ flex: 1, display: "grid", gridTemplateColumns: "210px 1fr 318px", minHeight: 0 }}>
        <FileTree active={active.file} onPick={pick} />

        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, background: color.panel }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderBottom: HAIR, background: color.panelDeep, fontFamily: font.mono, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, background: color.accent }} />
            <span style={{ color: color.textLight }}>{active.file}</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor value={source} onChange={setSource} onMount={onEditorMount} />
          </div>
        </div>

        <div style={{ borderLeft: HAIR, background: color.panelDeep, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "12px 14px 8px", fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".12em", color: color.textGhostDk, display: "flex", justifyContent: "space-between" }}>
            <span>ENGINE</span>
            {phase === "ready" && idl && <span style={{ color: color.accent }}>{idl.name} · slot {active.slot}</span>}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {phase === "idle" && <PanelHint />}
            {phase === "compiling" && <div style={{ fontFamily: font.mono, fontSize: 12, color: color.textMutedDk }}>compiling on the node toolchain…</div>}

            {phase === "error" && (
              <div style={{ fontFamily: font.mono, fontSize: 11.5, color: "#FF8B7E", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {result?.error ?? `${result?.diagnostics.length ?? 0} compile problem(s) — see the editor.`}
              </div>
            )}

            {phase === "ready" && (
              <>
                {Object.keys(pending).length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: `1px solid ${color.yellow}`, background: `${color.yellow}14`, fontFamily: font.mono, fontSize: 11, color: color.yellow }}>
                    <span style={{ width: 7, height: 7, flex: "none", background: color.yellow, animation: "nodePulse 1.4s ease-in-out infinite" }} />
                    {Object.keys(pending).length} tx in mempool — waiting for its tick
                  </div>
                )}

                {procedures.length > 0 && (
                  <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk }}>PROCEDURES</div>
                )}
                {procedures.map(([id, entry]) => {
                  const key = `p:${id}`;
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
                      onRun={(input) => runProcedure(id, entry, input)}
                    />
                  );
                })}

                {functions.length > 0 && (
                  <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: ".1em", color: color.textGhostDk, marginTop: 4 }}>FUNCTIONS</div>
                )}
                {functions.map(([id, entry]) => (
                  <CallRow key={`f${id}`} kind="function" id={id} entry={entry} busy={busy} output={outputs[`f:${id}`]} onRun={(input) => runFunction(id, entry, input)} />
                ))}
              </>
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
        <span>{active.name}</span>
        <span>C++ · qpi.h</span>
        {result?.hash && <span>hash {result.hash.slice(0, 12)}</span>}
        <span style={{ marginLeft: "auto" }}>in-process engine</span>
      </div>
    </div>
  );
}

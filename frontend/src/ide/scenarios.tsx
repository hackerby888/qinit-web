// Scenario runner — saved contract tests built on the engine's reset/replay. A scenario is an ordered
// list of writes (captured from what you ran) plus assertions on function outputs. Running one resets the
// chain to genesis, replays the writes, then checks each assertion → pass/fail. Persisted per browser.
import { useState, type CSSProperties } from "react";
import type { ContractIdlView as ContractIdl, EntryView as IdlEntry } from "./idl-view";
import { color, font } from "../landing/tokens";
import { InputFields } from "./InputFields";
import type { InputDraft } from "./input-values";

export type Op = "==" | "!=" | ">" | "<" | ">=" | "<=";
export const OPS: Op[] = ["==", "!=", ">", "<", ">=", "<="];

// A captured write (procedure call) — enough to re-submit it against a fresh chain.
export interface CallStep {
  procId: string;
  procName: string;
  input: InputDraft;
  callerSeed: string;
  callerLabel: string;
  value: number | string; // qu as typed digits; older saves hold a number
}

// An expectation: call a function, read one output field, compare it.
export interface AssertStep {
  fnId: string;
  fnName: string;
  input: InputDraft;
  field: string;
  op: Op;
  expected: string;
}

export interface Scenario {
  id: string;
  name: string;
  contract: string; // deployed contract name this scenario drives
  calls: CallStep[];
  asserts: AssertStep[];
}

export interface AssertResult {
  ok: boolean;
  actual: string;
}

export interface ScenarioResult {
  results: AssertResult[];
  error?: string;
}

// Scenarios are persisted inside the project document (see projects/store.ts), not in their own key.
export const uid = (): string => Math.random().toString(36).slice(2, 9);

// Compare a function's actual output against the expected literal. Numeric when both sides parse as
// numbers (the common case — counters, balances); otherwise string equality for ==/!=.
export function compare(op: Op, actual: unknown, expected: string): boolean {
  const a = Number(actual);
  const b = Number(expected);
  const numeric = !Number.isNaN(a) && !Number.isNaN(b) && String(expected).trim() !== "";
  if (numeric) {
    switch (op) {
      case "==": return a === b;
      case "!=": return a !== b;
      case ">": return a > b;
      case "<": return a < b;
      case ">=": return a >= b;
      case "<=": return a <= b;
    }
  }
  const sa = String(actual);
  if (op === "==") {
    return sa === expected;
  }
  if (op === "!=") {
    return sa !== expected;
  }
  return false;
}

// The add-an-assertion form for one scenario: pick a function, fill its inputs, choose an output field +
// comparison + expected value.
function AssertForm({ idl, onAdd }: { idl: ContractIdl; onAdd: (a: AssertStep) => void }) {
  const fnIds = Object.keys(idl.functions);

  // Built per render so a live theme swap recolors the form fields.
  const tinyInput: CSSProperties = {
    flex: 1,
    minWidth: 0,
    background: color.void,
    border: `1px solid ${color.hair2}`,
    color: color.textLight,
    fontFamily: font.mono,
    fontSize: 11,
    padding: "3px 6px",
    outline: "none",
  };

  const [fnId, setFnId] = useState(fnIds[0] ?? "");
  const [input, setInput] = useState<InputDraft>({});
  const [field, setField] = useState("");
  const [op, setOp] = useState<Op>("==");
  const [expected, setExpected] = useState("");

  const entry: IdlEntry | undefined = idl.functions[fnId];
  const outFields = entry?.outFields ?? [];
  const fieldName = field || outFields[0]?.name || "";

  const add = () => {
    if (!entry || !fieldName) {
      return;
    }
    onAdd({ fnId, fnName: entry.name, input, field: fieldName, op, expected });
    setExpected("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: `1px solid ${color.hair}`, paddingTop: 6, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk, minWidth: 40 }}>expect</span>
        <select value={fnId} onChange={(e) => { setFnId(e.target.value); setField(""); setInput({}); }} style={tinyInput}>
          {fnIds.map((id) => (
            <option key={id} value={id}>{idl.functions[id].name}()</option>
          ))}
        </select>
      </div>

      {entry && <InputFields fields={entry.inFields} draft={input} onChange={setInput} compact />}

      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <select value={fieldName} onChange={(e) => setField(e.target.value)} style={tinyInput} title="output field">
          {outFields.length ? outFields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>) : <option value="">(no output)</option>}
        </select>
        <select value={op} onChange={(e) => setOp(e.target.value as Op)} style={{ ...tinyInput, flex: "none", width: 48 }}>
          {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="expected" style={tinyInput} />
        <button onClick={add} title="Add assertion" style={{ border: `1px solid ${color.hair2}`, background: color.void, color: color.accent, fontFamily: font.mono, fontSize: 12, padding: "3px 8px", cursor: "pointer", flex: "none" }}>+</button>
      </div>
    </div>
  );
}

export function ScenarioPanel({ scenarios, results, running, idl, contractName, canCapture, onCapture, onRun, onDelete, onAddAssert, onDeleteAssert }: {
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
  running: string | null;
  idl: ContractIdl | null;
  contractName: string | null;
  canCapture: boolean;
  onCapture: () => void;
  onRun: (s: Scenario) => void;
  onDelete: (id: string) => void;
  onAddAssert: (id: string, a: AssertStep) => void;
  onDeleteAssert: (id: string, idx: number) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={onCapture}
        disabled={!canCapture}
        title={canCapture ? `Capture the writes you ran on ${contractName} as a test` : `Run a procedure on ${contractName ?? "a contract"} first — there is nothing to capture yet`}
        style={{ alignSelf: "flex-start", border: `1px solid ${color.hair2}`, background: color.void, color: canCapture ? color.accent : color.textFaintDk, fontFamily: font.mono, fontSize: 10.5, padding: "3px 8px", cursor: canCapture ? "pointer" : "default" }}
      >
        + capture session
      </button>

      {scenarios.length === 0 && (
        <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textGhostDk, lineHeight: 1.5 }}>
          Run some procedures, then <span style={{ color: color.accent }}>capture</span> them as a test. Add assertions and re-run from a clean chain after editing the contract.
        </div>
      )}

      {scenarios.map((s) => {
        const r = results[s.id];
        const pass = r && !r.error ? r.results.filter((x) => x.ok).length : 0;
        const total = r && !r.error ? r.results.length : 0;
        const allOk = r && !r.error && total > 0 && pass === total;
        const badge = !r ? null : r.error ? `✗ ${r.error}` : total === 0 ? "ran · no asserts" : `${allOk ? "✓" : "✗"} ${pass}/${total}`;
        const isOpen = open === s.id;
        return (
          <div key={s.id} style={{ border: `1px solid ${color.hair}`, background: color.void, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span onClick={() => setOpen(isOpen ? null : s.id)} style={{ cursor: "pointer", color: color.textGhostDk, fontFamily: font.mono, fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
              <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLight }}>{s.name}</span>
              <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>{s.calls.length} call{s.calls.length === 1 ? "" : "s"} · {s.asserts.length} assert{s.asserts.length === 1 ? "" : "s"}</span>
              {badge && <span style={{ fontFamily: font.mono, fontSize: 10.5, color: r?.error ? "#f85149" : allOk ? color.accent : "#f85149" }}>{badge}</span>}
              <button onClick={() => onRun(s)} disabled={running === s.id} title="Reset chain, replay calls, check assertions" style={{ marginLeft: "auto", border: `2px solid ${color.ink}`, background: color.accent, color: color.void, fontFamily: font.display, fontSize: 11, padding: "2px 9px", cursor: running === s.id ? "default" : "pointer" }}>
                {running === s.id ? "…" : "▶ run"}
              </button>
              <button onClick={() => onDelete(s.id)} title="Delete scenario" style={{ border: "none", background: "transparent", color: color.textGhostDk, cursor: "pointer", fontFamily: font.mono, fontSize: 13 }}>×</button>
            </div>

            {isOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 16 }}>
                {s.calls.map((c, i) => (
                  <div key={i} style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textMutedDk }}>
                    <span style={{ color: color.secondary }}>call</span> {c.procName}({Object.entries(c.input).map(([k, v]) => `${k}=${v}`).join(", ")}){String(c.value) !== "0" ? ` · ${c.value} qus` : ""} <span style={{ color: color.textGhostDk }}>from {c.callerLabel}</span>
                  </div>
                ))}
                {s.asserts.map((a, i) => {
                  const ar = r && !r.error ? r.results[i] : undefined;
                  return (
                    <div key={`a${i}`} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font.mono, fontSize: 10.5 }}>
                      <span style={{ color: color.accent }}>expect</span>
                      <span style={{ color: color.textMutedDk }}>{a.fnName}({Object.entries(a.input).map(([k, v]) => `${k}=${v}`).join(", ")}).{a.field} {a.op} {a.expected}</span>
                      {ar && <span style={{ color: ar.ok ? color.accent : "#f85149" }}>{ar.ok ? "✓" : `✗ got ${ar.actual}`}</span>}
                      <button onClick={() => onDeleteAssert(s.id, i)} title="Remove" style={{ marginLeft: "auto", border: "none", background: "transparent", color: color.textGhostDk, cursor: "pointer", fontFamily: font.mono, fontSize: 12 }}>×</button>
                    </div>
                  );
                })}
                {idl && s.contract === contractName ? (
                  <AssertForm idl={idl} onAdd={(a) => onAddAssert(s.id, a)} />
                ) : (
                  <div style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk, paddingTop: 4 }}>
                    {s.contract === contractName ? `Compile & Run ${s.contract} to add assertions and run` : `switch to ${s.contract} to edit this scenario`}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

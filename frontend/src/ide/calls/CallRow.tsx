// one callable entry of the selected contract: its input form, the run/stop button and the frame of its last call.
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { color, font } from "../../ui/tokens";
import { edged, fieldInput, shortId } from "../chrome";
import type { DebugStep, TxDetail } from "../engine/proxy";
import type { EntryView as IdlEntry } from "./idl-view";
import { InputFields } from "./InputFields";
import type { InputDraft } from "./input-values";

// how long a call may run before the row offers to stop it.
export const STOP_OFFER_MS = 2000;

export function CallRow({ kind, id, entry, busy, disabled, output, detail, onRun, onStop, onDebug }: {
  kind: "function" | "procedure";
  id: string;
  entry: IdlEntry;
  busy: boolean;
  disabled: boolean;
  output?: string;
  detail?: TxDetail;
  onRun: (input: InputDraft, value: string) => void;
  onStop: () => void;
  onDebug?: (steps: DebugStep[], title: string) => void;
}) {
  const [vals, setVals] = useState<InputDraft>({});
  const [value, setValue] = useState(""); // empty, so the "0" placeholder shows as a hint
  const [slow, setSlow] = useState(false);
  const accent = kind === "function" ? color.accent : color.secondary;

  useEffect(() => {
    setSlow(false);
    if (!busy) {
      return;
    }
    const timer = setTimeout(() => setSlow(true), STOP_OFFER_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <div style={{ ...edged(accent, color.hair), background: color.panel, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 7, height: 7, background: accent, flex: "none" }} />
        <span style={{ fontFamily: font.mono, fontSize: 12.5, color: color.textLight }}>{entry.name}</span>
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>#{id} · {kind === "function" ? "read" : "write"}</span>
        {busy && slow && (
          <button onClick={onStop} title="Stop this call — the chain is rebuilt from the session's earlier calls" style={{ marginLeft: "auto", border: `1px solid ${color.hair2}`, background: color.void, color: "#f85149", fontFamily: font.mono, fontSize: 11, padding: "3px 8px", cursor: "pointer" }}>■ stop</button>
        )}
        <button
          onClick={() => onRun(vals, value)}
          disabled={disabled}
          aria-busy={busy}
          style={{ marginLeft: busy && slow ? 0 : "auto", minWidth: 64, border: `2px solid ${color.ink}`, background: accent, color: color.void, fontFamily: font.display, fontSize: 12, padding: "3px 10px", cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: disabled && !busy ? 0.55 : 1 }}
        >
          {busy ? <><LoaderCircle className="pix-call-spinner" size={13} strokeWidth={2.5} /><span>{kind === "function" ? "Calling" : "Running"}</span></> : kind === "function" ? "Call" : "Run"}
        </button>
      </div>

      <InputFields fields={entry.inFields} draft={vals} onChange={setVals} />

      {kind === "procedure" && (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textMutedDk, minWidth: 64 }}>value</span>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk, minWidth: 44 }}>qus</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" style={fieldInput()} />
        </div>
      )}

      {output !== undefined && (
        <div style={{ fontFamily: font.mono, fontSize: 11.5, color: accent, wordBreak: "break-all" }}>→ {output}</div>
      )}

      {detail && (
        <div style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textFaintDk, lineHeight: 1.6, borderTop: `1px solid ${color.hair}`, paddingTop: 5, display: "flex", flexDirection: "column", gap: 1 }}>
          {onDebug && detail.steps && detail.steps.length > 0 && (
            <button onClick={() => onDebug(detail.steps, `${entry.name}()`)} title="Step through this transaction" style={{ alignSelf: "flex-start", border: `1px solid ${color.hair2}`, background: color.void, color: color.accent, fontFamily: font.mono, fontSize: 10.5, padding: "2px 8px", cursor: "pointer", marginBottom: 4 }}>🐞 step debug</button>
          )}
          {detail.caller && detail.caller !== "(none)" && <div>caller <span style={{ color: color.textMutedDk }}>{shortId(detail.caller)}</span></div>}
          {detail.in && detail.in !== "(none)" && <div>in <span style={{ color: color.textMutedDk }}>{detail.in}</span></div>}
          {detail.out && detail.out !== "(none)" && <div>out <span style={{ color: color.textMutedDk }}>{detail.out}</span></div>}
          {detail.diff.map((d, i) => <div key={i} style={{ color: color.accent }}>Δ {d.label}: {d.text}</div>)}
          {detail.hostCalls.map((h, i) => <div key={`h${i}`} style={{ color: color.textMutedDk }}>host {h}</div>)}
          {detail.logs.map((l, i) => <div key={`l${i}`} style={{ color: color.secondary }}>log {l}</div>)}
          {detail.callees.map((callee) => (
            <div key={callee.seq} style={{ paddingLeft: 10, borderLeft: `1px solid ${color.hair2}`, marginTop: 2 }}>
              <div style={{ color: color.textMutedDk }}>↳ {callee.contract}.{callee.label}{callee.ok ? "" : " (failed)"}</div>
              {callee.diff.map((d, i) => <div key={i} style={{ color: color.accent }}>Δ {d.label}: {d.text}</div>)}
              {callee.logs.map((l, i) => <div key={`l${i}`} style={{ color: color.secondary }}>log {l}</div>)}
            </div>
          ))}
          {detail.prints.map((line, i) => <div key={`p${i}`} style={{ color: color.yellow, whiteSpace: "pre-wrap" }}>print {line}</div>)}
        </div>
      )}
    </div>
  );
}

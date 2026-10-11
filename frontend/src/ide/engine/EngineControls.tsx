// Deterministic testnet controls (Remix has none — we own the chain in-page). Pause/step time, jump an
// epoch to fire BEGIN/END_EPOCH hooks, and reset/replay the whole session against a fresh chain.
import { FastForward } from "lucide-react";
import { color, font } from "../../ui/tokens";
import { NeoBtn } from "../../ui/modals";
import type { EngineTickInfo } from "./proxy";

export function EngineControls({ paused, speed, info, epochLen, pendingEpochLen, onToggle, onStep, onEpoch, onEpochLen, onReset, onReplay, onSpeed }: {
  paused: boolean;
  speed: number;
  info: EngineTickInfo | null;
  epochLen: number;
  pendingEpochLen: number;
  onEpochLen: (typed: string) => void;
  onToggle: () => void;
  onStep: (n: number) => void;
  onEpoch: () => void;
  onReset: () => void;
  onReplay: () => void;
  onSpeed: (ticksPerSec: number) => void;
}) {
  const tick = info?.tick ?? 0;
  // the node's own epoch bounds: the first tick moves with every switch, so `tick % length` drifts.
  const within = info ? Math.min(epochLen, tick - info.epochFirstTick) : 0;
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

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>
          <span>ticks/epoch</span>
          <input
            type="number"
            min={1}
            value={pendingEpochLen}
            onChange={(e) => onEpochLen(e.target.value)}
            title="Ticks per epoch. A short epoch reaches END_EPOCH without ticking thousands of times."
            style={{ width: 62, border: `1px solid ${color.hair2}`, background: color.void, color: color.textLight, fontFamily: font.mono, fontSize: 10.5, padding: "2px 4px", outline: "none" }}
          />
          {pendingEpochLen !== epochLen && <span style={{ color: color.secondary }}>applies on ↺ reset</span>}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
          <NeoBtn onClick={onToggle} active={paused} title={paused ? "Resume auto-tick" : "Pause auto-tick"}>{paused ? "▶ run" : "⏸ pause"}</NeoBtn>
          <NeoBtn onClick={() => onStep(1)} title="Advance 1 tick">⏭ +1</NeoBtn>
          <NeoBtn onClick={() => onStep(10)} title="Advance 10 ticks"><span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#f5a623" }}><FastForward size={11} fill="#f5a623" /> +10</span></NeoBtn>
          <NeoBtn onClick={onEpoch} accent={color.secondary} title={`Jump into epoch ${(info?.epoch ?? 0) + 1} — fires END_EPOCH → BEGIN_EPOCH`}>⤓ epoch</NeoBtn>
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

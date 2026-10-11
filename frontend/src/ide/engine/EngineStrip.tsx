// In-process engine clock — the single-authority dev testnet your contracts deploy to. Time is
// explicit (advances on tick/invoke), so this reflects engine state, not a wall clock.
import { color, font } from "../../ui/tokens";
import { infoPopoverStyle } from "../chrome";
import type { EngineMemoryUsage } from "./proxy";

export interface IdeMemoryUsage {
  engine: EngineMemoryUsage;
  pageHeapBytes?: number;
}

export function formatMemory(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
  const mib = bytes / (1024 * 1024);
  if (mib < 1024) return `${mib < 100 ? mib.toFixed(1) : Math.round(mib)} MiB`;
  return `${(mib / 1024).toFixed(2)} GiB`;
}

export function memorySnapshot(engine: EngineMemoryUsage): IdeMemoryUsage {
  const pm = typeof performance === "undefined" ? undefined : (performance as Performance & {
    memory?: { usedJSHeapSize: number };
  }).memory;
  return {
    engine,
    pageHeapBytes: pm?.usedJSHeapSize,
  };
}

export function EngineStrip({ info, memory }: { info: { tick: number; epoch: number } | null; memory: IdeMemoryUsage | null }) {
  const live = !!info;
  const ideBytes = memory ? memory.engine.linearMemoryBytes + (memory.pageHeapBytes ?? 0) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: font.mono, fontSize: 11, color: color.textFaintDk }}>
      <span style={{ width: 7, height: 7, flex: "none", background: live ? color.accent : color.swatchOff, animation: live ? "nodePulse 2s ease-in-out infinite" : undefined }} />
      <span style={{ color: color.textMutedDk, letterSpacing: ".14em" }}>IN-PROCESS</span>
      {info ? (
        <>
          <span><span style={{ color: color.textGhostDk }}>tick </span><span style={{ color: color.accent }}>{info.tick.toLocaleString("en-US")}</span></span>
          <span><span style={{ color: color.textGhostDk }}>epoch </span><span style={{ color: color.textMutedDk }}>{info.epoch}</span></span>
          {memory && (
            <span
              className="pix-info-hover"
              tabIndex={0}
              aria-label="IDE page RAM breakdown"
              style={{ position: "relative", cursor: "default", outline: "none" }}
            >
              <span style={{ color: color.textGhostDk, borderBottom: `1px dotted ${color.textGhostDk}` }}>ram </span>
              <span style={{ color: color.textMutedDk }}>{memory.pageHeapBytes === undefined ? "≥ " : ""}{formatMemory(ideBytes)}</span>
              <span className="pix-info-popover" role="tooltip" style={infoPopoverStyle(330)}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 16, color: color.textLightHi }}>
                  <span>IDE PAGE RAM {memory.pageHeapBytes === undefined ? "LOWER BOUND" : "ESTIMATE"}</span>
                  <span style={{ color: color.accent }}>{formatMemory(ideBytes)}</span>
                </span>
                <span style={{ height: 1, background: color.hair2 }} />
                <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>virtual-node Wasm</span><span>{formatMemory(memory.engine.linearMemoryBytes)} exact</span></span>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>contract state</span><span>{formatMemory(memory.engine.stateBytes)}</span></span>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>deployed contracts</span><span>{memory.engine.contractCount}</span></span>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>page JS heap</span><span>{memory.pageHeapBytes === undefined ? "unavailable" : `${formatMemory(memory.pageHeapBytes)} estimate`}</span></span>
              </span>
            </span>
          )}
        </>
      ) : (
        <span style={{ color: color.textGhostDk }}>idle · compile to start</span>
      )}
    </div>
  );
}

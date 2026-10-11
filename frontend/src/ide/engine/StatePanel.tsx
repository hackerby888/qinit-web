// The qinit `state` inspector inline — a deployed contract's decoded StateData (scalars + container
// columns), refreshed after every transaction, build and manual step. Reuses the CLI's readState decoder.
import type { DecodedState as StateDump } from "@qinit/inspector/state-read";
import { color, font } from "../../ui/tokens";

export function StatePanel({ dump }: { dump?: StateDump }) {
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
        {dump.containers.map((c) => (
          <div key={c.name} style={{ fontFamily: font.mono, fontSize: 11 }}>
            <div style={{ color: color.secondary }}>{c.name} <span style={{ color: color.textGhostDk }}>({c.totalEntries})</span></div>
            {c.lines.map((line, i) => (
              <div key={i} style={{ color: color.textMutedDk, paddingLeft: 10, wordBreak: "break-all" }}>{line.label} {line.text}</div>
            ))}
            {c.error && <div style={{ color: "#f85149", paddingLeft: 10 }}>{c.error}</div>}
          </div>
        ))}
    </div>
  );
}

// True when a state dump has anything worth showing (gates the STATE section).
export function hasState(dump?: StateDump): boolean {
  return !!dump && (dump.fields.length > 0 || dump.containers.length > 0);
}

// Built-in system contracts (QX, QEARN, …) the user can host on the in-browser virtual node — toggle chips.
// On = selected/deployed (compiled in the browser, run in-page). Ctrl+click opens the contract's source in a
// read-only popup instead of toggling. A real node embeds these; this is dev-only.
import { color, font } from "../../ui/tokens";
import type { DeployedContract } from "../engine/slots";
import type { SystemContractEntry } from "./system-api";

export function SystemPicker({ catalog, selected, deployed, onToggle, onView }: {
  catalog: SystemContractEntry[];
  selected: string[];
  deployed: Record<string, DeployedContract>;
  onToggle: (name: string) => void;
  onView: (name: string) => void;
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
            onClick={(e) => ((e.ctrlKey || e.metaKey) ? onView(c.name) : onToggle(c.name))}
            title={`${c.name} · slot ${c.index} — ${on ? "deployed (click to remove)" : "click to compile + deploy"} · Ctrl+click to view the source`}
            style={{ padding: "2px 7px", border: `1px solid ${on ? color.accent : color.hair}`, background: on ? `${color.accent}14` : color.panel, color: on ? color.accent : color.textLight, cursor: "pointer", fontFamily: font.mono, fontSize: 10.5, lineHeight: 1.5 }}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

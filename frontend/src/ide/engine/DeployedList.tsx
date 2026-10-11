// The deployed-contracts list (Remix's "Deployed Contracts") — each compile&deploy registers one; click
// to drive its call form.
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { color, font } from "../../ui/tokens";
import { edged, fmtQus, shortId } from "../chrome";
import type { DeployedContract } from "./slots";

export function DeployedList({ deployed, selected, balances, onSelect }: {
  deployed: Record<string, DeployedContract>;
  selected: string | null;
  balances: Record<string, string>;
  onSelect: (name: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      setTimeout(() => setCopied(null), 1200);
    } catch {}
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Object.values(deployed).map((d) => {
        const on = d.name === selected;
        return (
          <div
            key={d.name}
            onClick={() => onSelect(d.name)}
            style={{ display: "flex", flexDirection: "column", gap: 3, padding: "6px 9px", cursor: "pointer", ...edged(on ? color.accent : color.hair2, on ? color.accent : color.hair), background: on ? `${color.accent}14` : color.panel, fontFamily: font.mono, fontSize: 11.5 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 7, height: 7, flex: "none", background: on ? color.accent : color.textGhostDk }} />
              <span style={{ color: on ? color.accent : color.textLight }}>{d.name}</span>
              <span style={{ color: color.textGhostDk, fontSize: 10 }}>slot {d.slot}</span>
              <span style={{ marginLeft: "auto", color: color.textGhostDk, fontSize: 10 }}>{shortId(d.address)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); void copyAddress(d.address); }}
                title={copied === d.address ? "Copied!" : "Copy the contract's full 60-char address"}
                style={{ flex: "none", display: "flex", alignItems: "center", border: "none", background: "transparent", color: copied === d.address ? color.accent : color.textGhostDk, cursor: "pointer", padding: 0 }}
              >
                {copied === d.address ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </div>
            <div style={{ color: color.textGhostDk, fontSize: 10, paddingLeft: 14 }}>balance <span style={{ color: color.textMutedDk }}>{fmtQus(balances[d.address])}</span> qus</div>
            {d.calls && d.calls.length > 0 && (
              <div style={{ color: color.secondary, fontSize: 10, paddingLeft: 14 }}>→ calls {d.calls.join(", ")}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

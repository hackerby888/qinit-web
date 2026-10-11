// The asset universe — every issued asset (qpi.issueAsset) and its share holdings. Global, not per-contract:
// assets live in the spectrum universe, not a contract's state. `mgr` is the contract managing a holding
// (the ownership-management slot). Refreshes together with balances and state.
import { color, font } from "../../ui/tokens";
import type { AssetView } from "./proxy";

export function AssetsPanel({ assets, slotName, fmtHolder }: { assets: AssetView[]; slotName: (slot: number) => string; fmtHolder: (hex: string) => string }) {
  if (assets.length === 0) {
    return null;
  }
  const num = (s: string): string => Number(s).toLocaleString("en-US");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {assets.map((a) => (
          <div key={a.issuer + a.name} style={{ fontFamily: font.mono, fontSize: 11, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ color: color.yellow, fontSize: 12 }}>{a.name}</span>
              <span style={{ color: color.textGhostDk }}>by {fmtHolder(a.issuer)}</span>
              <span style={{ marginLeft: "auto", color: color.accent }}>{num(a.totalShares)} sh</span>
            </div>
            {a.holdings.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 8, paddingLeft: 12, color: color.textMutedDk }}>
                <span style={{ color: color.textGhostDk }}>{fmtHolder(h.owner)}</span>
                <span style={{ color: color.secondary }}>{num(h.shares)}</span>
                <span style={{ marginLeft: "auto", color: color.textGhostDk }}>mgr {slotName(h.ownMgmt)}</span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

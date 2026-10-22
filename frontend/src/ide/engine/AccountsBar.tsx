// Pick the caller for a write + see its balance (Remix's account dropdown). Dev accounts are funded by
// the engine faucet; the +fund control tops the selected account up with more qus straight from it.
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { color, font } from "../../ui/tokens";
import { NeoBtn } from "../../ui/modals";
import { fieldInput, fmtQus, selectStyle, shortId } from "../chrome";
import type { Account } from "./proxy";

export function AccountsBar({ accounts, caller, onSelect, balances, onFund }: {
  accounts: Account[];
  caller: string;
  onSelect: (id: string) => void;
  balances: Record<string, string>;
  onFund: (id: string, qus: string) => void;
}) {
  const [amount, setAmount] = useState("1000000000");
  const [copied, setCopied] = useState(false);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(caller);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select value={caller} onChange={(e) => onSelect(e.target.value)} style={{ ...selectStyle(), flex: 1, minWidth: 0 }}>
            {accounts.map((a, i) => (
              <option key={a.id} value={a.id}>{`acct ${i} · ${shortId(a.id)}`}</option>
            ))}
          </select>
          <button
            onClick={() => void copyId()}
            title={copied ? "Copied!" : "Copy the full 60-char account id"}
            style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: `1px solid ${color.hair2}`, background: color.panel, color: copied ? color.accent : color.textMutedDk, cursor: "pointer" }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textMutedDk }}>
          balance <span style={{ color: color.accent }}>{fmtQus(balances[caller])}</span> qus
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>faucet</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="qus" style={fieldInput()} />
          <NeoBtn onClick={() => onFund(caller, amount)} active accent={color.action} title="Credit this account from the testnet faucet">+Fund</NeoBtn>
        </div>
    </div>
  );
}

// The Share dialog — create / copy / revoke view + edit links, set an expiry, and start a live session.
// Backed by shareApi (the backend share endpoints). The engine note clarifies that only file edits are
// shared; each collaborator keeps their own engine sandbox.
import { useEffect, useState, type CSSProperties } from "react";
import { color, font } from "../landing/tokens";
import { Card, NeoBtn } from "./ui";
import { createShareLink, listShareLinks, revokeShareLink, shareUrlFor, type ShareLink, type ShareMode } from "./shareApi";

const TTL_OPTIONS: { label: string; ms?: number }[] = [
  { label: "No expiry" },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
];

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#000000B0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
  padding: 20,
};

function relExpiry(expiresAt?: number): string {
  if (!expiresAt) {
    return "no expiry";
  }
  const ms = expiresAt - Date.now();
  if (ms <= 0) {
    return "expired";
  }
  const h = Math.round(ms / (60 * 60 * 1000));
  if (h < 1) {
    return "expires <1h";
  }
  if (h < 24) {
    return `expires ~${h}h`;
  }
  return `expires ~${Math.round(h / 24)}d`;
}

export function ShareDialog({ projectId, isLive, peerCount, onGoLive, onClose }: {
  projectId: string;
  isLive: boolean;
  peerCount: number;
  onGoLive: () => void;
  onClose: () => void;
}) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [ttlIdx, setTtlIdx] = useState(0);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const [err, setErr] = useState("");

  const refresh = async () => {
    try {
      setLinks(await listShareLinks(projectId));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
      setLinks([]);
    }
  };

  useEffect(() => {
    void refresh();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (mode: ShareMode) => {
    setBusy(mode);
    try {
      await createShareLink(projectId, mode, TTL_OPTIONS[ttlIdx].ms);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const revoke = async (linkId: string) => {
    setBusy(linkId);
    try {
      await revokeShareLink(projectId, linkId);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const copy = async (linkId: string) => {
    try {
      await navigator.clipboard.writeText(shareUrlFor(linkId));
    } catch {
      // clipboard blocked — the URL is still visible in the row
    }
    setCopied(linkId);
    setTimeout(() => setCopied(""), 1200);
  };

  const editLink = links?.find((l) => l.mode === "edit") ?? null;
  const viewLink = links?.find((l) => l.mode === "view") ?? null;

  const linkRow = (label: string, accent: string, blurb: string, mode: ShareMode, link: ShareLink | null) => (
    <div style={{ border: `1px solid ${color.hair2}`, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 9, height: 9, flex: "none", background: accent }} />
        <span style={{ fontFamily: font.display, fontSize: 14, color: color.textLightHi }}>{label}</span>
        <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>{blurb}</span>
      </div>

      {link ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: font.mono, fontSize: 11, color: color.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {shareUrlFor(link.linkId)}
          </span>
          <span style={{ flex: "none", fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>{relExpiry(link.expiresAt)}</span>
          <NeoBtn onClick={() => void copy(link.linkId)} title="Copy link">{copied === link.linkId ? "copied" : "copy"}</NeoBtn>
          <NeoBtn onClick={() => void revoke(link.linkId)} disabled={busy === link.linkId} title="Revoke link" accent="#f85149">revoke</NeoBtn>
        </div>
      ) : (
        <NeoBtn onClick={() => void create(mode)} disabled={busy === mode} active title={`Create a ${mode} link`}>
          {busy === mode ? "creating…" : `create ${mode} link`}
        </NeoBtn>
      )}
    </div>
  );

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "100%" }}>
        <Card frame={color.accentDeep} shadow={6}>
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 11, height: 11, flex: "none", background: color.accent }} />
              <span style={{ fontFamily: font.display, fontSize: 18, color: color.textLightHi }}>Share project</span>
              <div style={{ flex: 1 }} />
              {isLive ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font.mono, fontSize: 11, color: color.accent }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color.accent }} />
                  live{peerCount ? ` · ${peerCount + 1} editing` : ""}
                </span>
              ) : (
                <NeoBtn onClick={onGoLive} active title="Join the live room so collaborators see your edits">start live session</NeoBtn>
              )}
              <button onClick={onClose} title="Close" style={{ all: "unset", cursor: "pointer", marginLeft: 4, fontFamily: font.mono, fontSize: 14, color: color.textGhostDk, padding: "2px 4px" }}>✕</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>new links expire</span>
              <select
                value={ttlIdx}
                onChange={(e) => setTtlIdx(Number(e.target.value))}
                style={{ background: color.void, border: `1px solid ${color.hair2}`, color: color.textLight, fontFamily: font.mono, fontSize: 11, padding: "4px 6px", outline: "none" }}
              >
                {TTL_OPTIONS.map((o, i) => (
                  <option key={i} value={i}>{o.label}</option>
                ))}
              </select>
            </div>

            {linkRow("Edit — live collaboration", color.accent, "anyone with the link can edit", "edit", editLink)}
            {linkRow("View — read-only", color.yellow, "live, read-only", "view", viewLink)}

            <div style={{ fontFamily: font.mono, fontSize: 10.5, color: color.textFaintDk, lineHeight: 1.5 }}>
              The engine sandbox — deploys, ticks, accounts — is local to each person. Only file edits are shared.
            </div>

            {err && <div style={{ fontFamily: font.mono, fontSize: 11, color: "#f85149" }}>error: {err}</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

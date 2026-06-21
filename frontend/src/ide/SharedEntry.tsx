// The /ide/s/:linkId entry. Resolves a share link, gates anonymous guests behind a name prompt, then renders
// the editor in collab mode (edit = live multi-user; view = live read-only). Signed-in users skip the name
// prompt and collaborate under their account name.
import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { color, font } from "../landing/tokens";
import { NeoBtn } from "./ui";
import Ide from "./Ide";
import { resolveShare, type ResolvedShare } from "./shareApi";
import { fetchMe, type Me } from "./auth";
import { colorFor } from "./collab";
import type { CollabCtx } from "./useCollab";

const wrap: CSSProperties = { minHeight: "100vh", background: color.void, color: color.textLight, fontFamily: font.body, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div style={wrap}>
      <span style={{ fontFamily: font.mono, fontSize: 14, color: color.textGhostDk }}>{children}</span>
    </div>
  );
}

export default function SharedEntry() {
  const { linkId } = useParams<{ linkId: string }>();
  const [share, setShare] = useState<ResolvedShare | "loading" | "missing">("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState<string>(() => localStorage.getItem("qinit.guest.name") ?? "");
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    void (async () => {
      setMe(await fetchMe());
      const r = linkId ? await resolveShare(linkId) : null;
      setShare(r ?? "missing");
    })();
  }, [linkId]);

  if (share === "loading") {
    return <Splash>opening shared project…</Splash>;
  }
  if (share === "missing") {
    return <Splash>this link is invalid or has expired.</Splash>;
  }

  // Anonymous guest: ask for a display name once (so others see a labeled cursor).
  if (!me && !entered) {
    const go = () => {
      localStorage.setItem("qinit.guest.name", name.trim() || "Guest");
      setEntered(true);
    };
    return (
      <div style={wrap}>
        <div style={{ width: 340, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 14, border: `1px solid ${color.hair2}`, background: color.panel, padding: 24 }}>
          <span style={{ fontFamily: font.display, fontSize: 18, color: color.textLightHi }}>Join “{share.name}”</span>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk }}>
            {share.mode === "edit" ? "You'll be able to edit this project live with others." : "Read-only — you'll see edits as they happen."}
          </span>
          <input
            autoFocus
            value={name}
            placeholder="Your name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                go();
              }
            }}
            style={{ background: color.void, border: `1px solid ${color.accentDeep}`, color: color.textLight, fontFamily: font.mono, fontSize: 13, padding: "8px 10px", outline: "none" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <NeoBtn onClick={go} active title="Enter the session">join →</NeoBtn>
          </div>
        </div>
      </div>
    );
  }

  const finalName = me?.name ?? (name.trim() || "Guest");
  const ctx: CollabCtx = {
    linkId: linkId!,
    mode: share.mode,
    displayName: finalName,
    color: colorFor(finalName + (me?.id ?? "guest")),
  };
  return <Ide collab={ctx} />;
}

// The projects home screen (gallery) shown at /ide. Lists the user's contract projects as neo-brutalist
// cards — open, rename, duplicate, delete, export — plus create-new and import. Opening one routes to the
// editor at /ide/p/:id. All storage goes through the async ProjectStore, so this UI is unchanged when a
// cloud backend is added later.
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { color, font } from "../landing/tokens";
import { PixelQMark, KEYFRAMES } from "../landing/components";
import { Card, NeoBtn } from "./ui";
import { SplashScreen } from "./Splash";
import { getStore, getLocalStore } from "./projects/store";
import { captureAuthRedirect, fetchMe, login, logout, onAuthExpired, type Me } from "./auth";
import { exportProject, importProjectFile } from "./projects/io";
import type { ProjectMeta } from "./projects/types";
import { decodeSharedWorkspace } from "./workspace";
import { STARTER } from "./examples";
import { Toasts } from "./Toasts";
import { OfflineBanner } from "./OfflineBanner";
import { notify, errorMessage } from "./notify";
import "../landing/pixel.css";

function rel(ms: number): string {
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000);
  if (m < 1) {
    return "just now";
  }
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    return `${h}h ago`;
  }
  const days = Math.floor(h / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const inlineInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: color.void,
  border: `1px solid ${color.accentDeep}`,
  color: color.textLight,
  fontFamily: font.mono,
  fontSize: 13,
  padding: "4px 7px",
  outline: "none",
};

export default function Projects() {
  const navigate = useNavigate();
  const [metas, setMetas] = useState<ProjectMeta[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [authErr, setAuthErr] = useState<string>("");
  const [loadErr, setLoadErr] = useState<string>("");
  const [expired, setExpired] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [importPrompt, setImportPrompt] = useState<ProjectMeta[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [splash, setSplash] = useState<{ label: string; go: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const wasAuthed = useRef(false);
  const importUser = useRef<Me | null>(null);

  const reload = useCallback(async () => {
    try {
      setMetas(await getStore().list());
      setLoadErr("");
    } catch (e) {
      setLoadErr((e as Error).message);
      setMetas((prev) => prev ?? []);
    }
  }, []);

  // On first login, offer to copy local projects into the cloud account (once per account). Opens a modal
  // rather than a native confirm; the actual copy runs in runImport once the user chooses.
  const offerImport = useCallback(async (user: Me) => {
    const flag = `qinit.import.${user.id}`;
    if (localStorage.getItem(flag)) {
      return;
    }
    const [cloud, local] = await Promise.all([getStore().list(), getLocalStore().list()]);
    if (cloud.length === 0 && local.length > 0) {
      importUser.current = user;
      setImportPrompt(local);
    } else {
      localStorage.setItem(flag, "done");
    }
  }, []);

  const runImport = async () => {
    const user = importUser.current;
    const local = importPrompt;
    setImportPrompt(null);
    if (!user || !local) {
      return;
    }
    try {
      for (const m of local) {
        const p = await getLocalStore().load(m.id);
        if (p) {
          const cp = await getStore().create(p.name, p.files);
          cp.active = p.active;
          cp.openTabs = p.openTabs;
          cp.scenarios = p.scenarios;
          await getStore().save(cp);
        }
      }
      localStorage.setItem(`qinit.import.${user.id}`, "done");
    } catch (e) {
      setLoadErr(`import failed: ${(e as Error).message}`);
    }
    await reload();
  };

  const skipImport = () => {
    const user = importUser.current;
    if (user) {
      localStorage.setItem(`qinit.import.${user.id}`, "done");
    }
    setImportPrompt(null);
  };

  useEffect(() => {
    void (async () => {
      const redir = captureAuthRedirect();
      if (redir.error) {
        setAuthErr(redir.error);
      }
      const user = await fetchMe();
      setMe(user);
      if (user) {
        wasAuthed.current = true;
        await offerImport(user);
      }

      // A `#p=` share URL lands here — import it as a new project and open it.
      const shared = decodeSharedWorkspace();
      if (shared) {
        const p = await getStore().create("Shared project", shared.files);
        if (shared.active && shared.files.some((f) => f.name === shared.active)) {
          p.active = shared.active;
          p.openTabs = [shared.active];
          await getStore().save(p);
        }
        await getStore().setCurrentId(p.id);
        navigate(`/ide/p/${p.id}`);
        return;
      }
      await reload();
    })();
  }, [reload, navigate, offerImport]);

  // A cloud request rejected the token mid-session — drop to the local store and warn (only if we were
  // actually signed in, so a stale token on first load just quietly reverts to local).
  useEffect(() => {
    const off = onAuthExpired(() => {
      setMe(null);
      if (wasAuthed.current) {
        wasAuthed.current = false;
        setExpired(true);
      }
      void reload();
    });
    return off;
  }, [reload]);

  const signOut = () => {
    logout();
    setMe(null);
    wasAuthed.current = false;
    void reload();
  };

  // Both entries route through a short branded splash (a deliberate window to preload the workspace later).
  const open = async (id: string) => {
    try {
      await getStore().setCurrentId(id);
      setSplash({ label: "Opening workspace", go: () => navigate(`/ide/p/${id}`) });
    } catch (e) {
      notify.error(errorMessage(e, "Couldn't open the project"));
    }
  };

  // "standard" (the default click) seeds a Counter contract + its TS test + its C++ gtest; "dev" (the
  // bottom-right region) seeds the full example playground (all the starter contracts).
  const create = async (mode: "standard" | "dev" = "standard") => {
    try {
      const n = (metas?.length ?? 0) + 1;
      const seed = mode === "standard" ? STARTER.map((e) => ({ name: e.file, source: e.source })) : undefined;
      const p = await getStore().create(`Project ${n}`, seed);
      await getStore().setCurrentId(p.id);
      setSplash({ label: "Creating workspace", go: () => navigate(`/ide/p/${p.id}`) });
    } catch (e) {
      notify.error(errorMessage(e, "Couldn't create the project"));
    }
  };

  const duplicate = async (id: string) => {
    try {
      await getStore().duplicate(id);
      await reload();
    } catch (e) {
      notify.error(errorMessage(e, "Couldn't duplicate the project"));
    }
  };

  const del = async (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"? This can't be undone.`)) {
      try {
        await getStore().remove(id);
        await reload();
      } catch (e) {
        notify.error(errorMessage(e, "Couldn't delete the project"));
      }
    }
  };

  const startRename = (m: ProjectMeta) => {
    setRenaming(m.id);
    setDraft(m.name);
  };

  const commitRename = async (id: string) => {
    const name = draft.trim();
    if (name) {
      try {
        await getStore().rename(id, name);
        await reload();
      } catch (e) {
        notify.error(errorMessage(e, "Couldn't rename the project"));
      }
    }
    setRenaming(null);
  };

  const exportOne = async (id: string) => {
    try {
      const p = await getStore().load(id);
      if (p) {
        exportProject(p);
      }
    } catch (e) {
      notify.error(errorMessage(e, "Couldn't export the project"));
    }
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    try {
      await importProjectFile(file);
      await reload();
    } catch (err) {
      window.alert(`Import failed: ${(err as Error).message}`);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: color.void, color: color.textLight, fontFamily: font.body }}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <style dangerouslySetInnerHTML={{ __html: `::-webkit-scrollbar{width:11px;height:11px}::-webkit-scrollbar-track{background:${color.void}}::-webkit-scrollbar-thumb{background:${color.hair2};border:3px solid ${color.void}}::-webkit-scrollbar-thumb:hover{background:${color.accent}}::-webkit-scrollbar-corner{background:${color.void}}*{scrollbar-width:thin;scrollbar-color:${color.hair2} ${color.void}}` }} />
      <Toasts />
      <OfflineBanner />
      {splash && <SplashScreen label={splash.label} onDone={splash.go} />}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      {importPrompt && <ImportModal count={importPrompt.length} onImport={() => void runImport()} onSkip={skipImport} />}
      {expired && (
        <ExpiredToast
          onSignIn={() => {
            setExpired(false);
            setLoginOpen(true);
          }}
          onDismiss={() => setExpired(false)}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 22px", height: 54, borderBottom: `3px solid ${color.ink}`, background: color.panelDeep }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <PixelQMark size={22} />
          <span style={{ fontFamily: font.display, fontSize: 19, color: color.textLightHi }}>qinit <span style={{ color: color.accent }}>ide</span></span>
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onImport} style={{ display: "none" }} />
          <NeoBtn onClick={() => fileRef.current?.click()} title="Import a .qinit.json project">⤒ import</NeoBtn>
          {me ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {me.avatar && <img src={me.avatar} alt="" referrerPolicy="no-referrer" style={{ width: 22, height: 22, borderRadius: "50%", flex: "none" }} />}
              <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textLight, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={me.email ?? me.name}>{me.name}</span>
              <NeoBtn onClick={signOut} title="Sign out">sign out</NeoBtn>
            </div>
          ) : (
            <NeoBtn onClick={() => setLoginOpen(true)} active title="Sign in to sync your projects">sign in</NeoBtn>
          )}
          <Link to="/docs" style={{ fontFamily: font.mono, fontSize: 12, color: color.textMutedDk, textDecoration: "none", marginLeft: 4 }}>Docs</Link>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "34px 22px 60px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 22 }}>
          <span style={{ width: 12, height: 12, background: color.accent }} />
          <h1 style={{ fontFamily: font.display, fontSize: 30, color: color.textLightHi, margin: 0 }}>Projects</h1>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk }}>{metas ? `${metas.length} ${me ? "· synced to your account" : "local · sign in to sync"}` : "…"}</span>
        </div>

        {authErr && (
          <div style={{ marginBottom: 18, padding: "8px 12px", border: `1px solid #f85149`, background: "#f8514914", fontFamily: font.mono, fontSize: 12, color: "#f85149" }}>
            sign-in failed: {authErr}
          </div>
        )}

        {loadErr && (
          <div style={{ marginBottom: 18, padding: "8px 12px", border: `1px solid #f85149`, background: "#f8514914", fontFamily: font.mono, fontSize: 12, color: "#f85149", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ flex: 1 }}>couldn't load your projects: {loadErr}</span>
            <NeoBtn onClick={() => void reload()} accent="#f85149" title="Try again">retry</NeoBtn>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 }}>
          <NewProjectCard onStandard={() => void create("standard")} onDev={() => void create("dev")} />

          {(metas ?? []).map((m) => (
            <Card key={m.id} faceStyle={{ minHeight: 150 }}>
              <div style={{ padding: 14, minHeight: 150, display: "flex", flexDirection: "column", gap: 8 }}>
                {renaming === m.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void commitRename(m.id);
                      }
                      if (e.key === "Escape") {
                        setRenaming(null);
                      }
                    }}
                    style={inlineInput}
                  />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
                    <span onDoubleClick={() => startRename(m)} style={{ fontFamily: font.display, fontSize: 16, color: color.textLightHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                  </div>
                )}

                <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>
                  {m.fileCount} file{m.fileCount === 1 ? "" : "s"} · {rel(m.updatedAt)}
                </div>

                <div style={{ flex: 1 }} />

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <NeoBtn onClick={() => void open(m.id)} active title="Open in the editor">▶ open</NeoBtn>
                  <NeoBtn onClick={() => startRename(m)} title="Rename">✎</NeoBtn>
                  <NeoBtn onClick={() => void duplicate(m.id)} title="Duplicate">⧉</NeoBtn>
                  <NeoBtn onClick={() => void exportOne(m.id)} title="Export to .json">⤓</NeoBtn>
                  <NeoBtn onClick={() => void del(m.id, m.name)} title="Delete" accent="#f85149">✕</NeoBtn>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {metas && metas.length === 0 && (
          <div style={{ fontFamily: font.mono, fontSize: 13, color: color.textGhostDk, marginTop: 24 }}>
            No projects yet — hit <span style={{ color: color.accent }}>New project</span> to start, or <span style={{ color: color.accent }}>import</span> a .qinit.json.
          </div>
        )}
      </div>
    </div>
  );
}

// Sign-in modal — one entry point that fans out to the OAuth providers. Backdrop / Escape close it.
function LoginModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "#000000B0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 340, maxWidth: "100%" }}>
        <Card frame={color.accentDeep} shadow={6}>
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 11, height: 11, flex: "none", background: color.accent }} />
              <span style={{ fontFamily: font.display, fontSize: 18, color: color.textLightHi }}>Sign in</span>
              <div style={{ flex: 1 }} />
              <button onClick={onClose} title="Close" style={{ all: "unset", cursor: "pointer", fontFamily: font.mono, fontSize: 14, color: color.textGhostDk, padding: "2px 4px" }}>✕</button>
            </div>

            <div style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk, lineHeight: 1.5 }}>
              Sync your projects to your account and access them anywhere.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ProviderBtn onClick={() => login("google")} icon={<GoogleIcon />} label="Continue with Google" />
              <ProviderBtn onClick={() => login("github")} icon={<GitHubIcon />} label="Continue with GitHub" />
            </div>

            <div style={{ fontFamily: font.mono, fontSize: 10, color: color.textFaintDk }}>
              We only read your name, email, and avatar.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// The "New project" tile. The main face creates the standard project (Counter + TS test + gtest); the
// bottom-right "dev" region — highlighted on hover so it's discoverable — seeds the full example playground.
function NewProjectCard({ onStandard, onDev }: { onStandard: () => void; onDev: () => void }) {
  const [devHover, setDevHover] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={onStandard} title="New project — Counter contract + TS test + C++ gtest" style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
        <Card frame={color.accentDeep} shadow={5} faceStyle={{ minHeight: 150 }}>
          <div style={{ padding: 16, minHeight: 150, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ fontFamily: font.display, fontSize: 40, color: color.accent, lineHeight: 1 }}>+</span>
            <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>New project</span>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>Counter · TS test · gtest</span>
          </div>
        </Card>
      </button>
      <div
        onClick={(e) => { e.stopPropagation(); onDev(); }}
        onMouseEnter={() => setDevHover(true)}
        onMouseLeave={() => setDevHover(false)}
        title="Dev playground — seed every example contract (Adder, Bank, Token, Proxy, Shares, Equity…)"
        style={{
          // Hidden by default (not exposed) — only appears when the bottom-right corner is hovered. opacity:0
          // keeps it in layout, so the corner stays hoverable + clickable without ever showing unprompted.
          position: "absolute",
          right: 6,
          bottom: 6,
          cursor: "pointer",
          fontFamily: font.mono,
          fontSize: 10.5,
          padding: "3px 9px",
          color: color.void,
          background: color.accent,
          border: `1px solid ${color.accent}`,
          opacity: devHover ? 1 : 0,
          transition: "opacity .12s",
        }}
      >
        dev ▸
      </div>
    </div>
  );
}

// Full-width provider button — accent border on hover, brand glyph on the left.
function ProviderBtn({ onClick, icon, label }: { onClick: () => void; icon: ReactNode; label: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "11px 14px",
        border: `1px solid ${hover ? color.accent : color.hair2}`,
        background: hover ? color.panel : color.void,
        color: color.textLightHi,
        fontFamily: font.mono,
        fontSize: 13,
        cursor: "pointer",
        textAlign: "left",
        transition: "border-color .1s, background .1s",
      }}
    >
      <span style={{ flex: "none", display: "flex", width: 18, height: 18 }}>{icon}</span>
      {label}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill={color.textLightHi} aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// First-login prompt — copy the local projects into the freshly signed-in account, or keep them local.
function ImportModal({ count, onImport, onSkip }: { count: number; onImport: () => void; onSkip: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000B0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div style={{ width: 360, maxWidth: "100%" }}>
        <Card frame={color.accentDeep} shadow={6}>
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 11, height: 11, flex: "none", background: color.accent }} />
              <span style={{ fontFamily: font.display, fontSize: 18, color: color.textLightHi }}>Import local projects?</span>
            </div>

            <div style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk, lineHeight: 1.5 }}>
              You have {count} project{count === 1 ? "" : "s"} stored in this browser. Copy {count === 1 ? "it" : "them"} into your account so {count === 1 ? "it syncs" : "they sync"} across devices?
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <NeoBtn onClick={onSkip} title="Keep them in this browser only">keep local</NeoBtn>
              <NeoBtn onClick={onImport} active title="Copy them into your account">import {count}</NeoBtn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Mid-session 401 — a fixed top banner letting the user re-authenticate. Already reverted to the local store.
function ExpiredToast({ onSignIn, onDismiss }: { onSignIn: () => void; onDismiss: () => void }) {
  return (
    <div style={{ position: "fixed", top: 14, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 250, pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto" }}>
        <Card frame="#FFC857" shadow={5}>
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textLightHi }}>Session expired — your projects reverted to local.</span>
            <NeoBtn onClick={onSignIn} active title="Sign in again">sign in</NeoBtn>
            <button onClick={onDismiss} title="Dismiss" style={{ all: "unset", cursor: "pointer", fontFamily: font.mono, fontSize: 13, color: color.textGhostDk, padding: "2px 4px" }}>✕</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

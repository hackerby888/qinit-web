// GitHub import / export dialog. Import pulls a public repo's source files into the workspace; export writes
// the workspace to a Gist using a personal access token the user pastes (sent once, never stored). Both call
// the owner-authed backend proxy, so a signed-out user is shown a sign-in prompt instead.
import { useState, type CSSProperties } from "react";
import { color, font } from "../landing/tokens";
import { importRepo, exportGist, type RepoFile } from "./githubApi";

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#000000A0",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: 70,
  zIndex: 200,
};

const field: CSSProperties = {
  width: "100%",
  background: color.void,
  border: `1px solid ${color.hair2}`,
  color: color.textLight,
  fontFamily: font.mono,
  fontSize: 13,
  padding: "7px 9px",
  outline: "none",
  boxSizing: "border-box",
};

function Btn({ label, onClick, disabled, primary }: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${primary ? color.accent : color.hair2}`,
        background: primary ? color.accent : "transparent",
        color: primary ? color.void : color.textLight,
        fontFamily: font.mono,
        fontSize: 12,
        padding: "7px 14px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

export function GitHubDialog({ files, signedIn, initialTab, onImport, onSignIn, onClose }: {
  files: RepoFile[];
  signedIn: boolean;
  initialTab: "import" | "export";
  onImport: (files: RepoFile[]) => void;
  onSignIn: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"import" | "export">(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // import state
  const [ref, setRef] = useState("");
  const [imported, setImported] = useState<RepoFile[] | null>(null);

  // export state
  const [token, setToken] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [gistUrl, setGistUrl] = useState("");

  const runImport = async () => {
    setBusy(true);
    setError("");
    setImported(null);
    try {
      const res = await importRepo(ref);
      setImported(res.files);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    setBusy(true);
    setError("");
    setGistUrl("");
    try {
      const res = await exportGist({ token, files, description: desc || "Qubic contract — exported from qinit", public: isPublic });
      setGistUrl(res.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (id: "import" | "export"): CSSProperties => ({
    border: "none",
    borderBottom: `2px solid ${tab === id ? color.accent : "transparent"}`,
    background: "transparent",
    color: tab === id ? color.accent : color.textMutedDk,
    fontFamily: font.mono,
    fontSize: 12.5,
    padding: "10px 14px",
    cursor: "pointer",
  });

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: "94%", maxHeight: "80vh", display: "flex", flexDirection: "column", background: color.panelDeep, border: `1px solid ${color.hair2}`, boxShadow: "6px 6px 0 #000" }}>
        <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${color.hair}` }}>
          <button onClick={() => { setTab("import"); setError(""); }} style={tabBtn("import")}>↧ Import repo</button>
          <button onClick={() => { setTab("export"); setError(""); }} style={tabBtn("export")}>↥ Export Gist</button>
          <button onClick={onClose} title="Close" style={{ marginLeft: "auto", border: "none", background: "transparent", color: color.textGhostDk, fontFamily: font.mono, fontSize: 16, padding: "0 12px", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {!signedIn ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: color.textMutedDk, lineHeight: 1.5 }}>
                Sign in to import from GitHub or export your workspace as a Gist.
              </span>
              <Btn label="Sign in with GitHub" onClick={onSignIn} primary />
            </div>
          ) : tab === "import" ? (
            <>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk, lineHeight: 1.5 }}>
                Paste a public repo: <code style={{ color: color.textLight }}>owner/repo</code>, <code style={{ color: color.textLight }}>owner/repo/subdir</code>, <code style={{ color: color.textLight }}>owner/repo@branch</code>, or a github.com URL.
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  autoFocus
                  value={ref}
                  placeholder="qubic/core/src/contracts"
                  onChange={(e) => setRef(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && ref.trim() && !busy) { runImport(); } }}
                  style={{ ...field, flex: 1 }}
                />
                <Btn label={busy ? "…" : "Import"} onClick={runImport} disabled={busy || !ref.trim()} />
              </div>

              {imported && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textLightHi }}>
                    {imported.length} file{imported.length === 1 ? "" : "s"} — files with the same name will be overwritten.
                  </span>
                  <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${color.hair}`, padding: "6px 0" }}>
                    {imported.map((f) => (
                      <div key={f.name} style={{ fontFamily: font.mono, fontSize: 11.5, color: color.textMutedDk, padding: "3px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    ))}
                  </div>
                  <Btn label={`Add ${imported.length} file${imported.length === 1 ? "" : "s"} to workspace`} onClick={() => { onImport(imported); onClose(); }} primary />
                </div>
              )}
            </>
          ) : (
            <>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk, lineHeight: 1.5 }}>
                Export {files.length} workspace file{files.length === 1 ? "" : "s"} to a Gist. Needs a{" "}
                <a href="https://github.com/settings/tokens/new?scopes=gist&description=qinit" target="_blank" rel="noreferrer" style={{ color: color.accent }}>token with the <code>gist</code> scope</a>. It is sent once to create the Gist and never stored.
              </span>
              <input value={token} placeholder="ghp_… (gist scope)" type="password" onChange={(e) => setToken(e.target.value)} style={field} />
              <input value={desc} placeholder="Description (optional)" onChange={(e) => setDesc(e.target.value)} style={field} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: font.mono, fontSize: 12, color: color.textMutedDk, cursor: "pointer" }}>
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                Public Gist (default: secret)
              </label>
              <div>
                <Btn label={busy ? "Creating…" : "Create Gist"} onClick={runExport} disabled={busy || !token.trim() || files.length === 0} primary />
              </div>

              {gistUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${color.hair}`, padding: "8px 10px" }}>
                  <a href={gistUrl} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, fontFamily: font.mono, fontSize: 12, color: color.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gistUrl}</a>
                  <Btn label="Copy" onClick={() => navigator.clipboard.writeText(gistUrl)} />
                </div>
              )}
            </>
          )}

          {error && (
            <span style={{ fontFamily: font.mono, fontSize: 12, color: "#f85149", lineHeight: 1.5 }}>{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// The projects home screen (gallery) shown at /ide. Lists the user's contract projects as neo-brutalist
// cards — open, rename, duplicate, delete, export — plus create-new and import. Opening one routes to the
// editor at /ide/p/:id. All storage goes through the async ProjectStore, so this UI is unchanged when a
// cloud backend is added later.
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { color, font } from "../landing/tokens";
import { PixelQMark, KEYFRAMES } from "../landing/components";
import { Card, NeoBtn } from "./ui";
import { getStore } from "./projects/store";
import { exportProject, importProjectFile } from "./projects/io";
import type { ProjectMeta } from "./projects/types";
import { decodeSharedWorkspace } from "./workspace";
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
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    setMetas(await getStore().list());
  }, []);

  useEffect(() => {
    void (async () => {
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
  }, [reload, navigate]);

  const open = async (id: string) => {
    await getStore().setCurrentId(id);
    navigate(`/ide/p/${id}`);
  };

  const create = async () => {
    const n = (metas?.length ?? 0) + 1;
    const p = await getStore().create(`Project ${n}`);
    await getStore().setCurrentId(p.id);
    navigate(`/ide/p/${p.id}`);
  };

  const duplicate = async (id: string) => {
    await getStore().duplicate(id);
    await reload();
  };

  const del = async (id: string, name: string) => {
    if (window.confirm(`Delete "${name}"? This can't be undone.`)) {
      await getStore().remove(id);
      await reload();
    }
  };

  const commitRename = async (id: string) => {
    const name = draft.trim();
    if (name) {
      await getStore().rename(id, name);
      await reload();
    }
    setRenaming(null);
  };

  const exportOne = async (id: string) => {
    const p = await getStore().load(id);
    if (p) {
      exportProject(p);
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

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 22px", height: 54, borderBottom: `3px solid ${color.ink}`, background: color.panelDeep }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <PixelQMark size={22} />
          <span style={{ fontFamily: font.display, fontSize: 19, color: color.textLightHi }}>qinit <span style={{ color: color.accent }}>ide</span></span>
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onImport} style={{ display: "none" }} />
          <NeoBtn onClick={() => fileRef.current?.click()} title="Import a .qinit.json project">⤒ import</NeoBtn>
          <Link to="/docs" style={{ fontFamily: font.mono, fontSize: 12, color: color.textMutedDk, textDecoration: "none", marginLeft: 4 }}>Docs</Link>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "34px 22px 60px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 22 }}>
          <span style={{ width: 12, height: 12, background: color.accent }} />
          <h1 style={{ fontFamily: font.display, fontSize: 30, color: color.textLightHi, margin: 0 }}>Projects</h1>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.textGhostDk }}>{metas ? `${metas.length} local` : "…"}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 }}>
          <button onClick={create} title="New project" style={{ all: "unset", cursor: "pointer", display: "block" }}>
            <Card frame={color.accentDeep} shadow={5} faceStyle={{ minHeight: 150 }}>
              <div style={{ padding: 16, minHeight: 150, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <span style={{ fontFamily: font.display, fontSize: 40, color: color.accent, lineHeight: 1 }}>+</span>
                <span style={{ fontFamily: font.display, fontSize: 15, color: color.textLightHi }}>New project</span>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>blank contract</span>
              </div>
            </Card>
          </button>

          {(metas ?? []).map((m) => (
            <Card key={m.id} faceStyle={{ minHeight: 150 }}>
              <div style={{ padding: 14, minHeight: 150, display: "flex", flexDirection: "column", gap: 8 }}>
                {renaming === m.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(m.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") { void commitRename(m.id); } if (e.key === "Escape") { setRenaming(null); } }}
                    style={inlineInput}
                  />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 9, height: 9, flex: "none", background: color.accent }} />
                    <span onDoubleClick={() => { setRenaming(m.id); setDraft(m.name); }} style={{ fontFamily: font.display, fontSize: 16, color: color.textLightHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                  </div>
                )}

                <div style={{ fontFamily: font.mono, fontSize: 11, color: color.textGhostDk }}>
                  {m.fileCount} file{m.fileCount === 1 ? "" : "s"} · {rel(m.updatedAt)}
                </div>

                <div style={{ flex: 1 }} />

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <NeoBtn onClick={() => void open(m.id)} active title="Open in the editor">▶ open</NeoBtn>
                  <NeoBtn onClick={() => { setRenaming(m.id); setDraft(m.name); }} title="Rename">✎</NeoBtn>
                  <NeoBtn onClick={() => void duplicate(m.id)} title="Duplicate">⧉</NeoBtn>
                  <NeoBtn onClick={() => void exportOne(m.id)} title="Export to .json">⤓</NeoBtn>
                  <NeoBtn onClick={() => void del(m.id, m.name)} title="Delete" accent="#FF8B7E">✕</NeoBtn>
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

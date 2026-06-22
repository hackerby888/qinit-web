// The collab integration hook for the editor. Owns the Yjs session, one Monaco model per file, and the
// active-file MonacoBinding (rebinding on tab switch). It drives React's file list from the shared doc
// (observeDeep, throttled) so the explorer / tabs / auto-compile see live content, and exposes connection
// status + the peer list for the presence UI. IntelliSense keeps working because models are created with
// the same language as editor.tsx (langForPath) — the global per-language providers attach unchanged.
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { OnMount } from "@monaco-editor/react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { createCollabSession, type CollabSession, type CollabStatus } from "./collab";
import { langForPath } from "./editor";
import { notify } from "./notify";

type MonacoNS = Parameters<OnMount>[1];
type EditorRef = Parameters<OnMount>[0];
type TextModel = ReturnType<EditorRef["getModel"]>;

export interface CollabCtx {
  projectId?: string; // owner session (room = projectId, authed by token)
  linkId?: string; // guest/view session (server resolves the room from the link)
  mode: "view" | "edit";
  displayName: string;
  color: string;
}

export interface Peer {
  clientId: number;
  name: string;
  color: string;
}

// The shared "someone is building" lock state (one build per project at a time).
export interface BuildState {
  active: boolean;
  by: string | null;
  byOther: boolean;
}

export interface CollabApi {
  status: CollabStatus;
  ready: boolean;
  peers: Peer[];
  building: BuildState;
  // Claim the project-wide build lock (deterministic tiebreak for simultaneous clicks); release when done.
  claimBuild: () => Promise<boolean>;
  releaseBuild: () => void;
  // File mutations applied to the shared doc (so they propagate to every collaborator).
  ops: {
    create: (name: string, content: string) => void;
    rename: (oldName: string, newName: string) => void;
    remove: (name: string) => void;
  };
}

interface Args {
  ctx: CollabCtx | null;
  token?: string;
  editorRef: MutableRefObject<EditorRef | null>;
  monacoRef: MutableRefObject<MonacoNS | null>;
  editorReady: boolean;
  active: string;
  onInit: (files: { name: string; source: string }[]) => void;
  onFiles: (files: { name: string; source: string }[]) => void;
}

function filesOf(map: Y.Map<Y.Text>): { name: string; source: string }[] {
  return [...map.entries()].map(([name, text]) => ({ name, source: text.toString() }));
}

export function useCollab(args: Args): CollabApi {
  const { ctx, token, editorRef, monacoRef, editorReady, active, onInit, onFiles } = args;

  const [status, setStatus] = useState<CollabStatus>("connecting");
  const wasDisconnected = useRef(false); // tracks a drop so the next connect reads as a "reconnected"
  const [ready, setReady] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [building, setBuilding] = useState<BuildState>({ active: false, by: null, byOther: false });

  const sessionRef = useRef<CollabSession | null>(null);
  const modelsRef = useRef<Map<string, TextModel>>(new Map());
  const bindingRef = useRef<MonacoBinding | null>(null);
  const boundNameRef = useRef<string>("");
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest callbacks without re-running the session effect.
  const onInitRef = useRef(onInit);
  const onFilesRef = useRef(onFiles);
  onInitRef.current = onInit;
  onFilesRef.current = onFiles;

  // ---- session lifecycle (create once per ctx) ----
  useEffect(() => {
    if (!ctx) {
      return;
    }

    const session = createCollabSession({
      projectId: ctx.projectId,
      linkId: ctx.linkId,
      token,
      user: { name: ctx.displayName, color: ctx.color },
    });
    sessionRef.current = session;
    setStatus("connecting");
    setReady(false);

    // Toast the transitions so a dropped connection is loud (the initial connect stays quiet). A run of
    // connecting→connected after a drop reads as one "reconnected".
    const onStatus = (e: { status: CollabStatus }) => {
      if (e.status === "disconnected") {
        if (!wasDisconnected.current) {
          notify.warn("Collaboration disconnected — trying to reconnect…");
        }
        wasDisconnected.current = true;
      } else if (e.status === "connected") {
        if (wasDisconnected.current) {
          notify.info("Collaboration reconnected.");
        }
        wasDisconnected.current = false;
      }
      setStatus(e.status);
    };
    session.provider.on("status", onStatus);

    // Recompute presence (peer avatars) and the shared build state from awareness on every change.
    const pushPeers = () => {
      const me = session.awareness.clientID;
      const list: Peer[] = [];
      let byOther: string | null = null;
      let mine = false;
      session.awareness.getStates().forEach((state, clientId) => {
        const s = state as { user?: { name?: string; color?: string }; building?: unknown };
        if (clientId !== me && s.user) {
          list.push({ clientId, name: s.user.name ?? "anon", color: s.user.color ?? "#888" });
        }
        if (s.building) {
          if (clientId === me) {
            mine = true;
          } else if (!byOther) {
            byOther = s.user?.name ?? "someone";
          }
        }
      });
      setPeers(list);
      setBuilding({ active: !!byOther || mine, by: byOther ?? (mine ? "you" : null), byOther: !!byOther });
    };
    session.awareness.on("change", pushPeers);

    const pushFiles = () => {
      if (throttleRef.current) {
        return;
      }
      throttleRef.current = setTimeout(() => {
        throttleRef.current = null;
        onFilesRef.current(filesOf(session.filesMap));
      }, 120);
    };
    session.filesMap.observeDeep(pushFiles);

    void session.whenSynced.then(() => {
      onInitRef.current(filesOf(session.filesMap));
      setReady(true);
      pushPeers();
    });

    return () => {
      session.provider.off("status", onStatus);
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      bindingRef.current?.destroy();
      bindingRef.current = null;
      boundNameRef.current = "";
      modelsRef.current.forEach((m) => m?.dispose());
      modelsRef.current.clear();
      session.destroy();
      sessionRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, token]);

  // ---- models + active-file binding (rebinds on tab switch) ----
  useEffect(() => {
    const session = sessionRef.current;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!ctx || !ready || !editor || !monaco || !active) {
      return;
    }

    // Sync the model set to the shared file set (create new, dispose removed).
    const names = new Set<string>(session!.filesMap.keys() as IterableIterator<string>);
    for (const [name, model] of modelsRef.current) {
      if (!names.has(name)) {
        model?.dispose();
        modelsRef.current.delete(name);
      }
    }
    for (const name of names) {
      if (!modelsRef.current.has(name)) {
        const text = session!.filesMap.get(name);
        const uri = monaco.Uri.from({ scheme: "inmemory", path: `/collab/${name}` });
        const model = monaco.editor.createModel(text ? text.toString() : "", langForPath(name), uri);
        modelsRef.current.set(name, model);
      }
    }

    // Bind the active file (dispose the previous binding first — double-binding duplicates keystrokes).
    if (boundNameRef.current !== active || bindingRef.current === null) {
      const text = session!.filesMap.get(active);
      const model = modelsRef.current.get(active);
      if (text && model) {
        bindingRef.current?.destroy();
        editor.setModel(model);
        bindingRef.current = new MonacoBinding(text, model, new Set([editor]), session!.awareness);
        boundNameRef.current = active;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ready, editorReady, active, peers.length]);

  const ops = useRef<CollabApi["ops"]>({
    create: (name, content) => {
      const map = sessionRef.current?.filesMap;
      if (!map || map.has(name)) {
        return;
      }
      const text = new Y.Text();
      text.insert(0, content);
      map.set(name, text);
    },
    rename: (oldName, newName) => {
      const map = sessionRef.current?.filesMap;
      if (!map || !map.has(oldName) || map.has(newName)) {
        return;
      }
      const src = map.get(oldName)!.toString();
      const text = new Y.Text();
      text.insert(0, src);
      map.set(newName, text);
      map.delete(oldName);
    },
    remove: (name) => {
      sessionRef.current?.filesMap.delete(name);
    },
  });

  // Project-wide build lock over awareness. claimBuild marks us building, waits a beat for peers' claims to
  // propagate, then yields to a lower-clientID rival (deterministic) so two simultaneous clicks → one build.
  const lock = useRef({
    claimBuild: async (): Promise<boolean> => {
      const aw = sessionRef.current?.awareness;
      if (!aw) {
        return true;
      }
      const me = aw.clientID;
      const othersBuilding = () => [...aw.getStates()].filter(([id, s]) => id !== me && (s as { building?: unknown }).building);
      if (othersBuilding().length > 0) {
        return false;
      }
      aw.setLocalStateField("building", { at: Date.now() });
      await new Promise((r) => setTimeout(r, 180));
      if (othersBuilding().some(([id]) => id < me)) {
        aw.setLocalStateField("building", null);
        return false;
      }
      return true;
    },
    releaseBuild: (): void => {
      sessionRef.current?.awareness.setLocalStateField("building", null);
    },
  });

  return { status, ready, peers, building, claimBuild: lock.current.claimBuild, releaseBuild: lock.current.releaseBuild, ops: ops.current };
}

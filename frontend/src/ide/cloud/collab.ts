// Collaboration client: a Yjs doc synced over the backend /collab WebSocket via the stock y-websocket
// provider. File contents live in `files` = Y.Map<name, Y.Text>; awareness carries each user's cursor +
// {name,color} for remote carets. Active tab / open tabs stay local (per-user). The server is authoritative
// and persists back to the owner's cloud project — this client never writes to the cloud directly in collab.
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export type CollabStatus = "connecting" | "connected" | "disconnected";

export interface CollabUser {
  name: string;
  color: string;
}

export interface CollabSession {
  doc: Y.Doc;
  provider: WebsocketProvider;
  filesMap: Y.Map<Y.Text>;
  awareness: WebsocketProvider["awareness"];
  whenSynced: Promise<void>;
  destroy: () => void;
}

export interface CollabOpts {
  projectId?: string; // owner session (authed) — room = projectId
  linkId?: string; // guest/view session — server resolves the room from the link
  token?: string; // owner Bearer JWT
  user: CollabUser;
}

// A stable, pleasant color from a string (guest id / name) — used for the caret + avatar.
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360}, 70%, 55%)`;
}

function wsBase(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/collab`;
}

export function createCollabSession(opts: CollabOpts): CollabSession {
  const doc = new Y.Doc();
  const room = opts.projectId ?? opts.linkId ?? "room";
  const params: Record<string, string> = {};
  if (opts.projectId) {
    params.project = opts.projectId;
  }
  if (opts.linkId) {
    params.link = opts.linkId;
  }
  if (opts.token) {
    params.token = opts.token;
  }

  // WebsocketProvider auto-reconnects with backoff while shouldConnect is true (the default). Surface the
  // transport errors instead of letting them fail silently.
  const provider = new WebsocketProvider(wsBase(), room, doc, { params });
  provider.on("connection-error", (e: Event) => console.warn("[collab] connection error", e));
  provider.on("connection-close", () => console.info("[collab] disconnected — reconnecting…"));
  const filesMap = doc.getMap<Y.Text>("files");
  provider.awareness.setLocalStateField("user", { name: opts.user.name, color: opts.user.color });

  const whenSynced = new Promise<void>((resolve) => {
    if (provider.synced) {
      resolve();
      return;
    }
    provider.once("sync", () => resolve());
  });

  const destroy = (): void => {
    provider.awareness.setLocalState(null);
    provider.destroy();
    doc.destroy();
  };

  return { doc, provider, filesMap, awareness: provider.awareness, whenSynced, destroy };
}

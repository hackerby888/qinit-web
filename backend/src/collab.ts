// Real-time collaboration server. A WebSocket endpoint at /collab speaks the y-websocket wire protocol
// (msg 0 = sync, 1 = awareness) so the browser's stock WebsocketProvider can connect. Each project is one
// room holding an authoritative Y.Doc (files = Y.Map<name, Y.Text>). Updates fan to local sockets and, when
// Redis is configured, across backend instances via pub/sub. A single instance (Redis lock) debounces the
// doc back into the owner's cloud project. Redis + Mongo are both optional — without them it runs
// single-instance, in-memory.
import type { Server } from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { getProject, saveProject, getShare } from "./store";
import { userIdFromToken } from "./auth";
import { makeRedis } from "./redis";
import { log } from "./log";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SAVE_DEBOUNCE = 800;
const ROOM_GRACE = 30000;
const STATE_TTL = 3600000;

const instanceId = randomBytes(6).toString("hex");

interface ConnInfo {
  roomId: string;
  ownerUserId: string;
  projectId: string;
  write: boolean;
}

interface Room {
  roomId: string;
  ownerUserId: string;
  projectId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<WebSocket>;
  controlled: Map<WebSocket, Set<number>>; // awareness clientIDs each socket owns (for cleanup on close)
  baseDoc: Record<string, unknown> | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
  evictTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, Room>();
const roomInit = new Map<string, Promise<Room>>();

// Live collab footprint for the admin dashboard: open rooms and the total connected sockets across them.
export function collabMetrics(): { rooms: number; connections: number } {
  let connections = 0;

  for (const room of rooms.values()) {
    connections += room.conns.size;
  }

  return { rooms: rooms.size, connections };
}

// Pub/sub clients (null when REDIS_URL unset → single-instance, in-memory relay).
const pub = makeRedis();
const sub = makeRedis();
const subscribedRooms = new Set<string>();
const chan = (roomId: string): string => `collab:${roomId}`;

function toU8(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data as Buffer[]));
  }
  const b = data as Buffer;
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

// ---- Redis relay ----

function publishRedis(roomId: string, kind: "u" | "a", payload: Uint8Array): void {
  if (!pub) {
    return;
  }
  const msg = JSON.stringify({ o: instanceId, t: kind, d: Buffer.from(payload).toString("base64") });
  void pub.publish(chan(roomId), msg);
}

function subscribeRedis(roomId: string): void {
  if (!sub || subscribedRooms.has(roomId)) {
    return;
  }
  subscribedRooms.add(roomId);
  void sub.subscribe(chan(roomId));
}

if (sub) {
  sub.on("message", (channel: string, message: string) => {
    try {
      const roomId = channel.slice("collab:".length);
      const room = rooms.get(roomId);
      if (!room) {
        return;
      }
      const parsed = JSON.parse(message) as { o: string; t: "u" | "a"; d: string };
      if (parsed.o === instanceId) {
        return;
      }
      const payload = new Uint8Array(Buffer.from(parsed.d, "base64"));
      if (parsed.t === "u") {
        Y.applyUpdate(room.doc, payload, "redis");
      } else {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, payload, "redis");
      }
    } catch (e) {
      log.error("collab redis relay error", { error: (e as Error).message });
    }
  });
}

// ---- broadcast helpers ----

function broadcastSync(room: Room, update: Uint8Array, originWs: unknown): void {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeUpdate(enc, update);
  const msg = encoding.toUint8Array(enc);
  for (const ws of room.conns) {
    if (ws !== originWs && ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  }
}

function broadcastAwareness(room: Room, changed: number[], originWs: unknown): void {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_AWARENESS);
  encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed));
  const msg = encoding.toUint8Array(enc);
  for (const ws of room.conns) {
    if (ws !== originWs && ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  }
}

// ---- write-back (single writer when Redis present) ----

// Single-writer election for cross-instance write-back: the instance that wins the Redis SET-NX lock writes;
// the current lock holder may also write (it's renewing its own lease). Everyone else yields — they converge
// to the same doc via relay, so a skipped write loses nothing. Pure, so it's unit-testable without Redis.
export function electedWriter(setNxResult: string | null, currentHolder: string | null, self: string): boolean {
  if (setNxResult === "OK") {
    return true;
  }
  return currentHolder === self;
}

function scheduleSave(room: Room): void {
  if (room.saveTimer) {
    clearTimeout(room.saveTimer);
  }
  room.saveTimer = setTimeout(() => {
    void writeBack(room);
  }, SAVE_DEBOUNCE);
}

async function writeBack(room: Room): Promise<void> {
  room.saveTimer = null;
  if (!room.baseDoc) {
    return;
  }

  // Elect a single writer across instances: hold a short Redis lock; non-holders skip (they all converge to
  // the same doc via relay, so any holder writing the same content is correct).
  if (pub) {
    const key = `collab:${room.roomId}:writer`;
    const got = await pub.set(key, instanceId, "PX", 10000, "NX").catch(() => null);
    if (got !== "OK") {
      const holder = await pub.get(key).catch(() => null);
      if (!electedWriter(got, holder, instanceId)) {
        return;
      }
      await pub.pexpire(key, 10000).catch(() => {});
    }
  }

  try {
    const filesMap = room.doc.getMap("files");
    const files = [...filesMap.entries()].map(([name, t]) => ({ name, source: (t as Y.Text).toString() }));
    const base = room.baseDoc as { name: string; createdAt: number };
    await saveProject(room.ownerUserId, { ...room.baseDoc, ...base, id: room.projectId, files, updatedAt: Date.now() } as never);

    if (pub) {
      const state = Buffer.from(Y.encodeStateAsUpdate(room.doc)).toString("base64");
      void pub.set(`collab:${room.roomId}:state`, state, "PX", STATE_TTL).catch(() => {});
    }
  } catch (e) {
    log.error("collab write-back failed", { room: room.roomId, error: (e as Error).message });
  }
}

// ---- room lifecycle ----

// Callers share one initialization per room. Registering the room before its async seed completed let the
// other sockets of a burst join an empty doc — the seed lands with no update handler attached yet, so it is
// never broadcast and those clients stay blank. Only a real store is slow enough for the burst to land inside
// that window.
async function getOrCreateRoom(info: ConnInfo): Promise<Room> {
  const existing = rooms.get(info.roomId);
  if (existing) {
    return existing;
  }
  const inFlight = roomInit.get(info.roomId);
  if (inFlight) {
    return inFlight;
  }

  const init = createRoom(info).finally(() => roomInit.delete(info.roomId));
  roomInit.set(info.roomId, init);
  return init;
}

async function createRoom(info: ConnInfo): Promise<Room> {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const room: Room = {
    roomId: info.roomId,
    ownerUserId: info.ownerUserId,
    projectId: info.projectId,
    doc,
    awareness,
    conns: new Set(),
    controlled: new Map(),
    baseDoc: null,
    saveTimer: null,
    evictTimer: null,
  };
  // Seed from a warm Redis state cache if present, else from the owner's saved project. A failure here must
  // not reject room creation — fall back to an empty doc so the socket still works.
  try {
    let seeded = false;
    if (pub) {
      const cached = await pub.get(`collab:${room.roomId}:state`).catch(() => null);
      if (cached) {
        Y.applyUpdate(doc, new Uint8Array(Buffer.from(cached, "base64")), "seed");
        seeded = true;
      }
    }
    const project = (await getProject(info.ownerUserId, info.projectId)) as { files?: { name: string; source: string }[] } | null;
    room.baseDoc = project as Record<string, unknown> | null;
    if (!seeded && project && Array.isArray(project.files)) {
      const filesMap = doc.getMap("files");
      doc.transact(() => {
        for (const f of project.files!) {
          const text = new Y.Text();
          text.insert(0, String(f.source ?? ""));
          filesMap.set(String(f.name), text);
        }
      });
    }
  } catch (e) {
    log.error("collab seed failed", { room: room.roomId, error: (e as Error).message });
  }

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    broadcastSync(room, update, origin);
    if (origin !== "redis" && origin !== "seed") {
      publishRedis(room.roomId, "u", update);
    }
    scheduleSave(room);
  });

  awareness.on("update", (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    const { added, updated, removed } = changes;
    const changed = added.concat(updated, removed);
    const owner = room.controlled.get(origin as WebSocket);
    if (owner) {
      added.forEach((id) => owner.add(id));
      removed.forEach((id) => owner.delete(id));
    }
    broadcastAwareness(room, changed, origin);
    if (origin !== "redis") {
      publishRedis(room.roomId, "a", awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed));
    }
  });

  subscribeRedis(room.roomId);
  rooms.set(info.roomId, room);
  return room;
}

function evictRoom(room: Room): void {
  if (room.conns.size > 0) {
    return;
  }
  if (sub) {
    void sub.unsubscribe(chan(room.roomId));
    subscribedRooms.delete(room.roomId);
  }
  room.doc.destroy();
  rooms.delete(room.roomId);
}

function onClose(room: Room, ws: WebSocket): void {
  if (!room.conns.has(ws)) {
    return;
  }
  room.conns.delete(ws);
  const ids = room.controlled.get(ws);
  if (ids && ids.size > 0) {
    awarenessProtocol.removeAwarenessStates(room.awareness, [...ids], null);
  }
  room.controlled.delete(ws);

  if (room.conns.size === 0) {
    void writeBack(room);
    room.evictTimer = setTimeout(() => evictRoom(room), ROOM_GRACE);
  }
}

// A read-only socket may exchange state vectors but its inbound updates are dropped (view links can't edit).
function handleSync(decoder: decoding.Decoder, room: Room, ws: WebSocket, write: boolean): Uint8Array | null {
  const messageType = decoding.readVarUint(decoder);
  if (messageType === syncProtocol.messageYjsSyncStep1) {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep2(enc, room.doc, decoding.readVarUint8Array(decoder));
    return encoding.toUint8Array(enc);
  }
  if (messageType === syncProtocol.messageYjsSyncStep2 || messageType === syncProtocol.messageYjsUpdate) {
    const update = decoding.readVarUint8Array(decoder);
    if (write) {
      Y.applyUpdate(room.doc, update, ws);
    }
    return null;
  }
  return null;
}

function onMessage(room: Room, ws: WebSocket, data: Uint8Array, write: boolean): void {
  try {
    const decoder = decoding.createDecoder(data);
    const type = decoding.readVarUint(decoder);
    if (type === MSG_SYNC) {
      const reply = handleSync(decoder, room, ws, write);
      if (reply && ws.readyState === ws.OPEN) {
        ws.send(reply);
      }
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
    }
  } catch (e) {
    log.error("collab bad message dropped", { error: (e as Error).message });
  }
}

function onConnection(ws: WebSocket, info: ConnInfo): void {
  // Room init awaits Redis/Mongo, and a client sends sync step 1 the moment its socket opens — so frames
  // land before the room exists. Listen from here and hold them, or they are dropped and the client waits
  // forever for a step 2 that never comes (only visible against a real store; in-memory resolves too fast).
  let ready: Room | null = null;
  let closed = false;
  const pending: Uint8Array[] = [];

  ws.on("message", (raw) => {
    const data = toU8(raw);
    if (ready) {
      onMessage(ready, ws, data, info.write);
    } else {
      pending.push(data);
    }
  });

  const shutdown = (): void => {
    closed = true;
    if (ready) {
      onClose(ready, ws);
    }
  };
  ws.on("close", shutdown);
  ws.on("error", shutdown);

  void getOrCreateRoom(info).catch((e) => {
    log.error("collab room init failed", { error: (e as Error).message });
    ws.close();
    return null;
  }).then((room) => {
    if (!room || closed) {
      return;
    }
    if (room.evictTimer) {
      clearTimeout(room.evictTimer);
      room.evictTimer = null;
    }
    room.conns.add(ws);
    room.controlled.set(ws, new Set());

    // Initial handshake: send sync step 1 + the current awareness states.
    const syncEnc = encoding.createEncoder();
    encoding.writeVarUint(syncEnc, MSG_SYNC);
    syncProtocol.writeSyncStep1(syncEnc, room.doc);
    ws.send(encoding.toUint8Array(syncEnc));

    const states = room.awareness.getStates();
    if (states.size > 0) {
      const awEnc = encoding.createEncoder();
      encoding.writeVarUint(awEnc, MSG_AWARENESS);
      encoding.writeVarUint8Array(awEnc, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]));
      ws.send(encoding.toUint8Array(awEnc));
    }

    ready = room;
    for (const data of pending) {
      onMessage(room, ws, data, info.write);
    }
    pending.length = 0;
  });
}

// ---- auth on the WS upgrade ----

async function authorize(url: URL): Promise<ConnInfo | null> {
  try {
    const token = url.searchParams.get("token") ?? undefined;
    const project = url.searchParams.get("project") ?? undefined;
    const link = url.searchParams.get("link") ?? undefined;

    if (project) {
      const userId = userIdFromToken(token);
      if (!userId || !(await getProject(userId, project))) {
        return null;
      }
      return { roomId: project, ownerUserId: userId, projectId: project, write: true };
    }

    if (link) {
      const share = await getShare(link);
      if (!share) {
        return null;
      }
      return { roomId: share.projectId, ownerUserId: share.ownerUserId, projectId: share.projectId, write: share.mode === "edit" };
    }

    return null;
  } catch (e) {
    log.error("collab authorize failed", { error: (e as Error).message });
    return null;
  }
}

let collabWss: WebSocketServer | null = null;

// Graceful shutdown: close every live collab socket, the WS server, and the Redis pub/sub clients.
export async function closeCollab(): Promise<void> {
  for (const room of rooms.values()) {
    for (const ws of room.conns) {
      try {
        ws.close(1001, "server shutting down");
      } catch {
        // already closing
      }
    }
  }

  collabWss?.close();
  await Promise.allSettled([pub?.quit(), sub?.quit()]);
}

export function attachCollab(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  collabWss = wss;
  wss.on("connection", onConnection);

  server.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "", "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    // WebsocketProvider connects to /collab/<roomName>; the room is resolved from the query, not the path.
    if (!url.pathname.startsWith("/collab")) {
      socket.destroy();
      return;
    }
    void authorize(url)
      .then((info) => {
        if (!info) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, info);
        });
      })
      .catch((e) => {
        log.error("collab upgrade failed", { error: (e as Error).message });
        socket.destroy();
      });
  });
}

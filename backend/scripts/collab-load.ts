// Collab load + convergence test. Spins up N y-websocket-style clients into one room, each inserts a unique
// marker line into the shared file, then asserts every client's CRDT doc converges to the same content (all N
// markers) and the server stays up. Run against a booted backend (QINIT_DEV_AUTH=1), from backend/ — it
// imports the backend's own deps, and bun resolves those upwards from here, not from the repo root:
//   bun scripts/collab-load.ts [clients] [base]
// e.g. bun scripts/collab-load.ts 16 http://127.0.0.1:8787
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const N = Number(process.argv[2] || 12);
const BASE = process.argv[3] || "http://127.0.0.1:8787";
const WS_BASE = BASE.replace(/^http/, "ws");
const FILE = "Main.h";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MSG_SYNC = 0;

async function api(path: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(BASE + path, init);
  if (!r.ok) {
    throw new Error(`${path} -> ${r.status}`);
  }
  return r;
}

// One client: a Y.Doc kept in sync with the room over a raw WebSocket speaking the y-websocket sync protocol.
function makeClient(room: string, token: string, id: number): { doc: Y.Doc; ready: Promise<void>; ws: WebSocket } {
  const doc = new Y.Doc();
  const url = `${WS_BASE}/collab/${room}?token=${encodeURIComponent(token)}&project=${encodeURIComponent(room)}`;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  const ORIGIN = `c${id}`;
  let resolveReady: () => void;
  let rejectReady: (e: Error) => void;
  // A dropped socket has to reject, not hang: without this the run waits forever for a sync step 2 that is
  // never coming, and CI reports a timeout with nothing to read.
  const ready = new Promise<void>((res, rej) => { resolveReady = res; rejectReady = rej; });
  ws.onerror = () => rejectReady(new Error(`client ${id}: socket error`));
  ws.onclose = (e) => rejectReady(new Error(`client ${id}: socket closed before sync (code ${e.code})`));

  ws.onopen = () => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, doc);
    ws.send(encoding.toUint8Array(enc));
  };

  ws.onmessage = (ev) => {
    const data = new Uint8Array(ev.data as ArrayBuffer);
    const dec = decoding.createDecoder(data);
    const type = decoding.readVarUint(dec);
    if (type !== MSG_SYNC) {
      return; // awareness — ignored for the load test
    }

    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    const syncType = syncProtocol.readSyncMessage(dec, enc, doc, ORIGIN);
    if (encoding.length(enc) > 1) {
      ws.send(encoding.toUint8Array(enc));
    }
    // syncStep2 (server's full state) means we're synced.
    if (syncType === syncProtocol.messageYjsSyncStep2) {
      resolveReady();
    }
  };

  // Local edits → push to the server as a sync update.
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === ORIGIN || origin === null) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      if (ws.readyState === ws.OPEN) {
        ws.send(encoding.toUint8Array(enc));
      }
    }
  });

  return { doc, ready, ws };
}

async function main(): Promise<void> {
  console.log(`collab load: ${N} clients -> ${BASE}`);

  // Seed a project (in-memory or Mongo) the room can resolve, with one file.
  const token = (await (await api(`/api/auth/dev?name=load`)).json()).token as string;
  const pid = `load-${Math.floor(performance.now())}`;
  const project = { id: pid, name: "Load", createdAt: 1, updatedAt: 1, files: [{ name: FILE, source: "// base\n" }] };
  await api(`/api/projects/${pid}`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(project) });

  const clients = Array.from({ length: N }, (_, i) => makeClient(pid, token, i));
  const SYNC_TIMEOUT_MS = 30_000;
  await Promise.race([
    Promise.all(clients.map((c) => c.ready)),
    sleep(SYNC_TIMEOUT_MS).then(() => {
      throw new Error(`clients did not sync within ${SYNC_TIMEOUT_MS}ms`);
    }),
  ]);
  console.log("all clients synced");

  // Each client appends its own marker line into the shared file.
  clients.forEach((c, i) => {
    const text = c.doc.getMap("files").get(FILE) as Y.Text;
    c.doc.transact(() => text.insert(text.length, `line-from-${i}\n`), `c${i}`);
  });

  // Let updates fan out + settle.
  await sleep(1500);

  let converged = 0;
  const sizes = new Set<number>();
  for (const c of clients) {
    const text = (c.doc.getMap("files").get(FILE) as Y.Text).toString();
    sizes.add(text.length);
    const hasAll = Array.from({ length: N }, (_, i) => text.includes(`line-from-${i}`)).every(Boolean);
    if (hasAll) {
      converged++;
    }
  }

  const health = (await api(`/api/health`)).status === 200;
  clients.forEach((c) => c.ws.close());

  console.log(`converged clients: ${converged}/${N} | distinct doc sizes: ${sizes.size} (want 1) | server alive: ${health}`);
  const pass = converged === N && sizes.size === 1 && health;
  console.log("RESULT:", pass ? "PASS" : "FAIL");
  process.exit(pass ? 0 : 1);
}

void main().catch((e) => {
  console.error("collab load error:", e);
  process.exit(1);
});

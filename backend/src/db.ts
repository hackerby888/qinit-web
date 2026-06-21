import { MongoClient, type Db } from "mongodb";
import { isProd } from "./security";
import { log } from "./log";

// Mongo is optional in dev (the API falls back to the in-memory data layer), but REQUIRED in production: a
// failed connect there throws so the process refuses to serve with silent, non-durable storage.
let client: MongoClient | null = null;
let db: Db | null = null;
let tried = false;

export async function getDb(): Promise<Db | null> {
  if (db || tried) {
    return db;
  }
  tried = true;

  // QINIT_NO_DB forces the in-memory data layer (tests / explicit opt-out) — never touch a real Mongo.
  if (process.env.QINIT_NO_DB === "1") {
    return db;
  }

  const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    db = client.db(process.env.DB_NAME ?? "qinit_web");
    log.info("db connected", { uri });
  } catch (e) {
    if (isProd) {
      // No silent in-memory fallback in production — that would lose data on every write.
      throw new Error(`MongoDB unavailable in production (${uri}): ${(e as Error).message}`);
    }
    log.warn("db unavailable — running on the in-memory fallback (dev only)", { error: (e as Error).message });
    db = null;
  }

  return db;
}

// Cheap liveness signal for the readiness probe (no new connection — reflects the last connect attempt).
export function mongoUp(): boolean {
  return db !== null;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close().catch(() => {});
    client = null;
    db = null;
  }
}

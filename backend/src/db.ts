import { MongoClient, type Db } from "mongodb";

// Mongo is OPTIONAL: if it's not reachable the API still serves (no cache/stats). Keeps dev frictionless.
let db: Db | null = null;
let tried = false;

export async function getDb(): Promise<Db | null> {
  if (db || tried) return db;
  tried = true;
  const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    db = client.db(process.env.DB_NAME ?? "qinit_web");
    console.log("[db] connected:", uri);
  } catch (e) {
    console.warn("[db] unavailable, running without cache/stats:", (e as Error).message);
    db = null;
  }
  return db;
}

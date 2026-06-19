import { getDb } from "./db";

const REPO = process.env.GITHUB_REPO ?? "hackerby888/qinit";
const TTL_MS = 10 * 60 * 1000; // cache GitHub release 10 min

export interface Asset { name: string; os: string; arch: string; url: string; size: number; downloads: number }
export interface Release {
  version: string; publishedAt: string; installCmd: string;
  assets: Asset[]; totalDownloads: number; cachedAt: number;
}

function classify(name: string): { os: string; arch: string } {
  const os = name.includes("linux") ? "Linux" : name.includes("darwin") ? "macOS" : name.includes("windows") ? "Windows" : "—";
  const arch = name.includes("arm64") ? "arm64" : name.includes("x64") ? "x64" : "—";
  return { os, arch };
}

// Latest qinit release, cached in Mongo (when available) to avoid GitHub rate limits.
export async function latestRelease(): Promise<Release> {
  const db = await getDb();
  if (db) {
    const cached = await db.collection<Release>("releases").findOne({}, { sort: { cachedAt: -1 } });
    if (cached && Date.now() - cached.cachedAt < TTL_MS) return cached;
  }
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { "User-Agent": "qinit-web" } });
  if (!r.ok) throw new Error(`github ${r.status}`);
  const j: any = await r.json();
  const assets: Asset[] = (j.assets ?? [])
    .filter((a: any) => a.name.startsWith("qinit-"))
    .map((a: any) => ({ name: a.name, ...classify(a.name), url: a.browser_download_url, size: a.size, downloads: a.download_count }));
  const rel: Release = {
    version: j.tag_name,
    publishedAt: j.published_at,
    installCmd: `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | sh`,
    assets,
    totalDownloads: assets.reduce((s, a) => s + a.downloads, 0),
    cachedAt: Date.now(),
  };
  if (db) await db.collection<Release>("releases").insertOne(rel as any);
  return rel;
}

// Simple visit counter (no-op without Mongo).
export async function bumpVisits(): Promise<{ visits: number }> {
  const db = await getDb();
  if (!db) return { visits: 0 };
  const doc = await db.collection<{ _id: string; count: number }>("stats").findOneAndUpdate(
    { _id: "visits" }, { $inc: { count: 1 } }, { upsert: true, returnDocument: "after" });
  return { visits: doc?.count ?? 0 };
}

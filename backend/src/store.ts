// Account + project data layer. Backed by Mongo when reachable (collections `users`, `projects`, `shares`),
// else an in-memory fallback so the cloud features still work in dev without a database (mirrors db.ts's
// "Mongo is optional" stance). Projects are scoped by userId; the in-memory maps are per-process only.
import { randomBytes } from "node:crypto";
import { getDb } from "./db";

export interface User {
  id: string; // `${provider}:${providerId}` — stable across logins
  provider: "google" | "github";
  providerId: string;
  email?: string;
  name: string;
  avatar?: string;
  createdAt: number;
  currentProjectId?: string; // last-opened project, synced across devices
}

// A stored project document — the IDE's Project shape plus the owning userId. Kept as an opaque blob (the
// backend doesn't interpret files) with the indexable fields lifted out for cheap listing.
export interface StoredProject {
  userId: string;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  doc: unknown; // the full Project JSON from the client
}

export interface ProjectMetaRow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fileCount: number;
}

// In-memory fallback when Mongo is down.
const memUsers = new Map<string, User>();
const memProjects = new Map<string, StoredProject>(); // key = `${userId}\0${id}`
const pkey = (userId: string, id: string): string => `${userId}\0${id}`;

function fileCount(doc: unknown): number {
  const files = (doc as { files?: unknown[] })?.files;
  return Array.isArray(files) ? files.length : 0;
}

export async function upsertUser(u: User): Promise<User> {
  const db = await getDb();
  if (db) {
    // createdAt only on insert; everything else on every login. (Can't $set and $setOnInsert the same path.)
    await db.collection<User>("users").updateOne(
      { id: u.id },
      { $set: { provider: u.provider, providerId: u.providerId, email: u.email, name: u.name, avatar: u.avatar }, $setOnInsert: { id: u.id, createdAt: u.createdAt } },
      { upsert: true },
    );
    return (await db.collection<User>("users").findOne({ id: u.id }, { projection: { _id: 0 } })) ?? u;
  }
  const existing = memUsers.get(u.id);
  const merged = { ...u, createdAt: existing?.createdAt ?? u.createdAt };
  memUsers.set(u.id, merged);
  return merged;
}

export async function getUser(id: string): Promise<User | null> {
  const db = await getDb();
  if (db) {
    return await db.collection<User>("users").findOne({ id }, { projection: { _id: 0 } });
  }
  return memUsers.get(id) ?? null;
}

export async function listProjects(userId: string): Promise<ProjectMetaRow[]> {
  const db = await getDb();
  if (db) {
    const rows = await db.collection<StoredProject>("projects").find({ userId }, { projection: { _id: 0, id: 1, name: 1, createdAt: 1, updatedAt: 1, doc: 1 } }).toArray();
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt, fileCount: fileCount(r.doc) }));
  }
  return [...memProjects.values()].filter((p) => p.userId === userId).map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, fileCount: fileCount(p.doc) }));
}

export async function getProject(userId: string, id: string): Promise<unknown | null> {
  const db = await getDb();
  if (db) {
    const r = await db.collection<StoredProject>("projects").findOne({ userId, id }, { projection: { _id: 0, doc: 1 } });
    return r?.doc ?? null;
  }
  return memProjects.get(pkey(userId, id))?.doc ?? null;
}

export async function saveProject(userId: string, doc: { id: string; name: string; createdAt: number; updatedAt: number }): Promise<void> {
  const row: StoredProject = { userId, id: doc.id, name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt, doc };
  const db = await getDb();
  if (db) {
    await db.collection<StoredProject>("projects").updateOne({ userId, id: doc.id }, { $set: row }, { upsert: true });
    return;
  }
  memProjects.set(pkey(userId, doc.id), row);
}

// The last-opened project for this user — a tiny per-account UI pref, synced so a second device reopens it.
export async function getCurrentProject(userId: string): Promise<string | null> {
  const db = await getDb();
  if (db) {
    const u = await db.collection<User>("users").findOne({ id: userId }, { projection: { _id: 0, currentProjectId: 1 } });
    return u?.currentProjectId ?? null;
  }
  return memUsers.get(userId)?.currentProjectId ?? null;
}

export async function setCurrentProject(userId: string, projectId: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.collection<User>("users").updateOne({ id: userId }, { $set: { currentProjectId: projectId } });
    return;
  }
  const u = memUsers.get(userId);
  if (u) {
    u.currentProjectId = projectId;
  }
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.collection<StoredProject>("projects").deleteOne({ userId, id });
    return;
  }
  memProjects.delete(pkey(userId, id));
}

// ---- shares: a short link id → a project, opened view-only or as a live collaborative session ----
export interface Share {
  linkId: string;
  ownerUserId: string;
  projectId: string;
  mode: "view" | "edit";
  createdAt: number;
  expiresAt?: number; // optional TTL; an expired share is treated as missing
}

const memShares = new Map<string, Share>(); // key = linkId

const newLinkId = (): string => randomBytes(9).toString("base64url"); // 12 url-safe chars
const isLive = (s: Share, now: number): boolean => !s.expiresAt || s.expiresAt > now;

// Create (or reuse) a share link for the owner's project. Re-clicking Share with the same mode returns the
// existing live link instead of minting a new one.
export async function createShare(ownerUserId: string, projectId: string, mode: Share["mode"], ttlMs?: number): Promise<Share> {
  const now = Date.now();
  const existing = (await listShares(ownerUserId, projectId)).find((s) => s.mode === mode);
  if (existing) {
    return existing;
  }
  const share: Share = { linkId: newLinkId(), ownerUserId, projectId, mode, createdAt: now };
  if (ttlMs && ttlMs > 0) {
    share.expiresAt = now + ttlMs;
  }
  const db = await getDb();
  if (db) {
    await db.collection<Share>("shares").insertOne(share);
  } else {
    memShares.set(share.linkId, share);
  }
  return share;
}

export async function getShare(linkId: string): Promise<Share | null> {
  const now = Date.now();
  const db = await getDb();
  if (db) {
    const s = await db.collection<Share>("shares").findOne({ linkId }, { projection: { _id: 0 } });
    return s && isLive(s, now) ? s : null;
  }
  const s = memShares.get(linkId);
  return s && isLive(s, now) ? s : null;
}

export async function listShares(ownerUserId: string, projectId: string): Promise<Share[]> {
  const now = Date.now();
  const db = await getDb();
  if (db) {
    const rows = await db.collection<Share>("shares").find({ ownerUserId, projectId }, { projection: { _id: 0 } }).toArray();
    return rows.filter((s) => isLive(s, now));
  }
  return [...memShares.values()].filter((s) => s.ownerUserId === ownerUserId && s.projectId === projectId && isLive(s, now));
}

export async function deleteShare(ownerUserId: string, linkId: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.collection<Share>("shares").deleteOne({ ownerUserId, linkId });
    return;
  }
  const s = memShares.get(linkId);
  if (s && s.ownerUserId === ownerUserId) {
    memShares.delete(linkId);
  }
}

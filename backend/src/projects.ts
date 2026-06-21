// Project CRUD, scoped to the authed user (req.userId, set by requireAuth). The client owns the document
// shape (the same Project JSON it stores locally); the server just persists/lists it. Create + update both go
// through PUT (upsert) keyed by the client-generated id.
import type { Request, Response } from "express";
import { listProjects, getProject, saveProject, deleteProject, getCurrentProject, setCurrentProject, createShare, getShare, listShares, deleteShare } from "./store";

type AuthedRequest = Request & { userId: string };

export async function projectsList(req: Request, res: Response): Promise<void> {
  res.json(await listProjects((req as AuthedRequest).userId));
}

// Last-opened project id, synced per account so a second device reopens the same project.
export async function currentGet(req: Request, res: Response): Promise<void> {
  res.json({ id: await getCurrentProject((req as AuthedRequest).userId) });
}

export async function currentPut(req: Request, res: Response): Promise<void> {
  const id = (req.body as { id?: unknown })?.id;
  if (typeof id !== "string") {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await setCurrentProject((req as AuthedRequest).userId, id);
  res.json({ ok: true });
}

export async function projectGet(req: Request, res: Response): Promise<void> {
  const doc = await getProject((req as AuthedRequest).userId, req.params.id);
  if (!doc) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(doc);
}

export async function projectPut(req: Request, res: Response): Promise<void> {
  const doc = req.body as { id?: unknown; name?: unknown; createdAt?: unknown; updatedAt?: unknown };
  if (!doc || typeof doc.id !== "string" || doc.id !== req.params.id || typeof doc.name !== "string") {
    res.status(400).json({ error: "invalid project document" });
    return;
  }
  await saveProject((req as AuthedRequest).userId, {
    ...doc,
    id: doc.id,
    name: doc.name,
    createdAt: typeof doc.createdAt === "number" ? doc.createdAt : Date.now(),
    updatedAt: Date.now(), // server owns updatedAt
  } as { id: string; name: string; createdAt: number; updatedAt: number });
  res.json({ ok: true });
}

export async function projectDelete(req: Request, res: Response): Promise<void> {
  await deleteProject((req as AuthedRequest).userId, req.params.id);
  res.json({ ok: true });
}

// ---- share links ----

// POST /api/projects/:id/share — owner mints (or reuses) a view/edit link for their project.
export async function shareCreate(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedRequest).userId;
  const projectId = req.params.id;
  const mode = (req.body as { mode?: unknown })?.mode;
  const ttlMs = (req.body as { ttlMs?: unknown })?.ttlMs;
  if (mode !== "view" && mode !== "edit") {
    res.status(400).json({ error: "mode must be 'view' or 'edit'" });
    return;
  }
  if (!(await getProject(userId, projectId))) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const share = await createShare(userId, projectId, mode, typeof ttlMs === "number" ? ttlMs : undefined);
  res.json({ linkId: share.linkId, mode: share.mode, url: `/ide/s/${share.linkId}`, expiresAt: share.expiresAt });
}

// GET /api/projects/:id/shares — owner lists existing links (for the share dialog).
export async function shareList(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedRequest).userId;
  const rows = await listShares(userId, req.params.id);
  res.json(rows.map((s) => ({ linkId: s.linkId, mode: s.mode, url: `/ide/s/${s.linkId}`, createdAt: s.createdAt, expiresAt: s.expiresAt })));
}

// DELETE /api/projects/:id/share/:linkId — owner revokes a link.
export async function shareRevoke(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedRequest).userId;
  await deleteShare(userId, req.params.linkId);
  res.json({ ok: true });
}

// GET /api/s/:linkId — PUBLIC resolve. Never leaks ownerUserId/projectId; the live doc flows over the WS,
// keyed by the link. A view link returns the current snapshot for the read-only render.
export async function shareResolve(req: Request, res: Response): Promise<void> {
  const share = await getShare(req.params.linkId);
  if (!share) {
    res.status(404).json({ error: "link not found or expired" });
    return;
  }
  const doc = (await getProject(share.ownerUserId, share.projectId)) as { name?: string; files?: unknown } | null;
  if (!doc) {
    res.status(404).json({ error: "project gone" });
    return;
  }
  if (share.mode === "view") {
    res.json({ mode: "view", name: doc.name ?? "Shared project", room: share.linkId, files: doc.files ?? [] });
    return;
  }
  res.json({ mode: "edit", name: doc.name ?? "Shared project", room: share.linkId });
}

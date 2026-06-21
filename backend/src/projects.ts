// Project CRUD, scoped to the authed user (req.userId, set by requireAuth). The client owns the document
// shape (the same Project JSON it stores locally); the server just persists/lists it. Create + update both go
// through PUT (upsert) keyed by the client-generated id.
import type { Request, Response } from "express";
import { listProjects, getProject, saveProject, deleteProject, getCurrentProject, setCurrentProject } from "./store";

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

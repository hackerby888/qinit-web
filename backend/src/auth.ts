// Auth: Google + GitHub OAuth2 (authorization-code), a self-signed HS256 JWT returned to the SPA (stored in
// localStorage, sent as `Authorization: Bearer`), and a requireAuth middleware. No external auth deps —
// JWT/state are signed with SESSION_SECRET via node:crypto. The OAuth client id/secret + callback base come
// from env; a provider with no client id returns 503 ("not configured") instead of breaking.
import type { Request, Response, NextFunction } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { upsertUser, getUser, type User } from "./store";
import { SESSION_SECRET as SECRET } from "./security";

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:5180";
const CALLBACK_BASE = process.env.OAUTH_CALLBACK_BASE ?? "http://localhost:8787";
const TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days

const b64url = (s: string): string => Buffer.from(s).toString("base64url");
const hmac = (data: string): string => createHmac("sha256", SECRET).update(data).digest("base64url");

// ---- JWT (HS256) ---- (signJwt/verifyJwt are exported for unit tests; not part of the HTTP surface)
export function signJwt(payload: Record<string, unknown>): string {
  const data = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  return `${data}.${hmac(data)}`;
}

export function verifyJwt(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const expected = hmac(`${parts[0]}.${parts[1]}`);
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>;
    if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function issueToken(user: User): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ sub: user.id, name: user.name, email: user.email, avatar: user.avatar, provider: user.provider, iat: now, exp: now + TOKEN_TTL });
}

// ---- stateless CSRF state ----
function signState(provider: string): string {
  const data = `${provider}.${randomBytes(8).toString("hex")}.${Date.now()}`;
  return b64url(`${data}.${hmac(data)}`);
}

function verifyState(state: string, provider: string): boolean {
  try {
    const raw = Buffer.from(state, "base64url").toString();
    const cut = raw.lastIndexOf(".");
    const data = raw.slice(0, cut);
    if (raw.slice(cut + 1) !== hmac(data)) {
      return false;
    }
    const [p, , ts] = data.split(".");
    return p === provider && Date.now() - Number(ts) < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

// ---- providers ----
interface Profile {
  providerId: string;
  email?: string;
  name: string;
  avatar?: string;
}

interface Provider {
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  profile: (accessToken: string) => Promise<Profile>;
}

const providers: Record<string, Provider> = {
  google: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    async profile(accessToken) {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
      const p = (await r.json()) as { sub: string; email?: string; name?: string; picture?: string };
      return { providerId: p.sub, email: p.email, name: p.name || p.email || "Google user", avatar: p.picture };
    },
  },
  github: {
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    async profile(accessToken) {
      const headers = { Authorization: `Bearer ${accessToken}`, "User-Agent": "qinit-web", Accept: "application/vnd.github+json" };
      const p = (await (await fetch("https://api.github.com/user", { headers })).json()) as { id: number; login: string; name?: string; email?: string; avatar_url?: string };
      let email = p.email;
      if (!email) {
        const emails = (await (await fetch("https://api.github.com/user/emails", { headers })).json()) as Array<{ email: string; primary: boolean }>;
        email = Array.isArray(emails) ? (emails.find((e) => e.primary)?.email ?? emails[0]?.email) : undefined;
      }
      return { providerId: String(p.id), email, name: p.name || p.login || "GitHub user", avatar: p.avatar_url };
    },
  },
};

const callbackUrl = (provider: string): string => `${CALLBACK_BASE}/api/auth/${provider}/callback`;

// GET /api/auth/:provider — redirect to the provider's consent screen.
export function startAuth(req: Request, res: Response): void {
  const cfg = providers[req.params.provider];
  if (!cfg) {
    res.status(404).json({ error: "unknown provider" });
    return;
  }
  const clientId = cfg.clientId();
  if (!clientId) {
    res.status(503).json({ error: `${req.params.provider} login isn't configured — set ${req.params.provider.toUpperCase()}_CLIENT_ID and _SECRET` });
    return;
  }
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", callbackUrl(req.params.provider));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("state", signState(req.params.provider));
  res.redirect(u.toString());
}

// GET /api/auth/:provider/callback — exchange the code, upsert the user, hand a JWT back to the SPA in the URL
// fragment (kept out of server logs; the SPA reads it and clears the hash).
export async function authCallback(req: Request, res: Response): Promise<void> {
  const provider = req.params.provider;
  const cfg = providers[provider];
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  if (!cfg || !code || !state || !verifyState(state, provider)) {
    res.redirect(`${FRONTEND}/ide#auth_error=invalid_request`);
    return;
  }
  try {
    const body = new URLSearchParams({ client_id: cfg.clientId()!, client_secret: cfg.clientSecret()!, code, redirect_uri: callbackUrl(provider), grant_type: "authorization_code" });
    const tok = (await (await fetch(cfg.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", Accept: "application/json" }, body })).json()) as { access_token?: string };
    if (!tok.access_token) {
      throw new Error("token exchange failed");
    }
    const prof = await cfg.profile(tok.access_token);
    const user = await upsertUser({ id: `${provider}:${prof.providerId}`, provider: provider as User["provider"], providerId: prof.providerId, email: prof.email, name: prof.name, avatar: prof.avatar, createdAt: Date.now() });
    res.redirect(`${FRONTEND}/ide#token=${encodeURIComponent(issueToken(user))}`);
  } catch (e) {
    res.redirect(`${FRONTEND}/ide#auth_error=${encodeURIComponent((e as Error).message)}`);
  }
}

// Verify a raw JWT and return its userId (payload.sub), or null. Used by the WebSocket collab layer, which
// authenticates from a query param rather than an Authorization header.
export function userIdFromToken(token: string | undefined | null): string | null {
  if (!token) {
    return null;
  }
  const payload = verifyJwt(token);
  return payload && typeof payload.sub === "string" ? payload.sub : null;
}

// Express middleware — require a valid Bearer JWT; sets req.userId.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? verifyJwt(token) : null;
  if (!payload || typeof payload.sub !== "string") {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  (req as Request & { userId: string }).userId = payload.sub;
  next();
}

// GET /api/me — the current user.
export async function me(req: Request, res: Response): Promise<void> {
  const u = await getUser((req as Request & { userId: string }).userId);
  if (!u) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.json({ id: u.id, name: u.name, email: u.email, avatar: u.avatar, provider: u.provider });
}

// For tests/dev: mint a token for a synthetic user (only when QINIT_DEV_AUTH=1).
export async function devToken(req: Request, res: Response): Promise<void> {
  if (process.env.QINIT_DEV_AUTH !== "1") {
    res.status(404).json({ error: "not found" });
    return;
  }
  const name = (req.query.name as string) || "Dev User";
  const id = `dev:${(req.query.id as string) || name.toLowerCase().replace(/\W+/g, "")}`;
  const user = await upsertUser({ id, provider: "google", providerId: id, email: `${id}@dev.local`, name, avatar: undefined, createdAt: Date.now() });
  res.json({ token: issueToken(user) });
}

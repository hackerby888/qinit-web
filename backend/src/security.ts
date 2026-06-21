// Boot-time security config: the session secret (validated), the CORS allowlist, and a fail-fast guard that
// refuses to start in production with an insecure config. The pure helpers (isWeakSecret / parseOrigins /
// originAllowed) are unit-tested.
import type { CorsOptions } from "cors";

const DEFAULT_SECRET = "dev-insecure-secret-change-me";

export const isProd = process.env.NODE_ENV === "production";

// The HS256 signing secret for JWTs + OAuth state. Validated by assertBootConfig() before the server listens.
export const SESSION_SECRET = process.env.SESSION_SECRET ?? DEFAULT_SECRET;

// A secret is weak if it's missing, the shipped dev default, or too short to resist brute force.
export function isWeakSecret(secret: string | undefined): boolean {
  if (!secret || secret === DEFAULT_SECRET) {
    return true;
  }
  return secret.length < 24;
}

export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// The browser origins allowed to call the API. CORS_ORIGINS (comma list) wins; else FRONTEND_URL; else the dev
// localhost ports. "*" anywhere disables the allowlist (escape hatch — don't use in production).
const ALLOWED_ORIGINS: string[] = (() => {
  const fromEnv = parseOrigins(process.env.CORS_ORIGINS);
  if (fromEnv.length > 0) {
    return fromEnv;
  }
  return process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ["http://localhost:5180", "http://localhost:5173"];
})();

// Whether a request Origin is allowed. No Origin header (curl, server-to-server) is permitted — CORS only
// governs browser cross-origin requests.
export function originAllowed(origin: string | undefined, allowed: string[] = ALLOWED_ORIGINS): boolean {
  if (!origin) {
    return true;
  }
  if (allowed.includes("*")) {
    return true;
  }
  return allowed.includes(origin);
}

export function corsOptions(): CorsOptions {
  return {
    // Allowed → reflect the origin (sets Access-Control-Allow-Origin); disallowed → no ACAO header, so the
    // browser blocks the cross-origin read. Don't throw: same-origin / curl / server-to-server still work.
    origin(origin, cb) {
      cb(null, originAllowed(origin));
    },
    credentials: true,
  };
}

// Fail-fast: in production, refuse to start with an insecure session secret. Called from index.ts at boot.
export function assertBootConfig(): void {
  if (isProd && isWeakSecret(SESSION_SECRET)) {
    throw new Error("SESSION_SECRET must be set to a strong value (>= 24 chars) in production — refusing to start.");
  }

  if (isProd && parseOrigins(process.env.CORS_ORIGINS).length === 0 && !process.env.FRONTEND_URL) {
    console.warn("[security] production with no CORS_ORIGINS/FRONTEND_URL — only localhost origins are allowed.");
  }
}

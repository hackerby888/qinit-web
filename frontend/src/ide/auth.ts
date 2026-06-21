// Client auth: a Bearer JWT in localStorage (set by the OAuth callback's #token redirect), sent on the cloud
// API calls. login(provider) is a full-page navigation to the backend, which bounces to Google/GitHub and
// back to /ide#token=… ; captureAuthRedirect() consumes that on load.
const TOKEN_KEY = "qinit.token";

export interface Me {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  provider: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthed(): boolean {
  return !!getToken();
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Begin login — the backend redirects to the provider's consent screen, then back with the token.
export function login(provider: "google" | "github"): void {
  window.location.href = `/api/auth/${provider}`;
}

export function logout(): void {
  clearToken();
}

// Auth-expiry signal — fired when a cloud request is rejected for a stale/invalid token, so the UI can warn
// ("session expired, sign in again") and drop back to the local store instead of failing silently.
type Listener = () => void;
const expiredListeners = new Set<Listener>();

export function onAuthExpired(fn: Listener): () => void {
  expiredListeners.add(fn);
  return () => {
    expiredListeners.delete(fn);
  };
}

// Called on a 401 from any authed request: clear the dead token and notify listeners (once — only if we
// actually had a token, so a routine signed-out 401 doesn't trigger the "expired" UX).
export function handleUnauthorized(): void {
  if (!getToken()) {
    return;
  }
  clearToken();
  for (const fn of expiredListeners) {
    fn();
  }
}

// On app load, consume the OAuth callback fragment (#token / #auth_error) and clean the URL.
export function captureAuthRedirect(): { error?: string } {
  const hash = window.location.hash;
  const tok = hash.match(/[#&]token=([^&]+)/);
  if (tok) {
    setToken(decodeURIComponent(tok[1]));
    history.replaceState(null, "", location.pathname + location.search);
    return {};
  }
  const err = hash.match(/[#&]auth_error=([^&]+)/);
  if (err) {
    history.replaceState(null, "", location.pathname + location.search);
    return { error: decodeURIComponent(err[1]) };
  }
  return {};
}

// The current user (null if signed out / the token is rejected — a 401 clears it).
export async function fetchMe(): Promise<Me | null> {
  const t = getToken();
  if (!t) {
    return null;
  }
  try {
    const r = await fetch("/api/me", { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) {
      if (r.status === 401) {
        handleUnauthorized();
      }
      return null;
    }
    return (await r.json()) as Me;
  } catch {
    return null;
  }
}

// Unexpected-error reporting — the popup that turns a crash into something a user can paste into a bug
// report. Deliberately generic: this module knows nothing about the compiler, the engine, the decoder or
// any other subsystem. It traps the *unhandled* channels (window errors, unhandled rejections, and — via
// CrashDialog's boundary — React render throws) and lets subsystems push context in through
// registerDiagnostic(). Anything already caught and shown to the user (the notify/<Toasts/> path) must
// never reach here, or every handled error would be reported twice.
//
// Pure (no React, no DOM at import time) → unit-tested; CrashDialog is a thin renderer over this state.

export type CrashSource = "react" | "error" | "unhandledrejection" | "manual";

export interface CrashDetail {
  name: string;
  message: string;
  stack: string | null;
}

export interface CrashReport {
  id: number;
  at: number; // first occurrence
  source: CrashSource;
  key: string; // dedupe key
  detail: CrashDetail;
  extra: string | null; // React componentStack, when the boundary supplied one
  count: number;
  alsoSeen: string[]; // distinct later errors while this report is open
}

const MAX_MSG = 500;
const MAX_STACK_LINES = 24;
const MAX_ALSO = 5;
// ponytail: exact-message dedupe — a message carrying a tick number or an id makes a fresh key every time
// and defeats it. This hard cap is the backstop; key on a normalised message if reports get noisy.
const MAX_DIALOGS = 3;
// Bumping the count on a per-frame error re-renders the dialog every frame. Stop emitting after this many;
// buildReportText() reads live state, so the copied report still carries the true count.
const EMIT_UNTIL = 10;

type Listener = (report: CrashReport | null) => void;

interface Entry {
  fn: () => string | null;
  sensitive: boolean;
}

let current: CrashReport | null = null;
let seq = 0;
let shown = 0;
const muted = new Set<string>();
const listeners = new Set<Listener>();
const diags = new Map<string, Entry>();

const emit = (): void => {
  for (const l of listeners) {
    l(current);
  }
};

// The open report, read synchronously — lets the dialog seed its state instead of rendering null first.
export function currentCrash(): CrashReport | null {
  return current;
}

export function subscribeCrash(l: Listener): () => void {
  listeners.add(l);
  l(current);
  return () => {
    listeners.delete(l);
  };
}

// Closing also mutes the message for the rest of the session. Without that, an error thrown on every frame
// re-opens the dialog the instant it is dismissed and the user can never get back to the app.
export function dismissCrash(): void {
  if (!current) {
    return;
  }
  muted.add(current.key);
  current = null;
  emit();
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…(+${s.length - n} chars)` : s);

// Object.prototype.toString never throws — `e.constructor.name` does, on an Object.create(null).
const tag = (e: unknown): string => Object.prototype.toString.call(e).slice(8, -1);

// Duck-typed: an Error crossing a worker/iframe realm boundary fails `instanceof`, and DOMException is not
// an Error subclass in every engine.
const errorLike = (e: unknown): boolean =>
  typeof e === "object" &&
  e !== null &&
  typeof (e as { message?: unknown }).message === "string" &&
  typeof (e as { name?: unknown }).name === "string";

// A rejection reason is very often not an Error. This has to survive whatever it is handed — the weird
// values are exactly the ones worth reporting.
export function describeError(e: unknown): CrashDetail {
  if (e instanceof Error || errorLike(e)) {
    const err = e as Error;
    return {
      name: String(err.name) || "Error",
      message: clip(String(err.message ?? ""), MAX_MSG) || "(no message)",
      stack: typeof err.stack === "string" ? err.stack.split("\n").slice(0, MAX_STACK_LINES).join("\n") : null,
    };
  }
  if (typeof e === "string") {
    return { name: "string", message: clip(e, MAX_MSG) || "(empty string)", stack: null };
  }
  if (e == null) {
    return { name: tag(e), message: `rejected with ${String(e)}`, stack: null };
  }
  if (typeof e === "object") {
    let body: string;
    try {
      body = JSON.stringify(e) ?? tag(e); // circular refs, throwing getters
    } catch {
      body = tag(e);
    }
    return { name: tag(e), message: clip(body, MAX_MSG), stack: null };
  }
  return { name: typeof e, message: clip(String(e), MAX_MSG), stack: null };
}

export function reportCrash(e: unknown, source: CrashSource = "manual", extra?: string): void {
  try {
    const detail = describeError(e);
    const key = detail.message || detail.name;
    if (muted.has(key)) {
      return;
    }
    if (current) {
      if (current.key === key) {
        current = { ...current, count: current.count + 1 };
        if (current.count <= EMIT_UNTIL) {
          emit();
        }
      } else if (current.alsoSeen.length < MAX_ALSO && !current.alsoSeen.includes(key)) {
        // A cascade lands in the report as a compact list — never a second dialog stacked on the first.
        current = { ...current, alsoSeen: [...current.alsoSeen, key] };
        emit();
      }
      return;
    }
    if (shown >= MAX_DIALOGS) {
      return;
    }
    shown++;
    current = { id: ++seq, at: Date.now(), source, key, detail, extra: extra ?? null, count: 1, alsoSeen: [] };
    emit();
  } catch {
    // The reporter must never throw: this runs inside an unhandledrejection handler, where throwing loops.
  }
}

// ---- diagnostics ----------------------------------------------------------
// Subsystems push their context in; this module never reaches into them. That inversion is what keeps the
// core free of any compiler/engine/decoder knowledge.

export interface DiagnosticOptions {
  sensitive?: boolean;
}

export function registerDiagnostic(key: string, fn: () => string | null, opts: DiagnosticOptions = {}): () => void {
  const entry: Entry = { fn, sensitive: !!opts.sensitive };
  diags.set(key, entry);
  // Identity-guarded so a stale unregister (StrictMode's mount→unmount→mount, HMR, a route swap) can't
  // delete whatever replaced it.
  return () => {
    if (diags.get(key) === entry) {
      diags.delete(key);
    }
  };
}

export function sensitiveKeys(): string[] {
  return [...diags.entries()].filter(([, v]) => v.sensitive).map(([k]) => k);
}

// ---- redaction ------------------------------------------------------------

const URL_RE = /\bhttps?:\/\/[^\s"'`)<>\]}]+/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
// A source location, not an app route: ".js", ".ts:412:19", ".css".
const CODE_PATH = /\.[a-z0-9]{1,5}(:\d+)*$/i;

// Keep only the first path segment; every deeper one becomes ":id". A length threshold cannot work — a
// share linkId is exactly 12 chars and IS the credential, while a docs slug can be longer. `new URL` also
// means search and hash are never reproduced, which is what closes the OAuth-token-in-the-fragment leak.
export function redactUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "<url>";
  }
  if (CODE_PATH.test(u.pathname)) {
    return u.origin + u.pathname; // keep stack frames readable
  }
  const segs = u.pathname.split("/").filter(Boolean);
  return u.origin + (segs.length ? `/${segs[0]}${"/:id".repeat(segs.length - 1)}` : "/");
}

// Applied once to the whole assembled report, so a leak is caught wherever it surfaces — a message, a stack
// frame, or a diagnostic — rather than field by field.
export function scrub(text: string): string {
  return text.replace(JWT_RE, "<jwt>").replace(URL_RE, redactUrl);
}

// ---- report ---------------------------------------------------------------

const env = (): string => {
  try {
    return (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE ?? "unknown";
  } catch {
    return "unknown";
  }
};

const here = (): string => {
  if (typeof location === "undefined") {
    return "n/a";
  }
  // Never location.href: search and hash carry the OAuth token.
  return redactUrl(location.origin + location.pathname);
};

const agent = (): string => (typeof navigator === "undefined" ? "n/a" : navigator.userAgent);

const section = (title: string, body: string | null): string => (body ? `\n[${title}]\n${body}\n` : "");

// Reads live module state rather than a passed-in snapshot, so the copied text always carries the true
// repeat count even after the emit throttle stops re-rendering the dialog.
export function buildReportText(includeSensitive: boolean): string {
  const r = current;
  if (!r) {
    return "Qinit crash report\n(no error)\n";
  }

  const head = [
    "Qinit crash report",
    `when     ${new Date(r.at).toISOString()}`,
    `where    ${here()}`,
    `mode     ${env()}`,
    `ua       ${agent()}`,
    `source   ${r.source}`,
    `seen     ${r.count}x`,
  ].join("\n");

  let body =
    head +
    "\n" +
    section("error", `${r.detail.name}: ${r.detail.message}`) +
    section("stack", r.detail.stack) +
    section("component stack", r.extra) +
    section("also seen", r.alsoSeen.length ? r.alsoSeen.map((m) => `- ${m}`).join("\n") : null);

  // Registration order, non-sensitive first; the opt-in blob goes last so a reader hits the useful bits
  // before scrolling past a contract.
  const ordered = [...diags.entries()].filter(([, v]) => !v.sensitive).concat([...diags.entries()].filter(([, v]) => v.sensitive));
  for (const [key, entry] of ordered) {
    if (entry.sensitive && !includeSensitive) {
      continue;
    }
    let value: string | null;
    try {
      value = entry.fn();
    } catch (e) {
      value = `provider failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    body += section(key, value);
  }

  return scrub(body);
}

// ---- install --------------------------------------------------------------

let installed = false;

// Called before createRoot so an error in the very first render is already covered. Idempotent, which also
// makes it safe under StrictMode and callable from tests.
export function installCrashHandlers(): void {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  // Non-capture only: the capture phase also fires for failed <img>/<script> resource loads, which are not
  // app crashes. Never preventDefault() — the browser should still log to the console.
  window.addEventListener("error", (ev: ErrorEvent) => {
    // ev.error is null for cross-origin script errors ("Script error.").
    reportCrash(ev.error ?? `${ev.message} (${ev.filename}:${ev.lineno}:${ev.colno})`, "error");
  });
  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    reportCrash(ev.reason, "unhandledrejection");
  });
}

// test-only: clear the global state between cases.
export function _resetCrash(): void {
  current = null;
  seq = 0;
  shown = 0;
  installed = false;
  muted.clear();
  listeners.clear();
  diags.clear();
}

// Turns an unexpected error into a report a user can paste into a bug ticket. Knows nothing about any
// subsystem: it traps the *unhandled* channels and subsystems push context in via registerDiagnostic().
// Anything already caught and shown to the user (the notify/<Toasts/> path) must never reach here.
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
// Backstop: a message carrying a tick number or an id defeats exact-message dedupe.
const MAX_DIALOGS = 3;
// A per-frame error would re-render every frame; the copied report still carries the true count.
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

// Duck-typed: an Error crossing a worker realm fails `instanceof`, and DOMException is not always one.
const errorLike = (e: unknown): boolean =>
  typeof e === "object" &&
  e !== null &&
  typeof (e as { message?: unknown }).message === "string" &&
  typeof (e as { name?: unknown }).name === "string";

// A rejection reason is often not an Error, and the weird values are the ones worth reporting.
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
  // Identity-guarded so a stale unregister (StrictMode remount, HMR) can't delete its replacement.
  return () => {
    if (diags.get(key) === entry) {
      diags.delete(key);
    }
  };
}

export function sensitiveKeys(): string[] {
  return [...diags.entries()]
    .filter(([, entry]) => entry.sensitive)
    .map(([key]) => key);
}

// ---- redaction ------------------------------------------------------------

const URL_RE = /\bhttps?:\/\/[^\s"'`)<>\]}]+/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
// A source location, not an app route: ".js", ".ts:412:19", ".css".
const CODE_PATH = /\.[a-z0-9]{1,5}(:\d+)*$/i;

// Keep the first path segment, collapse the rest to ":id". A length threshold cannot work: a share linkId
// is 12 chars and IS the credential. `new URL` also drops search/hash, closing the OAuth-fragment leak.
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

// Applied to the whole report, so a leak is caught wherever it surfaces rather than field by field.
export function scrub(text: string): string {
  return text.replace(JWT_RE, "<jwt>").replace(URL_RE, redactUrl);
}

// ---- report ---------------------------------------------------------------

const buildMode = (): string => {
  try {
    return (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE ?? "unknown";
  } catch {
    return "unknown";
  }
};

const currentLocation = (): string => {
  if (typeof location === "undefined") {
    return "n/a";
  }
  // Never location.href: search and hash carry the OAuth token.
  return redactUrl(location.origin + location.pathname);
};

const userAgent = (): string => (typeof navigator === "undefined" ? "n/a" : navigator.userAgent);

const section = (title: string, body: string | null): string => (body ? `\n[${title}]\n${body}\n` : "");

// Reads live module state rather than a passed-in snapshot, so the copied text always carries the true
// repeat count even after the emit throttle stops re-rendering the dialog.
export function buildReportText(includeSensitive: boolean): string {
  const report = current;
  if (!report) {
    return "Qinit crash report\n(no error)\n";
  }

  const header = [
    "Qinit crash report",
    `when     ${new Date(report.at).toISOString()}`,
    `where    ${currentLocation()}`,
    `mode     ${buildMode()}`,
    `ua       ${userAgent()}`,
    `source   ${report.source}`,
    `seen     ${report.count}x`,
  ].join("\n");

  const alsoSeenList = report.alsoSeen.map((message) => `- ${message}`).join("\n");

  let body =
    header +
    "\n" +
    section("error", `${report.detail.name}: ${report.detail.message}`) +
    section("stack", report.detail.stack) +
    section("component stack", report.extra) +
    section("also seen", alsoSeenList || null);

  // Registration order, but the opt-in blob goes last so a reader hits the useful bits before a contract.
  const entries = [...diags.entries()];
  const ordered = [
    ...entries.filter(([, entry]) => !entry.sensitive),
    ...entries.filter(([, entry]) => entry.sensitive),
  ];

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

// The browser delivers this as an error event when a resize observer (the editor's auto-layout) could not finish
// in one frame. Layout catches up on the next frame; nothing in the app failed.
export function isBrowserNotice(message: string | undefined): boolean {
  return /^ResizeObserver loop /.test(message ?? "");
}

// Monaco rejects a pending task with an error named and worded "Canceled" when a model is swapped or disposed.
// Nothing went wrong; reporting it put the crash dialog over the page for switching files.
export function isCancellation(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "Canceled" && reason.message === "Canceled";
}

let installed = false;

// Called before createRoot so the first render is covered. Idempotent: StrictMode-safe and test-callable.
export function installCrashHandlers(): void {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  // Non-capture only: the capture phase also fires for failed <img>/<script> resource loads, which are not
  // app crashes. Never preventDefault() — the browser should still log to the console.
  window.addEventListener("error", (ev: ErrorEvent) => {
    if (isBrowserNotice(ev.message)) {
      return;
    }
    // ev.error is null for cross-origin script errors ("Script error.").
    reportCrash(ev.error ?? `${ev.message} (${ev.filename}:${ev.lineno}:${ev.colno})`, "error");
  });
  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    if (!isCancellation(ev.reason)) {
      reportCrash(ev.reason, "unhandledrejection");
    }
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

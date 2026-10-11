// Global toast notifications — a tiny module-level pub/sub so any part of the IDE can surface a LOUD error
// without prop-drilling. The <Toasts/> surface (rendered once per page) subscribes and renders the stack.
// Pure (no React, no DOM) → unit-tested; the component owns the auto-dismiss timer.

export type ToastKind = "error" | "warn" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const l of listeners) {
    l(toasts);
  }
};

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  l(toasts);
  return () => {
    listeners.delete(l);
  };
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

// De-dupe identical messages (a dead backend retried on every auto-save shouldn't stack), cap the visible
// stack, and return the toast id.
function push(kind: ToastKind, message: string): number {
  const existing = toasts.find((t) => t.kind === kind && t.message === message);
  if (existing) {
    return existing.id;
  }
  const id = ++seq;
  toasts = [...toasts, { id, kind, message }].slice(-5);
  emit();
  return id;
}

export const notify = {
  error: (m: string): number => push("error", m),
  warn: (m: string): number => push("warn", m),
  info: (m: string): number => push("info", m),
};

// A dead backend / lost network surfaces as one of these opaque fetch errors — translate to something a
// user can act on rather than echoing "TypeError: Failed to fetch".
const NETWORK = /failed to fetch|networkerror|load failed|err_connection|fetch failed|connection refused|err_network|the network connection was lost/i;

export function errorMessage(e: unknown, context?: string): string {
  const raw = e instanceof Error ? e.message : e == null ? "" : String(e);
  const friendly = NETWORK.test(raw) ? "Can't reach the server — is the backend running?" : raw || "Something went wrong.";
  return context ? `${context}: ${friendly}` : friendly;
}

// test-only: clear the global state between cases.
export function _resetToasts(): void {
  toasts = [];
  seq = 0;
  listeners.clear();
}

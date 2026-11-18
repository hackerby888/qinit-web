// Escape closes the overlay on top, and only that one. Each overlay used to listen on the window by itself,
// so one key press closed every overlay that was open.
import { useEffect, useRef } from "react";

const handlers: Array<() => void> = [];

// Add a handler above the ones already there; the returned function takes it off again.
export function pushEscape(handler: () => void): () => void {
  handlers.push(handler);
  return () => {
    const at = handlers.lastIndexOf(handler);
    if (at >= 0) {
      handlers.splice(at, 1);
    }
  };
}

// Run the newest handler. False when nothing is open.
export function runEscape(): boolean {
  const top = handlers[handlers.length - 1];
  if (!top) {
    return false;
  }
  top();
  return true;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    runEscape();
  }
}

export function useEscape(onEscape: () => void, active = true): void {
  const latest = useRef(onEscape);
  latest.current = onEscape;

  useEffect(() => {
    if (!active) {
      return;
    }
    const release = pushEscape(() => latest.current());
    if (handlers.length === 1) {
      window.addEventListener("keydown", onKeyDown);
    }
    return () => {
      release();
      if (handlers.length === 0) {
        window.removeEventListener("keydown", onKeyDown);
      }
    };
  }, [active]);
}

// DEV-ONLY triggers for the crash reporter — a kept debugging aid, not leftover scaffolding, so don't
// sweep it as dead code. Every use site is behind `import.meta.env.DEV`, so none of it reaches a production
// bundle. installCrashDev() prints the command list to the console on each dev boot.
//
// The reporter only ever sees *unhandled* errors, which are by definition hard to produce on demand; these
// give you one reliable trigger per channel.
//
// In the browser console:
//   __crash.sync()    → a synchronous throw            (window "error" channel)
//   __crash.reject()  → a non-Error rejection          (unhandledrejection channel)
//   __crash.loop()    → the same error every 50ms      (expect ONE popup with a ×N badge, not a storm)
//   __crash.stop()    → stop the loop
//   __crash.render()  → throw during a React render    (error-boundary channel; app is replaced by the
//                       fallback afterwards — that is the point, reload to recover)
import { useSyncExternalStore } from "react";

let armed = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = (): number => armed;

// Rendered inside CrashBoundary so a throw here exercises the real boundary path.
export function CrashDevTrigger(): null {
  const n = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (n > 0) {
    throw new Error("dev: render boom");
  }
  return null;
}

export function installCrashDev(): void {
  let timer: ReturnType<typeof setInterval> | null = null;
  (globalThis as unknown as { __crash: unknown }).__crash = {
    sync: () => {
      setTimeout(() => {
        throw new Error("dev: sync boom");
      });
    },
    reject: () => {
      void Promise.reject("dev: not an error object");
    },
    loop: (ms = 50) => {
      timer ??= setInterval(() => {
        void Promise.reject(new Error("dev: loop boom"));
      }, ms);
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    render: () => {
      armed++;
      for (const l of listeners) {
        l();
      }
    },
  };
  console.info("[crash dev] __crash.sync() · .reject() · .loop() / .stop() · .render()");
}

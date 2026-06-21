// Build concurrency pool + result cache. Split out of compile.ts so the pool *stats* (buildQueueState /
// buildCacheSize) can be read without importing compile.ts — which pulls @qinit/build (the sibling toolchain,
// absent in the self-contained test/CI env). The metrics layer imports from here; compile.ts owns the actual
// clang invocation. Pure (node:os only) → unit-testable, no sibling dependency.
import { cpus } from "node:os";

// One clang on one TU is single-threaded, so the throughput lever is running several builds at once — up to
// LIMIT in parallel, the rest queued. Default ~ (cores − 1) capped at 8 (clang is RAM-heavy); env overrides.
const LIMIT = Math.max(1, Number(process.env.QINIT_BUILD_CONCURRENCY) || Math.min(8, Math.max(1, (cpus()?.length ?? 4) - 1)));
let active = 0;  // builds running now
let queued = 0;  // builds waiting for a slot
const waiters: Array<() => void> = [];

// Memoized build results, keyed by a hash of the request. Stored as unknown so this module stays free of the
// CompileResponse type (which lives with the toolchain in compile.ts).
const cache = new Map<string, unknown>();

// Snapshot of the pool, for the /api/compile/queue endpoint the IDE polls while a build is pending.
export function buildQueueState(): { active: number; queued: number; limit: number } {
  return { active, queued, limit: LIMIT };
}

// Number of memoized build results — surfaced on the admin dashboard (cache hits skip the clang pool).
export function buildCacheSize(): number {
  return cache.size;
}

export function cacheGet<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function cacheSet(key: string, value: unknown): void {
  cache.set(key, value);
}

// Run `fn` once a build slot is free; releases the slot (and wakes the next waiter) when done.
export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= LIMIT) {
    queued++;
    await new Promise<void>((resolve) => waiters.push(resolve));
    queued--;
  }

  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = waiters.shift();
    if (next) {
      next();
    }
  }
}

// Process lifecycle: a readiness probe (distinct from liveness) + graceful shutdown. Readiness says "can this
// instance serve durably" — gated on Mongo (the durable store), except when the in-memory layer is intentional
// (QINIT_NO_DB). Shutdown drains in-flight requests and closes the sampler / collab sockets / DB on SIGTERM.
import type { Server } from "node:http";
import { closeDb, mongoUp } from "./db";
import { closeCollab } from "./collab";
import { stopMetricsSampler } from "./metrics";
import { redisUrl } from "./redis";
import { log } from "./log";

export interface Readiness {
  ready: boolean;
  mongo: boolean;
  redis: "configured" | "off";
}

// Pure: ready when Mongo is up, or when the in-memory layer is intentional (QINIT_NO_DB). Redis is optional
// (collab degrades to single-instance without it), so it never blocks readiness — only reported.
export function isReady(mongoConnected: boolean, noDb: boolean): boolean {
  return noDb || mongoConnected;
}

export function readinessSnapshot(): Readiness {
  return {
    ready: isReady(mongoUp(), process.env.QINIT_NO_DB === "1"),
    mongo: mongoUp(),
    redis: redisUrl() !== null ? "configured" : "off",
  };
}

let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

// Drain on SIGTERM/SIGINT: stop the sampler, stop accepting + let in-flight requests finish, close collab +
// DB, then exit. A hard-exit fallback fires if draining stalls past the grace window.
export function installGracefulShutdown(server: Server, graceMs = 10_000): void {
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info("shutdown: draining", { signal });

    const force = setTimeout(() => {
      log.warn("shutdown: grace window elapsed — forcing exit");
      process.exit(1);
    }, graceMs);
    force.unref?.();

    stopMetricsSampler();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeCollab();
    await closeDb();

    clearTimeout(force);
    log.info("shutdown: complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

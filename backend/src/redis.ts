// Redis is OPTIONAL: only used when REDIS_URL is set, to fan collab updates across backend instances.
// With no REDIS_URL the collab layer runs single-instance (in-memory relay) — keeps dev frictionless.
import Redis from "ioredis";
import { log } from "./log";

let checked = false;
let url: string | null = null;

export function redisUrl(): string | null {
  if (!checked) {
    checked = true;
    url = process.env.REDIS_URL ?? null;
  }
  return url;
}

// A fresh connection. Pub/sub needs separate clients (a subscriber connection can't issue normal commands),
// so the caller decides how many to make. Returns null when Redis isn't configured.
export function makeRedis(): Redis | null {
  const u = redisUrl();
  if (!u) {
    return null;
  }
  const client = new Redis(u, { maxRetriesPerRequest: null });
  client.on("error", (e) => log.warn("redis error", { error: (e as Error).message }));
  return client;
}

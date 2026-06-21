// A small fixed-window rate limiter (per-IP, in-memory). No external dep — fits the hand-rolled style of the
// auth/collab layers. The window decision (rateStep) is pure + unit-tested; the middleware wraps it with a
// per-key Map and 429 + Retry-After headers. In-memory = per-instance; a multi-instance deploy behind a load
// balancer should front this with a shared store, but this is a solid first layer against abuse/DoS.
import type { Request, Response, NextFunction, RequestHandler } from "express";

export interface RateState {
  count: number;
  resetAt: number;
}

export interface RateOptions {
  windowMs: number;
  limit: number;
}

// Fold one request into a key's window. Starts a fresh window when none exists or the prior one expired.
export function rateStep(prev: RateState | undefined, now: number, windowMs: number, limit: number): { state: RateState; allowed: boolean; remaining: number } {
  if (!prev || now >= prev.resetAt) {
    return { state: { count: 1, resetAt: now + windowMs }, allowed: true, remaining: Math.max(0, limit - 1) };
  }

  const count = prev.count + 1;
  return { state: { count, resetAt: prev.resetAt }, allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function rateLimit({ windowMs, limit }: RateOptions): RequestHandler {
  const hits = new Map<string, RateState>();

  // Periodically drop expired entries so the map doesn't grow unbounded with one-off IPs.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of hits) {
      if (now >= state.resetAt) {
        hits.delete(key);
      }
    }
  }, windowMs);
  sweeper.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = clientKey(req);
    const r = rateStep(hits.get(key), now, windowMs, limit);
    hits.set(key, r.state);

    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(r.remaining));

    if (!r.allowed) {
      res.setHeader("Retry-After", String(Math.ceil((r.state.resetAt - now) / 1000)));
      res.status(429).json({ error: "rate limit exceeded — slow down" });
      return;
    }

    next();
  };
}

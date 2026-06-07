// server/lib/rateLimit.ts
//
// Production-grade rate limiting for sensitive endpoints.
//
// Backing store:
//   - When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set (Vercel /
//     prod), limits are enforced in Upstash Redis with a sliding window. This is
//     globally consistent across all serverless instances and survives cold
//     starts — the only reliable option on Vercel, where each function instance
//     has its own memory.
//   - When those env vars are missing (local dev), we fall back to a per-process
//     in-memory fixed-window limiter. Good enough for development; NOT reliable
//     in a multi-instance production deployment (hence the Redis path above).
//
// Two entry points:
//   - rateLimit({ windowMs, max, message? })  -> Express middleware, IP-keyed.
//       Backwards-compatible with the original admin-login limiter.
//   - limitGuard(req, res, rules, message?)    -> programmatic multi-key guard
//       for routes that need to limit on more than IP (e.g. IP + locationId +
//       phone). Call it inside the handler after the relevant body fields are
//       known; returns true when the request was blocked (and a 429 already
//       sent), so the caller can `if (await limitGuard(...)) return;`.

import type { Request, Response, NextFunction } from "express";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const GENERIC_MESSAGE = "Too many requests. Please try again later.";

// ---------------------------------------------------------------------------
// Redis client (lazy, optional). Absent in local dev -> in-memory fallback.
// ---------------------------------------------------------------------------
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

export const rateLimitBackend: "redis" | "memory" = redis ? "redis" : "memory";

const isProd = process.env.NODE_ENV === "production";

/**
 * Print, once, which rate-limit backend is active. Safe to call from server
 * startup and from the serverless entrypoint. In production without Redis it
 * prints a very obvious multi-line warning banner — the limiter still runs
 * (in-memory) rather than crashing, but the banner makes the misconfiguration
 * impossible to miss in the Vercel logs.
 */
let statusLogged = false;
export function logRateLimitStatus(): void {
  if (statusLogged) return;
  statusLogged = true;

  if (rateLimitBackend === "redis") {
    console.log("[rate-limit] backend=redis (Upstash) — globally consistent.");
    return;
  }

  if (isProd) {
    console.warn(
      "\n" +
        "========================================================================\n" +
        "  ⚠️  RATE LIMITING IS USING THE IN-MEMORY FALLBACK IN PRODUCTION  ⚠️\n" +
        "  UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set.\n" +
        "  On Vercel each function instance has its own memory, so limits are\n" +
        "  per-instance and effectively bypassable. Set both env vars in the\n" +
        "  Vercel project and redeploy to get globally-consistent limits.\n" +
        "========================================================================\n",
    );
  } else {
    console.log(
      "[rate-limit] backend=memory (in-process fallback) — fine for local dev. " +
        "Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to use Redis.",
    );
  }
}

// Log immediately on module load too, so even the serverless cold-start path
// (which doesn't run the app.listen callback) surfaces the backend in logs.
logRateLimitStatus();

// ---------------------------------------------------------------------------
// Client IP extraction (behind Vercel's proxy).
// ---------------------------------------------------------------------------
/** Best-effort client IP behind Vercel's proxy (first x-forwarded-for hop). */
export function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// ---------------------------------------------------------------------------
// In-memory fallback (fixed window) — dev only.
// ---------------------------------------------------------------------------
type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();

function memoryLimit(
  fullKey: string,
  windowMs: number,
  max: number,
): { success: boolean; retryAfterSec: number } {
  const now = Date.now();
  const existing = memoryBuckets.get(fullKey);
  if (!existing || now >= existing.resetAt) {
    memoryBuckets.set(fullKey, { count: 1, resetAt: now + windowMs });
    return { success: true, retryAfterSec: 0 };
  }
  existing.count += 1;
  if (existing.count > max) {
    return {
      success: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { success: true, retryAfterSec: 0 };
}

// ---------------------------------------------------------------------------
// Redis limiter cache — one Ratelimit instance per (window, max) config.
// ---------------------------------------------------------------------------
const redisLimiters = new Map<string, Ratelimit>();

function getRedisLimiter(windowMs: number, max: number): Ratelimit {
  const cacheKey = `${windowMs}:${max}`;
  let limiter = redisLimiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      // Sliding window keeps limits smooth across window boundaries. Upstash
      // accepts a millisecond Duration string ("600000 ms").
      limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
      prefix: "seatping:rl",
      analytics: false,
    });
    redisLimiters.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Core check for a single namespaced key. Returns whether the request is
 * allowed and, when blocked, how many seconds until the window resets.
 * Fails open on Redis errors so a store outage never takes down the app.
 */
async function checkOne(
  fullKey: string,
  windowMs: number,
  max: number,
): Promise<{ success: boolean; retryAfterSec: number }> {
  if (redis) {
    try {
      const res = await getRedisLimiter(windowMs, max).limit(fullKey);
      const retryAfterSec = res.success
        ? 0
        : Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
      return { success: res.success, retryAfterSec };
    } catch (err) {
      console.error("[rate-limit] redis error, allowing request:", err);
      return { success: true, retryAfterSec: 0 };
    }
  }
  return memoryLimit(fullKey, windowMs, max);
}

function send429(res: Response, retryAfterSec: number, message?: string): false {
  if (retryAfterSec > 0) res.setHeader("Retry-After", String(retryAfterSec));
  res.status(429).json({ error: message ?? GENERIC_MESSAGE });
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a fixed/sliding-window limiter middleware keyed by client IP.
 * Backwards-compatible with the original signature.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  message?: string;
  /** Namespace so different IP-keyed limiters don't share a counter. */
  name?: string;
}) {
  const { windowMs, max } = opts;
  const message = opts.message ?? GENERIC_MESSAGE;
  const name = opts.name ?? "ip";

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    void checkOne(`${name}:${clientIp(req)}`, windowMs, max)
      .then(({ success, retryAfterSec }) => {
        if (success) return next();
        send429(res, retryAfterSec, message);
      })
      .catch(() => next()); // fail open
  };
}

/** A single rule in a multi-key guard. Rules with an empty key are skipped. */
export type RateLimitRule = {
  /** Namespace, e.g. "queue-join-ip" or "queue-join-target". */
  name: string;
  /** Identifying value (IP, locationId, normalized phone/email, ...). */
  key: string | null | undefined;
  windowMs: number;
  max: number;
};

/**
 * Enforce several rate-limit rules at once (e.g. a per-IP rule AND a
 * per-target rule). If ANY rule is exceeded, sends a single generic 429 and
 * returns true. Returns false when the request may proceed.
 *
 * Usage:
 *   if (await limitGuard(req, res, [
 *     { name: "queue-join-ip", key: clientIp(req), windowMs: 3_600_000, max: 10 },
 *     { name: "queue-join-target", key: `${locationId}:${phone}`, windowMs: 600_000, max: 3 },
 *   ])) return;
 */
export async function limitGuard(
  req: Request,
  res: Response,
  rules: RateLimitRule[],
  message?: string,
): Promise<boolean> {
  const active = rules.filter(
    (r) => r.key != null && String(r.key).trim() !== "",
  );
  if (active.length === 0) return false;

  const results = await Promise.all(
    active.map((r) =>
      checkOne(`${r.name}:${String(r.key).trim()}`, r.windowMs, r.max),
    ),
  );

  const blockedIdx = results.findIndex((r) => !r.success);
  if (blockedIdx === -1) return false;

  const retryAfterSec = Math.max(
    ...results.filter((r) => !r.success).map((r) => r.retryAfterSec),
  );
  send429(res, retryAfterSec, message);
  return true;
}

// Common window constants for callers.
export const MINUTES = (n: number) => n * 60 * 1000;
export const HOURS = (n: number) => n * 60 * 60 * 1000;

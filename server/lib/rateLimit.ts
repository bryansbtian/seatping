
import type { Request, Response, NextFunction } from "express";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const GENERIC_MESSAGE = "Too many requests. Please try again later.";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

export const rateLimitBackend: "redis" | "memory" = redis ? "redis" : "memory";

const isProd = process.env.NODE_ENV === "production";

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

logRateLimitStatus();

export function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

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

function memoryPeek(fullKey: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const existing = memoryBuckets.get(fullKey);
  if (!existing || now >= existing.resetAt) return true;
  return existing.count < max;
}

const redisLimiters = new Map<string, Ratelimit>();

function getRedisLimiter(windowMs: number, max: number): Ratelimit {
  const cacheKey = `${windowMs}:${max}`;
  let limiter = redisLimiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
      prefix: "seatping:rl",
      analytics: false,
    });
    redisLimiters.set(cacheKey, limiter);
  }
  return limiter;
}

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


export function rateLimit(opts: {
  windowMs: number;
  max: number;
  message?: string;
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
      .catch(() => next());
  };
}

export type RateLimitRule = {
  name: string;
  key: string | null | undefined;
  windowMs: number;
  max: number;
};

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

export async function consumeQuota(
  name: string,
  key: string | null | undefined,
  windowMs: number,
  max: number,
): Promise<boolean> {
  if (key == null || String(key).trim() === "") return true;
  const { success } = await checkOne(
    `${name}:${String(key).trim()}`,
    windowMs,
    max,
  );
  return success;
}

export async function peekQuota(
  name: string,
  key: string | null | undefined,
  windowMs: number,
  max: number,
): Promise<boolean> {
  if (key == null || String(key).trim() === "") return true;
  const fullKey = `${name}:${String(key).trim()}`;
  if (redis) {
    try {
      const { remaining } = await getRedisLimiter(windowMs, max).getRemaining(
        fullKey,
      );
      return remaining > 0;
    } catch (err) {
      console.error("[rate-limit] redis peek error, allowing:", err);
      return true;
    }
  }
  return memoryPeek(fullKey, windowMs, max);
}

export const MINUTES = (n: number) => n * 60 * 1000;
export const HOURS = (n: number) => n * 60 * 60 * 1000;
export const DAYS = (n: number) => n * 24 * 60 * 60 * 1000;

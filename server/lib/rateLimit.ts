// server/lib/rateLimit.ts
//
// Minimal dependency-free, in-memory fixed-window rate limiter for sensitive
// endpoints (e.g. admin login brute-force protection). Keyed by client IP.
//
// Serverless caveat: on Vercel each function instance has its own memory, so the
// counter is per-instance and resets on cold start. That's intentionally a
// best-effort throttle — it meaningfully slows a brute-force attempt against the
// single admin credential without requiring an external store. For stronger,
// globally-consistent limits later, back this with Upstash Redis / @upstash/ratelimit.

import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

/** Best-effort client IP behind Vercel's proxy. */
function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Build a fixed-window limiter middleware.
 * @param opts.windowMs  window length in ms
 * @param opts.max       max requests per IP per window
 * @param opts.message   generic message returned on 429 (no detail leaked)
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const { windowMs, max } = opts;
  const message = opts.message ?? "Too many requests. Please try again later.";
  const buckets = new Map<string, Bucket>();

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const now = Date.now();
    const key = clientIp(req);
    const existing = buckets.get(key);

    if (!existing || now >= existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

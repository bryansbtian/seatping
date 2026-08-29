import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const ORIGINAL_ENV = { ...process.env };

type FakeRes = Response & {
  statusCode: number | null;
  body: unknown;
  headers: Record<string, string>;
};

function fakeRes(): FakeRes {
  const res = {
    statusCode: null as number | null,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as FakeRes;
}

function fakeReq(overrides: Record<string, unknown> = {}): Request {
  return { headers: {}, ip: "10.0.0.1", socket: {}, ...overrides } as unknown as Request;
}

async function loadMemoryModule() {
  vi.resetModules();
  process.env.UPSTASH_REDIS_REST_URL = "";
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
  return import("../../server/lib/rateLimit.js");
}

function runMiddleware(
  middleware: (req: Request, res: Response, next: () => void) => void,
  req: Request,
  res: Response,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (passed: boolean) => {
      if (!settled) {
        settled = true;
        resolve(passed);
      }
    };
    const patched = res as FakeRes;
    const originalJson = patched.json.bind(patched);
    patched.json = (payload: unknown) => {
      const out = originalJson(payload);
      finish(false);
      return out;
    };
    middleware(req, patched as unknown as Response, () => finish(true));
  });
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@upstash/redis");
  vi.doUnmock("@upstash/ratelimit");
});

describe("clientIp", () => {
  it("prefers the first hop of a forwarded header", async () => {
    const { clientIp } = await loadMemoryModule();

    expect(clientIp(fakeReq({ headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" } }))).toBe(
      "203.0.113.7",
    );
  });

  it("reads a forwarded header that arrived as a list", async () => {
    const { clientIp } = await loadMemoryModule();

    expect(clientIp(fakeReq({ headers: { "x-forwarded-for": ["203.0.113.9"] } }))).toBe(
      "203.0.113.9",
    );
  });

  it("falls back to the request ip when the forwarded header is empty", async () => {
    const { clientIp } = await loadMemoryModule();

    expect(clientIp(fakeReq({ headers: { "x-forwarded-for": "" } }))).toBe("10.0.0.1");
    expect(clientIp(fakeReq({ headers: { "x-forwarded-for": [] } }))).toBe("10.0.0.1");
  });

  it("falls back to the socket address, then to unknown", async () => {
    const { clientIp } = await loadMemoryModule();

    expect(clientIp(fakeReq({ ip: undefined, socket: { remoteAddress: "198.51.100.2" } }))).toBe(
      "198.51.100.2",
    );
    expect(clientIp(fakeReq({ ip: undefined, socket: {} }))).toBe("unknown");
    expect(clientIp(fakeReq({ ip: undefined, socket: undefined }))).toBe("unknown");
  });
});

describe("rateLimit middleware on the memory backend", () => {
  it("passes requests through until the window is spent", async () => {
    const { rateLimit } = await loadMemoryModule();
    const middleware = rateLimit({ name: "test-pass", windowMs: 60_000, max: 2 });

    expect(await runMiddleware(middleware, fakeReq({ ip: "1.1.1.1" }), fakeRes())).toBe(true);
    expect(await runMiddleware(middleware, fakeReq({ ip: "1.1.1.1" }), fakeRes())).toBe(true);
  });

  it("answers 429 with a Retry-After header once the window is spent", async () => {
    const { rateLimit } = await loadMemoryModule();
    const middleware = rateLimit({ name: "test-block", windowMs: 60_000, max: 1 });

    await runMiddleware(middleware, fakeReq({ ip: "2.2.2.2" }), fakeRes());

    const res = fakeRes();
    expect(await runMiddleware(middleware, fakeReq({ ip: "2.2.2.2" }), res)).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "Too many requests. Please try again later." });
    expect(Number(res.headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("uses the message the caller supplied", async () => {
    const { rateLimit } = await loadMemoryModule();
    const middleware = rateLimit({ windowMs: 60_000, max: 1, message: "Slow down" });

    await runMiddleware(middleware, fakeReq({ ip: "3.3.3.3" }), fakeRes());

    const res = fakeRes();
    await runMiddleware(middleware, fakeReq({ ip: "3.3.3.3" }), res);

    expect(res.body).toEqual({ error: "Slow down" });
  });

  it("keeps separate budgets per caller", async () => {
    const { rateLimit } = await loadMemoryModule();
    const middleware = rateLimit({ name: "test-split", windowMs: 60_000, max: 1 });

    expect(await runMiddleware(middleware, fakeReq({ ip: "5.5.5.5" }), fakeRes())).toBe(true);
    expect(await runMiddleware(middleware, fakeReq({ ip: "6.6.6.6" }), fakeRes())).toBe(true);
    expect(await runMiddleware(middleware, fakeReq({ ip: "5.5.5.5" }), fakeRes())).toBe(false);
  });

  it("starts a fresh window once the old one has passed", async () => {
    vi.useFakeTimers();
    try {
      const { rateLimit } = await loadMemoryModule();
      const middleware = rateLimit({ name: "test-window", windowMs: 1_000, max: 1 });

      await runMiddleware(middleware, fakeReq({ ip: "4.4.4.4" }), fakeRes());
      expect(await runMiddleware(middleware, fakeReq({ ip: "4.4.4.4" }), fakeRes())).toBe(false);

      vi.setSystemTime(Date.now() + 2_000);

      expect(await runMiddleware(middleware, fakeReq({ ip: "4.4.4.4" }), fakeRes())).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("limitGuard", () => {
  it("lets the request through when every rule is blank", async () => {
    const { limitGuard, MINUTES } = await loadMemoryModule();
    const res = fakeRes();

    const blocked = await limitGuard(fakeReq(), res, [
      { name: "blank", key: null, windowMs: MINUTES(1), max: 1 },
      { name: "blank", key: "   ", windowMs: MINUTES(1), max: 1 },
      { name: "blank", key: undefined, windowMs: MINUTES(1), max: 1 },
    ]);

    expect(blocked).toBe(false);
    expect(res.statusCode).toBeNull();
  });

  it("lets the request through while the rules still have room", async () => {
    const { limitGuard, MINUTES } = await loadMemoryModule();

    const blocked = await limitGuard(fakeReq(), fakeRes(), [
      { name: "guard-open", key: "business-1", windowMs: MINUTES(1), max: 5 },
    ]);

    expect(blocked).toBe(false);
  });

  it("blocks and reports the longest retry once a rule is spent", async () => {
    const { limitGuard, MINUTES } = await loadMemoryModule();
    const rules = [
      { name: "guard-slow", key: "business-2", windowMs: MINUTES(10), max: 1 },
      { name: "guard-fast", key: "business-2", windowMs: MINUTES(1), max: 1 },
    ];

    await limitGuard(fakeReq(), fakeRes(), rules);
    const res = fakeRes();
    const blocked = await limitGuard(fakeReq(), res, rules, "Too many bookings");

    expect(blocked).toBe(true);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "Too many bookings" });
    expect(Number(res.headers["Retry-After"])).toBeGreaterThan(60);
  });

  it("ignores the blank rules and still weighs the real one", async () => {
    const { limitGuard, MINUTES } = await loadMemoryModule();
    const rules = [
      { name: "guard-mixed-blank", key: null, windowMs: MINUTES(1), max: 1 },
      { name: "guard-mixed", key: "business-3", windowMs: MINUTES(1), max: 1 },
    ];

    expect(await limitGuard(fakeReq(), fakeRes(), rules)).toBe(false);
    expect(await limitGuard(fakeReq(), fakeRes(), rules)).toBe(true);
  });
});

describe("consumeQuota", () => {
  it("treats a blank key as unlimited", async () => {
    const { consumeQuota, MINUTES } = await loadMemoryModule();

    expect(await consumeQuota("quota", null, MINUTES(1), 1)).toBe(true);
    expect(await consumeQuota("quota", "  ", MINUTES(1), 1)).toBe(true);
    expect(await consumeQuota("quota", undefined, MINUTES(1), 1)).toBe(true);
  });

  it("spends the quota and then refuses", async () => {
    const { consumeQuota, MINUTES } = await loadMemoryModule();

    expect(await consumeQuota("quota-spend", "guest-1", MINUTES(1), 1)).toBe(true);
    expect(await consumeQuota("quota-spend", "guest-1", MINUTES(1), 1)).toBe(false);
  });

  it("trims the key before spending against it", async () => {
    const { consumeQuota, MINUTES } = await loadMemoryModule();

    expect(await consumeQuota("quota-trim", " guest-2 ", MINUTES(1), 1)).toBe(true);
    expect(await consumeQuota("quota-trim", "guest-2", MINUTES(1), 1)).toBe(false);
  });
});

describe("peekQuota", () => {
  it("treats a blank key as unlimited", async () => {
    const { peekQuota, MINUTES } = await loadMemoryModule();

    expect(await peekQuota("peek", null, MINUTES(1), 1)).toBe(true);
    expect(await peekQuota("peek", "   ", MINUTES(1), 1)).toBe(true);
    expect(await peekQuota("peek", undefined, MINUTES(1), 1)).toBe(true);
  });

  it("reports room without spending any of it", async () => {
    const { consumeQuota, peekQuota, MINUTES } = await loadMemoryModule();

    expect(await peekQuota("peek-room", "guest-2", MINUTES(1), 1)).toBe(true);
    expect(await peekQuota("peek-room", "guest-2", MINUTES(1), 1)).toBe(true);
    expect(await consumeQuota("peek-room", "guest-2", MINUTES(1), 1)).toBe(true);
    expect(await peekQuota("peek-room", "guest-2", MINUTES(1), 1)).toBe(false);
  });

  it("reports room again once the window has rolled over", async () => {
    vi.useFakeTimers();
    try {
      const { consumeQuota, peekQuota } = await loadMemoryModule();

      await consumeQuota("peek-roll", "guest-3", 1_000, 1);
      expect(await peekQuota("peek-roll", "guest-3", 1_000, 1)).toBe(false);

      vi.setSystemTime(Date.now() + 2_000);

      expect(await peekQuota("peek-roll", "guest-3", 1_000, 1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("window helpers", () => {
  it("converts to milliseconds", async () => {
    const { MINUTES, HOURS, DAYS } = await loadMemoryModule();

    expect(MINUTES(2)).toBe(120_000);
    expect(HOURS(2)).toBe(7_200_000);
    expect(DAYS(1)).toBe(86_400_000);
  });
});

describe("the redis backend", () => {
  const limit = vi.fn();
  const getRemaining = vi.fn();

  beforeEach(() => {
    limit.mockReset();
    getRemaining.mockReset();
    vi.doMock("@upstash/redis", () => {
      return { Redis: class {} };
    });
    vi.doMock("@upstash/ratelimit", () => {
      class Ratelimit {
        limit = limit;
        getRemaining = getRemaining;
        static slidingWindow() {
          return "sliding";
        }
      }
      return { Ratelimit };
    });
  });

  async function loadRedisModule() {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    return import("../../server/lib/rateLimit.js");
  }

  it("reports redis as the backend", async () => {
    const mod = await loadRedisModule();

    expect(mod.rateLimitBackend).toBe("redis");
  });

  it("allows a request redis says is under the limit", async () => {
    limit.mockResolvedValue({ success: true, reset: Date.now() + 1_000 });
    const { consumeQuota, MINUTES } = await loadRedisModule();

    expect(await consumeQuota("redis-ok", "guest-1", MINUTES(1), 5)).toBe(true);
    expect(limit).toHaveBeenCalledWith("redis-ok:guest-1");
  });

  it("blocks a request redis says is over the limit", async () => {
    limit.mockResolvedValue({ success: false, reset: Date.now() + 30_000 });
    const { limitGuard, MINUTES } = await loadRedisModule();
    const res = fakeRes();

    const blocked = await limitGuard(fakeReq(), res, [
      { name: "redis-block", key: "guest-1", windowMs: MINUTES(1), max: 1 },
    ]);

    expect(blocked).toBe(true);
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("reuses one limiter per window and ceiling", async () => {
    limit.mockResolvedValue({ success: true, reset: Date.now() });
    const { consumeQuota, MINUTES } = await loadRedisModule();

    await consumeQuota("redis-cache", "a", MINUTES(1), 5);
    await consumeQuota("redis-cache", "b", MINUTES(1), 5);

    expect(limit).toHaveBeenCalledTimes(2);
  });

  it("lets the request through when redis itself fails", async () => {
    limit.mockRejectedValue(new Error("redis down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { consumeQuota, MINUTES } = await loadRedisModule();

    expect(await consumeQuota("redis-down", "guest-1", MINUTES(1), 1)).toBe(true);
  });

  it("peeks the remaining allowance through redis", async () => {
    getRemaining.mockResolvedValue({ remaining: 3 });
    const { peekQuota, MINUTES } = await loadRedisModule();

    expect(await peekQuota("redis-peek", "guest-1", MINUTES(1), 5)).toBe(true);

    getRemaining.mockResolvedValue({ remaining: 0 });
    expect(await peekQuota("redis-peek", "guest-1", MINUTES(1), 5)).toBe(false);
  });

  it("allows the peek when redis fails", async () => {
    getRemaining.mockRejectedValue(new Error("redis down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { peekQuota, MINUTES } = await loadRedisModule();

    expect(await peekQuota("redis-peek-fail", "guest-1", MINUTES(1), 5)).toBe(true);
  });
});

describe("logRateLimitStatus", () => {
  it("names redis as the backend when it is configured", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.doMock("@upstash/redis", () => {
      return { Redis: class {} };
    });
    vi.doMock("@upstash/ratelimit", () => {
      return { Ratelimit: class {} };
    });
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    await import("../../server/lib/rateLimit.js");

    expect(log.mock.calls.some((call) => String(call[0]).includes("backend=redis"))).toBe(true);
  });

  it("names the in-memory fallback outside production", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await loadMemoryModule();

    expect(log.mock.calls.some((call) => String(call[0]).includes("backend=memory"))).toBe(true);
  });

  it("warns loudly about the in-memory fallback in production", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.UPSTASH_REDIS_REST_URL = "";
    process.env.UPSTASH_REDIS_REST_TOKEN = "";

    await import("../../server/lib/rateLimit.js");

    expect(warn.mock.calls.some((call) => String(call[0]).includes("IN-MEMORY FALLBACK"))).toBe(
      true,
    );
  });

  it("only reports the backend once", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const mod = await loadMemoryModule();
    const before = log.mock.calls.length;

    mod.logRateLimitStatus();

    expect(log.mock.calls.length).toBe(before);
  });
});

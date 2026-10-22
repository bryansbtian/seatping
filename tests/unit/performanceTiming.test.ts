import express from "express";
import { serveApp } from "../helpers/app.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { businessMeTiming, measureDatabase } from "../../server/lib/performanceTiming.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function app() {
  const server = express();
  server.use(businessMeTiming);
  server.get("/", async (_req, res) => {
    await measureDatabase("credit.expire", async () => ({ count: 2 }));
    await measureDatabase("business.identity", async () => ({
      email: "private@example.invalid",
      password: "private-password",
    }));
    res.json({ ok: true });
  });
  return server;
}

describe("performance timing privacy and sampling", () => {
  it("does not measure or log by default", async () => {
    vi.stubEnv("PERFORMANCE_TIMINGS", "");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await (await serveApp(app())).get("/");
    expect(log).not.toHaveBeenCalled();
  });

  it("logs only fixed operation names, status, counts and timings", async () => {
    vi.stubEnv("PERFORMANCE_TIMINGS", "1");
    vi.stubEnv("PERFORMANCE_SAMPLE_RATE", "1");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await (
      await serveApp(app())
    )
      .get("/?email=private@example.invalid&token=private-token")
      .set("Cookie", "session=private-cookie");
    expect(log).toHaveBeenCalledTimes(1);
    const output = String(log.mock.calls[0][0]);
    expect(output).not.toMatch(/private|email|password|cookie|token|\?/i);
    expect(JSON.parse(output)).toEqual({
      event: "seatping.performance",
      operation: "business.me",
      status: 200,
      durationMs: expect.any(Number),
      database: {
        "credit.expire": { calls: 1, durationMs: expect.any(Number), affectedRows: 2 },
        "business.identity": { calls: 1, durationMs: expect.any(Number), affectedRows: 0 },
      },
    });
  });

  it("keeps concurrent request measurements isolated", async () => {
    vi.stubEnv("PERFORMANCE_TIMINGS", "1");
    vi.stubEnv("PERFORMANCE_SAMPLE_RATE", "1");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await Promise.all([(await serveApp(app())).get("/"), (await serveApp(app())).get("/")]);
    expect(log).toHaveBeenCalledTimes(2);
    for (const [output] of log.mock.calls) {
      expect(JSON.parse(String(output)).database["credit.expire"].affectedRows).toBe(2);
    }
  });

  it("allows a zero sample rate", async () => {
    vi.stubEnv("PERFORMANCE_TIMINGS", "1");
    vi.stubEnv("PERFORMANCE_SAMPLE_RATE", "0");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await (await serveApp(app())).get("/");
    expect(log).not.toHaveBeenCalled();
  });

  it("falls back to one-percent sampling for invalid rates", async () => {
    vi.stubEnv("PERFORMANCE_TIMINGS", "1");
    vi.stubEnv("PERFORMANCE_SAMPLE_RATE", "invalid");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await (await serveApp(app())).get("/");
    expect(log).not.toHaveBeenCalled();
  });

  it("preserves failures and never records error contents", async () => {
    vi.stubEnv("PERFORMANCE_TIMINGS", "1");
    vi.stubEnv("PERFORMANCE_SAMPLE_RATE", "1");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const server = express();
    server.use(businessMeTiming);
    server.get("/", async (_req, res) => {
      await expect(
        measureDatabase("credit.expire", async () => {
          throw new Error("private-data");
        }),
      ).rejects.toThrow("private-data");
      res.sendStatus(500);
    });
    await (await serveApp(server)).get("/");
    expect(log.mock.calls[0][0]).not.toContain("private-data");
    expect(JSON.parse(String(log.mock.calls[0][0])).database["credit.expire"].calls).toBe(1);
  });
});

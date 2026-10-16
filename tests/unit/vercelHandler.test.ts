import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { compiledApp, compiledDefault } = vi.hoisted(() => ({
  compiledApp: vi.fn(),
  compiledDefault: vi.fn(),
}));

vi.mock("../stubs/distServerApp", () => ({
  get default() {
    return compiledDefault();
  },
}));

beforeEach(() => {
  vi.resetModules();
  compiledDefault.mockReset().mockImplementation(() => compiledApp);
  vi.stubEnv("PERFORMANCE_TIMINGS", "0");
  compiledApp.mockReset().mockReturnValue("handled");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("vercel serverless entry", () => {
  it("rejects failed initialization and retries on the next request", async () => {
    const failure = new Error("Initialization unavailable");
    compiledDefault.mockImplementationOnce(() => {
      throw failure;
    });
    const handler = (await import("../../api/server.js")).default;

    const results = await Promise.allSettled([
      handler({} as never, {} as never),
      handler({} as never, {} as never),
    ]);

    expect(results).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ]);
    expect(compiledDefault).toHaveBeenCalledTimes(1);
    expect(compiledApp).not.toHaveBeenCalled();

    const req = {} as never;
    const res = {} as never;
    await expect(handler(req, res)).resolves.toBe("handled");
    expect(compiledDefault).toHaveBeenCalledTimes(2);
    expect(compiledApp).toHaveBeenCalledExactlyOnceWith(req, res);
  });

  it("delegates the request to the compiled express app", async () => {
    vi.resetModules();
    const handler = (await import("../../api/server.js")).default;
    const req = {} as never;
    const res = {} as never;

    await expect(handler(req, res)).resolves.toBe("handled");
    expect(compiledApp).toHaveBeenCalledWith(req, res);
  });

  it("imports the compiled app once and reuses it", async () => {
    vi.resetModules();
    const handler = (await import("../../api/server.js")).default;

    await handler({} as never, {} as never);
    await handler({} as never, {} as never);

    expect(compiledApp).toHaveBeenCalledTimes(2);
  });

  it("shares concurrent initialization and emits one fixed-label measurement", async () => {
    vi.stubEnv("PERFORMANCE_TIMINGS", "1");
    vi.stubEnv("PERFORMANCE_SAMPLE_RATE", "1");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const handler = (await import("../../api/server.js")).default;
    const request = { url: "/private?token=secret", headers: { cookie: "session=secret" } };

    await Promise.all([
      handler(request as never, {} as never),
      handler(request as never, {} as never),
      handler(request as never, {} as never),
    ]);

    expect(compiledApp).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledTimes(1);
    const event = JSON.parse(log.mock.calls[0][0]);
    expect(event).toEqual({
      event: "seatping.performance",
      operation: "server.initialize",
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(JSON.stringify(event)).not.toContain("private");
  });

  it("does not emit initialization timing when disabled", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const handler = (await import("../../api/server.js")).default;

    await handler({} as never, {} as never);

    expect(log).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "2", "invalid"])(
    "applies the configured sample rate %s safely",
    async (sampleRate) => {
      vi.stubEnv("PERFORMANCE_TIMINGS", "1");
      vi.stubEnv("PERFORMANCE_SAMPLE_RATE", sampleRate);
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      const handler = (await import("../../api/server.js")).default;

      await handler({} as never, {} as never);

      expect(log).not.toHaveBeenCalled();
    },
  );
});

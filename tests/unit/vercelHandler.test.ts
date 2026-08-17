import { beforeEach, describe, expect, it, vi } from "vitest";

const compiledApp = vi.fn();

vi.mock("../../dist-server/index.js", () => {
  return { default: compiledApp };
});

beforeEach(() => {
  compiledApp.mockReset().mockReturnValue("handled");
});

describe("vercel serverless entry", () => {
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
});

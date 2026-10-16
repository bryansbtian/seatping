import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawnSync: spawn }));
const { buildProduction } = await import("../../scripts/build.mjs");
const originalExitCode = process.exitCode;

beforeEach(() => {
  spawn.mockReset().mockReturnValue({ status: 0 });
});
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
});

describe("production build", () => {
  it("builds optimized browser assets even when the development environment is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    buildProduction();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[0][1][0]).toMatch(/vite[\\/]bin[\\/]vite\.js$/);
    expect(spawn.mock.calls[1][1]).toEqual([
      expect.stringMatching(/typescript[\\/]bin[\\/]tsc$/),
      "--project",
      "tsconfig.server.json",
    ]);
    for (const [, , options] of spawn.mock.calls) {
      expect(options.env.NODE_ENV).toBe("production");
      expect(options.stdio).toBe("inherit");
    }
    expect(process.env.NODE_ENV).toBe("development");
  });

  it("stops and reports the browser build failure without compiling a partial release", () => {
    spawn.mockReturnValueOnce({ status: 2 });
    buildProduction();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(2);
  });

  it("reports process startup failures", () => {
    spawn.mockReturnValueOnce({ status: null, error: new Error("unavailable") });
    buildProduction();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });
});

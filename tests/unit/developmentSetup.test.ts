import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupDevelopment } from "../../scripts/setup-development.js";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  query: vi.fn(),
  disconnect: vi.fn(),
  seed: vi.fn(),
  sleep: vi.fn(),
  generated: true,
  engineLoaded: false,
  generationFails: false,
}));

vi.mock("node:child_process", () => ({ spawnSync: mocks.spawn }));
vi.mock("node:timers/promises", () => ({ setTimeout: mocks.sleep }));
vi.mock("../../server/lib/developmentSeed.js", () => ({ seedDevelopmentData: mocks.seed }));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      if (!mocks.generated) {
        throw new Error("@prisma/client did not initialize yet.");
      }
      mocks.engineLoaded = true;
    }

    $queryRaw = mocks.query;
    $disconnect = mocks.disconnect;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://local:local@127.0.0.1:5434/seatping_dev");
  vi.stubEnv("DIRECT_URL", "postgresql://local:local@127.0.0.1:5434/seatping_dev");
  mocks.generated = true;
  mocks.engineLoaded = false;
  mocks.generationFails = false;
  mocks.query.mockResolvedValue([{ "?column?": 1 }]);
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.seed.mockResolvedValue(undefined);
  mocks.sleep.mockResolvedValue(undefined);
  mocks.spawn.mockImplementation((_command: string, args: string[]) => {
    if (args.includes("generate")) {
      if (mocks.engineLoaded || mocks.generationFails) {
        return { status: 1, error: new Error("EPERM: query engine DLL is locked") };
      }
      mocks.generated = true;
    }
    return { status: 0, stdout: "true" };
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Development Database Setup", () => {
  it("generates a missing Prisma client before the readiness check", async () => {
    mocks.generated = false;

    await setupDevelopment();

    expect(mocks.generated).toBe(true);
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.seed).toHaveBeenCalledWith(process.env.DATABASE_URL);
  });

  it("finishes on Windows without regenerating a loaded engine DLL", async () => {
    await setupDevelopment();

    expect(mocks.spawn.mock.calls.filter(([, args]) => args.includes("generate"))).toHaveLength(1);
    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining("index.js"), "migrate", "deploy"],
      expect.objectContaining({ stdio: "inherit" }),
    );
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.seed).toHaveBeenCalledOnce();
  });

  it("stops before connecting or seeding if client generation fails", async () => {
    mocks.generationFails = true;

    await expect(setupDevelopment()).rejects.toThrow("Stop npm run dev and Prisma Studio");

    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.seed).not.toHaveBeenCalled();
  });

  it("retries while PostgreSQL starts", async () => {
    mocks.query.mockRejectedValueOnce(new Error("Database is starting"));

    await setupDevelopment();

    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.sleep).toHaveBeenCalledWith(500);
    expect(mocks.seed).toHaveBeenCalledOnce();
  });

  it("disconnects and skips migrations and seed data when PostgreSQL stays unavailable", async () => {
    mocks.query.mockRejectedValue(new Error("Database is unavailable"));

    await expect(setupDevelopment()).rejects.toThrow("Local PostgreSQL is unavailable");

    expect(mocks.query).toHaveBeenCalledTimes(10);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.spawn.mock.calls.some(([, args]) => args.includes("migrate"))).toBe(false);
    expect(mocks.seed).not.toHaveBeenCalled();
  });

  it("rejects a hosted database before running any setup commands", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://local:local@hosted.example.test/seatping_dev");

    await expect(setupDevelopment()).rejects.toThrow("Development cannot connect");

    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.seed).not.toHaveBeenCalled();
  });
  it("creates the PostgreSQL container with a loopback port and no forced CPU architecture", async () => {
    const spawn = mocks.spawn.getMockImplementation()!;
    mocks.spawn.mockImplementation((command: string, args: string[]) => {
      if (args.includes("inspect")) {
        return { status: 1, stdout: "" };
      }
      return spawn(command, args);
    });

    await setupDevelopment();

    const creation = mocks.spawn.mock.calls.find(([, args]) => args.includes("run"));
    expect(creation?.[0]).toBe("docker");
    expect(creation?.[1]).toContain("127.0.0.1:5434:5432");
    expect(creation?.[1]).toContain("postgres:17");
    expect(creation?.[1]).not.toContain("--platform");
    expect(mocks.seed).toHaveBeenCalledOnce();
  });
  it("restarts an existing stopped development container", async () => {
    const spawn = mocks.spawn.getMockImplementation()!;
    mocks.spawn.mockImplementation((command: string, args: string[]) => {
      if (args.includes("inspect")) {
        return { status: 0, stdout: "false" };
      }
      return spawn(command, args);
    });

    await setupDevelopment();

    expect(mocks.spawn).toHaveBeenCalledWith(
      "docker",
      ["start", "seatping-dev-postgres"],
      expect.objectContaining({ stdio: "inherit" }),
    );
  });
  it("explains how to start Docker without trying to connect when Docker is unavailable", async () => {
    mocks.spawn.mockReturnValue({ status: 1, stdout: "" });

    await expect(setupDevelopment()).rejects.toThrow("Start Docker or Colima");

    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.seed).not.toHaveBeenCalled();
  });
  it("supports an existing local PostgreSQL server without Docker", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://local:local@127.0.0.1:5432/seatping_dev");
    vi.stubEnv("DIRECT_URL", "postgresql://local:local@127.0.0.1:5432/seatping_dev");

    await setupDevelopment();

    expect(mocks.spawn.mock.calls.some(([command]) => command === "docker")).toBe(false);
    expect(mocks.seed).toHaveBeenCalledWith(process.env.DATABASE_URL);
  });
  it("rejects mismatched runtime and migration databases before setup", async () => {
    vi.stubEnv("DIRECT_URL", "postgresql://local:local@127.0.0.1:5432/other_dev");

    await expect(setupDevelopment()).rejects.toThrow("must use the same local database");

    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("rejects setup outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(setupDevelopment()).rejects.toThrow("NODE_ENV=development");

    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});

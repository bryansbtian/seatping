import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructed: Array<Record<string, unknown>> = [];

vi.mock("@prisma/client", () => {
  class FakePrismaClient {
    public options: Record<string, unknown>;
    constructor(options: Record<string, unknown> = {}) {
      this.options = options;
      constructed.push(options);
    }
  }
  return { PrismaClient: FakePrismaClient };
});

const ORIGINAL_ENV = { ...process.env };

type GlobalWithPrisma = { prisma?: unknown };

async function loadPrisma() {
  vi.resetModules();
  constructed.length = 0;
  delete (globalThis as GlobalWithPrisma).prisma;
  return import("../../server/lib/prisma.js");
}

function lastOptions(): Record<string, any> {
  return constructed[constructed.length - 1] as Record<string, any>;
}

beforeEach(() => {
  process.env.DATABASE_URL = "mongodb://127.0.0.1:27017/seatping-test";
  delete process.env.DB_MAX_POOL_SIZE;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete (globalThis as GlobalWithPrisma).prisma;
});

describe("prisma datasource url", () => {
  it("appends a default pool size with a query separator", async () => {
    await loadPrisma();

    expect(lastOptions().datasourceUrl).toBe(
      "mongodb://127.0.0.1:27017/seatping-test?maxPoolSize=10",
    );
  });

  it("joins onto an existing query string", async () => {
    process.env.DATABASE_URL = "mongodb://127.0.0.1:27017/seatping-test?replicaSet=rs0";

    await loadPrisma();

    expect(lastOptions().datasourceUrl).toBe(
      "mongodb://127.0.0.1:27017/seatping-test?replicaSet=rs0&maxPoolSize=10",
    );
  });

  it("honours a configured pool size", async () => {
    process.env.DB_MAX_POOL_SIZE = "25";

    await loadPrisma();

    expect(lastOptions().datasourceUrl).toContain("maxPoolSize=25");
  });

  it("leaves a url that already sets the pool size alone", async () => {
    process.env.DATABASE_URL = "mongodb://127.0.0.1:27017/seatping-test?maxPoolSize=5";

    await loadPrisma();

    expect(lastOptions().datasourceUrl).toBe(
      "mongodb://127.0.0.1:27017/seatping-test?maxPoolSize=5",
    );
  });

  it("matches the pool size parameter regardless of case or position", async () => {
    process.env.DATABASE_URL =
      "mongodb://127.0.0.1:27017/seatping-test?replicaSet=rs0&MaxPoolSize=7";

    await loadPrisma();

    expect(lastOptions().datasourceUrl).toBe(
      "mongodb://127.0.0.1:27017/seatping-test?replicaSet=rs0&MaxPoolSize=7",
    );
  });

  it("builds a client with no datasource url when none is configured", async () => {
    delete process.env.DATABASE_URL;

    await loadPrisma();

    expect(lastOptions()).toEqual({ log: ["error", "warn"] });
    expect(lastOptions().datasourceUrl).toBeUndefined();
  });

  it("always asks the client to log errors and warnings", async () => {
    await loadPrisma();

    expect(lastOptions().log).toEqual(["error", "warn"]);
  });
});

describe("prisma client reuse", () => {
  it("builds exactly one client per process", async () => {
    await loadPrisma();

    expect(constructed).toHaveLength(1);
  });

  it("reuses a client already parked on the global", async () => {
    const existing = { marker: "already-built" };
    vi.resetModules();
    constructed.length = 0;
    (globalThis as GlobalWithPrisma).prisma = existing;

    const mod = await import("../../server/lib/prisma.js");

    expect(constructed).toHaveLength(0);
    expect(mod.prisma).toBe(existing);
  });

  it("parks the client it builds on the global for the next import", async () => {
    const mod = await loadPrisma();

    expect((globalThis as GlobalWithPrisma).prisma).toBe(mod.prisma);
  });
});

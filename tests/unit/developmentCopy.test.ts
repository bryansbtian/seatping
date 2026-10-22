import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyProductionToLocal } from "../../scripts/copy-production-to-local.js";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  query: vi.fn(),
  count: vi.fn(),
  disconnect: vi.fn(),
  spawn: vi.fn(),
  sourceFailure: false,
  destinationFailure: false,
  sql: "",
  committed: false,
  readerKilled: false,
  writerKilled: false,
}));
vi.mock("node:fs", () => ({ readFileSync: mocks.read }));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    $queryRaw = mocks.query;
    $disconnect = mocks.disconnect;
    business = { count: mocks.count };
    user = { count: mocks.count };
    ticket = { count: mocks.count };
    campaignTemplate = { count: mocks.count };
    blogPost = { count: mocks.count };
  },
}));
vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  const { Readable, Writable } = await import("node:stream");
  return {
    spawn: mocks.spawn.mockImplementation((_command: string, args: string[]) => {
      const emitter = new EventEmitter();
      if (args.includes("pg_dump")) {
        const stdout = Readable.from(["COPY tickets FROM stdin;\n"]);
        stdout.on("end", () =>
          queueMicrotask(() => emitter.emit("exit", Number(mocks.sourceFailure))),
        );
        return Object.assign(emitter, {
          stdout,
          kill: () => {
            mocks.readerKilled = true;
            emitter.emit("exit", 1);
            return true;
          },
        });
      }
      const stderr = new EventEmitter();
      const stdin = new Writable({
        write(chunk, _encoding, callback) {
          mocks.sql += String(chunk);
          callback();
        },
      });
      stdin.on("finish", () => {
        mocks.committed = !mocks.destinationFailure;
        if (mocks.destinationFailure) {
          stderr.emit("data", Buffer.from("ERROR: 23505\nDETAIL: Private row contents\n"));
        }
        emitter.emit("exit", Number(mocks.destinationFailure));
      });
      return Object.assign(emitter, {
        stdin,
        stderr,
        kill: () => {
          mocks.writerKilled = true;
          stdin.destroy();
          emitter.emit("exit", 1);
          return true;
        },
      });
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  mocks.sourceFailure = false;
  mocks.destinationFailure = false;
  mocks.sql = "";
  mocks.committed = false;
  mocks.readerKilled = false;
  mocks.writerKilled = false;
  mocks.query.mockResolvedValue([{ tablename: "tickets" }, { tablename: "users" }]);
  mocks.count.mockResolvedValue(3);
  mocks.read.mockImplementation((name: string) => {
    if (name === "prisma/migrations/20261020185000_retire_sales_tickets/migration.sql") {
      return Buffer.from("SELECT 1;\n");
    }
    if (name === ".env") {
      return Buffer.from(
        "DATABASE_URL=postgresql://local:local@localhost:5434/seatping_dev\nDIRECT_URL=postgresql://local:local@localhost:5434/seatping_dev",
      );
    }
    return Buffer.from("DIRECT_URL=postgresql://source:source@source.example.test:5432/postgres");
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Explicit Production To Local Copy", () => {
  it("never opens a production reader in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(copyProductionToLocal()).rejects.toThrow("requires NODE_ENV=production");
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("refuses a hosted destination before starting any copy", async () => {
    mocks.read.mockReturnValue(
      Buffer.from("DATABASE_URL=postgresql://u:p@hosted.example.test/seatping_dev"),
    );
    await expect(copyProductionToLocal()).rejects.toThrow("Development cannot connect");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("uses a read-only source and commits only a complete stream into the local transaction", async () => {
    await copyProductionToLocal();
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    const reader = mocks.spawn.mock.calls[0];
    const writer = mocks.spawn.mock.calls[1];
    expect(reader[2].env.NODE_ENV).toBe("production");
    expect(reader[2].env.PGOPTIONS).toBe("-c default_transaction_read_only=on");
    expect(reader[1]).toContain("--data-only");
    expect(reader[1]).toContain("--exclude-table=public._prisma_migrations");
    expect(writer[2].env.NODE_ENV).toBe("development");
    expect(writer[1]).toContain("--single-transaction");
    expect(writer[1]).toContain("--file=-");
    expect(writer[1]).toContain("seatping_dev");
    expect(mocks.sql).toContain(
      'TRUNCATE TABLE "public"."tickets", "public"."users" RESTART IDENTITY CASCADE;',
    );
    expect(mocks.sql).toContain("COPY tickets FROM stdin");
    expect(mocks.sql).toMatch(
      /COPY tickets FROM stdin;\nSET LOCAL search_path = public, pg_catalog;\nSELECT 1;\n$/,
    );
    expect(mocks.committed).toBe(true);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
  it("rolls back the local transaction when the source export fails", async () => {
    mocks.sourceFailure = true;
    await expect(copyProductionToLocal()).rejects.toThrow("local transaction was rolled back");
    expect(mocks.writerKilled).toBe(true);
    expect(mocks.committed).toBe(false);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
  it("fails without reporting success when the destination rejects the import", async () => {
    mocks.destinationFailure = true;
    const error = await copyProductionToLocal().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).toContain("local transaction was rolled back");
      expect(error.message).toContain("SQLSTATE: 23505");
      expect(error.message).not.toContain("Private row contents");
    }
    expect(mocks.committed).toBe(false);
  });
});

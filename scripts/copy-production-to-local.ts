import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { parse } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertLocalDevelopmentDatabase } from "../server/lib/developmentDatabase.js";

export async function copyProductionToLocal(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "This manual read-only export requires NODE_ENV=production; the development app remains local.",
    );
  }
  const localSettings = parse(readFileSync(".env"));
  const destination = new URL(assertLocalDevelopmentDatabase(localSettings.DATABASE_URL));
  const direct = new URL(assertLocalDevelopmentDatabase(localSettings.DIRECT_URL));
  if (
    destination.port !== "5434" ||
    destination.pathname !== "/seatping_dev" ||
    direct.host !== destination.host ||
    direct.pathname !== destination.pathname
  ) {
    throw new Error(
      "The destination must be the separate seatping_dev database on localhost:5434.",
    );
  }
  let source: URL;
  try {
    const productionSettings = parse(readFileSync(".env.production"));
    source = new URL(productionSettings.DIRECT_URL || "");
  } catch {
    throw new Error("Add the production DIRECT_URL to the ignored .env.production file first.");
  }
  if (
    !["postgres:", "postgresql:"].includes(source.protocol) ||
    ["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)
  ) {
    throw new Error(
      "The production source must be an explicitly configured hosted PostgreSQL database.",
    );
  }
  const datasourceUrl = assertLocalDevelopmentDatabase(destination.toString());
  const db = new PrismaClient({ datasourceUrl });
  try {
    const tables = await db.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
    if (!tables.length) {
      throw new Error("Run npm run db:dev to prepare the local schema before copying data.");
    }
    const names = tables
      .map(({ tablename }) => `"public"."${tablename.replace(/"/g, '""')}"`)
      .join(", ");
    const container = "seatping-dev-postgres";
    const reader = spawn(
      "docker",
      [
        "exec",
        "--env",
        "PGPASSWORD",
        "--env",
        "PGSSLMODE",
        "--env",
        "PGOPTIONS",
        "--env",
        "PGCONNECT_TIMEOUT",
        container,
        "pg_dump",
        "--host",
        source.hostname,
        "--port",
        source.port || "5432",
        "--username",
        decodeURIComponent(source.username),
        "--dbname",
        decodeURIComponent(source.pathname.slice(1)),
        "--schema=public",
        "--data-only",
        "--exclude-table=public._prisma_migrations",
        "--no-owner",
        "--no-privileges",
        "--disable-triggers",
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          PGPASSWORD: decodeURIComponent(source.password),
          PGSSLMODE: "require",
          PGOPTIONS: "-c default_transaction_read_only=on",
          PGCONNECT_TIMEOUT: "10",
        },
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const writer = spawn(
      "docker",
      [
        "exec",
        "--interactive",
        "--env",
        "PGPASSWORD",
        container,
        "psql",
        "--host",
        "127.0.0.1",
        "--username",
        decodeURIComponent(destination.username),
        "--dbname",
        "seatping_dev",
        "--single-transaction",
        "--file=-",
        "--set",
        "ON_ERROR_STOP=1",
        "--set",
        "VERBOSITY=sqlstate",
        "--quiet",
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: "development",
          PGPASSWORD: decodeURIComponent(destination.password),
        },
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
    let restoreSqlState = "";
    writer.stderr?.on("data", (chunk: Buffer) => {
      const match = chunk.toString().match(/ERROR:\s+([0-9A-Z]{5})\b/);
      if (match) {
        restoreSqlState = match[1];
      }
    });
    const completed = (child: typeof reader | typeof writer) =>
      new Promise<void>((resolve, reject) => {
        child.once("error", () =>
          reject(new Error("Unable to start the PostgreSQL copy process.")),
        );
        child.once("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error("Database copy failed; the local transaction was rolled back."));
          }
        });
      });
    const readerDone = completed(reader);
    const writerDone = completed(writer);
    void writerDone.catch(() => {});
    const timer = setTimeout(() => {
      reader.kill();
      writer.kill();
    }, 600000);
    try {
      writer.stdin.write(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;\n`);
      await Promise.all([readerDone, pipeline(reader.stdout, writer.stdin, { end: false })]);
      writer.stdin.write("SET LOCAL search_path = public, pg_catalog;\n");
      writer.stdin.write(
        readFileSync("prisma/migrations/20261020185000_retire_sales_tickets/migration.sql"),
      );
      writer.stdin.end();
      await writerDone;
    } catch {
      reader.kill();
      writer.kill();
      await Promise.allSettled([readerDone, writerDone]);
      let message =
        "Copy failed; production was read-only and the local transaction was rolled back.";
      if (restoreSqlState) {
        message += ` PostgreSQL restore SQLSTATE: ${restoreSqlState}.`;
      }
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
    const [businesses, customers, tickets, templates, blogPosts] = await Promise.all([
      db.business.count(),
      db.user.count(),
      db.ticket.count(),
      db.campaignTemplate.count(),
      db.blogPost.count(),
    ]);
    console.log(
      JSON.stringify({
        destination: "localhost:5434/seatping_dev",
        productionReadOnly: true,
        businesses,
        customers,
        tickets,
        templates,
        blogPosts,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  void copyProductionToLocal().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}

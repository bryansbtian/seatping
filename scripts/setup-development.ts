import "dotenv/config";
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertLocalDevelopmentDatabase } from "../server/lib/developmentDatabase.js";
import { seedDevelopmentData } from "../server/lib/developmentSeed.js";

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error || result.status !== 0) {
    throw new Error("Local development database setup failed.");
  }
}

async function setupDevelopment(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Run local database setup with NODE_ENV=development.");
  }
  const datasourceUrl = assertLocalDevelopmentDatabase(process.env.DATABASE_URL);
  const directUrl = assertLocalDevelopmentDatabase(process.env.DIRECT_URL);
  const url = new URL(datasourceUrl);
  const direct = new URL(directUrl);
  if (url.host !== direct.host || url.pathname !== direct.pathname) {
    throw new Error("Development DATABASE_URL and DIRECT_URL must use the same local database.");
  }
  if (url.port === "5434" && url.pathname === "/seatping_dev") {
    const docker = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      encoding: "utf8",
    });
    if (docker.error || docker.status !== 0) {
      throw new Error("Start Docker or Colima, then run npm run db:dev again.");
    }
    const container = "seatping-dev-postgres";
    const existing = spawnSync("docker", ["inspect", "--format", "{{.State.Running}}", container], {
      encoding: "utf8",
    });
    if (existing.status !== 0) {
      run("docker", [
        "run",
        "--detach",
        "--name",
        container,
        "--restart",
        "unless-stopped",
        "--publish",
        "127.0.0.1:5434:5432",
        "--env",
        `POSTGRES_USER=${decodeURIComponent(url.username)}`,
        "--env",
        `POSTGRES_PASSWORD=${decodeURIComponent(url.password)}`,
        "--env",
        "POSTGRES_DB=seatping_dev",
        "postgres:17",
      ]);
    } else if (existing.stdout.trim() !== "true") {
      run("docker", ["start", container]);
    }
  }
  const probeUrl = new URL(datasourceUrl);
  probeUrl.searchParams.set("connect_timeout", "2");
  const db = new PrismaClient({ datasourceUrl: probeUrl.toString(), log: [] });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await db.$queryRaw`SELECT 1`;
        ready = true;
        break;
      } catch {
        await setTimeout(500);
      }
    }
    if (!ready) {
      throw new Error("Local PostgreSQL is unavailable; no remote database was contacted.");
    }
  } finally {
    await db.$disconnect();
  }
  const prismaEntry = path.resolve("node_modules/prisma/build/index.js");
  run(process.execPath, [prismaEntry, "migrate", "deploy"]);
  run(process.execPath, [prismaEntry, "generate"]);
  await seedDevelopmentData(datasourceUrl);
  console.log("Local demo database is ready at localhost:5434/seatping_dev. Run npm run dev.");
}

const invokedPath = process.argv[1];
if (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  void setupDevelopment().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}

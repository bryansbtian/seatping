import "dotenv/config";
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertLocalDevelopmentDatabase } from "../server/lib/developmentDatabase.js";

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error || result.status !== 0) {
    if (args.includes("generate")) {
      throw new Error(
        "Prisma client generation failed. Stop npm run dev and Prisma Studio, then retry npm run db:dev.",
      );
    }
    throw new Error("Local development database setup failed.");
  }
}

export async function setupDevelopment(): Promise<void> {
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
  const prismaEntry = fileURLToPath(
    new URL("../node_modules/prisma/build/index.js", import.meta.url),
  );
  run(process.execPath, [prismaEntry, "generate"]);
  const { PrismaClient } = await import("@prisma/client");
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
  run(process.execPath, [prismaEntry, "migrate", "deploy"]);
  const { seedDevelopmentData } = await import("../server/lib/developmentSeed.js");
  await seedDevelopmentData(datasourceUrl);
  console.log(`Local demo database is ready at ${url.host}${url.pathname}. Run npm run dev.`);
  console.log(
    "Business logins: demo-restaurant-1 and demo-restaurant-2. Customer logins: demo-diner and demo-diner-2.",
  );
  console.log(
    "Demo accounts use your configured local admin password. No notifications were sent.",
  );
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

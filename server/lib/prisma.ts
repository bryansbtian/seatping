import { PrismaClient } from "@prisma/client";

function buildDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return undefined;
  }
  if (/[?&]maxPoolSize=/i.test(raw)) {
    return raw;
  }
  const maxPool = process.env.DB_MAX_POOL_SIZE || "10";
  let sep: string;
  if (raw.includes("?")) {
    sep = "&";
  } else {
    sep = "?";
  }
  return `${raw}${sep}maxPoolSize=${maxPool}`;
}

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

const datasourceUrl = buildDatasourceUrl();

let prismaClient = globalForPrisma.prisma;
if (!prismaClient) {
  if (datasourceUrl) {
    prismaClient = new PrismaClient({
      log: ["error", "warn"],
      datasourceUrl,
    });
  } else {
    prismaClient = new PrismaClient({ log: ["error", "warn"] });
  }
}

export const prisma = prismaClient;

globalForPrisma.prisma = prisma;

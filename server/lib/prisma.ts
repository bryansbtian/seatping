import { PrismaClient } from "@prisma/client";


function buildDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  if (/[?&]maxPoolSize=/i.test(raw)) return raw;
  const maxPool = process.env.DB_MAX_POOL_SIZE || "10";
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}maxPoolSize=${maxPool}`;
}

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

const datasourceUrl = buildDatasourceUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });

globalForPrisma.prisma = prisma;

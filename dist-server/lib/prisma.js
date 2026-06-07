import { PrismaClient } from "@prisma/client";
// Serverless connection safety (MongoDB Atlas + Vercel):
//
// Each Vercel function instance constructs its own PrismaClient, and the Mongo
// driver opens a connection pool per client. The driver default maxPoolSize is
// 100, so a traffic spike that spins up many concurrent instances can multiply
// out to thousands of connections and exhaust the Atlas connection limit
// (causing connection refusals / queueing for everyone).
//
// Two mitigations here:
//   1. Bound the per-instance pool via `maxPoolSize` on the connection string
//      (default 10, override with DB_MAX_POOL_SIZE). instances * 10 stays well
//      under typical Atlas caps.
//   2. Reuse a single client per instance by caching it on `global` in ALL
//      environments. In dev this prevents HMR from leaking clients; in
//      serverless prod it guarantees warm invocations reuse the same pool
//      instead of ever creating a second one.
/** Append a bounded maxPoolSize to DATABASE_URL unless one is already set. */
function buildDatasourceUrl() {
    const raw = process.env.DATABASE_URL;
    if (!raw)
        return undefined; // let Prisma fall back to the schema's env() url
    if (/[?&]maxPoolSize=/i.test(raw))
        return raw; // respect an explicit setting
    const maxPool = process.env.DB_MAX_POOL_SIZE || "10";
    const sep = raw.includes("?") ? "&" : "?";
    return `${raw}${sep}maxPoolSize=${maxPool}`;
}
const globalForPrisma = global;
const datasourceUrl = buildDatasourceUrl();
export const prisma = globalForPrisma.prisma ??
    new PrismaClient({
        log: ["error", "warn"], // add "query" if you need to debug
        ...(datasourceUrl ? { datasourceUrl } : {}),
    });
globalForPrisma.prisma = prisma;

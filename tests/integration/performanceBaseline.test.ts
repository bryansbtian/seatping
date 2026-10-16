import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import express from "express";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { clearTestDatabase, getTestPrisma } from "../helpers/db.js";
import { freshTestIp, serveApp } from "../helpers/app.js";
import { seedBusiness } from "../helpers/seed.js";

const measured = vi.hoisted(() => ({ durationMs: 0, count: 0 }));

vi.mock("../../server/lib/prisma.js", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  const { assertSafeTestDatabaseUrl } = await import("../helpers/db.js");
  const client = new Client({
    datasourceUrl: assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL),
    log: [{ emit: "event", level: "query" }],
  });
  client.$on("query", (event) => {
    measured.count++;
    measured.durationMs += event.duration;
  });
  return { prisma: client };
});

const db = getTestPrisma();
beforeEach(clearTestDatabase);

afterAll(async () => {
  const { prisma } = await import("../../server/lib/prisma.js");
  await prisma.$disconnect();
});

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

it("captures isolated HTTP search timings, bytes and SQL counts", async () => {
  const { default: search } = await import("../../server/routes/search.js");
  const app = express();
  app.set("trust proxy", 1);
  app.use("/api/search", search);
  const api = await serveApp(app);
  const business = await seedBusiness({ name: "Synthetic Dining", username: "synthetic-dining" });
  const metrics = [];
  const versionTwoMetrics = [];
  const plans: Array<{ locations: number; plan: unknown }> = [];
  for (const locations of [100, 1000, 10000]) {
    await db.location.deleteMany();
    await db.location.createMany({
      data: Array.from({ length: locations }, (_, index) => ({
        id: `synthetic-location-${String(index).padStart(5, "0")}`,
        businessId: business.id,
        businessUsername: business.username,
        name: `Synthetic Restaurant ${index}`,
        address: "Synthetic Street",
        city: "Synthetic City",
        isPublished: true,
        restaurantProfile: {
          displayName: `Synthetic Restaurant ${index}`,
          description: "Synthetic benchmark description ".repeat(12),
          cuisineTypes: ["Italian"],
          priceRange: "$$",
        },
        createdAt: new Date(1700000000000 + index * 1000),
      })),
    });
    await db.$executeRaw`ANALYZE locations`;
    const contracts = [false];
    if (process.env.SEATPING_BENCHMARK_BASELINE !== "1") {
      contracts.push(true);
    }
    for (const versionTwo of contracts) {
      let version = "";
      if (versionTwo) {
        version = "&version=2";
      }
      const durations: number[] = [];
      const databaseDurations: number[] = [];
      const queryCounts: number[] = [];
      let responseBytes = 0;
      for (let index = 0; index < 35; index++) {
        measured.count = 0;
        measured.durationMs = 0;
        const started = performance.now();
        const response = await api
          .get(`/api/search/restaurants?query=Synthetic&limit=10&page=1${version}`)
          .set("X-Forwarded-For", freshTestIp());
        const duration = performance.now() - started;
        expect(response.status).toBe(200);
        expect(response.body.total).toBe(locations);
        expect(response.body.results).toHaveLength(10);
        if (index >= 5) {
          durations.push(duration);
          databaseDurations.push(measured.durationMs);
          queryCounts.push(measured.count);
          responseBytes = Buffer.byteLength(response.text);
        }
      }
      const result = {
        locations,
        samples: durations.length,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        p99Ms: percentile(durations, 0.99),
        databaseP50Ms: percentile(databaseDurations, 0.5),
        databaseP95Ms: percentile(databaseDurations, 0.95),
        sqlQueriesPerRequest: [...new Set(queryCounts)],
        responseBytes,
      };
      if (versionTwo) {
        versionTwoMetrics.push(result);
      } else {
        metrics.push(result);
      }
    }
    if (process.env.SEATPING_BENCHMARK_BASELINE !== "1") {
      const { buildRestaurantSearchQuery, restaurantSearchOptions } =
        await import("../../server/lib/restaurantSearch.js");
      const { loadRestaurantCollation } = await import("../../server/lib/restaurantCollation.js");
      const query = buildRestaurantSearchQuery(
        restaurantSearchOptions({ query: "Synthetic", version: "2", page: "1" }),
        [],
        await loadRestaurantCollation(),
      );
      const plan = await db.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
      plans.push({ locations, plan });
    }
  }
  let label = "final";
  if (process.env.SEATPING_BENCHMARK_BASELINE === "1") {
    label = "before";
  }
  await mkdir("test-results", { recursive: true });
  await writeFile(
    `test-results/search-performance-${label}.json`,
    JSON.stringify(
      {
        event: "seatping.synthetic.search",
        capturedAt: new Date().toISOString(),
        node: process.version,
        protocol: "Sequential local HTTP, five warmups, thirty samples, no photos or reviews",
        metrics,
        versionTwoMetrics,
        plans,
      },
      null,
      2,
    ),
  );
}, 120000);
import { Prisma } from "@prisma/client";

import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { getTestPrisma } from "../helpers/db.js";
import { seedBusinessWithLocation } from "../helpers/seed.js";

function percentile(samples: number[], fraction: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 1000) / 1000;
}

it("records local synthetic review profile payload and timing measurements", async () => {
  const fixture = await seedBusinessWithLocation();
  await getTestPrisma().review.createMany({
    data: Array.from({ length: 1000 }, () => ({
      locationId: fixture.location.id,
      rating: 4,
      description: "Synthetic review content for local payload measurement.",
    })),
  });
  const request = await api();
  const path = `/api/restaurants/${fixture.business.username}/${fixture.location.id}`;
  const results: Record<
    string,
    { p50Ms: number; p95Ms: number; responseBytes: number; returnedReviews: number }
  > = {};
  for (const [label, suffix] of [
    ["legacy", ""],
    ["paginated", "?version=2"],
  ]) {
    for (let warmup = 0; warmup < 3; warmup += 1) {
      await request.get(`${path}${suffix}`).expect(200);
    }
    const durations: number[] = [];
    let responseBytes = 0;
    let returnedReviews = 0;
    for (let sample = 0; sample < 10; sample += 1) {
      const start = performance.now();
      const response = await request.get(`${path}${suffix}`).expect(200);
      durations.push(performance.now() - start);
      responseBytes = Buffer.byteLength(response.text);
      returnedReviews = response.body.restaurant.reviews.length;
      expect(response.body.restaurant.reviewCount).toBe(1000);
      expect(response.body.restaurant.rating).toBe(4);
    }
    results[label] = {
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      responseBytes,
      returnedReviews,
    };
  }
  expect(results.legacy.returnedReviews).toBe(1000);
  expect(results.paginated.returnedReviews).toBe(10);
  expect(results.paginated.responseBytes).toBeLessThan(results.legacy.responseBytes);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/review-performance-baseline.json",
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        node: process.version,
        environment: "Dedicated local synthetic PostgreSQL fixture, in-process HTTP",
        fixtureReviews: 1000,
        warmups: 3,
        samples: 10,
        results,
      },
      null,
      2,
    ),
  );
});

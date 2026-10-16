import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import * as timing from "../../server/lib/performanceTiming.js";
import { assembleBusinessMe } from "../../server/lib/business.js";
import { refreshBusinessCredits } from "../../server/lib/trial.js";
import { prisma } from "../../server/lib/prisma.js";
import { clearTestDatabase, getTestPrisma } from "../helpers/db.js";
import { seedBusiness, seedLocation, seedQueueEntry, seedReservation } from "../helpers/seed.js";

const db = getTestPrisma();
beforeEach(clearTestDatabase);

it("captures a reproducible local expired-trial baseline", async () => {
  const business = await seedBusiness({
    trial: true,
    createdAt: new Date(Date.now() - 30 * 86400000),
  });
  const first = await seedLocation(business.id, business.username);
  const second = await seedLocation(business.id, business.username);
  for (const location of [first, second]) {
    for (let index = 0; index < 10; index++) {
      await seedQueueEntry(location);
      await seedReservation(location);
    }
  }

  const legacy = async () => {
    const snapshot = await prisma.business.findUnique({
      where: { id: business.id },
      select: {
        id: true,
        trial: true,
        trialDurationDays: true,
        createdAt: true,
        baseCredits: true,
      },
    });
    expect(snapshot?.trial).toBe(true);
    const write = await prisma.location.updateMany({
      where: { businessId: business.id },
      data: { credits: 0 },
    });
    await prisma.business.findUnique({
      where: { id: business.id },
      select: { id: true, trial: true, creditsStartedAt: true, nextCreditRefillAt: true },
    });
    return { user: await assembleBusinessMe(business.id), affectedRows: write.count };
  };

  const candidate = async () => {
    const measure = vi.spyOn(timing, "measureDatabase");
    try {
      await refreshBusinessCredits(business.id);
      const writes = (await Promise.all(
        measure.mock.results
          .filter((_result, index) => measure.mock.calls[index][0] === "credit.expire")
          .map((result) => result.value),
      )) as Array<{ count: number }>;
      return {
        user: await assembleBusinessMe(business.id),
        affectedRows: writes.reduce((sum, write) => sum + write.count, 0),
      };
    } finally {
      measure.mockRestore();
    }
  };

  const capture = async (run: typeof legacy) => {
    const durations: number[] = [];
    let affectedRows = 0;
    let responseBytes = 0;
    for (let index = 0; index < 25; index++) {
      const start = performance.now();
      const result = await run();
      const bytes = Buffer.byteLength(JSON.stringify({ user: result.user }));
      const duration = performance.now() - start;
      if (index >= 5) {
        durations.push(duration);
        affectedRows += result.affectedRows;
        responseBytes = bytes;
      }
    }
    durations.sort((a, b) => a - b);
    return {
      samples: durations.length,
      p50Ms: durations[9],
      p95Ms: durations[18],
      affectedRows,
      responseBytes,
    };
  };

  await db.location.updateMany({ where: { businessId: business.id }, data: { credits: 0 } });
  const before = await capture(legacy);
  const after = await capture(candidate);
  expect(before.affectedRows).toBe(40);
  expect(after.affectedRows).toBe(0);
  expect(after.responseBytes).toBe(before.responseBytes);
  const report = {
    event: "seatping.phase1.baseline",
    capturedAt: new Date().toISOString(),
    node: process.version,
    fixture: { locations: 2, queueEntries: 20, reservations: 20 },
    before,
    after,
  };
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/phase-one-baseline.json", JSON.stringify(report, null, 2));
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as timing from "../../server/lib/performanceTiming.js";
import { refreshBusinessCredits } from "../../server/lib/trial.js";
import { api } from "../helpers/app.js";
import { adminCookie, businessCookie } from "../helpers/auth.js";
import { clearTestDatabase, getTestPrisma } from "../helpers/db.js";
import { seedBusiness, seedLocation } from "../helpers/seed.js";

const db = getTestPrisma();
beforeEach(clearTestDatabase);

describe("trial and paid credit concurrency", () => {
  it("updates expired balances once across a concurrent burst and never touches another tenant", async () => {
    const business = await seedBusiness({
      trial: true,
      createdAt: new Date(Date.now() - 30 * 86400000),
    });
    const location = await seedLocation(business.id, business.username);
    const other = await seedBusiness();
    const otherLocation = await seedLocation(other.id, other.username);
    const writes = vi.spyOn(timing, "measureDatabase");
    try {
      await Promise.all(Array.from({ length: 12 }, () => refreshBusinessCredits(business.id)));
      const results = (await Promise.all(
        writes.mock.results
          .filter((_result, index) => writes.mock.calls[index][0] === "credit.expire")
          .map((result) => result.value),
      )) as Array<{ count: number }>;
      expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1);
      expect((await db.location.findUniqueOrThrow({ where: { id: location.id } })).credits).toBe(0);
      expect(
        (await db.location.findUniqueOrThrow({ where: { id: otherLocation.id } })).credits,
      ).toBe(500);
      writes.mockClear();
      await refreshBusinessCredits(business.id);
      const expirationIndex = writes.mock.calls.findIndex(
        ([operation]) => operation === "credit.expire",
      );
      expect(await writes.mock.results[expirationIndex].value).toEqual({ count: 0 });
    } finally {
      writes.mockRestore();
    }
  });

  it("refills a due paid account once across concurrent requests", async () => {
    const business = await seedBusiness({
      trial: false,
      creditsStartedAt: new Date(Date.now() - 60 * 86400000),
      nextCreditRefillAt: new Date(Date.now() - 86400000),
    });
    const location = await seedLocation(business.id, business.username, { credits: 5 });
    const writes = vi.spyOn(timing, "measureDatabase");
    try {
      await Promise.all(Array.from({ length: 12 }, () => refreshBusinessCredits(business.id)));
      expect(writes.mock.calls.filter(([operation]) => operation === "credit.refill")).toHaveLength(
        1,
      );
      expect((await db.location.findUniqueOrThrow({ where: { id: location.id } })).credits).toBe(
        300,
      );
      await db.location.update({ where: { id: location.id }, data: { credits: { decrement: 1 } } });
      await refreshBusinessCredits(business.id);
      expect((await db.location.findUniqueOrThrow({ where: { id: location.id } })).credits).toBe(
        299,
      );
      expect(
        (
          await db.business.findUniqueOrThrow({ where: { id: business.id } })
        ).nextCreditRefillAt!.getTime(),
      ).toBeGreaterThan(Date.now());
    } finally {
      writes.mockRestore();
    }
  });

  it("preserves activation credits when expiration races the actual admin endpoint", async () => {
    const business = await seedBusiness({
      trial: true,
      createdAt: new Date(Date.now() - 30 * 86400000),
    });
    const location = await seedLocation(business.id, business.username);
    const agent = await api();
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () =>
        agent.get("/auth/business/me").set("Cookie", businessCookie(business.id)),
      ),
      agent
        .patch(`/admin/customer/${business.username}`)
        .set("Cookie", adminCookie())
        .send({ trial: false, locations: [{ credits: 450 }] }),
    ]);
    expect(results.map((result) => result.status)).toEqual(Array(9).fill(200));
    await refreshBusinessCredits(business.id);
    expect((await db.business.findUniqueOrThrow({ where: { id: business.id } })).trial).toBe(false);
    expect((await db.location.findUniqueOrThrow({ where: { id: location.id } })).credits).toBe(450);
  });

  it("preserves extended trials when an extension races expiration", async () => {
    const business = await seedBusiness({
      trial: true,
      createdAt: new Date(Date.now() - 30 * 86400000),
    });
    const location = await seedLocation(business.id, business.username);
    const agent = await api();
    const [, response] = await Promise.all([
      refreshBusinessCredits(business.id),
      agent
        .patch(`/admin/customer/${business.username}`)
        .set("Cookie", adminCookie())
        .send({ trialDurationDays: 90, locations: [{ credits: 200 }] }),
    ]);
    expect(response.status).toBe(200);
    await refreshBusinessCredits(business.id);
    expect((await db.location.findUniqueOrThrow({ where: { id: location.id } })).credits).toBe(200);
  });
});

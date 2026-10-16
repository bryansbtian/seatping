import { beforeEach, describe, expect, it, vi } from "vitest";

const businessFindUnique = vi.fn();
const businessFindMany = vi.fn();
const businessUpdate = vi.fn();
const locationUpdateMany = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      business: {
        findUnique: businessFindUnique,
        findMany: businessFindMany,
        update: businessUpdate,
      },
      location: { updateMany: locationUpdateMany },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (work) => {
        const { prisma } = await import("../../server/lib/prisma.js");
        return work(prisma);
      }),
    },
  };
});

const {
  buildLocationData,
  checkAndRefillMonthlyCredits,
  enforceTrialExpiration,
  nextMonthlyAnchorAfter,
  refillCreditsForUser,
  refreshBusinessCredits,
  runDailyCreditRefillSweep,
} = await import("../../server/lib/trial.js");

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

beforeEach(() => {
  businessFindUnique.mockReset().mockResolvedValue(null);
  businessFindMany.mockReset().mockResolvedValue([]);
  businessUpdate.mockReset().mockResolvedValue({});
  locationUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("nextMonthlyAnchorAfter", () => {
  it("advances past the current moment one month at a time", () => {
    const anchor = new Date("2026-01-15T00:00:00.000Z");

    const next = nextMonthlyAnchorAfter(anchor, new Date("2026-03-20T00:00:00.000Z"));

    expect(next.toISOString().slice(0, 7)).toBe("2026-04");
  });

  it("leaves a future anchor untouched", () => {
    const anchor = new Date("2026-12-01T00:00:00.000Z");

    const next = nextMonthlyAnchorAfter(anchor, new Date("2026-01-01T00:00:00.000Z"));

    expect(next.toISOString()).toBe(anchor.toISOString());
  });
});

describe("buildLocationData", () => {
  const business = {
    id: "biz-1",
    username: "bistro",
    trial: false,
    baseCredits: 400,
    createdAt: daysAgo(1),
  };

  it("accepts a plain address string", () => {
    const data = buildLocationData(business, "1 Test Street");

    expect(data.address).toBe("1 Test Street");
    expect(data.businessId).toBe("biz-1");
    expect(data.businessUsername).toBe("bistro");
    expect(data.credits).toBe(400);
    expect(data.baseCredits).toBe(400);
  });

  it("trims the optional descriptive fields and drops the empty ones", () => {
    const data = buildLocationData(business, {
      address: "1 Test Street",
      displayName: "  Downtown  ",
      area: "   ",
      city: " Jakarta ",
      googlePlaceId: "  place-1  ",
      googleMapsUrl: "",
    });

    expect(data.displayName).toBe("Downtown");
    expect(data.area).toBeNull();
    expect(data.city).toBe("Jakarta");
    expect(data.googlePlaceId).toBe("place-1");
    expect(data.googleMapsUrl).toBeNull();
  });

  it("keeps numeric coordinates and nulls anything else", () => {
    const withCoords = buildLocationData(business, {
      address: "1 Test Street",
      latitude: -6.2,
      longitude: 106.8,
    });
    const withoutCoords = buildLocationData(business, {
      address: "1 Test Street",
      latitude: null,
      longitude: "106.8" as never,
    });

    expect(withCoords.latitude).toBe(-6.2);
    expect(withCoords.longitude).toBe(106.8);
    expect(withoutCoords.latitude).toBeNull();
    expect(withoutCoords.longitude).toBeNull();
  });

  it("gives an expired trial location no credits but keeps the base allowance", () => {
    const data = buildLocationData(
      { id: "biz-2", trial: true, baseCredits: 300, createdAt: daysAgo(30) },
      "1 Test Street",
    );

    expect(data.credits).toBe(0);
    expect(data.baseCredits).toBe(300);
    expect(data.businessUsername).toBeNull();
  });

  it("falls back to the default base credits", () => {
    const data = buildLocationData(
      { id: "biz-3", trial: false, createdAt: daysAgo(1) },
      "1 Test Street",
    );

    expect(data.baseCredits).toBe(300);
  });
});

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz-1",
    trial: false,
    trialDurationDays: 7,
    createdAt: daysAgo(60),
    baseCredits: 450,
    creditsStartedAt: daysAgo(60),
    nextCreditRefillAt: daysAgo(1),
    ...overrides,
  };
}

describe("credit maintenance", () => {
  it("does nothing for an unknown business", async () => {
    await refreshBusinessCredits("missing");
    expect(locationUpdateMany).not.toHaveBeenCalled();
    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it("only zeroes nonzero locations belonging to an expired trial", async () => {
    businessFindUnique.mockResolvedValue(account({ trial: true }));
    await enforceTrialExpiration("biz-1");
    expect(locationUpdateMany).toHaveBeenCalledExactlyOnceWith({
      where: { businessId: "biz-1", credits: { not: 0 } },
      data: { credits: 0 },
    });
    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it.each([
    account({ trial: true, createdAt: daysAgo(1) }),
    account({ trial: true, trialDurationDays: 90 }),
    account({ trial: false }),
  ])("does not expire active trials or paid accounts: %o", async (business) => {
    businessFindUnique.mockResolvedValue(business);
    await enforceTrialExpiration("biz-1");
    expect(locationUpdateMany).not.toHaveBeenCalled();
  });

  it("treats a zero-day trial as expired", async () => {
    businessFindUnique.mockResolvedValue(account({ trial: true, trialDurationDays: 0 }));
    await refreshBusinessCredits("biz-1");
    expect(locationUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("reads one business snapshot for expiration and refill", async () => {
    businessFindUnique.mockResolvedValue(account({ trial: true }));
    await refreshBusinessCredits("biz-1");
    expect(businessFindUnique).toHaveBeenCalledTimes(1);
    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it("does not refill trials even when a stale refill date is due", async () => {
    businessFindUnique.mockResolvedValue(account({ trial: true }));
    await checkAndRefillMonthlyCredits("biz-1");
    expect(locationUpdateMany).not.toHaveBeenCalled();
  });

  it("does not refill a paid account without a credit start date", async () => {
    businessFindUnique.mockResolvedValue(account({ creditsStartedAt: null }));
    await refillCreditsForUser("biz-1");
    expect(locationUpdateMany).not.toHaveBeenCalled();
  });

  it("backfills an absent refill anchor without granting an early refill", async () => {
    businessFindUnique.mockResolvedValue(account({ nextCreditRefillAt: null }));
    await checkAndRefillMonthlyCredits("biz-1");
    expect(locationUpdateMany).not.toHaveBeenCalled();
    expect(businessUpdate).toHaveBeenCalledExactlyOnceWith({
      where: { id: "biz-1" },
      data: { nextCreditRefillAt: expect.any(Date) },
    });
  });

  it("waits until a future anchor is due", async () => {
    businessFindUnique.mockResolvedValue(
      account({ nextCreditRefillAt: new Date(Date.now() + 86400000) }),
    );
    await checkAndRefillMonthlyCredits("biz-1");
    expect(locationUpdateMany).not.toHaveBeenCalled();
    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it("refills and advances the anchor in the same transaction", async () => {
    businessFindUnique.mockResolvedValue(account());
    await refillCreditsForUser("biz-1");
    expect(locationUpdateMany).toHaveBeenCalledExactlyOnceWith({
      where: { businessId: "biz-1" },
      data: { credits: 450 },
    });
    const update = businessUpdate.mock.calls[0][0];
    expect(update.data.lastCreditRefillAt).toBeInstanceOf(Date);
    expect(update.data.nextCreditRefillAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("allows a paid zero-credit allowance", async () => {
    businessFindUnique.mockResolvedValue(account({ baseCredits: 0 }));
    await refreshBusinessCredits("biz-1");
    expect(locationUpdateMany.mock.calls[0][0].data.credits).toBe(0);
  });

  it("propagates database failures for transaction rollback", async () => {
    businessFindUnique.mockResolvedValue(account());
    locationUpdateMany.mockRejectedValue(new Error("write failed"));
    await expect(refreshBusinessCredits("biz-1")).rejects.toThrow("write failed");
    expect(businessUpdate).not.toHaveBeenCalled();
  });
});

describe("daily refill sweep", () => {
  it("does nothing when no business is due", async () => {
    await runDailyCreditRefillSweep();
    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it("rechecks each due or legacy business under the credit lock", async () => {
    businessFindMany.mockResolvedValue([{ id: "due-1" }, { id: "legacy-1" }]);
    businessFindUnique
      .mockResolvedValueOnce(account())
      .mockResolvedValueOnce(account({ nextCreditRefillAt: null }));
    await runDailyCreditRefillSweep();
    expect(locationUpdateMany).toHaveBeenCalledTimes(1);
    expect(businessUpdate).toHaveBeenCalledTimes(2);
  });

  it("continues after a failed account without logging account data", async () => {
    businessFindMany.mockResolvedValue([{ id: "due-1" }, { id: "due-2" }]);
    businessFindUnique
      .mockRejectedValueOnce(new Error("private database data"))
      .mockResolvedValueOnce(account());
    await runDailyCreditRefillSweep();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "[CREDIT-SWEEP] Credit maintenance failed",
    );
    expect(locationUpdateMany).toHaveBeenCalledTimes(1);
  });
});

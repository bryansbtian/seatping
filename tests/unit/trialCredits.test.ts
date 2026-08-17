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
    },
  };
});

const {
  buildLocationData,
  checkAndRefillMonthlyCredits,
  enforceTrialExpiration,
  nextMonthlyAnchorAfter,
  refillCreditsForUser,
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

describe("enforceTrialExpiration", () => {
  it("does nothing for an unknown business", async () => {
    await enforceTrialExpiration("biz-missing");

    expect(locationUpdateMany).not.toHaveBeenCalled();
  });

  it("zeroes every location of an expired trial business", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      trial: true,
      trialDurationDays: 7,
      createdAt: daysAgo(30),
      baseCredits: 300,
    });
    locationUpdateMany.mockResolvedValue({ count: 3 });

    await enforceTrialExpiration("biz-1");

    expect(locationUpdateMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1" },
      data: { credits: 0 },
    });
  });

  it("leaves an activated business to the monthly refill", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      trial: false,
      trialDurationDays: 7,
      createdAt: daysAgo(30),
      baseCredits: 300,
    });

    await enforceTrialExpiration("biz-1");

    expect(locationUpdateMany).not.toHaveBeenCalled();
  });

  it("leaves a business still inside its trial alone", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      trial: true,
      trialDurationDays: 7,
      createdAt: daysAgo(1),
      baseCredits: 300,
    });

    await enforceTrialExpiration("biz-1");

    expect(locationUpdateMany).not.toHaveBeenCalled();
  });
});

describe("refillCreditsForUser", () => {
  it("does nothing for an unknown business", async () => {
    await refillCreditsForUser("biz-missing");

    expect(locationUpdateMany).not.toHaveBeenCalled();
    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it("does nothing for a business that never started credits", async () => {
    businessFindUnique.mockResolvedValue({
      baseCredits: 300,
      creditsStartedAt: null,
    });

    await refillCreditsForUser("biz-1");

    expect(locationUpdateMany).not.toHaveBeenCalled();
  });

  it("restores the base credits and moves the anchor forward", async () => {
    businessFindUnique.mockResolvedValue({
      baseCredits: 450,
      creditsStartedAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    await refillCreditsForUser("biz-1");

    expect(locationUpdateMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1" },
      data: { credits: 450 },
    });
    const update = businessUpdate.mock.calls[0][0];
    expect(update.data.lastCreditRefillAt).toBeInstanceOf(Date);
    expect(update.data.nextCreditRefillAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("treats a missing base allowance as zero", async () => {
    businessFindUnique.mockResolvedValue({
      baseCredits: null,
      creditsStartedAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    await refillCreditsForUser("biz-1");

    expect(locationUpdateMany.mock.calls[0][0].data.credits).toBe(0);
  });
});

describe("checkAndRefillMonthlyCredits", () => {
  it("does nothing for an unknown business", async () => {
    await checkAndRefillMonthlyCredits("biz-missing");

    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it("does nothing for a business still on trial", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      trial: true,
      creditsStartedAt: daysAgo(60),
      nextCreditRefillAt: daysAgo(1),
    });

    await checkAndRefillMonthlyCredits("biz-1");

    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it("does nothing for a business that never started credits", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      trial: false,
      creditsStartedAt: null,
      nextCreditRefillAt: null,
    });

    await checkAndRefillMonthlyCredits("biz-1");

    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it("backfills a missing refill anchor without refilling early", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      trial: false,
      creditsStartedAt: daysAgo(10),
      nextCreditRefillAt: null,
    });

    await checkAndRefillMonthlyCredits("biz-1");

    expect(businessUpdate).toHaveBeenCalledTimes(1);
    expect(businessUpdate.mock.calls[0][0].data.nextCreditRefillAt).toBeInstanceOf(
      Date,
    );
    expect(locationUpdateMany).not.toHaveBeenCalled();
  });

  it("refills on demand once the anchor has passed", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      trial: false,
      creditsStartedAt: daysAgo(60),
      nextCreditRefillAt: daysAgo(1),
      baseCredits: 300,
    });

    await checkAndRefillMonthlyCredits("biz-1");

    expect(locationUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("waits when the anchor is still in the future", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      trial: false,
      creditsStartedAt: daysAgo(10),
      nextCreditRefillAt: new Date(Date.now() + 86_400_000),
    });

    await checkAndRefillMonthlyCredits("biz-1");

    expect(locationUpdateMany).not.toHaveBeenCalled();
  });
});

describe("runDailyCreditRefillSweep", () => {
  it("does nothing when no business is due", async () => {
    await runDailyCreditRefillSweep();

    expect(locationUpdateMany).not.toHaveBeenCalled();
    expect(businessUpdate).not.toHaveBeenCalled();
  });

  it("refills every due business and backfills every legacy one", async () => {
    businessFindMany
      .mockResolvedValueOnce([{ id: "due-1" }])
      .mockResolvedValueOnce([
        {
          id: "legacy-1",
          trial: false,
          creditsStartedAt: daysAgo(10),
          nextCreditRefillAt: null,
        },
      ]);
    businessFindUnique.mockResolvedValue({
      baseCredits: 300,
      creditsStartedAt: daysAgo(60),
    });

    await runDailyCreditRefillSweep();

    expect(locationUpdateMany).toHaveBeenCalledTimes(1);
    const backfill = businessUpdate.mock.calls.find(([arg]) => {
      return arg.where.id === "legacy-1";
    });
    expect(backfill).toBeDefined();
  });

  it("keeps sweeping after a refill fails", async () => {
    businessFindMany
      .mockResolvedValueOnce([{ id: "due-1" }, { id: "due-2" }])
      .mockResolvedValueOnce([]);
    businessFindUnique
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue({ baseCredits: 300, creditsStartedAt: daysAgo(60) });

    await runDailyCreditRefillSweep();

    expect(console.error).toHaveBeenCalled();
    expect(locationUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("keeps sweeping after a backfill fails", async () => {
    businessFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "legacy-1",
        trial: false,
        creditsStartedAt: daysAgo(10),
        nextCreditRefillAt: null,
      },
    ]);
    businessUpdate.mockRejectedValue(new Error("db down"));

    await runDailyCreditRefillSweep();

    expect(console.error).toHaveBeenCalled();
  });
});

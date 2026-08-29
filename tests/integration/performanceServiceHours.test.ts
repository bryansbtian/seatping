import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { apiFromIp } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { seedBusinessWithLocation } from "../helpers/seed.js";

const db = getTestPrisma();

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60000);
}

function everyDay(hours: Record<string, unknown>): Record<string, unknown> {
  const openingHours: Record<string, unknown> = {};
  for (const key of DAY_KEYS) {
    openingHours[key] = hours;
  }
  return openingHours;
}

async function setupWithHours(openingHours: Record<string, unknown> | null) {
  const { business, location } = await seedBusinessWithLocation();
  const room = await db.floorPlan.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });
  const table = await db.diningTable.create({
    data: {
      floorPlanId: room.id,
      businessId: business.id,
      locationId: location.id,
      name: "T1",
      capacity: 4,
      minimumPartySize: 1,
    },
  });
  await db.tableAssignment.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      tableId: table.id,
      tableIds: [table.id],
      partySize: 2,
      source: "SMART",
      status: "COMPLETED",
      expectedStartAt: minutesAgo(180),
      expectedEndAt: minutesAgo(90),
      seatedAt: minutesAgo(180),
      completedAt: minutesAgo(120),
    },
  });
  if (openingHours) {
    await db.location.update({
      where: { id: location.id },
      data: { restaurantProfile: { openingHours } },
    });
  }
  return { business, location, cookie: businessCookie(business.id) };
}

async function utilizationFor(
  locationId: string,
  cookie: string,
  preset = "today",
): Promise<number | null> {
  const request = await apiFromIp();
  const response = await request
    .get(`/api/performance/${locationId}?preset=${preset}`)
    .set("Cookie", cookie);
  expect(response.status).toBe(200);
  return response.body.metrics.tableUtilization;
}

describe("table utilization against opening hours", () => {
  it("measures against the elapsed day when the location never set its hours", async () => {
    const { location, cookie } = await setupWithHours(null);

    const utilization = await utilizationFor(location.id, cookie);

    expect(utilization).toBeGreaterThan(0);
  });

  it("measures against the elapsed day when every day is switched off", async () => {
    const noHours = await setupWithHours(null);
    const closed = await setupWithHours(everyDay({ enabled: false, open: "", close: "" }));

    const openUtilization = await utilizationFor(noHours.location.id, noHours.cookie);
    const closedUtilization = await utilizationFor(closed.location.id, closed.cookie);

    expect(closedUtilization).toBe(openUtilization);
  });

  it("measures against the open window once trading hours are set", async () => {
    const noHours = await setupWithHours(null);
    const trading = await setupWithHours(
      everyDay({ enabled: true, open: "09:00", close: "17:00" }),
    );

    const wholeWeek = await utilizationFor(noHours.location.id, noHours.cookie, "7d");
    const traded = await utilizationFor(trading.location.id, trading.cookie, "7d");

    expect(traded).toBeGreaterThan(wholeWeek as number);
  });

  it("treats matching open and close times as trading around the clock", async () => {
    const { location, cookie } = await setupWithHours(
      everyDay({ enabled: true, open: "00:00", close: "00:00" }),
    );

    const utilization = await utilizationFor(location.id, cookie);

    expect(utilization).toBeGreaterThan(0);
    expect(utilization).toBeLessThanOrEqual(1);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { seedBusinessWithLocation, seedQueueEntry } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60000);
}

async function setup() {
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
  const tables = [];
  for (const name of ["T1", "T2"]) {
    tables.push(
      await db.diningTable.create({
        data: {
          floorPlanId: room.id,
          businessId: business.id,
          locationId: location.id,
          name,
          capacity: 4,
          minimumPartySize: 1,
        },
      }),
    );
  }
  return { business, location, tables, cookie: businessCookie(business.id) };
}

async function seedAssignment(
  business: { id: string },
  location: { id: string },
  data: Record<string, unknown>,
) {
  return db.tableAssignment.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      partySize: 2,
      source: "SMART",
      status: "COMPLETED",
      expectedStartAt: minutesAgo(180),
      expectedEndAt: minutesAgo(90),
      seatedAt: minutesAgo(180),
      completedAt: minutesAgo(120),
      ...data,
    },
  });
}

async function metricsFor(locationId: string, cookie: string, query = "preset=today") {
  const response = await (
    await api()
  )
    .get(`/api/performance/${locationId}?${query}`)
    .set("Cookie", cookie);
  return response;
}

describe("performance metrics", () => {
  it("reports an empty range cleanly", async () => {
    const { location, cookie } = await setup();

    const response = await metricsFor(location.id, cookie);

    expect(response.status).toBe(200);
    expect(response.body.metrics.covers).toBe(0);
    expect(response.body.metrics.averageQueueWaitMinutes).toBeNull();
    expect(response.body.range.preset).toBe("today");
  });

  it("counts covers from persisted assignments", async () => {
    const { business, location, tables, cookie } = await setup();
    await seedAssignment(business, location, {
      tableId: tables[0].id,
      tableIds: [tables[0].id],
      partySize: 4,
    });

    const response = await metricsFor(location.id, cookie);

    expect(response.body.metrics.covers).toBe(4);
    expect(response.body.metrics.partiesSeated).toBe(1);
    expect(response.body.metrics.averageTableTurnMinutes).toBe(60);
  });

  it("reports the queue wait from persisted timestamps", async () => {
    const { location, cookie } = await setup();
    await seedQueueEntry(location, {
      guestCount: 2,
      status: "ARRIVED",
      joinedAt: minutesAgo(60),
      admittedAt: minutesAgo(45),
      arrivedAt: minutesAgo(40),
    });

    const response = await metricsFor(location.id, cookie);

    expect(response.body.metrics.averageQueueWaitMinutes).toBe(20);
    expect(response.body.metrics.guestsServed).toBe(2);
  });

  it("reports queue abandonment", async () => {
    const { location, cookie } = await setup();
    await seedQueueEntry(location, {
      status: "ARRIVED",
      joinedAt: minutesAgo(60),
      arrivedAt: minutesAgo(30),
    });
    await seedQueueEntry(location, {
      status: "LEFT",
      joinedAt: minutesAgo(60),
      leftAt: minutesAgo(30),
    });

    const response = await metricsFor(location.id, cookie);

    expect(response.body.metrics.queueAbandonmentRate).toBe(0.5);
  });

  it("separates reservation covers from walk in covers", async () => {
    const { business, location, tables, cookie } = await setup();
    const reservation = await db.reservation.create({
      data: {
        manageToken: `perf-${Date.now()}`,
        locationId: location.id,
        businessId: business.id,
        firstName: "Res",
        lastName: "Guest",
        email: `perf-${Date.now()}@test.invalid`,
        guestCount: 4,
        reservationDateTime: "2026-08-27T18:00",
        status: "COMPLETED",
        arrivedAt: minutesAgo(150),
        completedAt: minutesAgo(90),
      },
    });
    await seedAssignment(business, location, {
      tableId: tables[0].id,
      tableIds: [tables[0].id],
      partySize: 4,
      reservationId: reservation.id,
    });
    await seedAssignment(business, location, {
      tableId: tables[1].id,
      tableIds: [tables[1].id],
      partySize: 2,
    });

    const response = await metricsFor(location.id, cookie);

    expect(response.body.metrics.reservationCovers).toBe(4);
    expect(response.body.metrics.walkInCovers).toBe(2);
  });

  it("reports utilization for every table at the location", async () => {
    const { business, location, tables, cookie } = await setup();
    await seedAssignment(business, location, {
      tableId: tables[0].id,
      tableIds: [tables[0].id],
    });

    const response = await metricsFor(location.id, cookie);
    const rows = response.body.metrics.perTableUtilization;

    expect(rows).toHaveLength(2);
    const byName = new Map(rows.map((row: any) => [row.tableName, row]));
    expect(byName.get("T1").seatedMinutes).toBe(60);
    expect(byName.get("T2").seatedMinutes).toBe(0);
  });

  it("credits both tables of a joined party", async () => {
    const { business, location, tables, cookie } = await setup();
    await seedAssignment(business, location, {
      tableId: tables[0].id,
      tableIds: [tables[0].id, tables[1].id],
      partySize: 7,
    });

    const response = await metricsFor(location.id, cookie);
    const rows = response.body.metrics.perTableUtilization;

    expect(rows.every((row: any) => row.seatedMinutes === 60)).toBe(true);
  });

  it("accepts a custom range", async () => {
    const { location, cookie } = await setup();

    const response = await metricsFor(
      location.id,
      cookie,
      "preset=custom&from=2026-08-01&to=2026-08-03",
    );

    expect(response.status).toBe(200);
    expect(response.body.range.preset).toBe("custom");
  });

  it("refuses a custom range without both ends", async () => {
    const { location, cookie } = await setup();

    const response = await metricsFor(location.id, cookie, "preset=custom&from=2026-08-01");

    expect(response.status).toBe(400);
  });

  it("refuses an unknown preset", async () => {
    const { location, cookie } = await setup();

    const response = await metricsFor(location.id, cookie, "preset=forever");

    expect(response.status).toBe(400);
  });

  it("refuses another business's location", async () => {
    const { location } = await setup();
    const other = await setup();

    const response = await metricsFor(location.id, other.cookie);

    expect(response.status).toBe(404);
  });

  it("refuses a signed out request", async () => {
    const { location } = await setup();

    const response = await (await api()).get(`/api/performance/${location.id}?preset=today`);

    expect(response.status).toBe(401);
  });

  it("refuses a malformed location id", async () => {
    const { cookie } = await setup();

    const response = await metricsFor("not-an-id", cookie);

    expect(response.status).toBe(404);
  });

  it("keeps each location's metrics separate", async () => {
    const { business, location, tables, cookie } = await setup();
    await seedAssignment(business, location, {
      tableId: tables[0].id,
      tableIds: [tables[0].id],
      partySize: 4,
    });
    const second = await db.location.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        name: "Second",
        displayName: "Second",
        address: "2 Test Street",
      },
    });

    const response = await metricsFor(second.id, cookie);

    expect(response.body.metrics.covers).toBe(0);
  });
});

describe("adaptive buckets and activity detection", () => {
  function dayKeyAgo(days: number): string {
    const at = new Date();
    at.setDate(at.getDate() - days);
    const year = at.getFullYear();
    const month = String(at.getMonth() + 1).padStart(2, "0");
    const day = String(at.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  it("reports no activity for a silent location", async () => {
    const { location, cookie } = await setup();

    const response = await metricsFor(location.id, cookie);

    expect(response.body.metrics.hasActivity).toBe(false);
    expect(response.body.metrics.tableUtilization).toBeNull();
  });

  it("reports activity once someone joined the queue", async () => {
    const { location, cookie } = await setup();
    await seedQueueEntry(location, { joinedAt: minutesAgo(30), status: "WAITING" });

    const response = await metricsFor(location.id, cookie);

    expect(response.body.metrics.hasActivity).toBe(true);
  });

  it("treats a measured zero as activity, not missing data", async () => {
    const { location, cookie } = await setup();
    await seedQueueEntry(location, {
      joinedAt: minutesAgo(60),
      leftAt: minutesAgo(30),
      status: "LEFT",
    });

    const response = await metricsFor(location.id, cookie);

    expect(response.body.metrics.hasActivity).toBe(true);
    expect(response.body.metrics.covers).toBe(0);
    expect(response.body.metrics.queueAbandonmentRate).toBe(1);
  });

  it("uses daily buckets for a short range", async () => {
    const { location, cookie } = await setup();

    const response = await metricsFor(location.id, cookie, "preset=7d");

    expect(response.body.metrics.granularity).toBe("daily");
    expect(response.body.metrics.coverBuckets).toHaveLength(7);
  });

  it("uses weekly buckets for a hundred day custom range", async () => {
    const { location, cookie } = await setup();

    const response = await metricsFor(
      location.id,
      cookie,
      `preset=custom&from=${dayKeyAgo(99)}&to=${dayKeyAgo(0)}`,
    );

    expect(response.body.metrics.granularity).toBe("weekly");
    expect(response.body.metrics.coverBuckets.length).toBeLessThan(20);
  });

  it("keeps the bucket totals equal to the headline covers", async () => {
    const { business, location, tables, cookie } = await setup();
    await seedAssignment(business, location, {
      tableId: tables[0].id,
      tableIds: [tables[0].id],
      partySize: 4,
    });

    const response = await metricsFor(location.id, cookie, "preset=7d");
    const total = response.body.metrics.coverBuckets.reduce(
      (sum: number, bucket: any) => sum + bucket.covers,
      0,
    );

    expect(total).toBe(response.body.metrics.covers);
    expect(response.body.metrics.covers).toBe(4);
  });

  it("compares against the immediately preceding period of the same length", async () => {
    const { business, location, tables, cookie } = await setup();
    const priorSeated = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    await seedAssignment(business, location, {
      tableId: tables[0].id,
      tableIds: [tables[0].id],
      partySize: 3,
      seatedAt: priorSeated,
      completedAt: new Date(priorSeated.getTime() + 60 * 60 * 1000),
      expectedStartAt: priorSeated,
      expectedEndAt: new Date(priorSeated.getTime() + 90 * 60 * 1000),
    });
    await seedAssignment(business, location, {
      tableId: tables[1].id,
      tableIds: [tables[1].id],
      partySize: 5,
    });

    const response = await metricsFor(location.id, cookie, "preset=7d");

    expect(response.body.metrics.covers).toBe(5);
    expect(response.body.metrics.previousCovers).toBe(3);
    expect(response.body.metrics.coversDelta).toBe(2);
  });

  it("never counts one location's activity for another", async () => {
    const first = await setup();
    const second = await setup();
    await seedQueueEntry(first.location, { joinedAt: minutesAgo(20), status: "WAITING" });

    const response = await metricsFor(second.location.id, second.cookie);

    expect(response.body.metrics.hasActivity).toBe(false);
  });
});

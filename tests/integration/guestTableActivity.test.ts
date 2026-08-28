import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Business, Location } from "@prisma/client";
import { api } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import { disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import {
  seedBusinessWithLocation,
  seedQueueEntry,
  seedReservation,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

let business: Business;
let location: Location;
let cookie: string;

beforeAll(async () => {
  const seeded = await seedBusinessWithLocation();
  business = seeded.business;
  location = seeded.location;
  cookie = businessCookie(business.id);
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seedGuest(overrides: Record<string, unknown> = {}) {
  const suffix = uniqueSuffix();
  return db.guestProfile.create({
    data: {
      businessId: business.id,
      businessUsername: business.username,
      locationId: location.id,
      firstName: "Guest",
      lastName: suffix,
      fullName: `Guest ${suffix}`,
      email: `g-${suffix}@test.invalid`,
      totalVisits: 1,
      ...overrides,
    },
  });
}

async function seedTables(count: number) {
  const room = await db.floorPlan.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: `Room ${uniqueSuffix()}`,
      width: 1200,
      height: 800,
    },
  });
  const tables = [];
  for (let index = 0; index < count; index += 1) {
    tables.push(
      await db.diningTable.create({
        data: {
          floorPlanId: room.id,
          businessId: business.id,
          locationId: location.id,
          name: `T${uniqueSuffix().slice(0, 4)}${index}`,
          capacity: 4,
          minimumPartySize: 1,
        },
      }),
    );
  }
  return tables;
}

async function seedAssignment(data: Record<string, unknown>) {
  const start = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return db.tableAssignment.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      partySize: 2,
      source: "SMART",
      status: "COMPLETED",
      expectedStartAt: start,
      expectedEndAt: new Date(start.getTime() + 90 * 60 * 1000),
      seatedAt: start,
      completedAt: new Date(start.getTime() + 72 * 60 * 1000),
      ...data,
    },
  });
}

async function detailFor(guestId: string) {
  const response = await (await api()).get(`/api/guests/${guestId}`).set("Cookie", cookie);
  expect(response.status).toBe(200);
  return response.body;
}

function pastReservationDateTime(): string {
  const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T18:00`;
}

describe("table activity on guest history", () => {
  it("records the table a completed queue visit used", async () => {
    const [table] = await seedTables(1);
    const entry = await seedQueueEntry(location, { guestCount: 2 });
    const guest = await seedGuest({ sourceQueueEntryIds: [entry.id] });
    await seedAssignment({ tableId: table.id, tableIds: [table.id], queueEntryId: entry.id });

    const body = await detailFor(guest.id);
    const visit = body.waitlistHistory.find((row: any) => row.id === entry.id);

    expect(visit.table.tableName).toBe(table.name);
    expect(visit.table.turnMinutes).toBe(72);
    expect(visit.table.assignmentSource).toBe("SMART");
    expect(visit.table.status).toBe("COMPLETED");
    expect(visit.table.seatedAt).toEqual(expect.any(String));
    expect(visit.table.completedAt).toEqual(expect.any(String));
  });

  it("records the table a completed reservation used", async () => {
    const [table] = await seedTables(1);
    const reservation = await seedReservation(location, {
      guestCount: 2,
      reservationDateTime: pastReservationDateTime(),
      status: "COMPLETED",
    });
    const guest = await seedGuest({ sourceReservationIds: [reservation.id] });
    await seedAssignment({
      tableId: table.id,
      tableIds: [table.id],
      reservationId: reservation.id,
      source: "MANUAL",
    });

    const body = await detailFor(guest.id);
    const visit = body.pastReservations.find((row: any) => row.id === reservation.id);

    expect(visit.table.tableName).toBe(table.name);
    expect(visit.table.assignmentSource).toBe("MANUAL");
    expect(visit.table.turnMinutes).toBe(72);
  });

  it("names every table a joined party used", async () => {
    const tables = await seedTables(2);
    const entry = await seedQueueEntry(location, { guestCount: 7 });
    const guest = await seedGuest({ sourceQueueEntryIds: [entry.id] });
    await seedAssignment({
      tableId: tables[0].id,
      tableIds: [tables[0].id, tables[1].id],
      queueEntryId: entry.id,
      partySize: 7,
    });

    const body = await detailFor(guest.id);
    const visit = body.waitlistHistory.find((row: any) => row.id === entry.id);

    expect(visit.table.tableNames).toEqual([tables[0].name, tables[1].name]);
    expect(visit.table.tableName).toBe(`${tables[0].name} + ${tables[1].name}`);
  });

  it("leaves the turn time empty while the party is still seated", async () => {
    const [table] = await seedTables(1);
    const entry = await seedQueueEntry(location, { guestCount: 2 });
    const guest = await seedGuest({ sourceQueueEntryIds: [entry.id] });
    await seedAssignment({
      tableId: table.id,
      tableIds: [table.id],
      queueEntryId: entry.id,
      status: "SEATED",
      completedAt: null,
    });

    const body = await detailFor(guest.id);
    const visit = body.waitlistHistory.find((row: any) => row.id === entry.id);

    expect(visit.table.status).toBe("SEATED");
    expect(visit.table.turnMinutes).toBeNull();
    expect(visit.table.completedAt).toBeNull();
  });

  it("prefers the completed assignment over a cancelled one", async () => {
    const tables = await seedTables(2);
    const entry = await seedQueueEntry(location, { guestCount: 2 });
    const guest = await seedGuest({ sourceQueueEntryIds: [entry.id] });
    await seedAssignment({
      tableId: tables[0].id,
      tableIds: [tables[0].id],
      queueEntryId: entry.id,
      status: "CANCELLED",
      seatedAt: null,
      completedAt: null,
    });
    await seedAssignment({
      tableId: tables[1].id,
      tableIds: [tables[1].id],
      queueEntryId: entry.id,
    });

    const body = await detailFor(guest.id);
    const visit = body.waitlistHistory.find((row: any) => row.id === entry.id);

    expect(visit.table.tableName).toBe(tables[1].name);
    expect(visit.table.status).toBe("COMPLETED");
  });

  it("leaves table data null for a visit that never got one", async () => {
    const entry = await seedQueueEntry(location, { guestCount: 2 });
    const guest = await seedGuest({ sourceQueueEntryIds: [entry.id] });

    const body = await detailFor(guest.id);
    const visit = body.waitlistHistory.find((row: any) => row.id === entry.id);

    expect(visit.table).toBeNull();
  });

  it("keeps the existing history fields working", async () => {
    const entry = await seedQueueEntry(location, { guestCount: 3 });
    const guest = await seedGuest({ sourceQueueEntryIds: [entry.id] });

    const body = await detailFor(guest.id);
    const visit = body.waitlistHistory.find((row: any) => row.id === entry.id);

    expect(visit.partySize).toBe(3);
    expect(visit.source).toBe("waitlist");
    expect(visit.location).toEqual(expect.any(String));
    expect(body.guest.id).toBe(guest.id);
  });

  it("carries the table onto the combined timeline", async () => {
    const [table] = await seedTables(1);
    const entry = await seedQueueEntry(location, { guestCount: 2 });
    const guest = await seedGuest({ sourceQueueEntryIds: [entry.id] });
    await seedAssignment({ tableId: table.id, tableIds: [table.id], queueEntryId: entry.id });

    const body = await detailFor(guest.id);
    const visit = body.timeline.find((row: any) => row.id === entry.id);

    expect(visit.table.tableName).toBe(table.name);
  });

  it("does not leak an assignment owned by another business", async () => {
    const [table] = await seedTables(1);
    const other = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location, { guestCount: 2 });
    const guest = await seedGuest({ sourceQueueEntryIds: [entry.id] });
    await db.tableAssignment.create({
      data: {
        businessId: other.business.id,
        locationId: other.location.id,
        tableId: table.id,
        tableIds: [table.id],
        queueEntryId: entry.id,
        partySize: 2,
        source: "SMART",
        status: "COMPLETED",
        expectedStartAt: new Date(),
        expectedEndAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const body = await detailFor(guest.id);
    const visit = body.waitlistHistory.find((row: any) => row.id === entry.id);

    expect(visit.table).toBeNull();
  });
});

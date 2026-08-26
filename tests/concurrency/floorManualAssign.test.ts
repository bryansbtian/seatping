import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry, seedReservation } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seedFloor(tableCount = 2) {
  const { business, location } = await seedBusinessWithLocation();
  const plan = await db.floorPlan.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });

  const tables = [];
  for (let index = 0; index < tableCount; index += 1) {
    tables.push(
      await db.diningTable.create({
        data: {
          floorPlanId: plan.id,
          businessId: business.id,
          locationId: location.id,
          name: `T${index + 1}`,
          capacity: 6,
          minimumPartySize: 1,
        },
      }),
    );
  }

  return { business, location, cookie: businessCookie(business.id), tables };
}

function countByStatus(responses: { status: number }[], status: number): number {
  return responses.filter((response) => response.status === status).length;
}

describe("concurrent manual assignment", () => {
  it("lets only one of two staff assign the same table to different guests", async () => {
    const { location, cookie, tables } = await seedFloor(1);
    const request = await api();
    const first = await seedQueueEntry(location, { guestCount: 2 });
    const second = await seedQueueEntry(location, { guestCount: 2 });

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ tableId: tables[0].id, queueEntryId: first.id }),
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ tableId: tables[0].id, queueEntryId: second.id }),
    ]);

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);

    const stored = await db.tableAssignment.findMany({ where: { tableId: tables[0].id } });
    expect(stored).toHaveLength(1);
  });

  it("seats exactly one guest when five staff assign the same table at once", async () => {
    const { location, cookie, tables } = await seedFloor(1);
    const request = await api();
    const parties = await Promise.all([
      seedQueueEntry(location, { guestCount: 2 }),
      seedQueueEntry(location, { guestCount: 2 }),
      seedQueueEntry(location, { guestCount: 2 }),
      seedQueueEntry(location, { guestCount: 2 }),
      seedQueueEntry(location, { guestCount: 2 }),
    ]);

    const responses = await Promise.all(
      parties.map((party) =>
        request
          .post(`/api/floor/${location.id}/assign`)
          .set("Cookie", cookie)
          .send({ tableId: tables[0].id, queueEntryId: party.id }),
      ),
    );

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(4);

    const arrived = await db.queueEntry.findMany({
      where: { locationId: location.id, status: "ARRIVED" },
    });
    expect(arrived).toHaveLength(1);
  });

  it("does not let a queue guest and a reservation claim the same table", async () => {
    const { location, cookie, tables } = await seedFloor(1);
    const request = await api();
    const entry = await seedQueueEntry(location, { guestCount: 2 });
    const reservation = await seedReservation(location, { guestCount: 2 });

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ tableId: tables[0].id, queueEntryId: entry.id }),
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ tableId: tables[0].id, reservationId: reservation.id }),
    ]);

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);

    const stored = await db.tableAssignment.findMany({ where: { tableId: tables[0].id } });
    expect(stored).toHaveLength(1);
  });

  it("keeps one assignment when the same guest is assigned twice at once", async () => {
    const { location, cookie, tables } = await seedFloor(2);
    const request = await api();
    const entry = await seedQueueEntry(location, { guestCount: 2 });

    await Promise.all([
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ tableId: tables[0].id, queueEntryId: entry.id }),
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ tableId: tables[1].id, queueEntryId: entry.id }),
    ]);

    const active = await db.tableAssignment.findMany({
      where: { queueEntryId: entry.id, status: { in: ["RESERVED", "SEATED"] } },
    });
    expect(active).toHaveLength(1);
  });

  it("leaves the live floor showing a single occupied table after the race", async () => {
    const { location, cookie, tables } = await seedFloor(1);
    const request = await api();
    const first = await seedQueueEntry(location, { guestCount: 2 });
    const second = await seedQueueEntry(location, { guestCount: 2 });

    await Promise.all([
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ tableId: tables[0].id, queueEntryId: first.id }),
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ tableId: tables[0].id, queueEntryId: second.id }),
    ]);

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const occupied = live.body.rooms[0].tables.filter((t: any) => t.status === "OCCUPIED");

    expect(occupied).toHaveLength(1);
    expect(live.body.waitingParties).toHaveLength(1);
  });
});

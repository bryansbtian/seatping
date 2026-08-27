import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seedFloor() {
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
  for (let index = 0; index < 3; index += 1) {
    tables.push(
      await db.diningTable.create({
        data: {
          floorPlanId: plan.id,
          businessId: business.id,
          locationId: location.id,
          name: `T${index + 1}`,
          capacity: 4,
          minimumPartySize: 1,
        },
      }),
    );
  }

  const first = await db.tableCombination.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "T1 + T2",
      tableIds: [tables[0].id, tables[1].id],
    },
  });
  const second = await db.tableCombination.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "T2 + T3",
      tableIds: [tables[1].id, tables[2].id],
    },
  });

  return { business, location, cookie: businessCookie(business.id), tables, first, second };
}

function countByStatus(responses: { status: number }[], status: number): number {
  return responses.filter((response) => response.status === status).length;
}

describe("concurrent combination assignment", () => {
  it("lets only one of two overlapping combinations take the shared table", async () => {
    const { location, cookie, first, second } = await seedFloor();
    const request = await api();

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ combinationId: first.id, partySize: 7 }),
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ combinationId: second.id, partySize: 7 }),
    ]);

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);

    const stored = await db.tableAssignment.findMany({ where: { locationId: location.id } });
    expect(stored).toHaveLength(1);
  });

  it("does not let a combination and a single table claim the same seat", async () => {
    const { location, cookie, tables, first } = await seedFloor();
    const request = await api();

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ combinationId: first.id, partySize: 7 }),
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ tableId: tables[1].id, partySize: 2 }),
    ]);

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);

    const stored = await db.tableAssignment.findMany({ where: { locationId: location.id } });
    expect(stored).toHaveLength(1);
  });

  it("seats one party when several race for the same combination", async () => {
    const { location, cookie, first } = await seedFloor();
    const request = await api();
    const parties = await Promise.all([
      seedQueueEntry(location, { guestCount: 7 }),
      seedQueueEntry(location, { guestCount: 7 }),
      seedQueueEntry(location, { guestCount: 7 }),
    ]);

    const responses = await Promise.all(
      parties.map((party) =>
        request
          .post(`/api/floor/${location.id}/assign`)
          .set("Cookie", cookie)
          .send({ combinationId: first.id, queueEntryId: party.id }),
      ),
    );

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(2);

    const arrived = await db.queueEntry.findMany({
      where: { locationId: location.id, status: "ARRIVED" },
    });
    expect(arrived).toHaveLength(1);
  });

  it("leaves the live floor consistent after the race", async () => {
    const { location, cookie, first, second } = await seedFloor();
    const request = await api();

    await Promise.all([
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ combinationId: first.id, partySize: 7 }),
      request
        .post(`/api/floor/${location.id}/assign`)
        .set("Cookie", cookie)
        .send({ combinationId: second.id, partySize: 7 }),
    ]);

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const occupied = live.body.rooms[0].tables.filter((t: any) => t.status === "OCCUPIED");

    expect(occupied).toHaveLength(2);
  });
});

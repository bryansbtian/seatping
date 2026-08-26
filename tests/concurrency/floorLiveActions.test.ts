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
    const table = await db.diningTable.create({
      data: {
        floorPlanId: plan.id,
        businessId: business.id,
        locationId: location.id,
        name: `T${index + 1}`,
        capacity: 6,
        minimumPartySize: 1,
      },
    });
    tables.push(table);
  }

  return { business, location, cookie: businessCookie(business.id), tables };
}

function countByStatus(responses: { status: number }[], status: number): number {
  return responses.filter((response) => response.status === status).length;
}

describe("concurrent seating from the live floor", () => {
  it("seats only one of two walk ins racing for the same table", async () => {
    const { location, cookie, tables } = await seedFloor(1);
    const request = await api();

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
        .set("Cookie", cookie)
        .send({ partySize: 2 }),
      request
        .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
        .set("Cookie", cookie)
        .send({ partySize: 3 }),
    ]);

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);

    const stored = await db.tableAssignment.findMany({
      where: { tableId: tables[0].id, status: "SEATED" },
    });
    expect(stored).toHaveLength(1);
  });

  it("seats only one party when five staff members tap the same table at once", async () => {
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
          .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
          .set("Cookie", cookie)
          .send({ queueEntryId: party.id }),
      ),
    );

    expect(countByStatus(responses, 201)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(4);

    const stored = await db.tableAssignment.findMany({ where: { tableId: tables[0].id } });
    expect(stored).toHaveLength(1);
  });

  it("keeps a live floor read consistent with exactly one seated party after the race", async () => {
    const { location, cookie, tables } = await seedFloor(1);
    const request = await api();

    await Promise.all([
      request
        .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
        .set("Cookie", cookie)
        .send({ partySize: 2 }),
      request
        .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
        .set("Cookie", cookie)
        .send({ partySize: 4 }),
    ]);

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const table = live.body.rooms[0].tables[0];

    expect(table.status).toBe("OCCUPIED");
    expect(table.currentAssignment).not.toBeNull();
  });
});

describe("concurrent move party", () => {
  it("moves a party to exactly one destination when two moves race", async () => {
    const { location, cookie, tables } = await seedFloor(3);
    const request = await api();

    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });
    const assignmentId = seated.body.assignment.id;

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assignments/${assignmentId}/move`)
        .set("Cookie", cookie)
        .send({ tableId: tables[1].id }),
      request
        .post(`/api/floor/${location.id}/assignments/${assignmentId}/move`)
        .set("Cookie", cookie)
        .send({ tableId: tables[2].id }),
    ]);

    expect(countByStatus(responses, 200)).toBeGreaterThanOrEqual(1);

    const stored = await db.tableAssignment.findUnique({ where: { id: assignmentId } });
    expect([tables[1].id, tables[2].id]).toContain(stored?.tableId);

    const occupied = await db.tableAssignment.findMany({ where: { status: "SEATED" } });
    expect(occupied).toHaveLength(1);
  });

  it("lets only one of two parties move onto the same free table", async () => {
    const { location, cookie, tables } = await seedFloor(3);
    const request = await api();

    const first = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });
    const second = await request
      .post(`/api/floor/${location.id}/tables/${tables[1].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assignments/${first.body.assignment.id}/move`)
        .set("Cookie", cookie)
        .send({ tableId: tables[2].id }),
      request
        .post(`/api/floor/${location.id}/assignments/${second.body.assignment.id}/move`)
        .set("Cookie", cookie)
        .send({ tableId: tables[2].id }),
    ]);

    expect(countByStatus(responses, 200)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);

    const landed = await db.tableAssignment.findMany({
      where: { tableId: tables[2].id, status: "SEATED" },
    });
    expect(landed).toHaveLength(1);
  });

  it("does not let a move and a fresh seating double book the destination", async () => {
    const { location, cookie, tables } = await seedFloor(2);
    const request = await api();

    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
        .set("Cookie", cookie)
        .send({ tableId: tables[1].id }),
      request
        .post(`/api/floor/${location.id}/tables/${tables[1].id}/seat`)
        .set("Cookie", cookie)
        .send({ partySize: 3 }),
    ]);

    const winners = responses.filter((response) => response.status < 400);
    expect(winners.length).toBeGreaterThanOrEqual(1);

    const landed = await db.tableAssignment.findMany({
      where: { tableId: tables[1].id, status: "SEATED" },
    });
    expect(landed).toHaveLength(1);
  });
});

describe("concurrent visit completion", () => {
  it("completes a visit exactly once when two staff tap at the same time", async () => {
    const { location, cookie, tables } = await seedFloor(1);
    const request = await api();

    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });
    const assignmentId = seated.body.assignment.id;

    const responses = await Promise.all([
      request
        .post(`/api/floor/${location.id}/assignments/${assignmentId}/complete`)
        .set("Cookie", cookie)
        .send({}),
      request
        .post(`/api/floor/${location.id}/assignments/${assignmentId}/complete`)
        .set("Cookie", cookie)
        .send({}),
    ]);

    expect(countByStatus(responses, 200)).toBe(1);
    expect(countByStatus(responses, 409)).toBe(1);

    const stored = await db.tableAssignment.findUnique({ where: { id: assignmentId } });
    expect(stored?.status).toBe("COMPLETED");
  });

  it("keeps the table usable when a completion and a cleaning flag race", async () => {
    const { location, cookie, tables } = await seedFloor(1);
    const request = await api();

    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    await Promise.all([
      request
        .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/complete`)
        .set("Cookie", cookie)
        .send({}),
      request
        .post(`/api/floor/${location.id}/tables/${tables[0].id}/cleaning`)
        .set("Cookie", cookie)
        .send({}),
    ]);

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const table = live.body.rooms[0].tables[0];

    expect(["AVAILABLE", "CLEANING"]).toContain(table.status);
    expect(table.currentAssignment).toBeNull();
  });
});

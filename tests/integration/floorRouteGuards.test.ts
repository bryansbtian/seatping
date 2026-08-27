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

async function setupFloor() {
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
      capacity: 8,
      minimumPartySize: 1,
    },
  });
  return { business, location, cookie: businessCookie(business.id), room, table };
}

describe("seat route validation", () => {
  it("rejects a malformed reservation id", async () => {
    const { location, cookie, table } = await setupFloor();

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/tables/${table.id}/seat`)
      .set("Cookie", cookie)
      .send({ reservationId: "nope", partySize: 2 });

    expect(response.status).toBe(400);
  });

  it("rejects a malformed guest profile id", async () => {
    const { location, cookie, table } = await setupFloor();

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/tables/${table.id}/seat`)
      .set("Cookie", cookie)
      .send({ guestProfileId: "nope", partySize: 2 });

    expect(response.status).toBe(400);
  });

  it("rejects a guest profile that belongs to another business", async () => {
    const { location, cookie, table } = await setupFloor();
    const other = await seedBusinessWithLocation();
    const guest = await db.guestProfile.create({
      data: {
        businessId: other.business.id,
        locationId: other.location.id,
        firstName: "Foreign",
        lastName: "Guest",
      },
    });

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/tables/${table.id}/seat`)
      .set("Cookie", cookie)
      .send({ guestProfileId: guest.id, partySize: 2 });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("Guest not found");
  });

  it("derives the party size from the reservation when seating one", async () => {
    const { location, cookie, table } = await setupFloor();
    const reservation = await seedReservation(location, { guestCount: 5 });

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/tables/${table.id}/seat`)
      .set("Cookie", cookie)
      .send({ reservationId: reservation.id });

    expect(response.status).toBe(201);
    expect(response.body.assignment.partySize).toBe(5);
  });

  it("rejects an unusable occupancy window on the seat route", async () => {
    const { location, cookie, table } = await setupFloor();

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/tables/${table.id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2, expectedStartAt: "not-a-date" });

    expect(response.status).toBe(400);
  });
});

describe("assign route validation", () => {
  it("rejects a malformed guest profile id", async () => {
    const { location, cookie, table } = await setupFloor();

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, guestProfileId: "nope", partySize: 2 });

    expect(response.status).toBe(400);
  });

  it("rejects a malformed reservation id", async () => {
    const { location, cookie, table } = await setupFloor();

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, reservationId: "nope", partySize: 2 });

    expect(response.status).toBe(400);
  });

  it("rejects an unusable occupancy window", async () => {
    const { location, cookie, table } = await setupFloor();

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 2, expectedEndAt: "not-a-date" });

    expect(response.status).toBe(400);
  });

  it("honours an explicit turn length", async () => {
    const { location, cookie, table } = await setupFloor();

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 2, turnMinutes: 45 });

    expect(response.status).toBe(201);
    const start = new Date(response.body.assignment.expectedStartAt).getTime();
    const end = new Date(response.body.assignment.expectedEndAt).getTime();
    expect(Math.round((end - start) / 60000)).toBe(45);
  });

  it("holds a table without seating when seatNow is false", async () => {
    const { location, cookie, table } = await setupFloor();
    const guest = await seedQueueEntry(location, { guestCount: 2 });

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, queueEntryId: guest.id, seatNow: false });

    expect(response.status).toBe(201);
    expect(response.body.assignment.status).toBe("RESERVED");

    const stored = await db.queueEntry.findUnique({ where: { id: guest.id } });
    expect(stored?.status).toBe("WAITING");
  });
});

describe("assignment listing filters", () => {
  it("filters assignments by table", async () => {
    const { location, cookie, table } = await setupFloor();
    await (
      await api()
    )
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 2 });

    const response = await (
      await api()
    )
      .get(`/api/floor/${location.id}/assignments?tableId=${table.id}`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.assignments).toHaveLength(1);
  });

  it("rejects a malformed table filter", async () => {
    const { location, cookie } = await setupFloor();

    const response = await (
      await api()
    )
      .get(`/api/floor/${location.id}/assignments?tableId=nope`)
      .set("Cookie", cookie);

    expect(response.status).toBe(400);
  });

  it("filters assignments by status", async () => {
    const { location, cookie, table } = await setupFloor();
    await (
      await api()
    )
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 2 });

    const seated = await (
      await api()
    )
      .get(`/api/floor/${location.id}/assignments?status=SEATED`)
      .set("Cookie", cookie);
    const cancelled = await (
      await api()
    )
      .get(`/api/floor/${location.id}/assignments?status=CANCELLED`)
      .set("Cookie", cookie);

    expect(seated.body.assignments).toHaveLength(1);
    expect(cancelled.body.assignments).toEqual([]);
  });

  it("rejects an unknown status filter", async () => {
    const { location, cookie } = await setupFloor();

    const response = await (
      await api()
    )
      .get(`/api/floor/${location.id}/assignments?status=NONSENSE`)
      .set("Cookie", cookie);

    expect(response.status).toBe(400);
  });

  it("rejects a malformed date filter", async () => {
    const { location, cookie } = await setupFloor();

    const from = await (
      await api()
    )
      .get(`/api/floor/${location.id}/assignments?from=nope`)
      .set("Cookie", cookie);
    const to = await (
      await api()
    )
      .get(`/api/floor/${location.id}/assignments?to=nope`)
      .set("Cookie", cookie);

    expect(from.status).toBe(400);
    expect(to.status).toBe(400);
  });
});

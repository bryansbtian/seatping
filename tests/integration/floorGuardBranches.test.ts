import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry, seedReservation } from "../helpers/seed.js";

const db = getTestPrisma();

const MALFORMED_ID = "nope";

function minutesFromNow(offset: number): string {
  return new Date(Date.now() + offset * 60 * 1000).toISOString();
}

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function setupFloor() {
  const { business, location } = await seedBusinessWithLocation();
  const cookie = businessCookie(business.id);
  const request = await api();

  const roomResponse = await request
    .post(`/api/floor/${location.id}/rooms`)
    .set("Cookie", cookie)
    .send({ name: "Terrace" });
  const room = roomResponse.body.room;

  const tableResponse = await request
    .post(`/api/floor/${location.id}/rooms/${room.id}/tables`)
    .set("Cookie", cookie)
    .send({ name: "Table 1", capacity: 4, minimumPartySize: 1 });

  return { business, location, cookie, request, room, table: tableResponse.body.table };
}

describe("floor identifier guards", () => {
  it("rejects a malformed location id before touching the database", async () => {
    const { business } = await seedBusinessWithLocation();

    const response = await (
      await api()
    )
      .get(`/api/floor/${MALFORMED_ID}`)
      .set("Cookie", businessCookie(business.id));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Location not found or access denied");
  });

  it("rejects a malformed queue entry id on every live queue action", async () => {
    const { location, cookie, request } = await setupFloor();

    for (const action of ["admit", "arrived", "no-show"]) {
      const response = await request
        .post(`/api/floor/${location.id}/queue/${MALFORMED_ID}/${action}`)
        .set("Cookie", cookie)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("queueEntryId");
    }
  });

  it("rejects a malformed reservation id when resolving a reservation", async () => {
    const { location, cookie, request } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/reservations/${MALFORMED_ID}/resolve`)
      .set("Cookie", cookie)
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Reservation not found or access denied");
  });

  it("rejects a malformed queue entry id when creating an assignment", async () => {
    const { location, cookie, request, table } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, queueEntryId: MALFORMED_ID });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("queueEntryId");
  });

  it("rejects a party size outside the supported range when creating an assignment", async () => {
    const { location, cookie, request, table } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 9999 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("partySize");
  });

  it("requires a table id when the assignment body carries neither form", async () => {
    const { location, cookie, request } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("tableId");
  });
});

describe("floor room renaming", () => {
  it("accepts a rename that matches the current name without a duplicate check", async () => {
    const { location, cookie, request, room } = await setupFloor();

    const response = await request
      .patch(`/api/floor/${location.id}/rooms/${room.id}`)
      .set("Cookie", cookie)
      .send({ name: room.name });

    expect(response.status).toBe(200);
    expect(response.body.room.name).toBe(room.name);
  });
});

describe("seating a party without an explicit party size", () => {
  it("falls back to the guest count on the queue entry", async () => {
    const { location, cookie, request, table } = await setupFloor();
    const entry = await seedQueueEntry(location, { guestCount: 3 });

    const response = await request
      .post(`/api/floor/${location.id}/tables/${table.id}/seat`)
      .set("Cookie", cookie)
      .send({ queueEntryId: entry.id });

    expect(response.status).toBe(201);
    expect(response.body.assignment.partySize).toBe(3);
  });

  it("falls back to the guest count on the reservation", async () => {
    const { location, cookie, request, table } = await setupFloor();
    const reservation = await seedReservation(location, { guestCount: 4 });

    const response = await request
      .post(`/api/floor/${location.id}/tables/${table.id}/seat`)
      .set("Cookie", cookie)
      .send({ reservationId: reservation.id });

    expect(response.status).toBe(201);
    expect(response.body.assignment.partySize).toBe(4);
  });
});

describe("assignment status side effects", () => {
  it("marks the reservation as arrived when an assignment is created already seated", async () => {
    const { location, cookie, request, table } = await setupFloor();
    const reservation = await seedReservation(location, { guestCount: 2 });

    const response = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 2,
        source: "MANUAL",
        reservationId: reservation.id,
        status: "SEATED",
        expectedStartAt: minutesFromNow(5),
      });

    expect(response.status).toBe(201);
    const stored = await db.reservation.findUnique({ where: { id: reservation.id } });
    expect(stored?.status).toBe("ARRIVED");
  });

  it("admits the queue entry when a reserved assignment is updated to seated", async () => {
    const { location, cookie, request, table } = await setupFloor();
    const entry = await seedQueueEntry(location, { guestCount: 2 });

    const created = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 2,
        source: "MANUAL",
        queueEntryId: entry.id,
        status: "RESERVED",
        expectedStartAt: minutesFromNow(5),
      });
    expect(created.status).toBe(201);

    const response = await request
      .patch(`/api/floor/${location.id}/assignments/${created.body.assignment.id}`)
      .set("Cookie", cookie)
      .send({ status: "SEATED" });

    expect(response.status).toBe(200);
    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("ADMITTED");
  });
});

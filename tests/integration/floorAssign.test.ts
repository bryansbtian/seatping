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

async function setupFloor(
  tables: { name: string; capacity: number; minimumPartySize?: number }[] = [
    { name: "T1", capacity: 4 },
    { name: "T2", capacity: 4 },
  ],
) {
  const { business, location } = await seedBusinessWithLocation();
  const cookie = businessCookie(business.id);
  const request = await api();

  const roomResponse = await request
    .post(`/api/floor/${location.id}/rooms`)
    .set("Cookie", cookie)
    .send({ name: "Main Dining Room", width: 1200, height: 800 });
  const room = roomResponse.body.room;

  const created: any[] = [];
  for (const table of tables) {
    const response = await request
      .post(`/api/floor/${location.id}/rooms/${room.id}/tables`)
      .set("Cookie", cookie)
      .send({
        name: table.name,
        capacity: table.capacity,
        minimumPartySize: table.minimumPartySize ?? 1,
      });
    created.push(response.body.table);
  }

  return { business, location, cookie, request, room, tables: created };
}

describe("manual assignment of a queue guest", () => {
  it("seats a waiting guest and records the source as manual", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const entry = await seedQueueEntry(location, { guestCount: 2 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: entry.id });

    expect(response.status).toBe(201);
    expect(response.body.assignment.source).toBe("MANUAL");
    expect(response.body.assignment.status).toBe("SEATED");
    expect(response.body.assignment.partySize).toBe(2);
    expect(response.body.moved).toBe(false);
  });

  it("moves the queue entry to arrived so the queue stays consistent", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const entry = await seedQueueEntry(location, { guestCount: 2, status: "WAITING" });

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: entry.id });

    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("ARRIVED");
    expect(stored?.finalStatus).toBe("arrived");
    expect(stored?.arrivedAt).toBeTruthy();
    expect(stored?.admittedAt).toBeTruthy();
  });

  it("keeps an already admitted guest's admitted time when seating them", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const admittedAt = new Date(Date.now() - 20 * 60 * 1000);
    const entry = await seedQueueEntry(location, {
      guestCount: 2,
      status: "ADMITTED",
      admittedAt,
    });

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: entry.id });

    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("ARRIVED");
    expect(stored?.admittedAt?.toISOString()).toBe(admittedAt.toISOString());
  });

  it("leaves a removed guest's queue status alone", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const entry = await seedQueueEntry(location, { guestCount: 2, status: "REMOVED" });

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: entry.id });

    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("REMOVED");
  });

  it("derives the party size from the queue entry", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const entry = await seedQueueEntry(location, { guestCount: 3 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: entry.id });

    expect(response.body.assignment.partySize).toBe(3);
  });

  it("shows the seated guest on the live floor straight away", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const entry = await seedQueueEntry(location, {
      firstName: "Ada",
      lastName: "Lovelace",
      guestCount: 2,
    });

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: entry.id });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const table = live.body.rooms[0].tables.find((row: any) => row.id === tables[0].id);

    expect(table.status).toBe("OCCUPIED");
    expect(table.currentAssignment.partyName).toBe("Ada Lovelace");
    expect(live.body.waitingParties).toEqual([]);
  });
});

describe("manual assignment of a reservation", () => {
  it("holds a table for a reservation without seating it", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const reservation = await seedReservation(location, { guestCount: 2 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, reservationId: reservation.id, seatNow: false });

    expect(response.status).toBe(201);
    expect(response.body.assignment.status).toBe("RESERVED");

    const stored = await db.reservation.findUnique({ where: { id: reservation.id } });
    expect(stored?.status).toBe("CONFIRMED");
  });

  it("marks the reservation arrived when it is seated", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const reservation = await seedReservation(location, { guestCount: 2 });

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, reservationId: reservation.id, seatNow: true });

    const stored = await db.reservation.findUnique({ where: { id: reservation.id } });
    expect(stored?.status).toBe("ARRIVED");
    expect(stored?.arrivedAt).toBeTruthy();
  });

  it("changes the table of a reservation that already holds one", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const reservation = await seedReservation(location, { guestCount: 2 });

    const first = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, reservationId: reservation.id, seatNow: false });

    const second = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[1].id, reservationId: reservation.id, seatNow: false });

    expect(second.status).toBe(200);
    expect(second.body.moved).toBe(true);
    expect(second.body.assignment.id).toBe(first.body.assignment.id);
    expect(second.body.assignment.tableId).toBe(tables[1].id);

    const all = await db.tableAssignment.findMany({ where: { reservationId: reservation.id } });
    expect(all).toHaveLength(1);
  });

  it("refuses to move a reservation onto an occupied table", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const reservation = await seedReservation(location, { guestCount: 2 });

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, reservationId: reservation.id, seatNow: false });
    await request
      .post(`/api/floor/${location.id}/tables/${tables[1].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[1].id, reservationId: reservation.id });

    expect(response.status).toBe(409);
  });
});

describe("manual assignment validation", () => {
  it("rejects a table that cannot fit the party", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 2 }]);
    const entry = await seedQueueEntry(location, { guestCount: 6 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: entry.id });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("seats");
  });

  it("rejects a party below the table minimum", async () => {
    const { location, cookie, request, tables } = await setupFloor([
      { name: "T1", capacity: 8, minimumPartySize: 4 },
    ]);
    const entry = await seedQueueEntry(location, { guestCount: 2 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: entry.id });

    expect(response.status).toBe(409);
  });

  it("rejects a blocked table", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/block`)
      .set("Cookie", cookie)
      .send({});

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, partySize: 2 });

    expect(response.status).toBe(409);
  });

  it("rejects an assignment that clashes with an existing one", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, partySize: 2 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, partySize: 2 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("already has an assignment");
  });

  it("refuses to reference both a queue entry and a reservation", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const entry = await seedQueueEntry(location);
    const reservation = await seedReservation(location);

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: entry.id, reservationId: reservation.id });

    expect(response.status).toBe(400);
  });

  it("rejects a malformed table id", async () => {
    const { location, cookie, request } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: "nope", partySize: 2 });

    expect(response.status).toBe(400);
  });

  it("rejects a table that belongs to another business", async () => {
    const { location, cookie, request } = await setupFloor();
    const other = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: other.tables[0].id, partySize: 2 });

    expect(response.status).toBe(404);
  });

  it("rejects a queue entry that belongs to another business", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const other = await seedBusinessWithLocation();
    const foreign = await seedQueueEntry(other.location);

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: foreign.id });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("Queue entry not found");
  });

  it("requires a party size when nothing supplies one", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("partySize");
  });

  it("refuses the assignment without a business session", async () => {
    const { location, tables } = await setupFloor();

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assign`)
      .send({ tableId: tables[0].id, partySize: 2 });

    expect(response.status).toBe(401);
  });
});

describe("closing a visit keeps the reservation consistent", () => {
  it("marks an arrived reservation completed when the visit ends", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const reservation = await seedReservation(location, { guestCount: 2 });

    const seated = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, reservationId: reservation.id, seatNow: true });

    await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const stored = await db.reservation.findUnique({ where: { id: reservation.id } });
    expect(stored?.status).toBe("COMPLETED");
    expect(stored?.completedAt).toBeTruthy();
  });

  it("leaves a reservation that never arrived untouched when its hold is closed", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const reservation = await seedReservation(location, { guestCount: 2 });

    const held = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, reservationId: reservation.id, seatNow: false });

    await request
      .post(`/api/floor/${location.id}/assignments/${held.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const stored = await db.reservation.findUnique({ where: { id: reservation.id } });
    expect(stored?.status).toBe("CONFIRMED");
  });
});

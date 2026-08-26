import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry, seedReservation } from "../helpers/seed.js";
import {
  DEFAULT_LOCATION_TIMEZONE,
  getNowWallClockInTimezone,
} from "../../server/lib/operatingHours.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function minutesFromNow(offset: number): string {
  return new Date(Date.now() + offset * 60 * 1000).toISOString();
}

async function setupLiveFloor(
  tables: { name: string; capacity: number; minimumPartySize?: number }[] = [
    { name: "T1", capacity: 4 },
  ],
) {
  const { business, location } = await seedBusinessWithLocation();
  const cookie = businessCookie(business.id);
  const request = await api();

  const roomResponse = await request
    .post(`/api/floor/${location.id}/rooms`)
    .set("Cookie", cookie)
    .send({ name: "Main Dining Room", width: 1200, height: 800 });
  expect(roomResponse.status).toBe(201);
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
    expect(response.status).toBe(201);
    created.push(response.body.table);
  }

  return { business, location, cookie, request, room, tables: created };
}

function tableNamed(body: any, name: string) {
  for (const room of body.rooms) {
    const found = room.tables.find((table: any) => table.name === name);
    if (found) {
      return found;
    }
  }
  return null;
}

describe("live floor read", () => {
  it("returns an empty floor for a location with no rooms", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const response = await (
      await api()
    )
      .get(`/api/floor/${location.id}/live`)
      .set("Cookie", businessCookie(business.id));

    expect(response.status).toBe(200);
    expect(response.body.rooms).toEqual([]);
    expect(response.body.waitingParties).toEqual([]);
    expect(typeof response.body.now).toBe("string");
  });

  it("reports an idle table as available with no party attached", async () => {
    const { location, cookie, request } = await setupLiveFloor();

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(response.status).toBe(200);
    const table = tableNamed(response.body, "T1");
    expect(table.status).toBe("AVAILABLE");
    expect(table.currentAssignment).toBeNull();
    expect(table.upcomingAssignment).toBeNull();
    expect(table.recommendedPartyId).toBeNull();
  });

  it("carries the room geometry and zones the layout editor produced", async () => {
    const { location, cookie, request, room } = await setupLiveFloor();
    const zone = await request
      .post(`/api/floor/${location.id}/rooms/${room.id}/zones`)
      .set("Cookie", cookie)
      .send({ name: "Window Side", x: 100, y: 100, width: 300, height: 200 });
    expect(zone.status).toBe(201);

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(response.body.rooms).toHaveLength(1);
    expect(response.body.rooms[0].width).toBe(1200);
    expect(response.body.rooms[0].height).toBe(800);
    expect(response.body.rooms[0].zones).toHaveLength(1);
    expect(response.body.rooms[0].zones[0].name).toBe("Window Side");
  });

  it("reports a blocked table as blocked", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/block`)
      .set("Cookie", cookie)
      .send({});

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(tableNamed(response.body, "T1").status).toBe("BLOCKED");
  });

  it("reports a seated party as occupied and names them", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const queueEntry = await seedQueueEntry(location, {
      firstName: "Ada",
      lastName: "Lovelace",
      guestCount: 3,
    });

    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ queueEntryId: queueEntry.id });
    expect(seated.status).toBe(201);

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const table = tableNamed(response.body, "T1");

    expect(table.status).toBe("OCCUPIED");
    expect(table.currentAssignment.partyName).toBe("Ada Lovelace");
    expect(table.currentAssignment.partySize).toBe(3);
    expect(table.currentAssignment.seatedAt).toBeTruthy();
    expect(table.currentAssignment.seatedMinutes).toBe(0);
  });

  it("falls back to the reservation display name when the name halves are blank", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const reservation = await seedReservation(location, {
      firstName: " ",
      lastName: " ",
      name: "Walk In Booking",
      guestCount: 2,
    });

    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ reservationId: reservation.id });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(tableNamed(response.body, "T1").currentAssignment.partyName).toBe("Walk In Booking");
  });

  it("reports a table with an imminent reservation as reserved", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const reservation = await seedReservation(location, {
      firstName: "Grace",
      lastName: "Hopper",
      guestCount: 2,
    });

    const created = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: tables[0].id,
        partySize: 2,
        source: "MANUAL",
        reservationId: reservation.id,
        expectedStartAt: minutesFromNow(30),
      });
    expect(created.status).toBe(201);

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const table = tableNamed(response.body, "T1");

    expect(table.status).toBe("RESERVED");
    expect(table.upcomingAssignment.partyName).toBe("Grace Hopper");
    expect(table.upcomingAssignment.reservationId).toBe(reservation.id);
  });

  it("stays available for a reservation beyond the lookahead but still shows it", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: tables[0].id,
        partySize: 2,
        source: "MANUAL",
        expectedStartAt: minutesFromNow(300),
      });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const table = tableNamed(response.body, "T1");

    expect(table.status).toBe("AVAILABLE");
    expect(table.upcomingAssignment).not.toBeNull();
    expect(table.upcomingAssignment.partySize).toBe(2);
  });

  it("lists waiting parties in join order with their wait time", async () => {
    const { location, cookie, request } = await setupLiveFloor();
    await seedQueueEntry(location, {
      firstName: "First",
      lastName: "Waiter",
      guestCount: 2,
      joinedAt: new Date(Date.now() - 40 * 60 * 1000),
    });
    await seedQueueEntry(location, {
      firstName: "Second",
      lastName: "Waiter",
      guestCount: 2,
      joinedAt: new Date(Date.now() - 10 * 60 * 1000),
    });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(response.body.waitingParties).toHaveLength(2);
    expect(response.body.waitingParties[0].name).toBe("First Waiter");
    expect(response.body.waitingParties[0].waitingMinutes).toBeGreaterThanOrEqual(39);
    expect(response.body.waitingParties[1].name).toBe("Second Waiter");
  });

  it("leaves admitted and removed queue entries out of the waiting list", async () => {
    const { location, cookie, request } = await setupLiveFloor();
    await seedQueueEntry(location, { status: "ADMITTED" });
    await seedQueueEntry(location, { status: "REMOVED" });
    await seedQueueEntry(location, { firstName: "Still", lastName: "Waiting" });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(response.body.waitingParties).toHaveLength(1);
    expect(response.body.waitingParties[0].name).toBe("Still Waiting");
  });

  it("drops a waiting party from the list once they are seated", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const queueEntry = await seedQueueEntry(location, { guestCount: 2 });

    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ queueEntryId: queueEntry.id });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(response.body.waitingParties).toEqual([]);
  });

  it("recommends the longest waiting party that fits an available table", async () => {
    const { location, cookie, request } = await setupLiveFloor([
      { name: "T1", capacity: 2 },
      { name: "T2", capacity: 6, minimumPartySize: 3 },
    ]);

    const pair = await seedQueueEntry(location, {
      guestCount: 2,
      joinedAt: new Date(Date.now() - 30 * 60 * 1000),
    });
    const group = await seedQueueEntry(location, {
      guestCount: 4,
      joinedAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(tableNamed(response.body, "T1").recommendedPartyId).toBe(pair.id);
    expect(tableNamed(response.body, "T2").recommendedPartyId).toBe(group.id);
  });

  it("never recommends a party to an occupied or blocked table", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor([
      { name: "T1", capacity: 4 },
      { name: "T2", capacity: 4 },
    ]);
    await seedQueueEntry(location, { guestCount: 2 });

    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/block`)
      .set("Cookie", cookie)
      .send({});
    await request
      .post(`/api/floor/${location.id}/tables/${tables[1].id}/cleaning`)
      .set("Cookie", cookie)
      .send({});

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(tableNamed(response.body, "T1").recommendedPartyId).toBeNull();
    expect(tableNamed(response.body, "T2").recommendedPartyId).toBeNull();
  });
});

describe("upcoming reservations", () => {
  function todayAt(hour: number, minute = 0): string {
    const dayKey = getNowWallClockInTimezone(DEFAULT_LOCATION_TIMEZONE).slice(0, 10);
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    return `${dayKey}T${hh}:${mm}`;
  }

  it("returns an empty list when nothing is booked", async () => {
    const { location, cookie, request } = await setupLiveFloor();
    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(response.body.upcomingReservations).toEqual([]);
  });

  it("lists a later booking today with its time, name, and party size", async () => {
    const { location, cookie, request } = await setupLiveFloor();
    await seedReservation(location, {
      firstName: "Grace",
      lastName: "Hopper",
      guestCount: 4,
      reservationDateTime: todayAt(23, 30),
    });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(response.body.upcomingReservations).toHaveLength(1);
    const row = response.body.upcomingReservations[0];
    expect(row.name).toBe("Grace Hopper");
    expect(row.partySize).toBe(4);
    expect(row.time).toBe("23:30");
    expect(row.timeLabel).toBe("11:30 PM");
    expect(row.tableName).toBeNull();
  });

  it("sorts the list by booking time", async () => {
    const { location, cookie, request } = await setupLiveFloor();
    await seedReservation(location, {
      firstName: "Later",
      lastName: "Guest",
      reservationDateTime: todayAt(23, 50),
    });
    await seedReservation(location, {
      firstName: "Earlier",
      lastName: "Guest",
      reservationDateTime: todayAt(23, 40),
    });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(response.body.upcomingReservations.map((row: any) => row.name)).toEqual([
      "Earlier Guest",
      "Later Guest",
    ]);
  });

  it("leaves cancelled and no show bookings out of the list", async () => {
    const { location, cookie, request } = await setupLiveFloor();
    await seedReservation(location, {
      status: "CANCELLED",
      reservationDateTime: todayAt(23, 30),
    });
    await seedReservation(location, {
      status: "NO_SHOW",
      reservationDateTime: todayAt(23, 30),
    });
    await seedReservation(location, {
      firstName: "Still",
      lastName: "Booked",
      reservationDateTime: todayAt(23, 30),
    });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(response.body.upcomingReservations).toHaveLength(1);
    expect(response.body.upcomingReservations[0].name).toBe("Still Booked");
  });

  it("leaves bookings for another day out of the list", async () => {
    const { location, cookie, request } = await setupLiveFloor();
    await seedReservation(location, { reservationDateTime: "2027-01-01T19:00" });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(response.body.upcomingReservations).toEqual([]);
  });

  it("marks a booking that is already sitting at a table", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const reservation = await seedReservation(location, {
      firstName: "Seated",
      lastName: "Guest",
      guestCount: 2,
      reservationDateTime: todayAt(23, 30),
    });

    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ reservationId: reservation.id });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(response.body.upcomingReservations).toHaveLength(1);
    expect(response.body.upcomingReservations[0].tableName).toBe("T1");
  });

  it("keeps another business bookings out of the list", async () => {
    const { location, cookie, request } = await setupLiveFloor();
    const other = await seedBusinessWithLocation();
    await seedReservation(other.location, { reservationDateTime: todayAt(23, 30) });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(response.body.upcomingReservations).toEqual([]);
  });

  it("keeps contact details out of the reservation list", async () => {
    const { location, cookie, request } = await setupLiveFloor();
    await seedReservation(location, {
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@test.invalid",
      phone: "+15559876543",
      reservationDateTime: todayAt(23, 30),
    });

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const serialized = JSON.stringify(response.body.upcomingReservations);

    expect(serialized).toContain("Grace Hopper");
    expect(serialized).not.toContain("grace@test.invalid");
    expect(serialized).not.toContain("+15559876543");
  });
});

describe("seat party", () => {
  it("derives the party size from the queue entry when it is omitted", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const queueEntry = await seedQueueEntry(location, { guestCount: 3 });

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ queueEntryId: queueEntry.id });

    expect(response.status).toBe(201);
    expect(response.body.assignment.partySize).toBe(3);
    expect(response.body.assignment.status).toBe("SEATED");
    expect(response.body.assignment.source).toBe("MANUAL");
  });

  it("derives the party size from the reservation when it is omitted", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const reservation = await seedReservation(location, { guestCount: 4 });

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ reservationId: reservation.id });

    expect(response.status).toBe(201);
    expect(response.body.assignment.partySize).toBe(4);
  });

  it("seats a walk in with an explicit party size", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    expect(response.status).toBe(201);
    expect(response.body.assignment.queueEntryId).toBeNull();
    expect(response.body.assignment.reservationId).toBeNull();
  });

  it("clears a cleaning flag when the table is seated", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/cleaning`)
      .set("Cookie", cookie)
      .send({});
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const stored = await db.diningTable.findUnique({ where: { id: tables[0].id } });
    expect(stored?.cleaningSince).toBeNull();
  });

  it("rejects a party that does not fit the table", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor([
      { name: "T1", capacity: 2 },
    ]);

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 6 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("seats");
  });

  it("rejects seating at a blocked table", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/block`)
      .set("Cookie", cookie)
      .send({});

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    expect(response.status).toBe(409);
  });

  it("rejects a second party while the table is still occupied", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    expect(response.status).toBe(409);
  });

  it("requires a party size when there is nothing to derive it from", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("partySize");
  });

  it("refuses to reference both a queue entry and a reservation", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const queueEntry = await seedQueueEntry(location);
    const reservation = await seedReservation(location);

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ queueEntryId: queueEntry.id, reservationId: reservation.id, partySize: 2 });

    expect(response.status).toBe(400);
  });

  it("rejects a malformed table id", async () => {
    const { location, cookie, request } = await setupLiveFloor();

    const response = await request
      .post(`/api/floor/${location.id}/tables/not-an-id/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    expect(response.status).toBe(404);
  });

  it("rejects a malformed queue entry id", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ queueEntryId: "nope", partySize: 2 });

    expect(response.status).toBe(400);
  });

  it("rejects an out of range party size", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 0 });

    expect(response.status).toBe(400);
  });

  it("rejects an unusable turn length", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    const response = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2, turnMinutes: 0 });

    expect(response.status).toBe(400);
  });
});

describe("complete visit", () => {
  it("frees the table and clears the current party", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const completed = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});
    expect(completed.status).toBe(200);
    expect(completed.body.assignment.status).toBe("COMPLETED");

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const table = tableNamed(response.body, "T1");
    expect(table.status).toBe("AVAILABLE");
    expect(table.currentAssignment).toBeNull();
  });

  it("refuses to complete the same visit twice", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});
    const again = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    expect(again.status).toBe(409);
  });
});

describe("move party", () => {
  it("moves a seated party to another table", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor([
      { name: "T1", capacity: 4 },
      { name: "T2", capacity: 4 },
    ]);
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const moved = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
      .set("Cookie", cookie)
      .send({ tableId: tables[1].id });

    expect(moved.status).toBe(200);
    expect(moved.body.assignment.tableId).toBe(tables[1].id);

    const response = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(tableNamed(response.body, "T1").status).toBe("AVAILABLE");
    expect(tableNamed(response.body, "T2").status).toBe("OCCUPIED");
  });

  it("clears a cleaning flag on the destination table", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor([
      { name: "T1", capacity: 4 },
      { name: "T2", capacity: 4 },
    ]);
    await request
      .post(`/api/floor/${location.id}/tables/${tables[1].id}/cleaning`)
      .set("Cookie", cookie)
      .send({});
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
      .set("Cookie", cookie)
      .send({ tableId: tables[1].id });

    const stored = await db.diningTable.findUnique({ where: { id: tables[1].id } });
    expect(stored?.cleaningSince).toBeNull();
  });

  it("refuses to move onto an occupied table", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor([
      { name: "T1", capacity: 4 },
      { name: "T2", capacity: 4 },
    ]);
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });
    await request
      .post(`/api/floor/${location.id}/tables/${tables[1].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const moved = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
      .set("Cookie", cookie)
      .send({ tableId: tables[1].id });

    expect(moved.status).toBe(409);
    expect(moved.body.error).toContain("already has an assignment");
  });

  it("refuses to move onto a blocked table", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor([
      { name: "T1", capacity: 4 },
      { name: "T2", capacity: 4 },
    ]);
    await request
      .post(`/api/floor/${location.id}/tables/${tables[1].id}/block`)
      .set("Cookie", cookie)
      .send({});
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const moved = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
      .set("Cookie", cookie)
      .send({ tableId: tables[1].id });

    expect(moved.status).toBe(409);
  });

  it("refuses to move onto a table that is too small", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor([
      { name: "T1", capacity: 6 },
      { name: "T2", capacity: 2 },
    ]);
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 5 });

    const moved = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
      .set("Cookie", cookie)
      .send({ tableId: tables[1].id });

    expect(moved.status).toBe(409);
    expect(moved.body.error).toContain("seats");
  });

  it("refuses to move a party onto the table it is already at", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const moved = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id });

    expect(moved.status).toBe(409);
    expect(moved.body.error).toContain("already at that table");
  });

  it("refuses to move a completed visit", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor([
      { name: "T1", capacity: 4 },
      { name: "T2", capacity: 4 },
    ]);
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });
    await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const moved = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
      .set("Cookie", cookie)
      .send({ tableId: tables[1].id });

    expect(moved.status).toBe(409);
    expect(moved.body.error).toContain("already closed");
  });

  it("rejects a malformed assignment id", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    const moved = await request
      .post(`/api/floor/${location.id}/assignments/not-an-id/move`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id });

    expect(moved.status).toBe(404);
  });

  it("rejects a missing destination table id", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const moved = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
      .set("Cookie", cookie)
      .send({});

    expect(moved.status).toBe(400);
  });

  it("rejects a destination table that does not exist", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const moved = await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/move`)
      .set("Cookie", cookie)
      .send({ tableId: "0".repeat(24) });

    expect(moved.status).toBe(404);
  });
});

describe("cleaning state", () => {
  it("marks a table for cleaning and back to available", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    const cleaning = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/cleaning`)
      .set("Cookie", cookie)
      .send({});
    expect(cleaning.status).toBe(200);

    let live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(tableNamed(live.body, "T1").status).toBe("CLEANING");
    expect(tableNamed(live.body, "T1").cleaningSince).toBeTruthy();

    const available = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/available`)
      .set("Cookie", cookie)
      .send({});
    expect(available.status).toBe(200);

    live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(tableNamed(live.body, "T1").status).toBe("AVAILABLE");
    expect(tableNamed(live.body, "T1").cleaningSince).toBeNull();
  });

  it("refuses to mark an occupied table for cleaning", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const cleaning = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/cleaning`)
      .set("Cookie", cookie)
      .send({});

    expect(cleaning.status).toBe(409);
    expect(cleaning.body.error).toContain("Complete the current visit");
  });

  it("clears cleaning even when the table was never marked", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();

    const available = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/available`)
      .set("Cookie", cookie)
      .send({});

    expect(available.status).toBe(200);
  });

  it("rejects a malformed table id on both cleaning routes", async () => {
    const { location, cookie, request } = await setupLiveFloor();

    const cleaning = await request
      .post(`/api/floor/${location.id}/tables/not-an-id/cleaning`)
      .set("Cookie", cookie)
      .send({});
    const available = await request
      .post(`/api/floor/${location.id}/tables/not-an-id/available`)
      .set("Cookie", cookie)
      .send({});

    expect(cleaning.status).toBe(404);
    expect(available.status).toBe(404);
  });
});

describe("seating a reserved party", () => {
  it("turns the reservation into an occupied table without creating a second assignment", async () => {
    const { location, cookie, request, tables } = await setupLiveFloor();
    const reservation = await seedReservation(location, { guestCount: 2 });

    const created = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: tables[0].id,
        partySize: 2,
        source: "MANUAL",
        reservationId: reservation.id,
        expectedStartAt: minutesFromNow(10),
      });

    const seated = await request
      .patch(`/api/floor/${location.id}/assignments/${created.body.assignment.id}`)
      .set("Cookie", cookie)
      .send({ status: "SEATED" });
    expect(seated.status).toBe(200);

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const table = tableNamed(live.body, "T1");

    expect(table.status).toBe("OCCUPIED");
    expect(table.currentAssignment.id).toBe(created.body.assignment.id);
    expect(table.upcomingAssignment).toBeNull();

    const stored = await db.tableAssignment.findMany({ where: { tableId: tables[0].id } });
    expect(stored).toHaveLength(1);
  });
});

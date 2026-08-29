import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import {
  seedBusinessWithLocation,
  seedQueueEntry,
  seedReservation,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function at(hour: number, minute = 0): string {
  return new Date(Date.UTC(2026, 7, 30, hour, minute, 0)).toISOString();
}

async function setupFloor(tableOverrides: Record<string, unknown> = {}) {
  const { business, location } = await seedBusinessWithLocation();
  const cookie = businessCookie(business.id);
  const request = await api();

  const planResponse = await request
    .post(`/api/floor/${location.id}/rooms`)
    .set("Cookie", cookie)
    .send({ name: "Main Floor", width: 1400, height: 900 });
  expect(planResponse.status).toBe(201);

  const room = planResponse.body.room;

  const tableResponse = await request
    .post(`/api/floor/${location.id}/rooms/${room.id}/tables`)
    .set("Cookie", cookie)
    .send({ name: "Table 12", capacity: 4, minimumPartySize: 2, ...tableOverrides });
  expect(tableResponse.status).toBe(201);

  return { business, location, cookie, room, table: tableResponse.body.table };
}

describe("room lifecycle", () => {
  it("reports no rooms before one is created", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const response = await (
      await api()
    )
      .get(`/api/floor/${location.id}`)
      .set("Cookie", businessCookie(business.id));

    expect(response.status).toBe(200);
    expect(response.body.rooms).toEqual([]);
  });

  it("creates, reads back, and updates a room", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    const request = await api();

    const created = await request
      .post(`/api/floor/${location.id}/rooms`)
      .set("Cookie", cookie)
      .send({ name: "Ground Floor", width: 1400, height: 900 });
    expect(created.status).toBe(201);
    expect(created.body.room.name).toBe("Ground Floor");
    expect(created.body.room.width).toBe(1400);

    const fetched = await request.get(`/api/floor/${location.id}`).set("Cookie", cookie);
    expect(fetched.status).toBe(200);
    expect(fetched.body.rooms).toHaveLength(1);
    expect(fetched.body.rooms[0].id).toBe(created.body.room.id);
    expect(fetched.body.rooms[0].tables).toEqual([]);
    expect(fetched.body.rooms[0].zones).toEqual([]);

    const updated = await request
      .patch(`/api/floor/${location.id}/rooms/${created.body.room.id}`)
      .set("Cookie", cookie)
      .send({ name: "Upstairs", height: 1000 });
    expect(updated.status).toBe(200);
    expect(updated.body.room.name).toBe("Upstairs");
    expect(updated.body.room.height).toBe(1000);
    expect(updated.body.room.width).toBe(1400);
  });

  it("keeps several rooms for one location and orders them", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    const request = await api();

    const main = await request
      .post(`/api/floor/${location.id}/rooms`)
      .set("Cookie", cookie)
      .send({ name: "Main Dining Room" });
    const patio = await request
      .post(`/api/floor/${location.id}/rooms`)
      .set("Cookie", cookie)
      .send({ name: "Patio" });

    expect(main.status).toBe(201);
    expect(patio.status).toBe(201);
    expect(main.body.room.sortOrder).toBe(0);
    expect(patio.body.room.sortOrder).toBe(1);

    const fetched = await request.get(`/api/floor/${location.id}`).set("Cookie", cookie);
    expect(fetched.body.rooms.map((room: any) => room.name)).toEqual(["Main Dining Room", "Patio"]);
  });

  it("refuses two rooms with the same name in one location", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    const request = await api();

    await request.post(`/api/floor/${location.id}/rooms`).set("Cookie", cookie).send({});
    const second = await request
      .post(`/api/floor/${location.id}/rooms`)
      .set("Cookie", cookie)
      .send({});

    expect(second.status).toBe(409);
    expect(await db.floorPlan.count({ where: { locationId: location.id } })).toBe(1);
  });

  it("deletes a room together with its tables and zones", async () => {
    const { location, cookie, room, table } = await setupFloor();
    const request = await api();

    const zone = await request
      .post(`/api/floor/${location.id}/rooms/${room.id}/zones`)
      .set("Cookie", cookie)
      .send({ name: "Patio zone" });
    expect(zone.status).toBe(201);

    const deleted = await request
      .delete(`/api/floor/${location.id}/rooms/${room.id}`)
      .set("Cookie", cookie);
    expect(deleted.status).toBe(200);

    expect(await db.floorPlan.count({ where: { id: room.id } })).toBe(0);
    expect(await db.diningTable.count({ where: { id: table.id } })).toBe(0);
    expect(await db.floorZone.count({ where: { floorPlanId: room.id } })).toBe(0);
  });

  it("refuses to delete a room whose table is still assigned", async () => {
    const { location, cookie, room, table } = await setupFloor();
    const request = await api();

    await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 4, source: "MANUAL", expectedStartAt: at(19) });

    const deleted = await request
      .delete(`/api/floor/${location.id}/rooms/${room.id}`)
      .set("Cookie", cookie);

    expect(deleted.status).toBe(409);
    expect(await db.floorPlan.count({ where: { id: room.id } })).toBe(1);
  });

  it("keeps each location layout independent", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    const request = await api();

    const secondLocation = await db.location.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        displayName: `Second ${uniqueSuffix()}`,
        address: "2 Test Street",
      },
    });

    const first = await request
      .post(`/api/floor/${location.id}/rooms`)
      .set("Cookie", cookie)
      .send({ name: "PIK" });
    await request
      .post(`/api/floor/${secondLocation.id}/rooms`)
      .set("Cookie", cookie)
      .send({ name: "SCBD" });

    await request
      .post(`/api/floor/${location.id}/rooms/${first.body.room.id}/tables`)
      .set("Cookie", cookie)
      .send({ name: "Table 1", capacity: 2 });

    const firstRooms = await request.get(`/api/floor/${location.id}`).set("Cookie", cookie);
    const secondRooms = await request.get(`/api/floor/${secondLocation.id}`).set("Cookie", cookie);

    expect(firstRooms.body.rooms[0].name).toBe("PIK");
    expect(firstRooms.body.rooms[0].tables).toHaveLength(1);
    expect(secondRooms.body.rooms[0].name).toBe("SCBD");
    expect(secondRooms.body.rooms[0].tables).toHaveLength(0);
  });

  it("rejects floor dimensions outside the supported range", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/rooms`)
      .set("Cookie", businessCookie(business.id))
      .send({ width: 10 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("width");
  });
});

describe("table management", () => {
  it("persists every configurable table field", async () => {
    const { location, cookie, room } = await setupFloor({
      name: "Patio 3",
      capacity: 6,
      minimumPartySize: 3,
      shape: "round",
      x: 240,
      y: 130,
      width: 150,
      height: 150,
      rotation: 450,
    });

    const fetched = await (await api()).get(`/api/floor/${location.id}`).set("Cookie", cookie);
    const table = fetched.body.rooms[0].tables[0];

    expect(table.name).toBe("Patio 3");
    expect(table.capacity).toBe(6);
    expect(table.minimumPartySize).toBe(3);
    expect(table.shape).toBe("ROUND");
    expect(table.x).toBe(240);
    expect(table.y).toBe(130);
    expect(table.rotation).toBe(90);
    expect(table.isBlocked).toBe(false);
  });

  it("moves, resizes, and renames a table", async () => {
    const { location, cookie, table } = await setupFloor();

    const response = await (
      await api()
    )
      .patch(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({ name: "Table 12A", x: 500, y: 320, width: 200 });

    expect(response.status).toBe(200);
    expect(response.body.table.name).toBe("Table 12A");
    expect(response.body.table.x).toBe(500);
    expect(response.body.table.width).toBe(200);
    expect(response.body.table.capacity).toBe(4);
  });

  it("refuses duplicate table names within a location but allows them across locations", async () => {
    const { business, location, cookie, room } = await setupFloor();
    const request = await api();

    const duplicate = await request
      .post(`/api/floor/${location.id}/rooms/${room.id}/tables`)
      .set("Cookie", cookie)
      .send({ name: "Table 12", capacity: 2 });
    expect(duplicate.status).toBe(409);

    const secondLocation = await db.location.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        displayName: `Second ${uniqueSuffix()}`,
        address: "2 Test Street",
      },
    });
    const secondRoomResponse = await request
      .post(`/api/floor/${secondLocation.id}/rooms`)
      .set("Cookie", cookie)
      .send({});
    const secondRoom = secondRoomResponse.body.room;

    const elsewhere = await request
      .post(`/api/floor/${secondLocation.id}/rooms/${secondRoom.id}/tables`)
      .set("Cookie", cookie)
      .send({ name: "Table 12", capacity: 2 });
    expect(elsewhere.status).toBe(201);
  });

  it("rejects a minimum party size above capacity", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    const request = await api();
    const roomResponse = await request
      .post(`/api/floor/${location.id}/rooms`)
      .set("Cookie", cookie)
      .send({});
    const room = roomResponse.body.room;

    const response = await request
      .post(`/api/floor/${location.id}/rooms/${room.id}/tables`)
      .set("Cookie", cookie)
      .send({ name: "Table 1", capacity: 2, minimumPartySize: 4 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("minimumPartySize");
  });

  it("requires a room before tables can be added", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/rooms/0123456789abcdef01234567/tables`)
      .set("Cookie", businessCookie(business.id))
      .send({ name: "Table 1", capacity: 2 });

    expect(response.status).toBe(404);
  });

  it("blocks and unblocks a table", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    const blocked = await request
      .post(`/api/floor/${location.id}/tables/${table.id}/block`)
      .set("Cookie", cookie)
      .send({});
    expect(blocked.status).toBe(200);
    expect(blocked.body.table.isBlocked).toBe(true);

    const unblocked = await request
      .post(`/api/floor/${location.id}/tables/${table.id}/unblock`)
      .set("Cookie", cookie)
      .send({});
    expect(unblocked.status).toBe(200);
    expect(unblocked.body.table.isBlocked).toBe(false);
  });

  it("deletes a table and cascades its historical assignments", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    const assignment = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 4, source: "MANUAL", expectedStartAt: at(19) });
    expect(assignment.status).toBe(201);

    await request
      .post(`/api/floor/${location.id}/assignments/${assignment.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const deleted = await request
      .delete(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie);
    expect(deleted.status).toBe(200);

    expect(await db.diningTable.count({ where: { id: table.id } })).toBe(0);
    expect(await db.tableAssignment.count({ where: { tableId: table.id } })).toBe(0);
  });

  it("refuses to delete a table that still has an active assignment", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 4, source: "MANUAL", expectedStartAt: at(19) });

    const deleted = await request
      .delete(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie);

    expect(deleted.status).toBe(409);
    expect(await db.diningTable.count({ where: { id: table.id } })).toBe(1);
  });
});

describe("table assignments", () => {
  it("creates a manual assignment and derives the occupancy window from the turn time", async () => {
    const { location, cookie, table } = await setupFloor();

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(19),
        turnMinutes: 60,
      });

    expect(response.status).toBe(201);
    expect(response.body.assignment.source).toBe("MANUAL");
    expect(response.body.assignment.status).toBe("RESERVED");
    expect(response.body.assignment.expectedEndAt).toBe(at(20));
    expect(response.body.assignment.seatedAt).toBeNull();
  });

  it("records a Smart assignment against a reservation", async () => {
    const { location, cookie, table, business } = await setupFloor();
    const reservation = await seedReservation({
      id: location.id,
      businessId: business.id,
      businessUsername: business.username,
    });

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "SMART",
        reservationId: reservation.id,
        expectedStartAt: at(19),
      });

    expect(response.status).toBe(201);
    expect(response.body.assignment.source).toBe("SMART");
    expect(response.body.assignment.reservationId).toBe(reservation.id);
    expect(response.body.assignment.queueEntryId).toBeNull();
  });

  it("records an assignment against a queue entry and stamps seating time", async () => {
    const { location, cookie, table } = await setupFloor();
    const queueEntry = await seedQueueEntry({ id: location.id, businessId: location.businessId });

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "SMART",
        status: "SEATED",
        queueEntryId: queueEntry.id,
        expectedStartAt: at(19),
      });

    expect(response.status).toBe(201);
    expect(response.body.assignment.queueEntryId).toBe(queueEntry.id);
    expect(response.body.assignment.status).toBe("SEATED");
    expect(response.body.assignment.seatedAt).not.toBeNull();
  });

  it("refuses an assignment that references both a queue entry and a reservation", async () => {
    const { location, cookie, table, business } = await setupFloor();
    const queueEntry = await seedQueueEntry({ id: location.id, businessId: location.businessId });
    const reservation = await seedReservation({
      id: location.id,
      businessId: business.id,
      businessUsername: business.username,
    });

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        queueEntryId: queueEntry.id,
        reservationId: reservation.id,
        expectedStartAt: at(19),
      });

    expect(response.status).toBe(400);
  });

  it("refuses an overlapping assignment but allows a back to back turn", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    const first = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(19),
        expectedEndAt: at(21),
      });
    expect(first.status).toBe(201);

    const overlapping = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(20),
        expectedEndAt: at(22),
      });
    expect(overlapping.status).toBe(409);

    const backToBack = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(21),
        expectedEndAt: at(23),
      });
    expect(backToBack.status).toBe(201);

    expect(await db.tableAssignment.count({ where: { tableId: table.id } })).toBe(2);
  });

  it("refuses an assignment on a blocked table", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    await request
      .post(`/api/floor/${location.id}/tables/${table.id}/block`)
      .set("Cookie", cookie)
      .send({});

    const response = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 4, source: "SMART", expectedStartAt: at(19) });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("blocked");
  });

  it("refuses a party that does not fit the table", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    const tooBig = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 6, source: "SMART", expectedStartAt: at(19) });
    expect(tooBig.status).toBe(409);

    const tooSmall = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 1, source: "SMART", expectedStartAt: at(19) });
    expect(tooSmall.status).toBe(409);
  });

  it("moves an assignment through seating and completion", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    const created = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 4, source: "SMART", expectedStartAt: at(19) });
    const assignmentId = created.body.assignment.id;

    const seated = await request
      .patch(`/api/floor/${location.id}/assignments/${assignmentId}`)
      .set("Cookie", cookie)
      .send({ status: "SEATED" });
    expect(seated.status).toBe(200);
    expect(seated.body.assignment.seatedAt).not.toBeNull();

    const completed = await request
      .post(`/api/floor/${location.id}/assignments/${assignmentId}/complete`)
      .set("Cookie", cookie)
      .send({});
    expect(completed.status).toBe(200);
    expect(completed.body.assignment.status).toBe("COMPLETED");
    expect(completed.body.assignment.completedAt).not.toBeNull();

    const again = await request
      .post(`/api/floor/${location.id}/assignments/${assignmentId}/complete`)
      .set("Cookie", cookie)
      .send({});
    expect(again.status).toBe(409);
  });

  it("frees the table for a new assignment once the previous one is completed", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    const first = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(19),
        expectedEndAt: at(21),
      });

    await request
      .post(`/api/floor/${location.id}/assignments/${first.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const second = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(19, 30),
        expectedEndAt: at(21),
      });

    expect(second.status).toBe(201);
  });

  it("refuses to edit a closed assignment", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    const created = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 4, source: "SMART", expectedStartAt: at(19) });

    await request
      .post(`/api/floor/${location.id}/assignments/${created.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const response = await request
      .patch(`/api/floor/${location.id}/assignments/${created.body.assignment.id}`)
      .set("Cookie", cookie)
      .send({ partySize: 3 });

    expect(response.status).toBe(409);
  });

  it("refuses to move an assignment onto an occupied window", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(19),
        expectedEndAt: at(21),
      });

    const later = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(21),
        expectedEndAt: at(23),
      });

    const response = await request
      .patch(`/api/floor/${location.id}/assignments/${later.body.assignment.id}`)
      .set("Cookie", cookie)
      .send({ expectedStartAt: at(20) });

    expect(response.status).toBe(409);
  });

  it("filters assignments by table, status, and time window", async () => {
    const { location, cookie, table } = await setupFloor();
    const request = await api();

    const early = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(12),
        expectedEndAt: at(13),
      });
    await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(19),
        expectedEndAt: at(20),
      });

    await request
      .post(`/api/floor/${location.id}/assignments/${early.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const all = await request.get(`/api/floor/${location.id}/assignments`).set("Cookie", cookie);
    expect(all.body.assignments).toHaveLength(2);

    const active = await request
      .get(`/api/floor/${location.id}/assignments?status=ACTIVE`)
      .set("Cookie", cookie);
    expect(active.body.assignments).toHaveLength(1);
    expect(active.body.assignments[0].expectedStartAt).toBe(at(19));

    const evening = await request
      .get(`/api/floor/${location.id}/assignments?from=${at(18)}&to=${at(23)}`)
      .set("Cookie", cookie);
    expect(evening.body.assignments).toHaveLength(1);

    const byTable = await request
      .get(`/api/floor/${location.id}/assignments?tableId=${table.id}`)
      .set("Cookie", cookie);
    expect(byTable.body.assignments).toHaveLength(2);
  });

  it("rejects a reference that belongs to another location", async () => {
    const { location, cookie, table } = await setupFloor();
    const other = await seedBusinessWithLocation();
    const foreignReservation = await seedReservation(other.location);

    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "SMART",
        reservationId: foreignReservation.id,
        expectedStartAt: at(19),
      });

    expect(response.status).toBe(404);
    expect(await db.tableAssignment.count()).toBe(0);
  });
});

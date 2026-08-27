import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { seedBusinessWithLocation } from "../helpers/seed.js";
import { businessCookie } from "../helpers/auth.js";
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

function tomorrow(): string {
  const today = getNowWallClockInTimezone(DEFAULT_LOCATION_TIMEZONE).slice(0, 10);
  const next = new Date(`${today}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

const DATE = tomorrow();

async function setupRestaurant(capacities: number[] = [4], settings: Record<string, unknown> = {}) {
  const { business, location } = await seedBusinessWithLocation({
    reservationSettings: {
      reservationStartTime: "09:00",
      reservationEndTime: "22:00",
      maxPartySize: 12,
      maxReservedGuestsPerHour: 0,
      bookingWindowDays: 30,
      minNoticeMinutes: 0,
      defaultReservationDurationMinutes: 90,
      reservationHoldMinutes: 15,
      confirmationMode: "auto",
      cancellationPolicy: "",
      ...settings,
    },
  });

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
  for (let index = 0; index < capacities.length; index += 1) {
    tables.push(
      await db.diningTable.create({
        data: {
          floorPlanId: room.id,
          businessId: business.id,
          locationId: location.id,
          name: `T${index + 1}`,
          capacity: capacities[index],
          minimumPartySize: 1,
        },
      }),
    );
  }

  return { business, location, room, tables };
}

let emailCounter = 0;

async function book(
  business: { username: string },
  location: { id: string },
  body: Record<string, unknown>,
) {
  emailCounter += 1;
  const request = await api();
  return request.post(`/api/reservations/${business.username}/${location.id}`).send({
    firstName: "Ada",
    lastName: `Guest${emailCounter}`,
    email: `guest${emailCounter}-${Date.now()}@example.com`,
    date: DATE,
    time: "19:00",
    partySize: 2,
    ...body,
  });
}

async function assignmentsFor(reservationId: string) {
  return db.tableAssignment.findMany({ where: { reservationId } });
}

describe("assigning a table when a reservation is booked", () => {
  it("gives the booking a table and records it as a smart assignment", async () => {
    const { business, location, tables } = await setupRestaurant([4]);

    const response = await book(business, location, {});

    expect(response.status).toBe(200);
    const assignments = await assignmentsFor(response.body.reservation.id);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].tableId).toBe(tables[0].id);
    expect(assignments[0].source).toBe("SMART");
    expect(assignments[0].status).toBe("RESERVED");
  });

  it("reserves the table for the configured duration", async () => {
    const { business, location } = await setupRestaurant([4], {
      defaultReservationDurationMinutes: 120,
    });

    const response = await book(business, location, {});

    const [assignment] = await assignmentsFor(response.body.reservation.id);
    const minutes =
      (assignment.expectedEndAt.getTime() - assignment.expectedStartAt.getTime()) / 60000;
    expect(minutes).toBe(120);
  });

  it("picks the tightest table that fits the party", async () => {
    const { business, location, tables } = await setupRestaurant([10, 4]);

    const response = await book(business, location, { partySize: 4 });

    const [assignment] = await assignmentsFor(response.body.reservation.id);
    expect(assignment.tableId).toBe(tables[1].id);
  });

  it("seats a second booking at a different table", async () => {
    const { business, location } = await setupRestaurant([4, 4]);

    const first = await book(business, location, {});
    const second = await book(business, location, {});

    expect(second.status).toBe(200);
    const [one] = await assignmentsFor(first.body.reservation.id);
    const [two] = await assignmentsFor(second.body.reservation.id);
    expect(one.tableId).not.toBe(two.tableId);
  });

  it("refuses a booking when the only table is already taken", async () => {
    const { business, location } = await setupRestaurant([4]);

    await book(business, location, {});
    const second = await book(business, location, {});

    expect(second.status).toBe(400);
    expect(second.body.error).toContain("do not have a table free");
  });

  it("refuses a booking that overlaps the tail of an existing one", async () => {
    const { business, location } = await setupRestaurant([4]);

    await book(business, location, { time: "19:00" });
    const overlapping = await book(business, location, { time: "20:00" });

    expect(overlapping.status).toBe(400);
    expect(overlapping.body.error).toContain("do not have a table free");
  });

  it("accepts a booking that starts once the previous turn is over", async () => {
    const { business, location } = await setupRestaurant([4]);

    await book(business, location, { time: "19:00" });
    const later = await book(business, location, { time: "20:30" });

    expect(later.status).toBe(200);
    expect(await assignmentsFor(later.body.reservation.id)).toHaveLength(1);
  });

  it("refuses a party larger than every table", async () => {
    const { business, location } = await setupRestaurant([4, 4]);

    const response = await book(business, location, { partySize: 7 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("do not have a table free");
  });

  it("skips a blocked table", async () => {
    const { business, location, tables } = await setupRestaurant([4, 4]);
    await db.diningTable.update({ where: { id: tables[0].id }, data: { isBlocked: true } });

    const response = await book(business, location, {});

    const [assignment] = await assignmentsFor(response.body.reservation.id);
    expect(assignment.tableId).toBe(tables[1].id);
  });

  it("still books a location that tracks no tables", async () => {
    const { business, location } = await seedBusinessWithLocation({
      reservationSettings: {
        reservationStartTime: "09:00",
        reservationEndTime: "22:00",
        maxPartySize: 12,
        maxReservedGuestsPerHour: 20,
        bookingWindowDays: 30,
        minNoticeMinutes: 0,
      },
    });

    const response = await book(business, location, {});

    expect(response.status).toBe(200);
    expect(await assignmentsFor(response.body.reservation.id)).toHaveLength(0);
  });
});

describe("availability with a real floor", () => {
  it("closes a slot whose table is already reserved", async () => {
    const { business, location } = await setupRestaurant([4]);
    await book(business, location, { time: "19:00" });

    const request = await api();
    const response = await request.get(
      `/api/reservations/${business.username}/${location.id}/availability?date=${DATE}&partySize=2`,
    );

    const slot = response.body.slots.find((entry: any) => entry.time === "19:00");
    expect(slot.available).toBe(false);
    expect(slot.reason).toBe("no_table");
  });

  it("keeps a slot open once the turn has ended", async () => {
    const { business, location } = await setupRestaurant([4]);
    await book(business, location, { time: "19:00" });

    const request = await api();
    const response = await request.get(
      `/api/reservations/${business.username}/${location.id}/availability?date=${DATE}&partySize=2`,
    );

    const slot = response.body.slots.find((entry: any) => entry.time === "20:30");
    expect(slot.available).toBe(true);
  });
});

describe("changing a reservation", () => {
  it("moves the table hold when the time changes", async () => {
    const { business, location } = await setupRestaurant([4]);
    const created = await book(business, location, { time: "19:00" });
    const [original] = await assignmentsFor(created.body.reservation.id);

    const request = await api();
    const updated = await request
      .put(`/api/reservations/manage/${created.body.manageToken}`)
      .send({ date: DATE, time: "20:30", partySize: 2 });

    expect(updated.status).toBe(200);

    const active = await db.tableAssignment.findMany({
      where: { reservationId: created.body.reservation.id, status: "RESERVED" },
    });
    expect(active).toHaveLength(1);

    const movedBy =
      (active[0].expectedStartAt.getTime() - original.expectedStartAt.getTime()) / 60000;
    expect(movedBy).toBe(90);

    const all = await assignmentsFor(created.body.reservation.id);
    expect(all.filter((row) => row.status === "CANCELLED")).toHaveLength(1);
  });

  it("keeps exactly one live hold after a change", async () => {
    const { business, location } = await setupRestaurant([4, 4]);
    const created = await book(business, location, { time: "19:00" });

    const request = await api();
    await request
      .put(`/api/reservations/manage/${created.body.manageToken}`)
      .send({ date: DATE, time: "19:00", partySize: 4 });

    const active = await db.tableAssignment.findMany({
      where: { reservationId: created.body.reservation.id, status: "RESERVED" },
    });
    expect(active).toHaveLength(1);
    expect(active[0].partySize).toBe(4);
  });

  it("frees the table when the guest cancels", async () => {
    const { business, location } = await setupRestaurant([4]);
    const created = await book(business, location, { time: "19:00" });

    const request = await api();
    const cancelled = await request.post(
      `/api/reservations/manage/${created.body.manageToken}/cancel`,
    );

    expect(cancelled.status).toBe(200);
    const active = await db.tableAssignment.findMany({
      where: { reservationId: created.body.reservation.id, status: "RESERVED" },
    });
    expect(active).toHaveLength(0);
  });

  it("lets the freed slot be booked again after a cancellation", async () => {
    const { business, location } = await setupRestaurant([4]);
    const created = await book(business, location, { time: "19:00" });

    const request = await api();
    await request.post(`/api/reservations/manage/${created.body.manageToken}/cancel`);
    const replacement = await book(business, location, { time: "19:00" });

    expect(replacement.status).toBe(200);
    expect(await assignmentsFor(replacement.body.reservation.id)).toHaveLength(1);
  });
});

describe("staff actions on a reserved table", () => {
  it("frees the table when staff cancel the reservation", async () => {
    const { business, location } = await setupRestaurant([4]);
    const created = await book(business, location, { time: "19:00" });

    const request = await api();
    const response = await request
      .patch(`/auth/business/locations/${location.id}/reservations/${created.body.reservation.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ status: "cancelled" });

    expect(response.status).toBe(200);
    const active = await db.tableAssignment.findMany({
      where: { reservationId: created.body.reservation.id, status: "RESERVED" },
    });
    expect(active).toHaveLength(0);
  });

  it("frees the table when staff mark the reservation completed", async () => {
    const { business, location } = await setupRestaurant([4]);
    const created = await book(business, location, { time: "19:00" });

    const request = await api();
    await request
      .patch(`/auth/business/locations/${location.id}/reservations/${created.body.reservation.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ status: "completed" });

    const active = await db.tableAssignment.findMany({
      where: { reservationId: created.body.reservation.id, status: "RESERVED" },
    });
    expect(active).toHaveLength(0);
  });

  it("keeps the table held while the reservation is still confirmed", async () => {
    const { business, location } = await setupRestaurant([4]);
    const created = await book(business, location, { time: "19:00" });

    const request = await api();
    await request
      .patch(`/auth/business/locations/${location.id}/reservations/${created.body.reservation.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ status: "confirmed" });

    const active = await db.tableAssignment.findMany({
      where: { reservationId: created.body.reservation.id, status: "RESERVED" },
    });
    expect(active).toHaveLength(1);
  });

  it("lets staff move the booking to another table", async () => {
    const { business, location, tables } = await setupRestaurant([4, 4]);
    const created = await book(business, location, { time: "19:00" });
    const [assignment] = await assignmentsFor(created.body.reservation.id);

    const request = await api();
    const response = await request
      .post(`/api/floor/${location.id}/assignments/${assignment.id}/move`)
      .set("Cookie", businessCookie(business.id))
      .send({ tableId: tables[1].id });

    expect(response.status).toBe(200);
    const moved = await db.tableAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(moved.tableId).toBe(tables[1].id);
  });

  it("refuses a manual move onto a table that is already taken", async () => {
    const { business, location, tables } = await setupRestaurant([4, 4]);
    const first = await book(business, location, { time: "19:00" });
    const second = await book(business, location, { time: "19:00" });
    const [assignment] = await assignmentsFor(first.body.reservation.id);
    const [taken] = await assignmentsFor(second.body.reservation.id);

    const request = await api();
    const response = await request
      .post(`/api/floor/${location.id}/assignments/${assignment.id}/move`)
      .set("Cookie", businessCookie(business.id))
      .send({ tableId: taken.tableId });

    expect(response.status).toBe(409);
    const unchanged = await db.tableAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(unchanged.tableId).toBe(tables[0].id);
  });

  it("refuses a manual move onto a blocked table", async () => {
    const { business, location, tables } = await setupRestaurant([4, 4]);
    const created = await book(business, location, { time: "19:00" });
    const [assignment] = await assignmentsFor(created.body.reservation.id);
    await db.diningTable.update({ where: { id: tables[1].id }, data: { isBlocked: true } });

    const request = await api();
    const response = await request
      .post(`/api/floor/${location.id}/assignments/${assignment.id}/move`)
      .set("Cookie", businessCookie(business.id))
      .send({ tableId: tables[1].id });

    expect(response.status).toBe(409);
  });
});

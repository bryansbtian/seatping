import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
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

function tomorrow(): string {
  const today = getNowWallClockInTimezone(DEFAULT_LOCATION_TIMEZONE).slice(0, 10);
  const next = new Date(`${today}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

async function setupFinalTable() {
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
  const table = await db.diningTable.create({
    data: {
      floorPlanId: room.id,
      businessId: business.id,
      locationId: location.id,
      name: "T1",
      capacity: 4,
      minimumPartySize: 1,
    },
  });
  return { business, location, table, cookie: businessCookie(business.id) };
}

function assignmentWindow() {
  const start = new Date();
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  return { expectedStartAt: start.toISOString(), expectedEndAt: end.toISOString() };
}

function statusCount(responses: { status: number }[], status: number): number {
  return responses.filter((response) => response.status === status).length;
}

describe("floor recommendation races", () => {
  it("assigns the final table to only one of two simultaneous reservation bookings", async () => {
    const { business, location, table } = await setupFinalTable();
    const request = await api();
    const date = tomorrow();

    const responses = await Promise.all([
      request.post(`/api/reservations/${business.username}/${location.id}`).send({
        firstName: "Ada",
        lastName: "Lovelace",
        email: `ada-${Date.now()}@example.com`,
        date,
        time: "19:00",
        partySize: 2,
      }),
      request.post(`/api/reservations/${business.username}/${location.id}`).send({
        firstName: "Grace",
        lastName: "Hopper",
        email: `grace-${Date.now()}@example.com`,
        date,
        time: "19:00",
        partySize: 2,
      }),
    ]);

    expect(statusCount(responses, 200)).toBe(2);
    const reservations = await db.reservation.findMany({
      where: { locationId: location.id },
      orderBy: { firstName: "asc" },
    });
    const assignments = await db.tableAssignment.findMany({
      where: { tableId: table.id, status: { in: ["RESERVED", "SEATED"] } },
    });
    expect(reservations).toHaveLength(2);
    expect(assignments).toHaveLength(1);
    expect(reservations.filter((reservation) => reservation.needsReview)).toHaveLength(1);
    expect(reservations.filter((reservation) => !reservation.needsReview)).toHaveLength(1);
  });

  it("allows one commit after two staff sessions calculate the same recommendation", async () => {
    const { location, table, cookie } = await setupFinalTable();
    const request = await api();
    const guest = await seedQueueEntry(location, { guestCount: 2 });

    const recommendations = await Promise.all([
      request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie),
      request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie),
    ]);
    for (const recommendation of recommendations) {
      expect(recommendation.body.rooms[0].tables[0].recommendedPartyId).toBe(guest.id);
      expect(recommendation.body.waitingParties[0].recommendedTableId).toBe(table.id);
    }

    const payload = {
      tableId: table.id,
      queueEntryId: guest.id,
      partySize: 2,
      source: "SMART",
      status: "SEATED",
      ...assignmentWindow(),
    };
    const commits = await Promise.all([
      request.post(`/api/floor/${location.id}/assignments`).set("Cookie", cookie).send(payload),
      request.post(`/api/floor/${location.id}/assignments`).set("Cookie", cookie).send(payload),
    ]);

    expect(statusCount(commits, 201)).toBe(1);
    expect(statusCount(commits, 409)).toBe(1);
    const active = await db.tableAssignment.findMany({
      where: { queueEntryId: guest.id, status: { in: ["RESERVED", "SEATED"] } },
    });
    expect(active).toHaveLength(1);
  });

  it("rejects a stale queue recommendation after a reservation claims the table", async () => {
    const { location, table, cookie } = await setupFinalTable();
    const request = await api();
    const guest = await seedQueueEntry(location, { guestCount: 2 });
    const reservation = await seedReservation(location, { guestCount: 2 });

    const recommendation = await request
      .get(`/api/floor/${location.id}/live`)
      .set("Cookie", cookie);
    expect(recommendation.body.waitingParties[0].recommendedTableId).toBe(table.id);

    const window = assignmentWindow();
    const hold = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        reservationId: reservation.id,
        partySize: 2,
        source: "SMART",
        status: "RESERVED",
        ...window,
      });
    const stale = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        queueEntryId: guest.id,
        partySize: 2,
        source: "SMART",
        status: "SEATED",
        ...window,
      });

    expect(hold.status).toBe(201);
    expect(stale.status).toBe(409);
    expect(
      await db.tableAssignment.count({
        where: { queueEntryId: guest.id, status: { in: ["RESERVED", "SEATED"] } },
      }),
    ).toBe(0);
    expect(
      await db.tableAssignment.count({
        where: { reservationId: reservation.id, status: { in: ["RESERVED", "SEATED"] } },
      }),
    ).toBe(1);
  });
});

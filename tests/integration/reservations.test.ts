import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import {
  futureReservationDateTime,
  seedBusinessWithLocation,
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

function bookingBody(overrides: Record<string, unknown> = {}) {
  const suffix = uniqueSuffix();
  const dt = futureReservationDateTime(19);
  const [date, time] = dt.split("T");
  return {
    firstName: "Booker",
    lastName: suffix,
    email: `booking-${suffix}@test.invalid`,
    date,
    time,
    partySize: 2,
    ...overrides,
  };
}

async function locationWithCapacity(maxPerHour = 10) {
  return seedBusinessWithLocation({
    reservationSettings: {
      reservationStartTime: "09:00",
      reservationEndTime: "22:00",
      maxPartySize: 8,
      maxReservedGuestsPerHour: maxPerHour,
      bookingWindowDays: 30,
      minNoticeMinutes: 0,
      confirmationMode: "auto",
      cancellationPolicy: "",
    },
  });
}

describe("reservation settings and availability", () => {
  it("exposes normalized settings for a location", async () => {
    const { business, location } = await locationWithCapacity();

    const res = await (
      await api()
    ).get(`/api/reservations/${business.username}/${location.id}/settings`);

    expect(res.status).toBe(200);
    expect(res.body.reservationsEnabled).toBe(true);
    expect(res.body.settings.maxReservedGuestsPerHour).toBe(10);
  });

  it("returns 404 for an unknown location", async () => {
    const { business } = await locationWithCapacity();

    const res = await (
      await api()
    ).get(`/api/reservations/${business.username}/000000000000000000000000/settings`);

    expect(res.status).toBe(404);
  });

  it("reports settings as unavailable when reservations are disabled", async () => {
    const { business, location } = await seedBusinessWithLocation({
      reservationsEnabled: false,
    });

    const res = await (
      await api()
    ).get(`/api/reservations/${business.username}/${location.id}/settings`);

    expect(res.status).toBe(200);
    expect(res.body.reservationsEnabled).toBe(false);
    expect(res.body.settings).toBeNull();
  });

  it("lists availability slots for a valid date", async () => {
    const { business, location } = await locationWithCapacity();
    const date = futureReservationDateTime(19).split("T")[0];

    const res = await (
      await api()
    ).get(
      `/api/reservations/${business.username}/${location.id}/availability?date=${date}&partySize=2`,
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.slots)).toBe(true);
    expect(res.body.slots.length).toBeGreaterThan(0);
  });

  it("flags a party larger than the maximum", async () => {
    const { business, location } = await locationWithCapacity();
    const date = futureReservationDateTime(19).split("T")[0];

    const res = await (
      await api()
    ).get(
      `/api/reservations/${business.username}/${location.id}/availability?date=${date}&partySize=50`,
    );

    expect(res.status).toBe(200);
    expect(res.body.partyTooLarge).toBe(true);
  });
});

describe("creating a reservation", () => {
  it("stores a real reservation and updates the slot counter", async () => {
    const { business, location } = await locationWithCapacity();
    const body = bookingBody();

    const res = await (
      await api()
    )
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(body);

    expect(res.status).toBe(200);

    const stored = await db.reservation.findFirst({
      where: { locationId: location.id, email: body.email },
    });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("CONFIRMED");
    expect(stored?.guestCount).toBe(2);
    expect(stored?.manageToken).toEqual(expect.any(String));

    const counter = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey: body.date, hour: 19 },
    });
    expect(counter?.reservedGuests).toBe(2);
  });

  it("rejects a booking that exceeds the hourly capacity", async () => {
    const { business, location } = await locationWithCapacity(4);
    const first = bookingBody({ partySize: 4 });

    const ok = await (
      await api()
    )
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(first);
    expect(ok.status).toBe(200);

    const overflow = await (
      await api()
    )
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(bookingBody({ partySize: 2, date: first.date, time: first.time }));

    expect(overflow.status).toBeGreaterThanOrEqual(400);

    const counter = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey: first.date, hour: 19 },
    });
    expect(counter?.reservedGuests).toBeLessThanOrEqual(4);
  });

  it("rejects a party larger than the configured maximum", async () => {
    const { business, location } = await locationWithCapacity();

    const res = await (
      await api()
    )
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(bookingBody({ partySize: 99 }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.reservation.count()).toBe(0);
  });

  it("rejects a time outside reservation hours", async () => {
    const { business, location } = await locationWithCapacity();

    const res = await (
      await api()
    )
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(bookingBody({ time: "03:00" }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.reservation.count()).toBe(0);
  });

  it("rejects a date beyond the booking window", async () => {
    const { business, location } = await locationWithCapacity();
    const farOut = futureReservationDateTime(19, 400).split("T")[0];

    const res = await (
      await api()
    )
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(bookingBody({ date: farOut }));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a booking with missing contact details", async () => {
    const { business, location } = await locationWithCapacity();

    const res = await (
      await api()
    )
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(bookingBody({ email: undefined, firstName: undefined }));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses bookings when reservations are disabled for the location", async () => {
    const { business, location } = await seedBusinessWithLocation({
      reservationsEnabled: false,
    });

    const res = await (
      await api()
    )
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(bookingBody());

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.reservation.count()).toBe(0);
  });
});

describe("managing a reservation by token", () => {
  it("returns the reservation for a valid manage token", async () => {
    const { location } = await locationWithCapacity();
    const reservation = await seedReservation(location);

    const res = await (await api()).get(`/api/reservations/manage/${reservation.manageToken}`);

    expect(res.status).toBe(200);
    expect(res.body.reservation?.id ?? res.body.id).toBeDefined();
  });

  it("rejects an unknown manage token", async () => {
    const res = await (await api()).get("/api/reservations/manage/nope-not-real");

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("cancels a reservation and releases its capacity", async () => {
    const { business, location } = await locationWithCapacity();
    const body = bookingBody();

    const created = await (
      await api()
    )
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(body);
    expect(created.status).toBe(200);

    const stored = await db.reservation.findFirst({
      where: { locationId: location.id, email: body.email },
    });

    const cancelled = await (
      await api()
    ).post(`/api/reservations/manage/${stored?.manageToken}/cancel`);

    expect(cancelled.status).toBe(200);

    const after = await db.reservation.findUnique({ where: { id: stored!.id } });
    expect(after?.status).toBe("CANCELLED");

    const counter = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey: body.date, hour: 19 },
    });
    expect(counter?.reservedGuests).toBe(0);
  });

  it("updates a reservation to a new time", async () => {
    const { business, location } = await locationWithCapacity();
    const body = bookingBody();

    await (await api()).post(`/api/reservations/${business.username}/${location.id}`).send(body);
    const stored = await db.reservation.findFirst({
      where: { locationId: location.id, email: body.email },
    });

    const res = await (
      await api()
    )
      .put(`/api/reservations/manage/${stored?.manageToken}`)
      .send({ date: body.date, time: "20:00", partySize: 2 });

    expect(res.status).toBe(200);
    const after = await db.reservation.findUnique({ where: { id: stored!.id } });
    expect(after?.reservationDateTime).toBe(`${body.date}T20:00`);
  });

  it("rejects an update that would break capacity rules", async () => {
    const { business, location } = await locationWithCapacity(4);
    const body = bookingBody({ partySize: 2 });

    await (await api()).post(`/api/reservations/${business.username}/${location.id}`).send(body);
    const stored = await db.reservation.findFirst({
      where: { locationId: location.id, email: body.email },
    });

    const res = await (
      await api()
    )
      .put(`/api/reservations/manage/${stored?.manageToken}`)
      .send({ date: body.date, time: body.time, partySize: 99 });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

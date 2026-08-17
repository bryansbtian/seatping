import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { customerCookie } from "../helpers/auth.js";
import { sinks } from "../setup/externalMocks.js";
import {
  futureReservationDateTime,
  seedBusinessWithLocation,
  seedCustomer,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function bookableLocation(maxPerHour = 20) {
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

function booking(overrides: Record<string, unknown> = {}) {
  const suffix = uniqueSuffix();
  const [date, time] = futureReservationDateTime(19).split("T");
  return {
    firstName: "Res",
    lastName: suffix,
    email: `rv-${suffix}@test.invalid`,
    date,
    time,
    partySize: 2,
    ...overrides,
  };
}

describe("reservation creation branches", () => {
  it("stores optional notes and contact details", async () => {
    const { business, location } = await bookableLocation();
    const body = booking({
      notes: "Window seat please",
      phone: "5551234567",
      countryCode: "+1",
    });

    const res = await (await api())
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(body);

    expect(res.status).toBe(200);
    const stored = await db.reservation.findFirst({
      where: { locationId: location.id, email: body.email },
    });
    expect(stored?.notes).toBe("Window seat please");
    expect(stored?.phone).toBe("");
    expect(stored?.email).toBe(body.email);
  });

  it("links a reservation to a signed-in customer", async () => {
    const { business, location } = await bookableLocation();
    const customer = await seedCustomer();
    const body = booking();

    await (await api())
      .post(`/api/reservations/${business.username}/${location.id}`)
      .set("Cookie", customerCookie(customer.id))
      .send(body);

    const stored = await db.reservation.findFirst({
      where: { locationId: location.id, email: body.email },
    });
    expect(stored?.customerId).toBe(customer.id);
  });

  it("requires both a first and last name", async () => {
    const { business, location } = await bookableLocation();

    const res = await (await api())
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(booking({ lastName: undefined }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it("requires a usable email address", async () => {
    const { business, location } = await bookableLocation();

    const res = await (await api())
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(booking({ email: "not-an-email" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("refuses a duplicate booking for the same guest, date and time", async () => {
    const { business, location } = await bookableLocation();
    const body = booking();

    const first = await (await api())
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(body);
    expect(first.status).toBe(200);

    const second = await (await api())
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(body);

    expect(second.status).toBe(409);
    expect(
      await db.reservation.count({ where: { locationId: location.id } }),
    ).toBe(1);
  });

  it("returns 404 for an unknown business", async () => {
    const { location } = await bookableLocation();

    const res = await (await api())
      .post(`/api/reservations/nobody-here/${location.id}`)
      .send(booking());

    expect(res.status).toBe(404);
  });

  it("sends the confirmation through the mocked transport only", async () => {
    const { business, location } = await bookableLocation();

    await (await api())
      .post(`/api/reservations/${business.username}/${location.id}`)
      .send(booking());

    expect(sinks().telnyx).toHaveLength(0);
    expect(sinks().whatsapp).toHaveLength(0);
  });
});

describe("reservation management branches", () => {
  async function createOne(businessUsername: string, locationId: string) {
    const body = booking();
    await (await api())
      .post(`/api/reservations/${businessUsername}/${locationId}`)
      .send(body);
    const stored = await db.reservation.findFirst({
      where: { locationId, email: body.email },
    });
    return { body, stored };
  }

  it("rejects an update with an invalid party size", async () => {
    const { business, location } = await bookableLocation();
    const { body, stored } = await createOne(business.username, location.id);

    const res = await (await api())
      .put(`/api/reservations/manage/${stored?.manageToken}`)
      .send({ date: body.date, time: body.time, partySize: 0 });

    expect(res.status).toBe(400);
  });

  it("rejects an update to a closed hour", async () => {
    const { business, location } = await bookableLocation();
    const { body, stored } = await createOne(business.username, location.id);

    const res = await (await api())
      .put(`/api/reservations/manage/${stored?.manageToken}`)
      .send({ date: body.date, time: "03:00", partySize: 2 });

    expect(res.status).toBe(400);
  });

  it("releases and reclaims capacity when the time changes", async () => {
    const { business, location } = await bookableLocation();
    const { body, stored } = await createOne(business.username, location.id);

    await (await api())
      .put(`/api/reservations/manage/${stored?.manageToken}`)
      .send({ date: body.date, time: "20:00", partySize: 2 });

    const oldHour = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey: body.date, hour: 19 },
    });
    const newHour = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey: body.date, hour: 20 },
    });

    expect(oldHour?.reservedGuests ?? 0).toBe(0);
    expect(newHour?.reservedGuests).toBe(2);
  });

  it("refuses to cancel an unknown reservation", async () => {
    const res = await (await api()).post(
      "/api/reservations/manage/no-such-token/cancel",
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("is idempotent when cancelling twice", async () => {
    const { business, location } = await bookableLocation();
    const { body, stored } = await createOne(business.username, location.id);

    const first = await (await api()).post(
      `/api/reservations/manage/${stored?.manageToken}/cancel`,
    );
    expect(first.status).toBe(200);

    const second = await (await api()).post(
      `/api/reservations/manage/${stored?.manageToken}/cancel`,
    );

    expect(second.status).toBeLessThan(500);
    const counter = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey: body.date, hour: 19 },
    });
    expect(counter?.reservedGuests ?? 0).toBe(0);
  });
});

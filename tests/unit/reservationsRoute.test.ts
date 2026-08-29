import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";

const businessFindUnique = vi.fn();
const locationFindFirst = vi.fn();
const locationFindUnique = vi.fn();
const reservationFindMany = vi.fn();
const reservationFindFirst = vi.fn();
const reservationFindUnique = vi.fn();
const reservationFindUniqueOrThrow = vi.fn();
const reservationCreate = vi.fn();
const reservationUpdate = vi.fn();
const reservationUpdateMany = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const slotCounterUpsert = vi.fn();
const slotCounterUpdateMany = vi.fn();

const enqueueNotification = vi.fn();
const syncGuestFromReservation = vi.fn();
const touchGuestByReservationId = vi.fn();

const diningTableFindFirst = vi.fn(async () => null);

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      business: { findUnique: businessFindUnique },
      location: { findFirst: locationFindFirst, findUnique: locationFindUnique },
      reservation: {
        findMany: reservationFindMany,
        findFirst: reservationFindFirst,
        findUnique: reservationFindUnique,
        findUniqueOrThrow: reservationFindUniqueOrThrow,
        create: reservationCreate,
        update: reservationUpdate,
        updateMany: reservationUpdateMany,
      },
      slotCounter: {
        upsert: slotCounterUpsert,
        updateMany: slotCounterUpdateMany,
      },
      user: { findUnique: userFindUnique, update: userUpdate },
      diningTable: { findFirst: diningTableFindFirst },
    },
  };
});

const assignOrFlagReservation = vi.fn(async () => null);
const reassignTableForReservation = vi.fn(async () => null);
const releaseReservationTables = vi.fn(async () => 0);

vi.mock("../../server/lib/reservationTables.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/reservationTables.js");
  return {
    ...actual,
    assignOrFlagReservation,
    reassignTableForReservation,
    releaseReservationTables,
  };
});

vi.mock("../../server/lib/notifications.js", () => {
  return { enqueueNotification };
});

vi.mock("../../server/lib/guests.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/guests.js");
  return { ...actual, syncGuestFromReservation, touchGuestByReservationId };
});

const reservationsRouter = (await import("../../server/routes/reservations.js")).default;

const ORIGINAL_ENV = { ...process.env };
const LOC = "0123456789abcdef01234567";

let ipCounter = 0;
let emailCounter = 0;

function app() {
  const server = express();
  server.use(cookieParser());
  server.use(express.json());
  server.use("/api/reservations", reservationsRouter);
  return supertest(server);
}

function freshIp(): string {
  ipCounter += 1;
  return `172.20.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

function futureParts(daysAhead = 3) {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: "19:00",
  };
}

function locationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LOC,
    businessId: "biz-1",
    displayName: "Downtown",
    name: "Bistro Downtown",
    address: "1 Test Street",
    area: "Kemang",
    city: "Jakarta",
    reservationsEnabled: true,
    reservationSettings: {
      reservationStartTime: "00:00",
      reservationEndTime: "23:30",
      maxPartySize: 10,
      maxReservedGuestsPerHour: 40,
      bookingWindowDays: 60,
      minNoticeMinutes: 0,
      confirmationMode: "auto",
      cancellationPolicy: "",
    },
    restaurantProfile: { openingHours: { timezone: "UTC" } },
    ...overrides,
  };
}

function createdRow(overrides: Record<string, unknown> = {}) {
  const { date, time } = futureParts();
  return {
    id: "res-1",
    manageToken: "mt-1",
    locationId: LOC,
    businessId: "biz-1",
    businessUsername: "bistro",
    customerId: null,
    firstName: "Ada",
    lastName: "Lovelace",
    name: "Ada Lovelace",
    contactMethod: "email",
    phone: "",
    countryCode: "",
    email: "guest@test.invalid",
    guestCount: 2,
    reservationDateTime: `${date}T${time}`,
    notes: "",
    status: "CONFIRMED",
    source: "seatping_public",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function book(body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const { date, time } = futureParts();
  const request = app().post(`/api/reservations/bistro/${LOC}`).set("X-Forwarded-For", freshIp());
  for (const [k, v] of Object.entries(headers)) {
    request.set(k, v);
  }
  emailCounter += 1;
  return request.send({
    firstName: "Ada",
    lastName: "Lovelace",
    email: `guest-${emailCounter}@test.invalid`,
    partySize: 2,
    date,
    time,
    ...body,
  });
}

beforeEach(() => {
  process.env.FRONTEND_URL = "https://app.test.invalid";
  assignOrFlagReservation.mockReset().mockResolvedValue(null);
  reassignTableForReservation.mockReset().mockResolvedValue(null);
  releaseReservationTables.mockReset().mockResolvedValue(0);
  businessFindUnique.mockReset().mockResolvedValue({
    id: "biz-1",
    name: "Bistro",
    username: "bistro",
    email: "owner@test.invalid",
  });
  locationFindFirst.mockReset().mockResolvedValue(locationRow());
  locationFindUnique.mockReset().mockResolvedValue(locationRow());
  reservationFindMany.mockReset().mockResolvedValue([]);
  reservationFindFirst.mockReset().mockResolvedValue(null);
  reservationFindUnique.mockReset().mockResolvedValue(createdRow());
  reservationFindUniqueOrThrow
    .mockReset()
    .mockResolvedValue(createdRow({ status: "CANCELLED", cancelledAt: new Date() }));
  reservationCreate.mockReset().mockResolvedValue(createdRow());
  reservationUpdate.mockReset().mockImplementation(async ({ data }) => {
    return createdRow(data);
  });
  reservationUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  userFindUnique.mockReset().mockResolvedValue({
    upcomingReservations: [],
    pastReservations: [],
  });
  userUpdate.mockReset().mockResolvedValue({});
  slotCounterUpsert.mockReset().mockResolvedValue({});
  slotCounterUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  enqueueNotification.mockReset().mockResolvedValue(undefined);
  syncGuestFromReservation.mockReset().mockResolvedValue(undefined);
  touchGuestByReservationId.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("resolving a restaurant", () => {
  it("rejects a blank business username", async () => {
    const res = await app().get(`/api/reservations/%20/${LOC}/settings`);

    expect(res.status).toBe(404);
  });

  it("reports an unknown business", async () => {
    businessFindUnique.mockResolvedValue(null);

    const res = await app().get(`/api/reservations/bistro/${LOC}/settings`);

    expect(res.status).toBe(404);
  });

  it("reports a server error on the settings route", async () => {
    businessFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().get(`/api/reservations/bistro/${LOC}/settings`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: "Failed to load reservation settings.",
    });
  });

  it("reports a server error on the availability route", async () => {
    businessFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().get(`/api/reservations/bistro/${LOC}/availability?date=2026-08-12`);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to load availability." });
  });

  it("treats a location with no explicit flag as reservable", async () => {
    locationFindFirst.mockResolvedValue(locationRow({ reservationsEnabled: null }));

    const res = await app().get(`/api/reservations/bistro/${LOC}/settings`);

    expect(res.body.reservationsEnabled).toBe(true);
  });
});

describe("creating a reservation", () => {
  it("stores a booking and notifies both sides", async () => {
    const res = await book();

    expect(res.status).toBe(200);
    expect(res.body.manageToken).toMatch(/^[0-9a-f]{48}$/);
    expect(enqueueNotification).toHaveBeenCalledTimes(1);
    expect(syncGuestFromReservation).toHaveBeenCalledTimes(1);
  });

  it("builds the manage link from the request origin", async () => {
    const res = await book({}, { Origin: "https://booked.test.invalid/" });

    expect(res.body.manageUrl).toBe(
      `https://booked.test.invalid/reservations/manage/${res.body.manageToken}`,
    );
  });

  it("builds the manage link from the forwarded protocol and host", async () => {
    const res = await book({}, { "X-Forwarded-Proto": "https" });

    expect(res.body.manageUrl).toMatch(/^https:\/\/.+\/reservations\/manage\/[0-9a-f]{48}$/);
  });

  it("falls back to a generic business name in the notification", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      name: null,
      username: "bistro",
      email: null,
    });

    await book();

    const job = enqueueNotification.mock.calls[0][0];
    expect(job.businessName).toBe("the restaurant");
    expect(job.businessEmail).toBeUndefined();
  });

  it("falls back through the location label in the notification", async () => {
    locationFindFirst.mockResolvedValue(locationRow({ displayName: null, name: null }));

    await book();

    expect(enqueueNotification.mock.calls[0][0].locationName).toBe("1 Test Street");
  });

  it("keeps the reservation when the notification cannot be queued", async () => {
    enqueueNotification.mockRejectedValue(new Error("queue down"));

    const res = await book();

    expect(res.status).toBe(500);
    expect(reservationCreate).toHaveBeenCalled();
  });

  it("releases the held capacity when the write fails", async () => {
    reservationCreate.mockRejectedValue(new Error("db down"));

    const res = await book();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to create reservation." });
    expect(slotCounterUpdateMany).toHaveBeenCalled();
  });

  it("refuses a booking when the hour is already full", async () => {
    slotCounterUpdateMany.mockResolvedValue({ count: 0 });

    const res = await book();

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("fully booked");
  });

  it("rejects a date that cannot be read for the label", async () => {
    const res = await book({ date: "not-a-date" });

    expect(res.status).toBe(400);
  });
});

describe("when table assignment goes wrong", () => {
  it("still confirms the booking if the table hold throws", async () => {
    assignOrFlagReservation.mockRejectedValue(new Error("floor unavailable"));

    const res = await book();

    expect(res.status).toBe(200);
    expect(res.body.manageToken).toMatch(/^[0-9a-f]{48}$/);
  });

  it("still saves a change if the table hold throws", async () => {
    reassignTableForReservation.mockRejectedValue(new Error("floor unavailable"));
    reservationFindUnique.mockResolvedValue(createdRow());
    reservationUpdate.mockResolvedValue(createdRow());

    const res = await app()
      .put("/api/reservations/manage/mt-1")
      .set("X-Forwarded-For", freshIp())
      .send({ partySize: 3 });

    expect(res.status).toBe(200);
  });
});

describe("managing a reservation", () => {
  it("reports an unknown manage token on every route", async () => {
    reservationFindUnique.mockResolvedValue(null);

    const get = await app().get("/api/reservations/manage/nope");
    const put = await app()
      .put("/api/reservations/manage/nope")
      .set("X-Forwarded-For", freshIp())
      .send({ partySize: 3 });
    const cancel = await app()
      .post("/api/reservations/manage/nope/cancel")
      .set("X-Forwarded-For", freshIp());

    expect(get.status).toBe(404);
    expect(put.status).toBe(404);
    expect(cancel.status).toBe(404);
  });

  it("reports a missing location behind the token", async () => {
    locationFindUnique.mockResolvedValue(null);

    const res = await app().get("/api/reservations/manage/mt-1");

    expect(res.status).toBe(404);
  });

  it("falls back through the restaurant labels", async () => {
    locationFindUnique.mockResolvedValue(
      locationRow({ displayName: null, name: null, restaurantProfile: {} }),
    );
    businessFindUnique.mockResolvedValue({ name: null, username: "bistro" });

    const res = await app().get("/api/reservations/manage/mt-1");

    expect(res.body.restaurant.name).toBe("Restaurant");
    expect(res.body.restaurant.locationName).toBe("Kemang");
  });

  it("falls back to a generic name when nothing is set", async () => {
    locationFindUnique.mockResolvedValue(
      locationRow({
        displayName: null,
        name: null,
        area: null,
        city: null,
        address: "",
        restaurantProfile: {},
      }),
    );
    businessFindUnique.mockResolvedValue(null);

    const res = await app().get("/api/reservations/manage/mt-1");

    expect(res.body.restaurant.name).toBe("Restaurant");
    expect(res.body.restaurant.locationName).toBeNull();
    expect(res.body.restaurant.businessUsername).toBeNull();
    expect(res.body.restaurant.address).toBe("");
  });

  it("reports a server error while loading a reservation", async () => {
    reservationFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().get("/api/reservations/manage/mt-1");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to load reservation." });
  });

  it("reports a server error while updating a reservation", async () => {
    reservationUpdate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .put("/api/reservations/manage/mt-1")
      .set("X-Forwarded-For", freshIp())
      .send({ partySize: 3 });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to update reservation." });
  });

  it("gives the seats back when the new hour is full", async () => {
    slotCounterUpdateMany.mockResolvedValueOnce({ count: 1 });
    slotCounterUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await app()
      .put("/api/reservations/manage/mt-1")
      .set("X-Forwarded-For", freshIp())
      .send({ partySize: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("fully booked");
    expect(slotCounterUpsert).toHaveBeenCalled();
  });

  it("keeps the customer profile in step when the reservation has an owner", async () => {
    reservationFindUnique.mockResolvedValue(createdRow({ customerId: "cust-1" }));
    reservationUpdate.mockResolvedValue(createdRow({ customerId: "cust-1" }));

    const res = await app()
      .put("/api/reservations/manage/mt-1")
      .set("X-Forwarded-For", freshIp())
      .send({ partySize: 3 });

    expect(res.status).toBe(200);
    expect(touchGuestByReservationId).toHaveBeenCalled();
  });

  it("reports a server error while cancelling", async () => {
    reservationUpdateMany.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/api/reservations/manage/mt-1/cancel")
      .set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to cancel reservation." });
  });

  it("skips the capacity release when the claim matched nothing", async () => {
    reservationUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app()
      .post("/api/reservations/manage/mt-1/cancel")
      .set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(200);
    expect(slotCounterUpdateMany).not.toHaveBeenCalled();
  });
});

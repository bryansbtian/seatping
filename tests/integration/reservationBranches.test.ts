import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Business, Location } from "@prisma/client";
import { api } from "../helpers/app.js";
import { customerCookie } from "../helpers/auth.js";
import {
  clearTestDatabase,
  disconnectTestPrisma,
  getTestPrisma,
} from "../helpers/db.js";
import {
  futureReservationDateTime,
  seedBusinessWithLocation,
  seedCustomer,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

let ipCounter = 0;

function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${(ipCounter % 250) + 1}`;
}

function futureParts(hour = 19, daysAhead = 3) {
  const [date, time] = futureReservationDateTime(hour, daysAhead).split("T");
  return { date, time };
}

function bookingPath(business: Business, location: Location): string {
  return `/api/reservations/${business.username}/${location.id}`;
}

async function book(
  business: Business,
  location: Location,
  overrides: Record<string, unknown> = {},
  cookie?: string,
) {
  const { date, time } = futureParts();
  const suffix = uniqueSuffix();
  const request = (await api())
    .post(bookingPath(business, location))
    .set("X-Forwarded-For", freshIp());
  if (cookie) {
    request.set("Cookie", cookie);
  }
  return request.send({
    firstName: "Ada",
    lastName: suffix,
    email: `book-${suffix}@test.invalid`,
    partySize: 2,
    date,
    time,
    ...overrides,
  });
}

const CLOSED_HOURS = {
  timezone: "UTC",
  monday: { enabled: false },
  tuesday: { enabled: false },
  wednesday: { enabled: false },
  thursday: { enabled: false },
  friday: { enabled: false },
  saturday: { enabled: false },
  sunday: { enabled: false },
};

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("reservation settings and availability", () => {
  it("hides the settings when reservations are switched off", async () => {
    const { business, location } = await seedBusinessWithLocation({
      reservationsEnabled: false,
    });

    const res = await (await api()).get(
      `${bookingPath(business, location)}/settings`,
    );

    expect(res.status).toBe(200);
    expect(res.body.reservationsEnabled).toBe(false);
    expect(res.body.settings).toBeNull();
  });

  it("returns no slots when reservations are switched off", async () => {
    const { business, location } = await seedBusinessWithLocation({
      reservationsEnabled: false,
    });
    const { date } = futureParts();

    const res = await (await api()).get(
      `${bookingPath(business, location)}/availability?date=${date}&partySize=2`,
    );

    expect(res.body.reservationsEnabled).toBe(false);
    expect(res.body.slots).toEqual([]);
  });

  it("reports a closed day", async () => {
    const { business, location } = await seedBusinessWithLocation({
      restaurantProfile: {
        openingHours: CLOSED_HOURS,
        details: {},
        isPublished: true,
      } as never,
    });
    const { date } = futureParts();

    const res = await (await api()).get(
      `${bookingPath(business, location)}/availability?date=${date}&partySize=2`,
    );

    expect(res.body.availability.status).toBe("closed");
    expect(res.body.availability.message).toContain("closed");
  });

  it("reports when the restaurant is shut during reservation hours", async () => {
    const { business, location } = await seedBusinessWithLocation({
      reservationSettings: {
        reservationStartTime: "11:00",
        reservationEndTime: "22:00",
        maxPartySize: 10,
        maxReservedGuestsPerHour: 20,
        bookingWindowDays: 30,
        minNoticeMinutes: 0,
        confirmationMode: "auto",
        cancellationPolicy: "",
      },
      restaurantProfile: {
        openingHours: {
          timezone: "UTC",
          monday: { enabled: true, open: "02:00", close: "04:00" },
          tuesday: { enabled: true, open: "02:00", close: "04:00" },
          wednesday: { enabled: true, open: "02:00", close: "04:00" },
          thursday: { enabled: true, open: "02:00", close: "04:00" },
          friday: { enabled: true, open: "02:00", close: "04:00" },
          saturday: { enabled: true, open: "02:00", close: "04:00" },
          sunday: { enabled: true, open: "02:00", close: "04:00" },
        },
        details: {},
        isPublished: true,
      } as never,
    });
    const { date } = futureParts();

    const res = await (await api()).get(
      `${bookingPath(business, location)}/availability?date=${date}&partySize=2`,
    );

    expect(res.body.availability.status).toBe("outside_operating_hours");
  });

  it("reports available on an ordinary day", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const { date } = futureParts();

    const res = await (await api()).get(
      `${bookingPath(business, location)}/availability?date=${date}&partySize=2`,
    );

    expect(res.body.availability.status).toBe("available");
    expect(res.body.slots.length).toBeGreaterThan(0);
  });

  it("reports an unknown location on both endpoints", async () => {
    const { business } = await seedBusinessWithLocation();

    const settings = await (await api()).get(
      `/api/reservations/${business.username}/000000000000000000000000/settings`,
    );
    const availability = await (await api()).get(
      `/api/reservations/${business.username}/000000000000000000000000/availability`,
    );

    expect(settings.status).toBe(404);
    expect(availability.status).toBe(404);
  });
});

describe("booking validation messages", () => {
  it("explains that the restaurant is closed that day", async () => {
    const { business, location } = await seedBusinessWithLocation({
      restaurantProfile: {
        openingHours: CLOSED_HOURS,
        details: {},
        isPublished: true,
      } as never,
    });

    const res = await book(business, location);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("closed on");
  });

  it("explains that a time is outside the operating hours", async () => {
    const { business, location } = await seedBusinessWithLocation({
      restaurantProfile: {
        openingHours: {
          timezone: "UTC",
          monday: { enabled: true, open: "11:00", close: "14:00" },
          tuesday: { enabled: true, open: "11:00", close: "14:00" },
          wednesday: { enabled: true, open: "11:00", close: "14:00" },
          thursday: { enabled: true, open: "11:00", close: "14:00" },
          friday: { enabled: true, open: "11:00", close: "14:00" },
          saturday: { enabled: true, open: "11:00", close: "14:00" },
          sunday: { enabled: true, open: "11:00", close: "14:00" },
        },
        details: {},
        isPublished: true,
      } as never,
    });

    const res = await book(business, location, { time: "21:00" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("operating hours");
  });

  it("explains the minimum notice period", async () => {
    const { business, location } = await seedBusinessWithLocation({
      reservationSettings: {
        reservationStartTime: "00:00",
        reservationEndTime: "23:30",
        maxPartySize: 10,
        maxReservedGuestsPerHour: 20,
        bookingWindowDays: 30,
        minNoticeMinutes: 600,
        confirmationMode: "auto",
        cancellationPolicy: "",
      },
    });
    const soon = new Date(Date.now() + 30 * 60 * 1000);
    const date = soon.toISOString().slice(0, 10);
    const time = `${String(soon.getUTCHours()).padStart(2, "0")}:00`;

    const res = await book(business, location, { date, time });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it("refuses a second booking for the same email, date and time", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const email = `dupe-${uniqueSuffix()}@test.invalid`;
    await book(business, location, { email });

    const res = await book(business, location, { email });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
  });

  it("links a booking to the signed-in customer", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();

    const res = await book(
      business,
      location,
      {},
      customerCookie(customer.id),
    );

    expect(res.status).toBe(200);
    const stored = await db.reservation.findUnique({
      where: { manageToken: res.body.manageToken },
    });
    expect(stored?.customerId).toBe(customer.id);
    const refreshed = await db.user.findUnique({ where: { id: customer.id } });
    expect(
      (refreshed?.upcomingReservations as unknown as unknown[]).length,
    ).toBe(1);
  });

  it("trims and truncates the notes", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await book(business, location, {
      notes: `  ${"n".repeat(1200)}  `,
    });

    const stored = await db.reservation.findUnique({
      where: { manageToken: res.body.manageToken },
    });
    expect(stored?.notes).toHaveLength(1000);
  });
});

describe("managing a reservation by token", () => {
  it("returns the restaurant profile alongside the reservation", async () => {
    const { business, location } = await seedBusinessWithLocation({
      restaurantProfile: {
        displayName: "Warung Nusantara",
        shortAddress: "Kemang Raya 1",
        details: {},
        isPublished: true,
      } as never,
    });
    const created = await book(business, location);

    const res = await (await api()).get(
      `/api/reservations/manage/${created.body.manageToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.restaurant.name).toBe("Warung Nusantara");
    expect(res.body.restaurant.locationName).toBe("Kemang Raya 1");
    expect(res.body.restaurant.businessUsername).toBe(business.username);
    expect(res.body.reservation.manageToken).toBe(created.body.manageToken);
  });

  it("falls back to the business name when there is no profile", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const created = await book(business, location);

    const res = await (await api()).get(
      `/api/reservations/manage/${created.body.manageToken}`,
    );

    expect(res.body.restaurant.name).toBe(business.name);
  });

  it("rejects a blank manage token", async () => {
    const res = await (await api()).get("/api/reservations/manage/%20");

    expect(res.status).toBe(404);
  });

  it("refuses to change a cancelled reservation", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const created = await book(business, location);
    const token = created.body.manageToken;
    await (await api())
      .post(`/api/reservations/manage/${token}/cancel`)
      .set("X-Forwarded-For", freshIp());

    const res = await (await api())
      .put(`/api/reservations/manage/${token}`)
      .set("X-Forwarded-For", freshIp())
      .send({ partySize: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("no longer be changed");
  });

  it("keeps the current date and time when only the party size changes", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const created = await book(business, location);

    const res = await (await api())
      .put(`/api/reservations/manage/${created.body.manageToken}`)
      .set("X-Forwarded-For", freshIp())
      .send({ partySize: 4 });

    expect(res.status).toBe(200);
    expect(res.body.reservation.partySize).toBe(4);
    expect(res.body.reservation.reservationDateTime).toBe(
      created.body.reservation.reservationDateTime,
    );
  });

  it("keeps the customer's upcoming list in step with a change", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();
    const created = await book(
      business,
      location,
      {},
      customerCookie(customer.id),
    );

    await (await api())
      .put(`/api/reservations/manage/${created.body.manageToken}`)
      .set("X-Forwarded-For", freshIp())
      .send({ partySize: 5 });

    const refreshed = await db.user.findUnique({ where: { id: customer.id } });
    const upcoming = refreshed?.upcomingReservations as unknown as Array<
      Record<string, unknown>
    >;
    expect(upcoming[0].people).toBe(5);
  });

  it("moves a cancelled booking into the customer's past list", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();
    const created = await book(
      business,
      location,
      {},
      customerCookie(customer.id),
    );

    await (await api())
      .post(`/api/reservations/manage/${created.body.manageToken}/cancel`)
      .set("X-Forwarded-For", freshIp());

    const refreshed = await db.user.findUnique({ where: { id: customer.id } });
    expect(refreshed?.upcomingReservations).toEqual([]);
    expect(
      (refreshed?.pastReservations as unknown as unknown[]).length,
    ).toBe(1);
  });

  it("refuses to cancel a completed reservation", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const created = await book(business, location);
    await db.reservation.update({
      where: { manageToken: created.body.manageToken },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const res = await (await api())
      .post(`/api/reservations/manage/${created.body.manageToken}/cancel`)
      .set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("no longer be cancelled");
  });

  it("returns the reservation unchanged when it is already cancelled", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const created = await book(business, location);
    const token = created.body.manageToken;
    await (await api())
      .post(`/api/reservations/manage/${token}/cancel`)
      .set("X-Forwarded-For", freshIp());

    const res = await (await api())
      .post(`/api/reservations/manage/${token}/cancel`)
      .set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(200);
    expect(res.body.reservation.status).toBe("cancelled");
  });
});

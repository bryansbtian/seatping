import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import {
  seedBusinessWithLocation,
  seedCustomer,
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

async function guest(
  businessId: string,
  businessUsername: string,
  locationId: string,
  overrides: Record<string, unknown> = {},
) {
  const suffix = uniqueSuffix();
  return db.guestProfile.create({
    data: {
      businessId,
      businessUsername,
      locationId,
      firstName: "Guest",
      lastName: suffix,
      fullName: `Guest ${suffix}`,
      email: `g-${suffix}@test.invalid`,
      normalizedEmail: `g-${suffix}@test.invalid`,
      phone: "5551234567",
      normalizedPhone: `1555123${suffix.slice(0, 4)}`,
      totalVisits: 1,
      ...overrides,
    },
  });
}

describe("guest list filters", () => {
  it("filters returning guests from new guests", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, {
      totalVisits: 5,
    });
    await guest(business.id, business.username, location.id, {
      totalVisits: 1,
    });
    const cookie = businessCookie(business.id);

    const returning = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}&type=returning`)
      .set("Cookie", cookie);
    const fresh = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}&type=new`)
      .set("Cookie", cookie);

    expect(returning.status).toBe(200);
    expect(fresh.status).toBe(200);
    expect(returning.body.guests.length).toBe(1);
    expect(fresh.body.guests.length).toBe(1);
    expect(returning.body.guests[0].id).not.toBe(fresh.body.guests[0].id);
  });

  it("searches guests by name", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const target = await guest(business.id, business.username, location.id, {
      firstName: "Findme",
      fullName: "Findme Target",
    });
    await guest(business.id, business.username, location.id);

    const res = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}&search=Findme`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.guests).toHaveLength(1);
    expect(res.body.guests[0].id).toBe(target.id);
  });

  it("searches guests by phone digits", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, {
      normalizedPhone: "15559998888",
    });

    const res = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}&search=9998888`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.guests.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by tag", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, { tags: ["vip"] });
    await guest(business.id, business.username, location.id, { tags: ["other"] });

    const res = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}&tags=vip`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.guests).toHaveLength(1);
  });

  it("filters guests that have notes", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, {
      notes: "Prefers window seat",
    });
    await guest(business.id, business.username, location.id, { notes: "" });

    const res = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}&hasNotes=true`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.guests.length).toBeGreaterThanOrEqual(1);
    for (const g of res.body.guests) {
      expect(g.hasNotes).toBe(true);
    }
  });

  it("filters guests with a no-show history", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, { noShowCount: 2 });
    await guest(business.id, business.username, location.id, { noShowCount: 0 });

    const res = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}&hasNoShow=true`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.guests).toHaveLength(1);
  });

  it("filters guests with upcoming reservations", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, {
      upcomingReservationCount: 1,
    });
    await guest(business.id, business.username, location.id, {
      upcomingReservationCount: 0,
    });

    const res = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}&hasUpcoming=true`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.guests).toHaveLength(1);
  });

  it("selects an explicit list of guest ids", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const a = await guest(business.id, business.username, location.id);
    await guest(business.id, business.username, location.id);

    const res = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}&ids=${a.id}`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.guests).toHaveLength(1);
    expect(res.body.guests[0].id).toBe(a.id);
  });

  it("returns every guest when no filter is supplied", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id);
    await guest(business.id, business.username, location.id);

    const res = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.guests).toHaveLength(2);
  });
});

describe("featured restaurants payload", () => {
  it("includes rating and review aggregates for a featured location", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();
    await db.review.create({
      data: {
        locationId: location.id,
        customerId: customer.id,
        customerName: "Reviewer",
        rating: 4,
        description: "Nice",
      },
    });
    await db.featuredRestaurant.create({
      data: {
        businessId: business.id,
        locationId: location.id,
        sortOrder: 0,
        isActive: true,
      },
    });

    const res = await (await api()).get("/api/featured-restaurants");

    expect(res.status).toBe(200);
    const payload = JSON.stringify(res.body);
    expect(payload).toContain(location.id);
    expect(payload).toContain("rating");
  });

  it("returns an empty list when nothing is featured", async () => {
    const res = await (await api()).get("/api/featured-restaurants");

    expect(res.status).toBe(200);
    const list = res.body.featured ?? res.body;
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(0);
  });
});

describe("public restaurant payload", () => {
  it("includes reviews and aggregate rating", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();
    await db.review.create({
      data: {
        locationId: location.id,
        customerId: customer.id,
        customerName: "Reviewer",
        rating: 5,
        description: "Excellent",
      },
    });

    const res = await (await api()).get(`/api/restaurants/${business.username}/${location.id}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain("Excellent");
  });

  it("still serves an unpublished location by direct link", async () => {
    const { business, location } = await seedBusinessWithLocation({
      isPublished: false,
    });

    const res = await (await api()).get(`/api/restaurants/${business.username}/${location.id}`);

    expect(res.status).toBe(200);
  });

  it("rejects a malformed location id", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api()).get(`/api/restaurants/${business.username}/not-an-object-id`);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("reservation availability edge cases", () => {
  it("returns no slots when the date parameter is missing", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    ).get(`/api/reservations/${business.username}/${location.id}/availability`);

    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it("reports no slots for a past date", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    ).get(
      `/api/reservations/${business.username}/${location.id}/availability?date=2020-01-01&partySize=2`,
    );

    expect(res.status).toBe(200);
    expect(res.body.outsideWindow).toBe(true);
  });

  it("counts an existing reservation against the hour", async () => {
    const { business, location } = await seedBusinessWithLocation({
      reservationSettings: {
        reservationStartTime: "09:00",
        reservationEndTime: "22:00",
        maxPartySize: 8,
        maxReservedGuestsPerHour: 4,
        bookingWindowDays: 30,
        minNoticeMinutes: 0,
        confirmationMode: "auto",
        cancellationPolicy: "",
      },
    });

    const dt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await seedReservation(location, {
      reservationDateTime: `${dt}T19:00`,
      guestCount: 4,
      status: "CONFIRMED",
    });

    const res = await (
      await api()
    ).get(
      `/api/reservations/${business.username}/${location.id}/availability?date=${dt}&partySize=2`,
    );

    expect(res.status).toBe(200);
    const seven = res.body.slots.find((s: { time: string }) => {
      return s.time === "19:00";
    });
    expect(seven?.available).toBe(false);
  });
});

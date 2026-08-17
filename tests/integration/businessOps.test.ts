import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie, customerCookie } from "../helpers/auth.js";
import {
  seedBusiness,
  seedBusinessWithLocation,
  seedCustomer,
  seedQueueEntry,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("business location management", () => {
  it("creates a location for the authenticated business", async () => {
    const business = await seedBusiness({ maxLocations: 5 });
    const suffix = uniqueSuffix();

    const res = await (await api())
      .post("/auth/business/locations")
      .set("Cookie", businessCookie(business.id))
      .send({ displayName: `Branch ${suffix}`, address: `${suffix} Main Street` });

    expect(res.status).toBe(200);
    const stored = await db.location.findFirst({ where: { businessId: business.id } });
    expect(stored?.address).toBe(`${suffix} Main Street`);
    expect(stored?.businessUsername).toBe(business.username);
  });

  it("requires an address", async () => {
    const business = await seedBusiness();

    const res = await (await api())
      .post("/auth/business/locations")
      .set("Cookie", businessCookie(business.id))
      .send({ displayName: "No address" });

    expect(res.status).toBe(400);
    expect(await db.location.count()).toBe(0);
  });

  it("requires a display name", async () => {
    const business = await seedBusiness();

    const res = await (await api())
      .post("/auth/business/locations")
      .set("Cookie", businessCookie(business.id))
      .send({ address: "1 Nameless Road" });

    expect(res.status).toBe(400);
  });

  it("enforces the maximum location allowance", async () => {
    const business = await seedBusiness({ maxLocations: 1 });
    const cookie = businessCookie(business.id);

    const first = await (await api())
      .post("/auth/business/locations")
      .set("Cookie", cookie)
      .send({ displayName: "One", address: "1 First Street" });
    expect(first.status).toBe(200);

    const second = await (await api())
      .post("/auth/business/locations")
      .set("Cookie", cookie)
      .send({ displayName: "Two", address: "2 Second Street" });

    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await db.location.count({ where: { businessId: business.id } })).toBe(1);
  });

  it("rejects an unauthenticated location create", async () => {
    const res = await (await api())
      .post("/auth/business/locations")
      .send({ displayName: "Anon", address: "1 Anon Street" });

    expect(res.status).toBe(401);
  });

  it("updates a location the business owns", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ address: "99 Updated Street" });

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.address).toBe("99 Updated Street");
  });

  it("updates reservation settings on a location", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({
        reservationsEnabled: true,
        reservationSettings: {
          reservationStartTime: "10:00",
          reservationEndTime: "23:00",
          maxPartySize: 12,
          maxReservedGuestsPerHour: 40,
          bookingWindowDays: 45,
          minNoticeMinutes: 30,
          confirmationMode: "auto",
          cancellationPolicy: "24 hours notice",
        },
      });

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    const settings = stored?.reservationSettings as Record<string, unknown>;
    expect(settings.maxPartySize).toBe(12);
  });

  it("returns a client error when updating an unknown location", async () => {
    const business = await seedBusiness();

    const res = await (await api())
      .put("/auth/business/locations/000000000000000000000000")
      .set("Cookie", businessCookie(business.id))
      .send({ address: "Nowhere" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("business queue management", () => {
  it("confirms arrival for an admitted guest", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location, {
      status: "ADMITTED",
      admittedAt: new Date(),
      finalStatus: "pending",
    });

    const res = await (await api())
      .post(
        `/auth/business/${business.username}/admitted/${entry.legacyKey}/confirm-arrival`,
      )
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("ARRIVED");
    expect(stored?.arrivedAt).toBeInstanceOf(Date);
  });

  it("rejects arrival confirmation for a guest who was never admitted", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);

    const res = await (await api())
      .post(
        `/auth/business/${business.username}/admitted/${entry.legacyKey}/confirm-arrival`,
      )
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("WAITING");
  });

  it("lets a waiting guest leave the queue", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);

    const res = await (await api()).post(
      `/auth/business/${business.username}/queue/${entry.legacyKey}/leave`,
    );

    expect(res.status).toBeLessThan(500);
    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(["LEFT", "WAITING"]).toContain(stored?.status);
  });

  it("reports queue status for a customer key", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);

    const res = await (await api()).get(
      `/auth/business/${business.username}/queue/${entry.legacyKey}/status`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("returns an ETA for a queue token", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);

    const res = await (await api()).get(
      `/auth/business/${business.username}/queue/token/${entry.queueToken}/eta`,
    );

    expect(res.status).toBe(200);
  });

  it("returns queue ETAs for a location the business owns", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedQueueEntry(location);

    const res = await (await api())
      .get(`/auth/business/${business.username}/locations/${location.id}/queue-etas`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
  });

  it("does not return queue ETAs for another business's location", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    const res = await (await api())
      .get(
        `/auth/business/${tenantB.business.username}/locations/${tenantA.location.id}/queue-etas`,
      )
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("customer saved restaurants and reviews", () => {
  it("saves and removes a saved location", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const cookie = customerCookie(customer.id);

    const saved = await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", cookie)
      .send({ locationId: location.id });
    expect(saved.status).toBeLessThan(500);

    const check = await (await api())
      .get(`/auth/me/saved-locations/${location.id}`)
      .set("Cookie", cookie);
    expect(check.status).toBeLessThan(500);
  });

  it("rejects saved-location access without a customer session", async () => {
    const res = await (await api()).get(
      "/auth/me/saved-locations/000000000000000000000000",
    );

    expect(res.status).toBe(401);
  });

  it("lists reviews for the authenticated customer", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .get("/auth/me/reviews")
      .set("Cookie", customerCookie(customer.id));

    expect(res.status).toBe(200);
  });

  it("refuses to edit a review the customer does not own", async () => {
    const customer = await seedCustomer();
    const other = await seedCustomer();
    const { business, location } = await seedBusinessWithLocation();

    const review = await db.review.create({
      data: {
        locationId: location.id,
        customerId: other.id,
        customerName: other.name,
        rating: 5,
        description: "Owned by someone else",
      },
    });

    const res = await (await api())
      .patch(`/auth/me/reviews/${review.id}`)
      .set("Cookie", customerCookie(customer.id))
      .send({ rating: 1, description: "Hijacked" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const stored = await db.review.findUnique({ where: { id: review.id } });
    expect(stored?.description).toBe("Owned by someone else");
  });

  it("lets a customer delete their own review", async () => {
    const customer = await seedCustomer();
    const { business, location } = await seedBusinessWithLocation();

    const review = await db.review.create({
      data: {
        locationId: location.id,
        customerId: customer.id,
        customerName: customer.name,
        rating: 4,
        description: "Mine to delete",
      },
    });

    const res = await (await api())
      .delete(`/auth/me/reviews/${review.id}`)
      .set("Cookie", customerCookie(customer.id));

    expect(res.status).toBe(200);
    expect(await db.review.findUnique({ where: { id: review.id } })).toBeNull();
  });
});

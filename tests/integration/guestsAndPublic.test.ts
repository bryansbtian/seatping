import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry, uniqueSuffix } from "../helpers/seed.js";
import { syncGuestFromQueueEntry } from "../../server/lib/guests.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("guest CRM", () => {
  it("exposes location metadata and suggested tags", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get("/api/guests/meta")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body.locations)).toContain(location.id);
    expect(Array.isArray(res.body.suggestedTags)).toBe(true);
  });

  it("requires a location the business owns when listing guests", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get("/api/guests?locationId=000000000000000000000000")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(404);
  });

  it("creates a guest profile from queue activity", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location, {
      email: `crm-${uniqueSuffix()}@test.invalid`,
    });

    await syncGuestFromQueueEntry(entry);

    const guests = await db.guestProfile.findMany({
      where: { businessId: business.id },
    });
    expect(guests).toHaveLength(1);
    expect(guests[0].locationId).toBe(location.id);
    expect(guests[0].normalizedEmail).toBe(entry.email?.toLowerCase());
  });

  it("does not duplicate a guest when the same contact returns", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const sharedEmail = `repeat-${uniqueSuffix()}@test.invalid`;

    const first = await seedQueueEntry(location, { email: sharedEmail });
    const second = await seedQueueEntry(location, {
      email: sharedEmail.toUpperCase(),
    });

    await syncGuestFromQueueEntry(first);
    await syncGuestFromQueueEntry(second);

    const guests = await db.guestProfile.findMany({
      where: { businessId: business.id },
    });
    expect(guests).toHaveLength(1);
    expect(guests[0].normalizedEmail).toBe(sharedEmail.toLowerCase());
    expect(guests[0].sourceQueueEntryIds).toContain(first.id);
    expect(guests[0].sourceQueueEntryIds).toContain(second.id);
  });

  it("counts a completed visit once the guest has arrived", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location, { status: "ARRIVED" });

    await syncGuestFromQueueEntry(entry);

    const guest = await db.guestProfile.findFirst({
      where: { businessId: business.id },
    });
    expect(guest?.totalVisits).toBeGreaterThanOrEqual(1);
  });

  it("treats differently punctuated phone numbers as one guest", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const first = await seedQueueEntry(location, {
      notificationMethod: "sms",
      email: null,
      phone: "812-3456-7890",
      countryCode: "+62",
    });
    const second = await seedQueueEntry(location, {
      notificationMethod: "sms",
      email: null,
      phone: "8123456790",
      countryCode: "+62",
    });

    await syncGuestFromQueueEntry(first);
    await syncGuestFromQueueEntry(second);

    const guests = await db.guestProfile.findMany({
      where: { businessId: business.id },
    });
    expect(guests.length).toBeGreaterThanOrEqual(1);
    for (const g of guests) {
      expect(g.normalizedPhone).toEqual(expect.any(String));
    }
  });

  it("lists, tags and untags a guest through the API", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    const entry = await seedQueueEntry(location);
    await syncGuestFromQueueEntry(entry);
    const guest = await db.guestProfile.findFirst({
      where: { businessId: business.id },
    });

    const list = await (
      await api()
    )
      .get(`/api/guests?locationId=${location.id}`)
      .set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(guest!.id);

    const detail = await (await api()).get(`/api/guests/${guest!.id}`).set("Cookie", cookie);
    expect(detail.status).toBe(200);

    const tagged = await (
      await api()
    )
      .post(`/api/guests/${guest!.id}/tags`)
      .set("Cookie", cookie)
      .send({ tag: "vip" });
    expect(tagged.status).toBe(200);
    expect((await db.guestProfile.findUnique({ where: { id: guest!.id } }))?.tags).toContain("vip");

    const untagged = await (
      await api()
    )
      .delete(`/api/guests/${guest!.id}/tags/vip`)
      .set("Cookie", cookie);
    expect(untagged.status).toBe(200);
    expect((await db.guestProfile.findUnique({ where: { id: guest!.id } }))?.tags).not.toContain(
      "vip",
    );
  });

  it("saves guest notes", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);
    await syncGuestFromQueueEntry(entry);
    const guest = await db.guestProfile.findFirst({
      where: { businessId: business.id },
    });

    const res = await (
      await api()
    )
      .patch(`/api/guests/${guest!.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ notes: "Allergic to peanuts" });

    expect(res.status).toBe(200);
    const stored = await db.guestProfile.findUnique({ where: { id: guest!.id } });
    expect(stored?.notes).toBe("Allergic to peanuts");
  });

  it("recomputes guest stats on demand", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location, { status: "ARRIVED" });
    await syncGuestFromQueueEntry(entry);
    const guest = await db.guestProfile.findFirst({
      where: { businessId: business.id },
    });

    const res = await (
      await api()
    )
      .post(`/api/guests/${guest!.id}/recompute`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
  });

  it("returns a client error for an unknown guest id", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get("/api/guests/000000000000000000000000")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("public discovery routes", () => {
  it("returns a published restaurant profile", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api()).get(`/api/restaurants/${business.username}/${location.id}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(location.address);
  });

  it("returns 404 for an unknown restaurant", async () => {
    const res = await (await api()).get("/api/restaurants/nobody/000000000000000000000000");

    expect(res.status).toBe(404);
  });

  it("searches restaurants and returns an array", async () => {
    const { location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    ).get(`/api/search/restaurants?query=${encodeURIComponent(location.address.slice(0, 6))}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it("supports paginated search", async () => {
    await seedBusinessWithLocation();

    const res = await (await api()).get("/api/search/restaurants?query=Test&limit=1&page=1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
  });

  it("returns search suggestions", async () => {
    const { location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    ).get(
      `/api/locations/search-suggestions?query=${encodeURIComponent(location.address.slice(0, 5))}`,
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });

  it("returns an empty suggestion list for a blank query", async () => {
    const res = await (await api()).get("/api/locations/search-suggestions?query=");

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  it("lists featured restaurants", async () => {
    const res = await (await api()).get("/api/featured-restaurants");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.featured ?? res.body)).toBe(true);
  });

  it("reports health with database connectivity", async () => {
    const res = await (await api()).get("/api/health");

    expect(res.body).toEqual({ ok: true, db: "ok" });
  });
});

describe("public intake forms", () => {
  it("accepts a feedback submission", async () => {
    const res = await (await api()).post("/api/feedback/submit").send({
      name: "Ada",
      email: `feedback-${uniqueSuffix()}@test.invalid`,
      message: "The queue flow worked well.",
      type: "feedback",
    });

    expect(res.status).toBeLessThan(500);
  });

  it("rejects a feedback submission with no message", async () => {
    const res = await (
      await api()
    )
      .post("/api/feedback/submit")
      .send({ name: "Ada", email: "a@test.invalid" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("accepts a sales inquiry", async () => {
    const res = await (await api()).post("/api/sales/inquiry").send({
      name: "Ada",
      email: `sales-${uniqueSuffix()}@test.invalid`,
      businessName: "Test Bistro",
      message: "Interested in SeatPing.",
    });

    expect(res.status).toBeLessThan(500);
  });

  it("rejects an incomplete sales inquiry", async () => {
    const res = await (await api()).post("/api/sales/inquiry").send({ name: "Ada" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

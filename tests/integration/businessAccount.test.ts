import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { adminCookie, businessCookie } from "../helpers/auth.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { seedBusiness, seedBusinessWithLocation, seedLocation } from "../helpers/seed.js";
import { sinks } from "../setup/externalMocks.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("business profile", () => {
  it("returns the dashboard payload for the signed-in business", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get("/auth/business/me")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(business.username);
    expect(JSON.stringify(res.body)).toContain(location.id);
  });

  it("requires an array when replacing the location list", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .put("/auth/business/me")
      .set("Cookie", businessCookie(business.id))
      .send({ locations: "one" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("locations array is required");
  });

  it("deletes the locations left out of the list along with their photos", async () => {
    const business = await seedBusiness({ maxLocations: 5 });
    const keep = await seedLocation(business.id, business.username, {
      address: "1 Keep Street",
    });
    const drop = await seedLocation(business.id, business.username, {
      address: "2 Drop Street",
      bannerImagePublicId: "seatping/locations/drop/banner/old",
    });
    await db.photo.create({
      data: {
        locationId: drop.id,
        url: "https://test.invalid/p.jpg",
        publicId: "seatping/locations/drop/photo/one",
      },
    });

    const res = await (
      await api()
    )
      .put("/auth/business/me")
      .set("Cookie", businessCookie(business.id))
      .send({ locations: [{ address: "1 Keep Street" }] });

    expect(res.status).toBe(200);
    const remaining = await db.location.findMany({
      where: { businessId: business.id },
    });
    expect(remaining.map((l) => l.id)).toEqual([keep.id]);
    expect(await db.photo.count({ where: { locationId: drop.id } })).toBe(0);
  });

  it("keeps every location when the list matches", async () => {
    const { business, location } = await seedBusinessWithLocation();

    await (
      await api()
    )
      .put("/auth/business/me")
      .set("Cookie", businessCookie(business.id))
      .send({ locations: [{ address: location.address }] });

    expect(await db.location.count({ where: { businessId: business.id } })).toBe(1);
  });

  it("ignores list entries with no address", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .put("/auth/business/me")
      .set("Cookie", businessCookie(business.id))
      .send({ locations: [{ displayName: "No address here" }] });

    expect(res.status).toBe(200);
    expect(await db.location.count({ where: { businessId: business.id } })).toBe(0);
  });
});

describe("business language", () => {
  it("defaults to English", async () => {
    const business = await seedBusiness({ language: null });

    const res = await (
      await api()
    )
      .get("/auth/business/language")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.language).toBe("en");
  });

  it("stores a supported language", async () => {
    const business = await seedBusiness();

    const res = await (
      await api()
    )
      .put("/auth/business/language")
      .set("Cookie", businessCookie(business.id))
      .send({ language: "id" });

    expect(res.status).toBe(200);
    expect(res.body.language).toBe("id");
    const stored = await db.business.findUnique({ where: { id: business.id } });
    expect(stored?.language).toBe("id");
  });

  it("rejects an unsupported language", async () => {
    const business = await seedBusiness();

    const res = await (
      await api()
    )
      .put("/auth/business/language")
      .set("Cookie", businessCookie(business.id))
      .send({ language: "fr" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("en, id");
  });
});

describe("adding a location", () => {
  it("requires an address and a display name", async () => {
    const business = await seedBusiness({ maxLocations: 3 });
    const cookie = businessCookie(business.id);

    const noAddress = await (
      await api()
    )
      .post("/auth/business/locations")
      .set("Cookie", cookie)
      .send({ displayName: "Downtown" });
    const noName = await (
      await api()
    )
      .post("/auth/business/locations")
      .set("Cookie", cookie)
      .send({ address: "1 Test Street" });

    expect(noAddress.status).toBe(400);
    expect(noAddress.body.error).toBe("address is required");
    expect(noName.status).toBe(400);
    expect(noName.body.error).toBe("displayName is required");
  });

  it("stores the full set of address details", async () => {
    const business = await seedBusiness({ maxLocations: 3 });

    const res = await (
      await api()
    )
      .post("/auth/business/locations")
      .set("Cookie", businessCookie(business.id))
      .send({
        address: "  1 Test Street  ",
        displayName: "Downtown",
        area: "Kemang",
        city: "Jakarta",
        country: "Indonesia",
        latitude: -6.2,
        longitude: 106.8,
        googlePlaceId: "place-1",
        googleMapsUrl: "https://maps.test.invalid/place-1",
      });

    expect(res.status).toBe(200);
    const stored = await db.location.findFirst({
      where: { businessId: business.id },
    });
    expect(stored?.address).toBe("1 Test Street");
    expect(stored?.area).toBe("Kemang");
    expect(stored?.latitude).toBe(-6.2);
    expect(stored?.googlePlaceId).toBe("place-1");
  });

  it("nulls coordinates that are not numbers", async () => {
    const business = await seedBusiness({ maxLocations: 3 });

    await (
      await api()
    )
      .post("/auth/business/locations")
      .set("Cookie", businessCookie(business.id))
      .send({
        address: "1 Test Street",
        displayName: "Downtown",
        latitude: "-6.2",
        longitude: null,
      });

    const stored = await db.location.findFirst({
      where: { businessId: business.id },
    });
    expect(stored?.latitude).toBeNull();
    expect(stored?.longitude).toBeNull();
  });

  it("refuses to exceed the location allowance", async () => {
    const business = await seedBusiness({ maxLocations: 1 });
    await seedLocation(business.id, business.username);

    const res = await (
      await api()
    )
      .post("/auth/business/locations")
      .set("Cookie", businessCookie(business.id))
      .send({ address: "2 Test Street", displayName: "Second" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Max locations reached");
  });
});

describe("editing a location", () => {
  it("publishes a location alongside its restaurant profile", async () => {
    const { business, location } = await seedBusinessWithLocation({
      isPublished: false,
    });

    const res = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({
        restaurantProfile: {
          displayName: "Warung Nusantara",
          details: {},
          isPublished: true,
        },
      });

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.isPublished).toBe(true);
  });

  it("unpublishes when the profile says so", async () => {
    const { business, location } = await seedBusinessWithLocation({
      isPublished: true,
    });

    await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ restaurantProfile: { details: {}, isPublished: false } });

    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.isPublished).toBe(false);
  });

  it("rejects a restaurant profile that is not an object", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ restaurantProfile: ["not", "an", "object"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("restaurantProfile must be an object");
  });

  it("trims a new address and rejects an empty one", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);

    const ok = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", cookie)
      .send({ address: "  9 New Street  " });
    const blank = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", cookie)
      .send({ address: "   " });

    expect(ok.status).toBe(200);
    expect(blank.status).toBe(400);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.address).toBe("9 New Street");
  });

  it("toggles the queue and reservation switches", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ queueEnabled: false, reservationsEnabled: false });

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.queueEnabled).toBe(false);
    expect(stored?.reservationsEnabled).toBe(false);
  });

  it("rejects non-boolean switches", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);

    const queue = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", cookie)
      .send({ queueEnabled: "no" });
    const reservations = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", cookie)
      .send({ reservationsEnabled: "no" });

    expect(queue.status).toBe(400);
    expect(reservations.status).toBe(400);
  });

  it("normalises the reservation settings it stores", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({
        reservationSettings: {
          reservationStartTime: "not a time",
          maxPartySize: 9999,
        },
      });

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    const settings = stored?.reservationSettings as Record<string, unknown>;
    expect(settings.reservationStartTime).toMatch(/^\d{2}:\d{2}$/);
    expect(Number(settings.maxPartySize)).toBeLessThan(9999);
  });

  it("rejects reservation settings that are not an object", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ reservationSettings: [] });

    expect(res.status).toBe(400);
  });

  it("rejects an edit with nothing to change", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .put(`/auth/business/locations/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No editable fields provided");
  });

  it("rejects a blank location id", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .put("/auth/business/locations/%20")
      .set("Cookie", businessCookie(business.id))
      .send({ queueEnabled: false });

    expect(res.status).toBe(400);
  });

  it("refuses to edit another business's location", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .put(`/auth/business/locations/${tenantA.location.id}`)
      .set("Cookie", businessCookie(tenantB.business.id))
      .send({ queueEnabled: false });

    expect(res.status).toBe(404);
  });
});

describe("admin email diagnostics", () => {
  it("requires an address", async () => {
    const res = await (await api()).post("/auth/test-email").set("Cookie", adminCookie()).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("email is required");
  });

  it("sends a test message", async () => {
    const res = await (
      await api()
    )
      .post("/auth/test-email")
      .set("Cookie", adminCookie())
      .send({ email: "ops@test.invalid" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sinks().email.at(-1)?.to).toBe("ops@test.invalid");
  });

  it("refuses a business cookie", async () => {
    const business = await seedBusiness();

    const res = await (
      await api()
    )
      .post("/auth/test-email")
      .set("Cookie", businessCookie(business.id))
      .send({ email: "ops@test.invalid" });

    expect(res.status).toBeGreaterThanOrEqual(401);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import {
  clearTestDatabase,
  disconnectTestPrisma,
  getTestPrisma,
} from "../helpers/db.js";
import {
  seedBusiness,
  seedBusinessWithLocation,
  seedCustomer,
  seedLocation,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

let ipCounter = 0;

function freshIp(): string {
  ipCounter += 1;
  return `192.0.2.${(ipCounter % 250) + 1}`;
}

function cronSecret(): string {
  return process.env.CRON_SECRET as string;
}

function weekdayName(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
    .toLowerCase();
}

async function search(query: string, extra = "") {
  return (await api())
    .get(`/api/search/restaurants?query=${encodeURIComponent(query)}${extra}`)
    .set("X-Forwarded-For", freshIp());
}

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("restaurant search", () => {
  it("returns every published restaurant for an empty query", async () => {
    const business = await seedBusiness({ name: "Search Bistro" });
    await seedLocation(business.id, business.username, { isPublished: true });
    await seedLocation(business.id, business.username, { isPublished: false });

    const res = await search("");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.query).toBe("");
  });

  it("matches on the business name, address and cuisine", async () => {
    const suffix = uniqueSuffix();
    const business = await seedBusiness({ name: `Rendang House ${suffix}` });
    await seedLocation(business.id, business.username, {
      isPublished: true,
      address: `${suffix} Jalan Thamrin`,
      restaurantProfile: {
        cuisineTypes: ["Padang"],
        tagline: "Slow cooked daily",
        details: {},
        isPublished: true,
      } as never,
    });

    const byName = await search("rendang");
    const byAddress = await search("thamrin");
    const byCuisine = await search("padang");
    const byTagline = await search("slow cooked");

    expect(byName.body.total).toBe(1);
    expect(byAddress.body.total).toBe(1);
    expect(byCuisine.body.total).toBe(1);
    expect(byTagline.body.total).toBe(1);
  });

  it("reports the aggregate rating and review count", async () => {
    const customer = await seedCustomer();
    const other = await seedCustomer();
    const { business, location } = await seedBusinessWithLocation({
      isPublished: true,
    });
    await db.review.create({
      data: { locationId: location.id, customerId: customer.id, rating: 4 },
    });
    await db.review.create({
      data: { locationId: location.id, customerId: other.id, rating: 5 },
    });

    const res = await search(business.name.split(" ")[0]);

    const hit = res.body.results.find((r: any) => {
      return r.locationId === location.id;
    });
    expect(hit.rating).toBe(4.5);
    expect(hit.reviewCount).toBe(2);
  });

  it("reports no rating for a restaurant with no reviews", async () => {
    const business = await seedBusiness({ name: "Unrated Bistro" });
    await seedLocation(business.id, business.username, { isPublished: true });

    const res = await search("unrated");

    expect(res.body.results[0].rating).toBeNull();
    expect(res.body.results[0].reviewCount).toBe(0);
  });

  it("flags a featured restaurant", async () => {
    const { business, location } = await seedBusinessWithLocation({
      isPublished: true,
    });
    await db.featuredRestaurant.create({
      data: { businessId: business.id, locationId: location.id, isActive: true },
    });

    const res = await search("");

    expect(res.body.results[0].featured).toBe(true);
  });

  it("falls back to the first gallery photo for the banner", async () => {
    const business = await seedBusiness({ name: "Gallery Bistro" });
    const location = await seedLocation(business.id, business.username, {
      isPublished: true,
      bannerImageUrl: null,
    });
    await db.photo.create({
      data: {
        locationId: location.id,
        url: "https://test.invalid/gallery.jpg",
        publicId: `seatping/locations/${location.id}/photo/one`,
      },
    });

    const res = await search("gallery");

    expect(res.body.results[0].bannerImageUrl).toBe(
      "https://test.invalid/gallery.jpg",
    );
  });

  it("paginates when a limit is given", async () => {
    const business = await seedBusiness({ name: "Paged Bistro" });
    for (let i = 0; i < 5; i++) {
      await seedLocation(business.id, business.username, { isPublished: true });
    }

    const first = await search("paged", "&limit=2&page=1");
    const second = await search("paged", "&limit=2&page=3");

    expect(first.body.results).toHaveLength(2);
    expect(first.body.total).toBe(5);
    expect(first.body.hasMore).toBe(true);
    expect(second.body.results).toHaveLength(1);
    expect(second.body.hasMore).toBe(false);
  });

  it("ignores a non-numeric page and caps the limit", async () => {
    const business = await seedBusiness({ name: "Capped Bistro" });
    await seedLocation(business.id, business.username, { isPublished: true });

    const res = await search("capped", "&limit=500&page=abc");

    expect(res.body.limit).toBe(100);
    expect(res.body.page).toBe(1);
  });

  it("omits pagination fields when no limit is given", async () => {
    const business = await seedBusiness({ name: "Unpaged Bistro" });
    await seedLocation(business.id, business.username, { isPublished: true });

    const res = await search("unpaged");

    expect(res.body.page).toBeUndefined();
    expect(res.body.hasMore).toBeUndefined();
  });
});

describe("open now reporting", () => {
  async function searchWithHours(openingHours: unknown) {
    const suffix = uniqueSuffix();
    const business = await seedBusiness({ name: `Hours ${suffix}` });
    await seedLocation(business.id, business.username, {
      isPublished: true,
      restaurantProfile: {
        openingHours,
        details: {},
        isPublished: true,
      } as never,
    });
    const res = await search(`hours ${suffix}`);
    return res.body.results[0].openNow;
  }

  it("reports nothing when there are no opening hours", async () => {
    await expect(searchWithHours(undefined)).resolves.toBeNull();
    await expect(searchWithHours("nine to five")).resolves.toBeNull();
  });

  it("reports closed on a disabled day", async () => {
    const hours = {
      timezone: "UTC",
      [weekdayName()]: { enabled: false, open: "09:00", close: "22:00" },
    };

    await expect(searchWithHours(hours)).resolves.toBe(false);
  });

  it("reports open across a full day window", async () => {
    const hours = {
      timezone: "UTC",
      [weekdayName()]: { enabled: true, open: "00:00", close: "23:59" },
    };

    await expect(searchWithHours(hours)).resolves.toBe(true);
  });

  it("handles a window that runs past midnight", async () => {
    const hours = {
      timezone: "UTC",
      [weekdayName()]: { enabled: true, open: "00:00", close: "00:00" },
    };

    await expect(searchWithHours(hours)).resolves.toBe(true);
  });

  it("reports nothing when the times are malformed", async () => {
    const hours = {
      timezone: "UTC",
      [weekdayName()]: { enabled: true, open: "9am", close: "10pm" },
    };

    await expect(searchWithHours(hours)).resolves.toBeNull();
  });

  it("reports nothing for an unusable timezone", async () => {
    const hours = {
      timezone: "Not/AZone",
      [weekdayName()]: { enabled: true, open: "09:00", close: "22:00" },
    };

    await expect(searchWithHours(hours)).resolves.toBeNull();
  });

  it("reports closed when today has no entry", async () => {
    const hours = {
      timezone: "UTC",
      [weekdayName(1)]: { enabled: true, open: "09:00", close: "22:00" },
    };

    await expect(searchWithHours(hours)).resolves.toBe(false);
  });
});

describe("cron endpoints", () => {
  const paths = [
    "/api/cron/reservation-reminders",
    "/api/cron/credit-refill",
    "/api/cron/campaigns",
  ];

  it("refuses an unauthenticated sweep", async () => {
    for (const path of paths) {
      const res = await (await api()).post(path);
      expect(res.status).toBe(401);
    }
  });

  it("refuses a wrong secret", async () => {
    for (const path of paths) {
      const res = await (await api())
        .post(path)
        .set("Authorization", "Bearer not-the-secret");
      expect(res.status).toBe(401);
    }
  });

  it("runs the reservation reminder sweep", async () => {
    const res = await (await api())
      .post("/api/cron/reservation-reminders")
      .set("Authorization", `Bearer ${cronSecret()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("runs the credit refill sweep", async () => {
    const res = await (await api())
      .post("/api/cron/credit-refill")
      .set("Authorization", `Bearer ${cronSecret()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("runs the campaign sweep and reports what fired", async () => {
    const res = await (await api())
      .get("/api/cron/campaigns")
      .set("Authorization", `Bearer ${cronSecret()}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.scheduled).toEqual(expect.any(Number));
    expect(res.body.recurring).toEqual(expect.any(Number));
  });
});

describe("saved audiences", () => {
  async function seedAudience(businessId: string, locationId: string) {
    const business = await db.business.findUnique({ where: { id: businessId } });
    return db.savedAudience.create({
      data: {
        businessId,
        businessUsername: business!.username,
        locationId,
        name: `Audience ${uniqueSuffix()}`,
        description: "Regulars",
        filters: { minVisits: 2 },
      },
    });
  }

  it("requires a location when listing", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .get("/api/audiences")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("locationId is required");
  });

  it("requires a location and a name when creating", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);

    const noLocation = await (await api())
      .post("/api/audiences")
      .set("Cookie", cookie)
      .send({ name: "Regulars" });
    const noName = await (await api())
      .post("/api/audiences")
      .set("Cookie", cookie)
      .send({ locationId: location.id, name: "   " });

    expect(noLocation.status).toBe(400);
    expect(noName.status).toBe(400);
  });

  it("stores an audience without a description", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/api/audiences")
      .set("Cookie", businessCookie(business.id))
      .send({ locationId: location.id, name: "  Regulars  " });

    expect(res.status).toBe(200);
    expect(res.body.audience.name).toBe("Regulars");
    expect(res.body.audience.description).toBeNull();
    expect(res.body.audience.filters).toEqual({});
  });

  it("requires a location when previewing", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/api/audiences/preview")
      .set("Cookie", businessCookie(business.id))
      .send({ filters: {} });

    expect(res.status).toBe(400);
  });

  it("previews the guests a filter would reach", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const suffix = uniqueSuffix();
    await db.guestProfile.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        locationId: location.id,
        firstName: "Ada",
        lastName: suffix,
        email: `preview-${suffix}@test.invalid`,
        totalVisits: 4,
      },
    });

    const res = await (await api())
      .post("/api/audiences/preview")
      .set("Cookie", businessCookie(business.id))
      .send({ locationId: location.id, filters: {}, timezone: "UTC" });

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(res.body.guests[0].fullName).toBe(`Ada ${suffix}`);
    expect(res.body.guests[0].returning).toBe(true);
  });

  it("updates only the fields that were supplied", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const audience = await seedAudience(business.id, location.id);

    const res = await (await api())
      .patch(`/api/audiences/${audience.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ name: "  Renamed  " });

    expect(res.status).toBe(200);
    expect(res.body.audience.name).toBe("Renamed");
    expect(res.body.audience.description).toBe("Regulars");
    expect(res.body.audience.filters).toEqual({ minVisits: 2 });
  });

  it("clears the description when an empty one is sent", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const audience = await seedAudience(business.id, location.id);

    const res = await (await api())
      .patch(`/api/audiences/${audience.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ description: "" });

    expect(res.body.audience.description).toBeNull();
  });

  it("replaces the stored filters", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const audience = await seedAudience(business.id, location.id);

    const res = await (await api())
      .patch(`/api/audiences/${audience.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ filters: { minVisits: 5 } });

    expect(res.body.audience.filters).toEqual({ minVisits: 5 });
  });

  it("ignores a blank name", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const audience = await seedAudience(business.id, location.id);

    const res = await (await api())
      .patch(`/api/audiences/${audience.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ name: "   " });

    expect(res.body.audience.name).toBe(audience.name);
  });

  it("reports an unknown audience on update and delete", async () => {
    const { business } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    const missing = "000000000000000000000000";

    const update = await (await api())
      .patch(`/api/audiences/${missing}`)
      .set("Cookie", cookie)
      .send({ name: "Renamed" });
    const remove = await (await api())
      .delete(`/api/audiences/${missing}`)
      .set("Cookie", cookie);

    expect(update.status).toBe(404);
    expect(remove.status).toBe(404);
  });

  it("deletes an audience", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const audience = await seedAudience(business.id, location.id);

    const res = await (await api())
      .delete(`/api/audiences/${audience.id}`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(
      await db.savedAudience.findUnique({ where: { id: audience.id } }),
    ).toBeNull();
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { seedBusiness, seedLocation, uniqueSuffix } from "../helpers/seed.js";
import {
  buildRestaurantSearchQuery,
  restaurantSearchClocks,
  restaurantSearchOptions,
} from "../../server/lib/restaurantSearch.js";
import type { SearchResponse } from "../../shared/restaurantDiscovery.js";

const db = getTestPrisma();
let caller = 0;

async function search(params: Record<string, string> = {}) {
  caller++;
  return (await api())
    .get(`/api/search/restaurants?${new URLSearchParams({ version: "2", ...params })}`)
    .set("X-Forwarded-For", `198.18.${Math.floor(caller / 250)}.${(caller % 250) + 1}`);
}

async function catalog(count: number) {
  const business = await seedBusiness({ name: "Catalog" });
  const suffix = uniqueSuffix();
  await db.location.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      id: `${suffix}-${String(index).padStart(3, "0")}`,
      businessId: business.id,
      businessUsername: business.username,
      address: "Catalog Street",
      displayName: `Location ${index}`,
      area: "Common",
      city: "City",
      isPublished: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      queueEnabled: index % 2 === 0,
      reservationsEnabled: index % 3 === 0,
      restaurantProfile: {
        displayName: `Restaurant ${String(index).padStart(3, "0")}`,
        cuisineTypes: ["Japanese", "Thai"],
        priceRange: "$$",
      },
    })),
  });
  const locations = await db.location.findMany({
    where: { businessId: business.id },
    orderBy: { id: "asc" },
  });
  return { business, locations };
}

beforeEach(() => clearTestDatabase());
afterAll(() => disconnectTestPrisma());

describe("PostgreSQL restaurant pagination", () => {
  it("returns exactly ten per page with accurate totals, stable ties, and a partial final page", async () => {
    const { locations } = await catalog(23);
    const first = await search();
    const second = await search({ page: "2" });
    const last = await search({ page: "3" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      total: 23,
      page: 1,
      limit: 10,
      totalPages: 3,
      hasMore: true,
    });
    expect(first.body.results).toHaveLength(10);
    expect(second.body.results).toHaveLength(10);
    expect(last.body.results).toHaveLength(3);
    expect(last.body.hasMore).toBe(false);
    const all = [first, second, last].flatMap((response) =>
      response.body.results.map((row: { locationId: string }) => row.locationId),
    );
    expect(all).toEqual(locations.map((row) => row.id));
    expect((await search({ page: "99" })).body).toMatchObject({ results: [], total: 23, page: 99 });
  });

  it("filters the full catalog before pagination and returns global query facets", async () => {
    const { locations } = await catalog(25);
    for (const location of locations.slice(11, 24)) {
      await db.location.update({
        where: { id: location.id },
        data: {
          area: "Rare District",
          restaurantProfile: { cuisineTypes: ["Rare Cuisine"], priceRange: "$$$$" },
        },
      });
    }
    const filtered = await search({
      cuisine: "Rare Cuisine",
      price: "$$$$",
      location: "Rare District",
    });
    expect(filtered.body.total).toBe(13);
    expect(filtered.body.results).toHaveLength(10);
    expect(filtered.body.facets.cuisines).toEqual(["Japanese", "Rare Cuisine"]);
    expect(filtered.body.facets.locations).toEqual(["Common", "Rare District"]);
    const pageTwo = await search({ cuisine: "Rare Cuisine", page: "2" });
    expect(pageTwo.body.results).toHaveLength(3);
    expect((await search({ cuisine: "Thai" })).body.total).toBe(0);
  });

  it("globally orders featured restaurants before pagination with inactive features ignored", async () => {
    const { business, locations } = await catalog(22);
    for (const location of locations.slice(11)) {
      await db.featuredRestaurant.create({
        data: { locationId: location.id, businessId: business.id },
      });
    }
    await db.featuredRestaurant.update({
      where: { locationId: locations[11].id },
      data: { isActive: false },
    });
    const response = await search();
    expect(response.body.results).toHaveLength(10);
    expect(response.body.results.every((row: { featured: boolean }) => row.featured)).toBe(true);
    expect(response.body.results.map((row: { locationId: string }) => row.locationId)).toEqual(
      locations.slice(12).map((row) => row.id),
    );
    expect(
      (await search({ page: "2" })).body.results.every(
        (row: { featured: boolean }) => !row.featured,
      ),
    ).toBe(true);
  });

  it("applies rounded ratings and service support across all matching rows", async () => {
    const { locations } = await catalog(24);
    await db.review.createMany({
      data: [
        ...Array.from({ length: 19 }, () => ({ locationId: locations[18].id, rating: 4 })),
        ...Array.from({ length: 21 }, () => ({ locationId: locations[18].id, rating: 5 })),
        { locationId: locations[6].id, rating: 3 },
      ],
    });
    const response = await search({ minRating: "4.5", queue: "1", reservations: "1" });
    expect(response.body.total).toBe(1);
    expect(response.body.results[0]).toMatchObject({
      locationId: locations[18].id,
      rating: 4.5,
      reviewCount: 40,
    });
    expect((await search({ sort: "rating" })).body.results[0].locationId).toBe(locations[18].id);
    expect((await search({ sort: "reviews" })).body.results[0].locationId).toBe(locations[18].id);
  });

  it("sorts names and prices globally and places missing prices last in either direction", async () => {
    const { locations } = await catalog(15);
    await db.location.update({
      where: { id: locations[14].id },
      data: { restaurantProfile: { displayName: "AAA", priceRange: "$" } },
    });
    await db.location.update({
      where: { id: locations[13].id },
      data: { restaurantProfile: { displayName: "ZZZ", priceRange: "$$$$" } },
    });
    await db.location.update({ where: { id: locations[12].id }, data: { restaurantProfile: {} } });
    expect((await search({ sort: "name-az" })).body.results[0].name).toBe("AAA");
    expect((await search({ sort: "name-za" })).body.results[0].name).toBe("ZZZ");
    expect((await search({ sort: "price-asc" })).body.results[0].priceRange).toBe("$");
    expect((await search({ sort: "price-desc" })).body.results[0].priceRange).toBe("$$$$");
    expect(
      (await search({ sort: "price-desc", page: "2" })).body.results.at(-1).priceRange,
    ).toBeNull();
    expect((await search({ price: "$$" })).body.total).toBe(12);
  });

  it("preserves literal percent, underscore, backslash, Unicode, and SQL-looking search terms", async () => {
    const business = await seedBusiness({ name: "Literal Bistro" });
    const labels = ["100% Pure", "a_b", "c\\d", "寿司 café", "x' OR 1=1 --"];
    for (const label of labels) {
      await seedLocation(business.id, business.username, {
        address: label,
        restaurantProfile: Prisma.JsonNull,
      });
    }
    for (const query of ["%", "_", "\\", "寿司", "CAFÉ", "x' OR 1=1 --"]) {
      const response = await search({ query });
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
    }
    expect(await db.location.count()).toBe(5);
  });

  it("matches all existing fields, including secondary cuisines and nested profile details", async () => {
    const business = await seedBusiness({ name: "Business Needle", username: "username-needle" });
    await seedLocation(business.id, business.username, {
      name: "Name Needle",
      displayName: "Display Needle",
      address: "Address Needle",
      area: "Area Needle",
      city: "City Needle",
      country: "Country Needle",
      restaurantProfile: {
        displayName: "Profile Needle",
        description: "Description Needle",
        tagline: "Tagline Needle",
        priceRange: "Price Needle",
        cuisineTypes: ["First Needle", "Second Needle"],
        details: { area: "Nested Area", city: "Nested City", address: "Nested Address" },
      },
    });
    for (const query of [
      "business needle",
      "username-needle",
      "name needle",
      "display needle",
      "address needle",
      "area needle",
      "city needle",
      "country needle",
      "profile needle",
      "description needle",
      "tagline needle",
      "price needle",
      "first needle",
      "second needle",
      "nested area",
      "nested city",
      "nested address",
    ]) {
      expect((await search({ query })).body.total).toBe(1);
    }
  });

  it("preserves Unicode default casing and locale ordering across the page boundary", async () => {
    const business = await seedBusiness({ name: "Unicode Dining" });
    const labels = [
      "İstanbul",
      "ΟΣ",
      "🍣 Dining",
      "Cafe\u0301",
      "Café",
      "Å Dining",
      "Zulu",
      "Alpha",
    ];
    for (const label of labels) {
      await seedLocation(business.id, business.username, {
        restaurantProfile: { displayName: label },
      });
    }
    for (const query of ["i\u0307", "ος", "🍣", "e\u0301", "É"]) {
      const expected = labels.filter((name) => name.toLowerCase().includes(query.toLowerCase()));
      const response = await search({ query, sort: "name-az" });
      expect(response.status).toBe(200);
      expect(response.body.results.map((row: { name: string }) => row.name)).toEqual(expected);
    }
    const sorted = await search({ sort: "name-az" });
    expect(sorted.body.results.map((row: { name: string }) => row.name)).toEqual(
      [...labels].sort((left, right) => left.localeCompare(right)),
    );
  });

  it("preserves publication rules and never returns credentials, credits, settings, or full profiles", async () => {
    const { business, locations } = await catalog(2);
    await db.location.update({ where: { id: locations[0].id }, data: { isPublished: false } });
    await db.location.update({
      where: { id: locations[1].id },
      data: { restaurantProfile: { isPublished: false } },
    });
    const other = await seedBusiness();
    await seedLocation(other.id, other.username, { isPublished: false });
    const response = await search();
    expect(response.body.total).toBe(1);
    expect(response.body.results[0].businessUsername).toBe(business.username);
    for (const field of [
      "password",
      "email",
      "phone",
      "credits",
      "baseCredits",
      "reservationSettings",
      "restaurantProfile",
      "businessId",
      "openingHours",
      "createdAt",
      "areaLabel",
    ]) {
      expect(response.body.results[0]).not.toHaveProperty(field);
    }
  });

  it("preserves profile, location, cuisine, address, gallery, and unknown-value fallbacks", async () => {
    const business = await seedBusiness({ name: "Fallback Business" });
    const location = await seedLocation(business.id, business.username, {
      displayName: null,
      area: null,
      city: "City",
      bannerImageUrl: null,
      restaurantProfile: { cuisineTypes: [], openingHours: "unknown" },
    });
    await db.photo.create({
      data: { locationId: location.id, url: "https://test.invalid/first.jpg", publicId: "first" },
    });
    let response = await search();
    expect(response.body.results[0]).toMatchObject({
      name: "Fallback Business",
      shortAddress: "City",
      cuisine: null,
      rating: null,
      reviewCount: 0,
      openNow: null,
      bannerImageUrl: "https://test.invalid/first.jpg",
    });
    await db.location.update({
      where: { id: location.id },
      data: {
        restaurantProfile: {
          displayName: "Profile",
          shortAddress: "Short",
          cuisineTypes: ["First", "Second"],
        },
      },
    });
    response = await search();
    expect(response.body.results[0]).toMatchObject({
      name: "Profile",
      shortAddress: "Short",
      cuisine: "First",
    });
  });
});

describe("database opening-hours filtering", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const defaultWeekday = new Intl.DateTimeFormat("en-US", { weekday: "long" })
    .format(now)
    .toLowerCase();
  async function withHours(openingHours: Prisma.InputJsonValue | null) {
    const business = await seedBusiness();
    await seedLocation(business.id, business.username, { restaurantProfile: { openingHours } });
    const options = restaurantSearchOptions({ version: "2" });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const clocks = restaurantSearchClocks(
      [
        timezone,
        "UTC",
        "utc",
        "Asia/Jakarta",
        "Asia/Calcutta",
        "US/Eastern",
        "+01:00",
        "America/New_York",
      ],
      now,
    );
    const rows = await db.$queryRaw<SearchResponse[]>(buildRestaurantSearchQuery(options, clocks));
    return rows[0].results[0].openNow;
  }

  it.each([
    [null, null],
    ["unknown", null],
    [{ timezone: "Not/AZone" }, null],
    [{ timezone: "UTC" }, false],
    [{ timezone: "UTC", monday: "closed" }, false],
    [{ timezone: "UTC", monday: { enabled: false, open: "00:00", close: "23:59" } }, false],
    [{ timezone: "UTC", monday: { enabled: true, open: "9am", close: "10pm" } }, null],
    [{ timezone: "UTC", monday: { enabled: true, open: "00:00", close: "23:59" } }, true],
    [{ timezone: "UTC", monday: { enabled: true, open: "13:00", close: "14:00" } }, false],
    [{ timezone: "UTC", monday: { enabled: true, open: "00:00", close: "00:00" } }, true],
    [{ timezone: "UTC", monday: { enabled: true, open: "23:00", close: "13:00" } }, true],
    [{ timezone: "UTC", monday: { enabled: true, open: "13:00", close: "11:00" } }, false],
    [{ timezone: "Asia/Jakarta", monday: { enabled: true, open: "18:00", close: "20:00" } }, true],
    [
      { timezone: "America/New_York", monday: { enabled: true, open: "07:00", close: "09:00" } },
      true,
    ],
    [{ timezone: 7, [defaultWeekday]: { enabled: true, open: "00:00", close: "00:00" } }, true],
    [{ timezone: "utc", monday: { enabled: true, open: "00:00", close: "00:00" } }, true],
    [{ timezone: "Asia/Calcutta", monday: { enabled: true, open: "17:00", close: "18:00" } }, true],
    [{ timezone: "US/Eastern", monday: { enabled: true, open: "07:00", close: "09:00" } }, true],
    [{ timezone: "+01:00", monday: { enabled: true, open: "12:00", close: "14:00" } }, true],
    [{ timezone: "Factory", monday: { enabled: true, open: "00:00", close: "00:00" } }, null],
    [[], false],
  ] as const)("preserves open-now semantics for %j", async (hours, expected) => {
    expect(await withHours(hours)).toBe(expected);
  });

  it("applies opening hours before paging across the complete matching catalog", async () => {
    const { locations } = await catalog(25);
    for (const location of locations.slice(11, 24)) {
      await db.location.update({
        where: { id: location.id },
        data: {
          restaurantProfile: {
            openingHours: {
              timezone: "UTC",
              monday: { enabled: true, open: "00:00", close: "00:00" },
            },
          },
        },
      });
    }
    const rows = await db.$queryRaw<SearchResponse[]>(
      buildRestaurantSearchQuery(
        restaurantSearchOptions({ version: "2", openNow: "1" }),
        restaurantSearchClocks(["UTC"], now),
      ),
    );
    expect(rows[0].total).toBe(13);
    expect(rows[0].results).toHaveLength(10);
    expect(rows[0].results.every((row) => row.openNow)).toBe(true);
  });

  it("preserves Intl aliases and rejects database-only timezone aliases in real API filtering", async () => {
    const business = await seedBusiness();
    const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    for (const timezone of [
      "Asia/Calcutta",
      "US/Eastern",
      "utc",
      "+01:00",
      "Factory",
      "localtime",
    ]) {
      const days = Object.fromEntries(
        weekdays.map((day) => [day, { enabled: true, open: "00:00", close: "00:00" }]),
      );
      await seedLocation(business.id, business.username, {
        displayName: timezone,
        restaurantProfile: { openingHours: { timezone, ...days } },
      });
    }
    const response = await search({ openNow: "1" });
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(4);
    expect(response.body.results.every((row: { openNow: boolean }) => row.openNow)).toBe(true);
    expect(
      response.body.results
        .map((row: { locationDisplayName: string }) => row.locationDisplayName)
        .sort(),
    ).toEqual(["+01:00", "Asia/Calcutta", "US/Eastern", "utc"]);
    const all = await search();
    expect(
      all.body.results.filter((row: { openNow: unknown }) => row.openNow === null),
    ).toHaveLength(2);
  });
});

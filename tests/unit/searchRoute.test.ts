import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";

const locationFindMany = vi.fn();
const businessFindMany = vi.fn();
const reviewGroupBy = vi.fn();
const featuredFindMany = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      location: { findMany: locationFindMany },
      business: { findMany: businessFindMany },
      review: { groupBy: reviewGroupBy },
      featuredRestaurant: { findMany: featuredFindMany },
    },
  };
});

const searchRouter = (await import("../../server/routes/search.js")).default;

let ipCounter = 0;

function searchApp() {
  const app = express();
  app.use("/api/search", searchRouter);
  return supertest(app);
}

function freshIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

async function search(query = "", extra = "") {
  return searchApp()
    .get(`/api/search/restaurants?query=${encodeURIComponent(query)}${extra}`)
    .set("X-Forwarded-For", freshIp());
}

function location(overrides: Record<string, unknown> = {}) {
  return {
    id: "loc-1",
    businessId: "biz-1",
    displayName: "Downtown",
    name: "Bistro Downtown",
    address: "1 Test Street",
    area: "Kemang",
    city: "Jakarta",
    country: "Indonesia",
    bannerImageUrl: "https://test.invalid/banner.jpg",
    restaurantProfile: {},
    photos: [],
    queueEnabled: true,
    reservationsEnabled: true,
    ...overrides,
  };
}

function today(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase();
}

function hourLabel(hour: number): string {
  return `${String(((hour % 24) + 24) % 24).padStart(2, "0")}:00`;
}

async function openNowFor(openingHours: unknown) {
  locationFindMany.mockResolvedValue([location({ restaurantProfile: { openingHours } })]);
  const res = await search("");
  return res.body.results[0].openNow;
}

beforeEach(() => {
  locationFindMany.mockReset().mockResolvedValue([]);
  businessFindMany
    .mockReset()
    .mockResolvedValue([{ id: "biz-1", name: "Bistro", username: "bistro" }]);
  reviewGroupBy.mockReset().mockResolvedValue([]);
  featuredFindMany.mockReset().mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("search result fallbacks", () => {
  it("falls back through every optional field", async () => {
    locationFindMany.mockResolvedValue([
      {
        id: "loc-1",
        businessId: "biz-unknown",
        photos: [],
      },
    ]);
    businessFindMany.mockResolvedValue([]);

    const res = await search("");

    const hit = res.body.results[0];
    expect(hit.businessUsername).toBeNull();
    expect(hit.businessName).toBeNull();
    expect(hit.name).toBe("Restaurant");
    expect(hit.shortAddress).toBeNull();
    expect(hit.description).toBeNull();
    expect(hit.tagline).toBeNull();
    expect(hit.cuisine).toBeNull();
    expect(hit.priceRange).toBeNull();
    expect(hit.address).toBe("");
    expect(hit.area).toBeNull();
    expect(hit.city).toBeNull();
    expect(hit.bannerImageUrl).toBeNull();
    expect(hit.queueEnabled).toBe(true);
    expect(hit.reservationsEnabled).toBe(true);
    expect(hit.openNow).toBeNull();
    expect(hit.featured).toBe(false);
  });

  it("prefers the profile display name and short address", async () => {
    locationFindMany.mockResolvedValue([
      location({
        restaurantProfile: {
          displayName: "Warung Nusantara",
          shortAddress: "Kemang Raya 1",
          description: "Home cooking",
          tagline: "Since 1998",
          priceRange: "$$",
          cuisineTypes: ["Indonesian", "Padang"],
        },
      }),
    ]);

    const res = await search("");

    const hit = res.body.results[0];
    expect(hit.name).toBe("Warung Nusantara");
    expect(hit.shortAddress).toBe("Kemang Raya 1");
    expect(hit.description).toBe("Home cooking");
    expect(hit.tagline).toBe("Since 1998");
    expect(hit.priceRange).toBe("$$");
    expect(hit.cuisine).toBe("Indonesian");
  });

  it("falls back to the location display name then area then city", async () => {
    locationFindMany.mockResolvedValue([
      location({ displayName: null, area: "Kemang", city: "Jakarta" }),
    ]);

    const byArea = await search("");
    expect(byArea.body.results[0].shortAddress).toBe("Kemang");

    locationFindMany.mockResolvedValue([
      location({ displayName: null, area: null, city: "Jakarta" }),
    ]);
    const byCity = await search("");
    expect(byCity.body.results[0].shortAddress).toBe("Jakarta");
  });

  it("falls back to the location name when the business has none", async () => {
    businessFindMany.mockResolvedValue([{ id: "biz-1", name: null, username: "bistro" }]);
    locationFindMany.mockResolvedValue([location({ displayName: null, name: "Bistro Downtown" })]);

    const res = await search("");

    expect(res.body.results[0].name).toBe("Bistro Downtown");
  });

  it("reports no cuisine for an empty or missing list", async () => {
    locationFindMany.mockResolvedValue([location({ restaurantProfile: { cuisineTypes: [] } })]);
    expect((await search("")).body.results[0].cuisine).toBeNull();

    locationFindMany.mockResolvedValue([location({ restaurantProfile: null })]);
    expect((await search("")).body.results[0].cuisine).toBeNull();
  });

  it("reports no rating when the aggregate has no numeric average", async () => {
    locationFindMany.mockResolvedValue([location()]);
    reviewGroupBy.mockResolvedValue([
      { locationId: "loc-1", _avg: { rating: null }, _count: { _all: 0 } },
    ]);

    const res = await search("");

    expect(res.body.results[0].rating).toBeNull();
  });
});

describe("search matching", () => {
  it("matches a location that carries no restaurant profile", async () => {
    locationFindMany.mockResolvedValue([
      { id: "loc-1", businessId: "biz-1", name: "Kopi House", photos: [] },
    ]);

    const res = await search("kopi");

    expect(res.body.total).toBe(1);
  });

  it("matches on the country field", async () => {
    locationFindMany.mockResolvedValue([location()]);

    const res = await search("indonesia");

    expect(res.body.total).toBe(1);
  });

  it("drops a location that matches nothing", async () => {
    locationFindMany.mockResolvedValue([location()]);

    const res = await search("zzzzz");

    expect(res.body.total).toBe(0);
    expect(res.body.results).toEqual([]);
  });
});

describe("open now edge cases", () => {
  it("reports nothing without usable opening hours", async () => {
    await expect(openNowFor(undefined)).resolves.toBeNull();
    await expect(openNowFor("nine to five")).resolves.toBeNull();
    await expect(openNowFor(null)).resolves.toBeNull();
  });

  it("works without a timezone on the opening hours", async () => {
    const result = await openNowFor({
      [today()]: { enabled: true, open: "00:00", close: "23:59" },
    });

    expect(typeof result).toBe("boolean");
  });

  it("ignores a non-string timezone", async () => {
    const result = await openNowFor({
      timezone: 7,
      [today()]: { enabled: true, open: "00:00", close: "23:59" },
    });

    expect(typeof result).toBe("boolean");
  });

  it("reports closed for a day that is switched off or absent", async () => {
    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: { enabled: false, open: "09:00", close: "22:00" },
      }),
    ).resolves.toBe(false);
    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: "closed",
      }),
    ).resolves.toBe(false);
    await expect(
      openNowFor({
        timezone: "UTC",
        [today(1)]: { enabled: true, open: "09:00", close: "22:00" },
      }),
    ).resolves.toBe(false);
  });

  it("reports nothing when the open or close time is malformed", async () => {
    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: { enabled: true, open: "9am", close: "22:00" },
      }),
    ).resolves.toBeNull();
    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: { enabled: true, open: "09:00", close: "10pm" },
      }),
    ).resolves.toBeNull();
    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: { enabled: true },
      }),
    ).resolves.toBeNull();
  });

  it("reports open inside a same-day window", async () => {
    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: { enabled: true, open: "00:00", close: "23:59" },
      }),
    ).resolves.toBe(true);
  });

  it("reports closed outside a same-day window", async () => {
    const hour = new Date().getUTCHours();
    if (hour > 20) {
      return;
    }

    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: {
          enabled: true,
          open: hourLabel(hour + 2),
          close: hourLabel(hour + 3),
        },
      }),
    ).resolves.toBe(false);
  });

  it("treats an equal open and close as always open", async () => {
    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: { enabled: true, open: "00:00", close: "00:00" },
      }),
    ).resolves.toBe(true);
  });

  it("reports open before the close of a window that wraps past midnight", async () => {
    const hour = new Date().getUTCHours();
    if (hour > 21) {
      return;
    }

    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: {
          enabled: true,
          open: "23:00",
          close: hourLabel(hour + 1),
        },
      }),
    ).resolves.toBe(true);
  });

  it("reports closed inside the gap of a window that wraps past midnight", async () => {
    const hour = new Date().getUTCHours();
    if (hour > 22) {
      return;
    }

    await expect(
      openNowFor({
        timezone: "UTC",
        [today()]: {
          enabled: true,
          open: hourLabel(hour + 1),
          close: hourLabel(hour),
        },
      }),
    ).resolves.toBe(false);
  });

  it("reports nothing for a timezone the runtime rejects", async () => {
    await expect(
      openNowFor({
        timezone: "Not/AZone",
        [today()]: { enabled: true, open: "09:00", close: "22:00" },
      }),
    ).resolves.toBeNull();
  });
});

describe("search failures and limits", () => {
  it("reports a server error without leaking the cause", async () => {
    locationFindMany.mockRejectedValue(new Error("db down"));

    const res = await search("");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Search failed." });
  });

  it("survives a rejection that carries no message", async () => {
    locationFindMany.mockRejectedValue("db exploded");

    const res = await search("");

    expect(res.status).toBe(500);
    expect((console.error as any).mock.calls[0][1]).toBe("db exploded");
  });

  it("rate limits a caller hammering the endpoint", async () => {
    const app = searchApp();
    const ip = "10.99.99.99";
    let limited = 0;

    for (let i = 0; i < 65; i++) {
      const res = await app.get("/api/search/restaurants?query=").set("X-Forwarded-For", ip);
      if (res.status === 429) {
        limited += 1;
      }
    }

    expect(limited).toBeGreaterThan(0);
  });
});

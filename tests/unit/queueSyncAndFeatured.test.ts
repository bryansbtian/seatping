import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const featuredFindMany = vi.fn();
const reviewGroupBy = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      user: { findUnique: userFindUnique, update: userUpdate },
      featuredRestaurant: { findMany: featuredFindMany },
      review: { groupBy: reviewGroupBy },
    },
  };
});

const { syncCustomerQueue } = await import("../../server/lib/queueSync.js");
const featuredRouter = (await import("../../server/routes/featured.js")).default;

function featuredApp() {
  const app = express();
  app.use("/api/featured-restaurants", featuredRouter);
  return supertest(app);
}

function savedActivity(): Array<Record<string, any>> {
  return userUpdate.mock.calls[0][0].data.queueingActivity;
}

function queueEntry(overrides: Record<string, unknown> = {}) {
  return {
    customerId: "cust-1",
    queueToken: "qt-1",
    firstName: "Ada",
    lastName: "Lovelace",
    joinedAt: "2026-08-12T18:00:00.000Z",
    partySize: 3,
    notificationMethod: "email",
    locationId: "loc-1",
    ...overrides,
  };
}

beforeEach(() => {
  userFindUnique.mockReset().mockResolvedValue({ queueingActivity: [] });
  userUpdate.mockReset().mockResolvedValue({});
  featuredFindMany.mockReset().mockResolvedValue([]);
  reviewGroupBy.mockReset().mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncCustomerQueue", () => {
  it("does nothing for an entry with no customer", async () => {
    await syncCustomerQueue(queueEntry({ customerId: null }), {
      status: "waiting",
    });
    await syncCustomerQueue(null, { status: "waiting" });

    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("does nothing when the customer no longer exists", async () => {
    userFindUnique.mockResolvedValue(null);

    await syncCustomerQueue(queueEntry(), { status: "waiting" });

    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("records a waiting entry as active", async () => {
    await syncCustomerQueue(queueEntry(), {
      status: "waiting",
      businessUsername: "bistro",
      businessName: "Bistro",
      locationName: "Downtown",
      locationId: "loc-9",
    });

    const [item] = savedActivity();
    expect(item.id).toBe("qt-1");
    expect(item.active).toBe(true);
    expect(item.businessUsername).toBe("bistro");
    expect(item.businessName).toBe("Bistro");
    expect(item.locationName).toBe("Downtown");
    expect(item.locationId).toBe("loc-9");
    expect(item.partySize).toBe(3);
  });

  it("marks every non-waiting status as inactive", async () => {
    for (const status of ["admitted", "arrived", "no_show", "removed", "left"] as const) {
      userUpdate.mockClear();
      await syncCustomerQueue(queueEntry(), { status });
      expect(savedActivity()[0].active).toBe(false);
    }
  });

  it("falls back to the entry's own business and location", async () => {
    await syncCustomerQueue(
      queueEntry({ businessUsername: "from-entry", locationId: "loc-entry" }),
      { status: "waiting" },
    );

    const [item] = savedActivity();
    expect(item.businessUsername).toBe("from-entry");
    expect(item.locationId).toBe("loc-entry");
    expect(item.businessName).toBeNull();
    expect(item.locationName).toBeNull();
  });

  it("builds a key from the name and join time when there is no token", async () => {
    await syncCustomerQueue(queueEntry({ queueToken: null }), {
      status: "waiting",
    });

    const [item] = savedActivity();
    expect(item.id).toBe("AdaLovelace2026-08-12T18:00:00.000Z");
    expect(item.queueToken).toBeNull();
    expect(item.entryKey).toBe("AdaLovelace2026-08-12T18:00:00.000Z");
  });

  it("tolerates an entry with no name or join time", async () => {
    await syncCustomerQueue(
      {
        customerId: "cust-1",
        queueToken: null,
        firstName: null,
        lastName: null,
        joinedAt: null,
      },
      { status: "waiting" },
    );

    const [item] = savedActivity();
    expect(item.entryKey).toBe("");
    expect(item.joinedAt).toBeNull();
    expect(item.partySize).toBe(0);
  });

  it("reads the party size from the legacy guest count field", async () => {
    await syncCustomerQueue(
      queueEntry({ partySize: undefined, numGuests: 5 }),
      { status: "waiting" },
    );

    expect(savedActivity()[0].partySize).toBe(5);
  });

  it("carries the lifecycle timestamps through", async () => {
    await syncCustomerQueue(
      queueEntry({
        admittedAt: "2026-08-12T18:30:00.000Z",
        confirmedAt: "2026-08-12T18:40:00.000Z",
        noShowMarkedAt: "2026-08-12T18:50:00.000Z",
        removedAt: "2026-08-12T19:00:00.000Z",
        leftAt: "2026-08-12T19:10:00.000Z",
      }),
      { status: "arrived" },
    );

    const [item] = savedActivity();
    expect(item.admittedAt).toBe("2026-08-12T18:30:00.000Z");
    expect(item.confirmedAt).toBe("2026-08-12T18:40:00.000Z");
    expect(item.noShowMarkedAt).toBe("2026-08-12T18:50:00.000Z");
    expect(item.removedAt).toBe("2026-08-12T19:00:00.000Z");
    expect(item.leftAt).toBe("2026-08-12T19:10:00.000Z");
  });

  it("nulls the timestamps that are absent", async () => {
    await syncCustomerQueue(queueEntry(), { status: "waiting" });

    const [item] = savedActivity();
    expect(item.admittedAt).toBeNull();
    expect(item.leftAt).toBeNull();
    expect(item.notificationMethod).toBe("email");
  });

  it("replaces an earlier record of the same visit and keeps the rest", async () => {
    userFindUnique.mockResolvedValue({
      queueingActivity: [
        { id: "qt-1", status: "waiting" },
        { id: "qt-other", status: "left" },
      ],
    });

    await syncCustomerQueue(queueEntry(), { status: "admitted" });

    const list = savedActivity();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("qt-1");
    expect(list[0].status).toBe("admitted");
    expect(list[1].id).toBe("qt-other");
  });

  it("tolerates a stored activity list of the wrong shape", async () => {
    userFindUnique.mockResolvedValue({ queueingActivity: "not a list" });

    await syncCustomerQueue(queueEntry(), { status: "waiting" });

    expect(savedActivity()).toHaveLength(1);
  });

  it("tolerates stored entries with no id", async () => {
    userFindUnique.mockResolvedValue({ queueingActivity: [{ status: "left" }] });

    await syncCustomerQueue(queueEntry(), { status: "waiting" });

    expect(savedActivity()).toHaveLength(2);
  });
});

describe("featured restaurants listing", () => {
  function featuredRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "feat-1",
      locationId: "loc-1",
      sortOrder: 0,
      business: { username: "bistro", name: "Bistro" },
      location: {
        displayName: "Downtown",
        name: "Bistro Downtown",
        address: "1 Test Street",
        area: "Kemang",
        city: "Jakarta",
        bannerImageUrl: "https://test.invalid/banner.jpg",
        restaurantProfile: {},
        photos: [],
        reservationsEnabled: false,
        queueEnabled: false,
      },
      ...overrides,
    };
  }

  it("returns an empty list when nothing is featured", async () => {
    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.status).toBe(200);
    expect(res.body.featured).toEqual([]);
    expect(reviewGroupBy).not.toHaveBeenCalled();
  });

  it("prefers the restaurant profile over the raw location fields", async () => {
    featuredFindMany.mockResolvedValue([
      featuredRow({
        location: {
          ...featuredRow().location,
          restaurantProfile: {
            displayName: "Warung Nusantara",
            shortAddress: "Kemang Raya 1",
            cuisineTypes: ["Indonesian", "Padang"],
            priceRange: "$$",
          },
        },
      }),
    ]);

    const res = await featuredApp().get("/api/featured-restaurants");

    const hit = res.body.featured[0];
    expect(hit.name).toBe("Warung Nusantara");
    expect(hit.shortAddress).toBe("Kemang Raya 1");
    expect(hit.cuisine).toBe("Indonesian");
    expect(hit.priceRange).toBe("$$");
  });

  it("falls back through the business and location names", async () => {
    featuredFindMany.mockResolvedValue([featuredRow()]);

    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.body.featured[0].name).toBe("Bistro");
    expect(res.body.featured[0].shortAddress).toBe("Downtown");
  });

  it("falls back to the location name when the business has none", async () => {
    featuredFindMany.mockResolvedValue([
      featuredRow({
        business: { username: "bistro", name: null },
        location: {
          ...featuredRow().location,
          displayName: null,
          area: null,
          city: null,
        },
      }),
    ]);

    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.body.featured[0].name).toBe("Bistro Downtown");
    expect(res.body.featured[0].shortAddress).toBeNull();
  });

  it("falls back to a generic name when nothing is set", async () => {
    featuredFindMany.mockResolvedValue([
      featuredRow({ business: null, location: null }),
    ]);

    const res = await featuredApp().get("/api/featured-restaurants");

    const hit = res.body.featured[0];
    expect(hit.name).toBe("Restaurant");
    expect(hit.businessUsername).toBeNull();
    expect(hit.businessName).toBeNull();
    expect(hit.address).toBe("");
    expect(hit.bannerImageUrl).toBeNull();
    expect(hit.reservationsEnabled).toBe(true);
    expect(hit.queueEnabled).toBe(true);
  });

  it("falls back to the first gallery photo for the banner", async () => {
    featuredFindMany.mockResolvedValue([
      featuredRow({
        location: {
          ...featuredRow().location,
          bannerImageUrl: null,
          photos: [{ url: "https://test.invalid/gallery.jpg" }],
        },
      }),
    ]);

    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.body.featured[0].bannerImageUrl).toBe(
      "https://test.invalid/gallery.jpg",
    );
  });

  it("reports no cuisine for an empty cuisine list", async () => {
    featuredFindMany.mockResolvedValue([
      featuredRow({
        location: {
          ...featuredRow().location,
          restaurantProfile: { cuisineTypes: [] },
        },
      }),
    ]);

    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.body.featured[0].cuisine).toBeNull();
  });

  it("attaches the rounded rating and review count", async () => {
    featuredFindMany.mockResolvedValue([featuredRow()]);
    reviewGroupBy.mockResolvedValue([
      { locationId: "loc-1", _avg: { rating: 4.26 }, _count: { _all: 7 } },
    ]);

    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.body.featured[0].rating).toBe(4.3);
    expect(res.body.featured[0].reviewCount).toBe(7);
  });

  it("reports no rating when the aggregate is empty", async () => {
    featuredFindMany.mockResolvedValue([featuredRow()]);
    reviewGroupBy.mockResolvedValue([
      { locationId: "loc-1", _avg: { rating: null }, _count: { _all: 0 } },
    ]);

    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.body.featured[0].rating).toBeNull();
    expect(res.body.featured[0].reviewCount).toBe(0);
  });

  it("reports no rating for a location the aggregate skipped", async () => {
    featuredFindMany.mockResolvedValue([featuredRow()]);
    reviewGroupBy.mockResolvedValue([
      { locationId: "loc-other", _avg: { rating: 5 }, _count: { _all: 1 } },
    ]);

    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.body.featured[0].rating).toBeNull();
    expect(res.body.featured[0].reviewCount).toBe(0);
  });

  it("reports a server error without leaking the cause", async () => {
    featuredFindMany.mockRejectedValue(new Error("db down"));

    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: "Failed to load featured restaurants.",
    });
  });

  it("survives a rejection that carries no message", async () => {
    featuredFindMany.mockRejectedValue("db exploded");

    const res = await featuredApp().get("/api/featured-restaurants");

    expect(res.status).toBe(500);
    expect((console.error as any).mock.calls[0][1]).toBe("db exploded");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { signJwt } from "../../server/lib/auth.js";

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const locationFindUnique = vi.fn();
const locationFindMany = vi.fn();
const businessFindUnique = vi.fn();
const businessFindMany = vi.fn();
const reviewFindMany = vi.fn();
const reviewFindFirst = vi.fn();
const reviewUpdate = vi.fn();
const reviewDelete = vi.fn();
const reviewAggregate = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      user: { findUnique: userFindUnique, update: userUpdate },
      location: { findUnique: locationFindUnique, findMany: locationFindMany },
      business: {
        findUnique: businessFindUnique,
        findMany: businessFindMany,
      },
      review: {
        findMany: reviewFindMany,
        findFirst: reviewFindFirst,
        update: reviewUpdate,
        delete: reviewDelete,
        aggregate: reviewAggregate,
      },
    },
  };
});

const authRouter = (await import("../../server/routes/auth.js")).default;

const ORIGINAL_ENV = { ...process.env };
const LOC = "0123456789abcdef01234567";
const REVIEW = "76543210fedcba9876543210";

function app() {
  const server = express();
  server.use(cookieParser());
  server.use(express.json());
  server.use("/auth", authRouter);
  return supertest(server);
}

function cookie(id = "cust-1"): string {
  return `sp_auth_customer=${signJwt({ sub: id, accountType: "customer", name: "Ada" })}`;
}

function customerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cust-1",
    name: "Ada Lovelace",
    email: "ada@test.invalid",
    username: "ada",
    phone: "+15550000000",
    upcomingReservations: [],
    pastReservations: [],
    queueingActivity: [],
    savedRestaurants: [],
    createdAt: new Date(),
    ...overrides,
  };
}

function locationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LOC,
    businessId: "biz-1",
    name: "Bistro Downtown",
    displayName: "Downtown",
    area: "Kemang",
    city: "Jakarta",
    address: "1 Test Street",
    bannerImageUrl: "https://test.invalid/banner.jpg",
    restaurantProfile: {},
    photos: [],
    ...overrides,
  };
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REVIEW,
    locationId: LOC,
    customerId: "cust-1",
    rating: 4,
    description: "Great service.",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function saveLocation() {
  return app().post("/auth/me/saved-locations").set("Cookie", cookie()).send({ locationId: LOC });
}

function savedEntry(res: any) {
  return res.body.user.savedRestaurants[0];
}

beforeEach(() => {
  process.env.JWT_SECRET = "unit-test-jwt-secret";
  userFindUnique.mockReset().mockImplementation(async () => {
    return customerRow();
  });
  userUpdate.mockReset().mockImplementation(async ({ data }) => {
    return customerRow(data);
  });
  locationFindUnique.mockReset().mockResolvedValue(locationRow());
  locationFindMany.mockReset().mockResolvedValue([]);
  businessFindUnique.mockReset().mockResolvedValue({ name: "Bistro", username: "bistro" });
  businessFindMany.mockReset().mockResolvedValue([]);
  reviewFindMany.mockReset().mockResolvedValue([]);
  reviewFindFirst.mockReset().mockResolvedValue({ id: REVIEW });
  reviewUpdate.mockReset().mockResolvedValue(reviewRow());
  reviewDelete.mockReset().mockResolvedValue({});
  reviewAggregate.mockReset().mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("saved restaurants", () => {
  it("keeps only the optional details that carry text", async () => {
    const res = await app().post("/auth/me/saved-restaurants").set("Cookie", cookie()).send({
      businessUsername: " bistro ",
      businessName: "  Bistro  ",
      locationName: "   ",
      area: 7,
      city: "Jakarta",
    });

    const saved = savedEntry(res);
    expect(saved.businessUsername).toBe("bistro");
    expect(saved.businessName).toBe("Bistro");
    expect(saved.locationName).toBeUndefined();
    expect(saved.area).toBeUndefined();
    expect(saved.city).toBe("Jakarta");
  });

  it("reports a missing customer", async () => {
    userFindUnique.mockResolvedValue(null);

    const res = await app()
      .post("/auth/me/saved-restaurants")
      .set("Cookie", cookie())
      .send({ businessUsername: "bistro" });

    expect(res.status).toBe(404);
  });

  it("tolerates a saved list of the wrong shape", async () => {
    userFindUnique.mockResolvedValue(customerRow({ savedRestaurants: "not a list" }));

    const res = await app()
      .post("/auth/me/saved-restaurants")
      .set("Cookie", cookie())
      .send({ businessUsername: "bistro" });

    expect(res.status).toBe(200);
  });

  it("reports a server error while saving and removing", async () => {
    userUpdate.mockRejectedValue(new Error("db down"));

    const save = await app()
      .post("/auth/me/saved-restaurants")
      .set("Cookie", cookie())
      .send({ businessUsername: "bistro" });
    const remove = await app().delete("/auth/me/saved-restaurants/bistro").set("Cookie", cookie());

    expect(save.status).toBe(500);
    expect(remove.status).toBe(500);
  });

  it("requires a business username to remove", async () => {
    const res = await app().delete("/auth/me/saved-restaurants/%20").set("Cookie", cookie());

    expect(res.status).toBe(400);
  });

  it("reports a missing customer on remove", async () => {
    userFindUnique.mockResolvedValue(null);

    const res = await app().delete("/auth/me/saved-restaurants/bistro").set("Cookie", cookie());

    expect(res.status).toBe(404);
  });

  it("tolerates a saved list of the wrong shape on remove", async () => {
    userFindUnique.mockResolvedValue(customerRow({ savedRestaurants: null }));

    const res = await app().delete("/auth/me/saved-restaurants/bistro").set("Cookie", cookie());

    expect(res.status).toBe(200);
  });
});

describe("saved locations", () => {
  it("prefers the profile fields", async () => {
    locationFindUnique.mockResolvedValue(
      locationRow({
        restaurantProfile: {
          displayName: "Warung Nusantara",
          shortAddress: "Kemang Raya 1",
          cuisineTypes: ["Indonesian", "Padang"],
        },
      }),
    );
    reviewAggregate.mockResolvedValue({
      _avg: { rating: 4.26 },
      _count: { _all: 7 },
    });

    const saved = savedEntry(await saveLocation());

    expect(saved.name).toBe("Warung Nusantara");
    expect(saved.locationName).toBe("Kemang Raya 1");
    expect(saved.cuisine).toBe("Indonesian");
    expect(saved.rating).toBe(4.3);
  });

  it("falls back through the business and location names", async () => {
    locationFindUnique.mockResolvedValue(locationRow());

    const saved = savedEntry(await saveLocation());

    expect(saved.name).toBe("Bistro");
    expect(saved.locationName).toBe("Downtown");
  });

  it("falls back to the location name then a generic label", async () => {
    businessFindUnique.mockResolvedValue(null);
    locationFindUnique.mockResolvedValue(
      locationRow({ displayName: null, area: null, city: null }),
    );
    const named = savedEntry(await saveLocation());
    expect(named.name).toBe("Bistro Downtown");
    expect(named.locationName).toBeNull();

    locationFindUnique.mockResolvedValue(
      locationRow({ displayName: null, name: null, area: null, city: null }),
    );
    const generic = savedEntry(await saveLocation());
    expect(generic.name).toBe("Restaurant");
    expect(generic.businessUsername).toBeNull();
    expect(generic.businessName).toBeNull();
  });

  it("falls back to the area then the city for the label", async () => {
    locationFindUnique.mockResolvedValue(locationRow({ displayName: null }));
    expect(savedEntry(await saveLocation()).locationName).toBe("Kemang");

    locationFindUnique.mockResolvedValue(locationRow({ displayName: null, area: null }));
    expect(savedEntry(await saveLocation()).locationName).toBe("Jakarta");
  });

  it("falls back to the first gallery photo", async () => {
    locationFindUnique.mockResolvedValue(
      locationRow({
        bannerImageUrl: null,
        photos: [{ url: "https://test.invalid/gallery.jpg" }],
      }),
    );

    expect(savedEntry(await saveLocation()).imageUrl).toBe("https://test.invalid/gallery.jpg");
  });

  it("reports no image when there is neither a banner nor a photo", async () => {
    locationFindUnique.mockResolvedValue(locationRow({ bannerImageUrl: null, photos: [] }));

    expect(savedEntry(await saveLocation()).imageUrl).toBeNull();
  });

  it("reports no cuisine for an empty or missing list", async () => {
    locationFindUnique.mockResolvedValue(locationRow({ restaurantProfile: { cuisineTypes: [] } }));
    expect(savedEntry(await saveLocation()).cuisine).toBeNull();

    locationFindUnique.mockResolvedValue(locationRow({ restaurantProfile: null }));
    expect(savedEntry(await saveLocation()).cuisine).toBeNull();
  });

  it("reports no rating when the aggregate is empty", async () => {
    reviewAggregate.mockResolvedValue({
      _avg: { rating: null },
      _count: { _all: 3 },
    });

    expect(savedEntry(await saveLocation()).rating).toBeNull();
  });

  it("reports a missing customer", async () => {
    userFindUnique.mockResolvedValue(null);

    const res = await saveLocation();

    expect(res.status).toBe(404);
  });

  it("tolerates a saved list of the wrong shape", async () => {
    userFindUnique.mockResolvedValue(customerRow({ savedRestaurants: "not a list" }));

    expect((await saveLocation()).status).toBe(200);
  });

  it("reports a server error while saving", async () => {
    userUpdate.mockRejectedValue(new Error("db down"));

    expect((await saveLocation()).status).toBe(500);
  });

  it("reports a server error while reading the saved flag", async () => {
    userFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app().get(`/auth/me/saved-locations/${LOC}`).set("Cookie", cookie());

    expect(res.status).toBe(500);
  });

  it("reports not saved when the customer is gone", async () => {
    userFindUnique.mockResolvedValue(null);

    const res = await app().get(`/auth/me/saved-locations/${LOC}`).set("Cookie", cookie());

    expect(res.body.saved).toBe(false);
  });

  it("matches a saved entry stored under either key", async () => {
    userFindUnique.mockResolvedValue(customerRow({ savedRestaurants: [{ id: LOC }] }));
    const byId = await app().get(`/auth/me/saved-locations/${LOC}`).set("Cookie", cookie());

    userFindUnique.mockResolvedValue(customerRow({ savedRestaurants: [{ locationId: LOC }] }));
    const byLocationId = await app().get(`/auth/me/saved-locations/${LOC}`).set("Cookie", cookie());

    expect(byId.body.saved).toBe(true);
    expect(byLocationId.body.saved).toBe(true);
  });

  it("reports a missing customer on remove", async () => {
    userFindUnique.mockResolvedValue(null);

    const res = await app().delete(`/auth/me/saved-locations/${LOC}`).set("Cookie", cookie());

    expect(res.status).toBe(404);
  });

  it("reports a server error on remove", async () => {
    userUpdate.mockRejectedValue(new Error("db down"));

    const res = await app().delete(`/auth/me/saved-locations/${LOC}`).set("Cookie", cookie());

    expect(res.status).toBe(500);
  });
});

describe("customer reviews", () => {
  it("prefers the profile name and short address", async () => {
    reviewFindMany.mockResolvedValue([reviewRow()]);
    locationFindUnique.mockResolvedValue(
      locationRow({
        restaurantProfile: {
          displayName: "Warung Nusantara",
          shortAddress: "Kemang Raya 1",
        },
      }),
    );

    const res = await app().get("/auth/me/reviews").set("Cookie", cookie());

    expect(res.body.reviews[0].restaurantName).toBe("Warung Nusantara");
    expect(res.body.reviews[0].locationName).toBe("Kemang Raya 1");
    expect(res.body.reviews[0].businessUsername).toBe("bistro");
  });

  it("falls back through the business and location labels", async () => {
    reviewFindMany.mockResolvedValue([reviewRow()]);
    businessFindUnique.mockResolvedValue(null);
    locationFindUnique.mockResolvedValue(
      locationRow({ displayName: null, area: null, city: null }),
    );

    const res = await app().get("/auth/me/reviews").set("Cookie", cookie());

    expect(res.body.reviews[0].restaurantName).toBe("Bistro Downtown");
    expect(res.body.reviews[0].locationName).toBe("1 Test Street");
    expect(res.body.reviews[0].businessUsername).toBeNull();
  });

  it("falls back to a generic name when the location is gone", async () => {
    reviewFindMany.mockResolvedValue([reviewRow()]);
    locationFindUnique.mockResolvedValue(null);

    const res = await app().get("/auth/me/reviews").set("Cookie", cookie());

    expect(res.body.reviews[0].restaurantName).toBe("Restaurant");
    expect(res.body.reviews[0].locationName).toBeNull();
    expect(businessFindUnique).not.toHaveBeenCalled();
  });

  it("defaults a rating that is not a number", async () => {
    reviewFindMany.mockResolvedValue([
      reviewRow({ rating: null, description: null, businessReply: null }),
    ]);

    const res = await app().get("/auth/me/reviews").set("Cookie", cookie());

    expect(res.body.reviews[0].rating).toBe(0);
    expect(res.body.reviews[0].description).toBeNull();
    expect(res.body.reviews[0].businessReply).toBeNull();
    expect(res.body.reviews[0].businessReplyCreatedAt).toBeNull();
  });

  it("keeps only the newest review per location", async () => {
    reviewFindMany.mockResolvedValue([
      reviewRow({ id: "r1" }),
      reviewRow({ id: "r2" }),
      reviewRow({ id: "r3", locationId: "loc-2" }),
    ]);

    const res = await app().get("/auth/me/reviews").set("Cookie", cookie());

    expect(res.body.reviews).toHaveLength(2);
    expect(res.body.reviews[0].id).toBe("r1");
  });

  it("reports a server error while listing", async () => {
    reviewFindMany.mockRejectedValue(new Error("db down"));

    const res = await app().get("/auth/me/reviews").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });

  it("reports a server error while updating and deleting", async () => {
    reviewUpdate.mockRejectedValue(new Error("db down"));
    reviewDelete.mockRejectedValue(new Error("db down"));

    const patch = await app()
      .patch(`/auth/me/reviews/${REVIEW}`)
      .set("Cookie", cookie())
      .send({ rating: 3 });
    const remove = await app().delete(`/auth/me/reviews/${REVIEW}`).set("Cookie", cookie());

    expect(patch.status).toBe(500);
    expect(remove.status).toBe(500);
  });
});

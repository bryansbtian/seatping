import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signJwt } from "../../server/lib/auth.js";
import adminRouter from "../../server/routes/admin.js";
import featuredRouter from "../../server/routes/featured.js";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  aggregate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  business: vi.fn(),
  location: vi.fn(),
  reviews: vi.fn(),
}));

vi.mock("../../server/lib/prisma.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
    featuredRestaurant: { findMany: mocks.findMany },
    review: { groupBy: mocks.reviews },
  },
}));

const tx = {
  $executeRaw: mocks.lock,
  featuredRestaurant: {
    findMany: mocks.findMany,
    findUnique: mocks.findUnique,
    aggregate: mocks.aggregate,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.remove,
  },
  business: { findUnique: mocks.business },
  location: { findUnique: mocks.location },
};

const app = express()
  .use(express.json())
  .use(cookieParser())
  .use("/admin", adminRouter)
  .use("/api/featured-restaurants", featuredRouter);
const firstId = "featured-one";
const secondId = "featured-two";
const thirdId = "featured-three";
const businessId = "business-one";
const locationId = "location-one";
const savedOrder = [{ sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }];

function row(id = firstId, sortOrder = 0, isActive = true) {
  return {
    id,
    businessId,
    locationId,
    sortOrder,
    isActive,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    business: {
      id: businessId,
      username: "example",
      name: "Example Restaurant",
      email: "operator@example.test",
      password: "private-fixture",
    },
    location: {
      id: locationId,
      displayName: "Downtown",
      name: "Downtown",
      address: "1 Example Street",
      area: "Central",
      city: "Jakarta",
      restaurantProfile: {},
      photos: [],
    },
  };
}

function adminCookie() {
  return `sp_auth_admin=${signJwt({ accountType: "admin", sub: "admin-featured-fixture" })}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_USERNAME", "test-admin");
  vi.stubEnv("ADMIN_PASSWORD_HASH", "test-only-hash");
  mocks.transaction.mockImplementation(async (work: (client: typeof tx) => Promise<unknown>) => {
    return work(tx);
  });
  mocks.lock.mockResolvedValue(1);
  mocks.findMany.mockResolvedValue([]);
  mocks.findUnique.mockResolvedValue(null);
  mocks.aggregate.mockResolvedValue({ _max: { sortOrder: 8 } });
  mocks.business.mockResolvedValue({ id: businessId });
  mocks.location.mockResolvedValue({ id: locationId, businessId });
  mocks.create.mockResolvedValue(row(firstId, 9));
  mocks.update.mockResolvedValue(row());
  mocks.remove.mockResolvedValue(row());
  mocks.reviews.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Featured Restaurant Authorization", () => {
  it.each(["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH"])(
    "fails closed when %s is missing",
    async (key) => {
      vi.stubEnv(key, "");
      const cookie = adminCookie();
      const responses = await Promise.all([
        request(app).get("/admin/featured-restaurants").set("Cookie", cookie),
        request(app)
          .post("/admin/featured-restaurants")
          .set("Cookie", cookie)
          .send({ businessId, locationId }),
        request(app)
          .patch("/admin/featured-restaurants/reorder")
          .set("Cookie", cookie)
          .send({ ids: [firstId] }),
        request(app)
          .patch(`/admin/featured-restaurants/${firstId}`)
          .set("Cookie", cookie)
          .send({ isActive: false }),
        request(app).delete(`/admin/featured-restaurants/${firstId}`).set("Cookie", cookie),
      ]);
      expect(responses.map((response) => response.status)).toEqual([503, 503, 503, 503, 503]);
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it.each(["anonymous", "business", "customer"])(
    "rejects %s sessions for every mutation",
    async (account) => {
      let cookie = "";
      if (account === "business") {
        cookie = `sp_auth_business=${signJwt({ accountType: "business", sub: businessId })}`;
      }
      if (account === "customer") {
        cookie = `sp_auth_customer=${signJwt({ accountType: "customer", sub: "customer-one" })}`;
      }
      const responses = await Promise.all([
        request(app)
          .post("/admin/featured-restaurants")
          .set("Cookie", cookie)
          .send({ businessId, locationId }),
        request(app)
          .patch("/admin/featured-restaurants/reorder")
          .set("Cookie", cookie)
          .send({ ids: [firstId] }),
        request(app)
          .patch(`/admin/featured-restaurants/${firstId}`)
          .set("Cookie", cookie)
          .send({ isActive: false }),
        request(app).delete(`/admin/featured-restaurants/${firstId}`).set("Cookie", cookie),
      ]);
      expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
});

describe("Featured Restaurant Names", () => {
  it.each([
    [{ displayName: "Japanese Restaurant" }, "Japanese Restaurant"],
    [{ displayName: "  Japanese Restaurant  " }, "Japanese Restaurant"],
    [{ displayName: null }, "Example Restaurant"],
    [{ displayName: { private: "hidden" } }, "Example Restaurant"],
    [{}, "Example Restaurant"],
  ])("uses the public restaurant name and safely falls back for %j", async (profile, expected) => {
    const restaurant = row();
    restaurant.location.restaurantProfile = profile;
    mocks.findMany.mockResolvedValueOnce([restaurant]);
    const response = await request(app)
      .get("/admin/featured-restaurants")
      .set("Cookie", adminCookie());
    expect(response.status).toBe(200);
    expect(response.body.featured[0].name).toBe(expected);
    expect(response.body.featured[0].business.name).toBe("Example Restaurant");
    expect(response.body.featured[0].location.restaurantProfile).toBeUndefined();
  });
});

describe("Featured Restaurant Reordering", () => {
  it("persists every position, including inactive entries, inside one locked transaction", async () => {
    mocks.findMany
      .mockResolvedValueOnce([{ id: firstId }, { id: secondId }, { id: thirdId }])
      .mockResolvedValueOnce([row(secondId, 0, false), row(thirdId, 1), row(firstId, 2)]);
    const response = await request(app)
      .patch("/admin/featured-restaurants/reorder")
      .set("Cookie", adminCookie())
      .send({ ids: [secondId, thirdId, firstId] });
    expect(response.status).toBe(200);
    expect(response.body.featured.map((entry: { id: string }) => entry.id)).toEqual([
      secondId,
      thirdId,
      firstId,
    ]);
    expect(response.body.featured[0].isActive).toBe(false);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    expect(mocks.lock.mock.calls[0][0].join("")).toContain(
      "pg_advisory_xact_lock(hashtext('seatping.featured-restaurants'))",
    );
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findMany.mock.invocationCallOrder[0],
    );
    expect(mocks.update.mock.calls).toEqual([
      [{ where: { id: secondId }, data: { sortOrder: 0 } }],
      [{ where: { id: thirdId }, data: { sortOrder: 1 } }],
      [{ where: { id: firstId }, data: { sortOrder: 2 } }],
    ]);
    expect(mocks.findMany).toHaveBeenLastCalledWith({
      orderBy: savedOrder,
      include: { business: true, location: true },
    });
    expect(JSON.stringify(response.body)).not.toContain("private-fixture");
  });

  it.each([
    {},
    { ids: null },
    { ids: firstId },
    { ids: [123] },
    { ids: [{}] },
    { ids: ["short"] },
    { ids: [firstId, firstId] },
  ])("rejects malformed or duplicated ordering %j", async (body) => {
    const response = await request(app)
      .patch("/admin/featured-restaurants/reorder")
      .set("Cookie", adminCookie())
      .send(body);
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([[firstId], [firstId, "featured-unknown"], []])(
    "rejects stale membership without updating any positions: %j",
    async (...ids) => {
      mocks.findMany.mockResolvedValue([{ id: firstId }, { id: secondId }]);
      const response = await request(app)
        .patch("/admin/featured-restaurants/reorder")
        .set("Cookie", adminCookie())
        .send({ ids });
      expect(response.status).toBe(409);
      expect(response.body.error).toContain("Refresh the list");
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it("allows an empty order only when the featured list is empty", async () => {
    const response = await request(app)
      .patch("/admin/featured-restaurants/reorder")
      .set("Cookie", adminCookie())
      .send({ ids: [] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ featured: [] });
  });

  it("rejects the transaction if any individual position update fails", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: firstId }, { id: secondId }]);
    mocks.update
      .mockResolvedValueOnce(row())
      .mockRejectedValueOnce(new Error("database-private-reason"));
    const response = await request(app)
      .patch("/admin/featured-restaurants/reorder")
      .set("Cookie", adminCookie())
      .send({ ids: [secondId, firstId] });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Internal server error" });
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("Featured Restaurant Mutations", () => {
  it("appends new restaurants after the largest saved order and defaults to active", async () => {
    const response = await request(app)
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send({ businessId, locationId });
    expect(response.status).toBe(200);
    expect(mocks.aggregate).toHaveBeenCalledWith({ _max: { sortOrder: true } });
    expect(mocks.create).toHaveBeenCalledWith({
      data: { businessId, locationId, sortOrder: 9, isActive: true },
      include: { business: true, location: true },
    });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.aggregate.mock.invocationCallOrder[0],
    );
  });

  it("starts the first saved restaurant at zero", async () => {
    mocks.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    await request(app)
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send({ businessId, locationId });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { businessId, locationId, sortOrder: 0, isActive: true } }),
    );
  });

  it("preserves explicit numerical API ordering and inactive creation", async () => {
    await request(app)
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send({ businessId, locationId, sortOrder: 4.8, isActive: false });
    expect(mocks.aggregate).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { businessId, locationId, sortOrder: 4, isActive: false } }),
    );
  });

  it.each([
    [{ businessId: "invalid", locationId }, 400],
    [{ businessId, locationId: "invalid" }, 400],
    [{ businessId, locationId, isActive: "yes" }, 400],
    [{ businessId, locationId, sortOrder: "1" }, 400],
  ])("validates new entries before opening a transaction: %j", async (body, status) => {
    const response = await request(app)
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send(body);
    expect(response.status).toBe(status);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects missing businesses and locations", async () => {
    mocks.business.mockResolvedValueOnce(null);
    const noBusiness = await request(app)
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send({ businessId, locationId });
    expect(noBusiness.status).toBe(404);
    mocks.location.mockResolvedValueOnce(null);
    const noLocation = await request(app)
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send({ businessId, locationId });
    expect(noLocation.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("enforces location ownership and existing featured membership", async () => {
    mocks.location.mockResolvedValueOnce({ id: locationId, businessId: "another-business" });
    const wrongOwner = await request(app)
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send({ businessId, locationId });
    expect(wrongOwner.status).toBe(400);
    mocks.findUnique.mockResolvedValueOnce({ id: firstId });
    const duplicate = await request(app)
      .post("/admin/featured-restaurants")
      .set("Cookie", adminCookie())
      .send({ businessId, locationId });
    expect(duplicate.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves active changes without changing order and shares the reorder lock", async () => {
    mocks.findUnique.mockResolvedValue({ id: firstId });
    const response = await request(app)
      .patch(`/admin/featured-restaurants/${firstId}`)
      .set("Cookie", adminCookie())
      .send({ isActive: false });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: firstId },
      data: { isActive: false },
      include: { business: true, location: true },
    });
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0],
    );
  });

  it("retains legacy per-entry sort updates", async () => {
    mocks.findUnique.mockResolvedValue({ id: firstId });
    const response = await request(app)
      .patch(`/admin/featured-restaurants/${firstId}`)
      .set("Cookie", adminCookie())
      .send({ sortOrder: 5.9 });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { sortOrder: 5 } }));
  });

  it("removes entries under the same ordering lock", async () => {
    mocks.findUnique.mockResolvedValue({ id: firstId });
    const response = await request(app)
      .delete(`/admin/featured-restaurants/${firstId}`)
      .set("Cookie", adminCookie());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: firstId } });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.remove.mock.invocationCallOrder[0],
    );
  });

  it("keeps missing updates and removals distinct from successful actions", async () => {
    const updated = await request(app)
      .patch(`/admin/featured-restaurants/${firstId}`)
      .set("Cookie", adminCookie())
      .send({ isActive: false });
    const removed = await request(app)
      .delete(`/admin/featured-restaurants/${firstId}`)
      .set("Cookie", adminCookie());
    expect(updated.status).toBe(404);
    expect(removed.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each([{ code: "P2002" }, { code: "P2003" }, { code: "P2025" }])(
    "returns a conflict for concurrent membership changes: %j",
    async (error) => {
      mocks.transaction.mockRejectedValue(error);
      const response = await request(app)
        .post("/admin/featured-restaurants")
        .set("Cookie", adminCookie())
        .send({ businessId, locationId });
      expect(response.status).toBe(409);
    },
  );
});

describe("Featured Restaurant Listing", () => {
  it("returns the saved deterministic order in the admin list", async () => {
    mocks.findMany.mockResolvedValue([row(secondId, 0), row(firstId, 1)]);
    const response = await request(app)
      .get("/admin/featured-restaurants")
      .set("Cookie", adminCookie());
    expect(response.status).toBe(200);
    expect(response.body.featured.map((entry: { id: string }) => entry.id)).toEqual([
      secondId,
      firstId,
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: savedOrder,
      include: { business: true, location: true },
    });
  });

  it("requests only active entries in the identical saved order for the homepage", async () => {
    mocks.findMany.mockResolvedValue([row(secondId, 0), row(firstId, 1)]);
    const response = await request(app).get("/api/featured-restaurants");
    expect(response.status).toBe(200);
    expect(response.body.featured.map((entry: { id: string }) => entry.id)).toEqual([
      secondId,
      firstId,
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true }, orderBy: savedOrder }),
    );
  });
});

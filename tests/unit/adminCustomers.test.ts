import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signJwt } from "../../server/lib/auth.js";
import router from "../../server/routes/adminCustomers.js";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() }));

vi.mock("../../server/lib/prisma.js", () => ({
  prisma: {
    business: { findMany: mocks.findMany, count: mocks.count },
    location: { groupBy: mocks.groupBy },
  },
}));

const app = express().use(cookieParser()).use("/admin/customer", router);
const account = {
  id: "business-1",
  name: "Example",
  username: "example",
  email: "operator@example.test",
  phone: "+12025550123",
  trial: true,
  maxLocations: 2,
  baseCredits: 300,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function adminCookie() {
  return `sp_auth_admin=${signJwt({ accountType: "admin", sub: "admin-fixture" })}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_USERNAME", "test-admin");
  vi.stubEnv("ADMIN_PASSWORD_HASH", "test-only-hash");
  mocks.findMany.mockResolvedValue([account]);
  mocks.count.mockResolvedValue(26);
  mocks.groupBy.mockResolvedValue([{ businessId: account.id, _count: { _all: 2 } }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Admin Account Listing", () => {
  it("requires a separate admin cookie", async () => {
    const unauthenticated = await request(app).get("/admin/customer");
    const business = await request(app)
      .get("/admin/customer")
      .set(
        "Cookie",
        `sp_auth_business=${signJwt({ accountType: "business", sub: "business-fixture" })}`,
      );
    expect(unauthenticated.status).toBe(401);
    expect(business.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it.each(["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH"])(
    "fails closed when %s is missing",
    async (key) => {
      vi.stubEnv(key, "");
      const response = await request(app).get("/admin/customer").set("Cookie", adminCookie());
      expect(response.status).toBe(503);
      expect(mocks.findMany).not.toHaveBeenCalled();
    },
  );

  it("returns paginated safe account fields and batches location counts", async () => {
    const response = await request(app).get("/admin/customer?page=2").set("Cookie", adminCookie());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      customers: [{ ...account, createdAt: account.createdAt.toISOString(), locationCount: 2 }],
      total: 26,
      page: 2,
      pageSize: 25,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
    );
    const selection = mocks.findMany.mock.calls[0][0].select;
    expect(Object.keys(selection)).toEqual([
      "id",
      "name",
      "username",
      "email",
      "phone",
      "trial",
      "maxLocations",
      "baseCredits",
      "createdAt",
    ]);
    expect(mocks.groupBy).toHaveBeenCalledWith({
      by: ["businessId"],
      where: { businessId: { in: [account.id] } },
      _count: { _all: true },
    });
  });

  it("searches all contact and identity fields while applying access and stable ordering", async () => {
    await request(app)
      .get("/admin/customer?search=%20DINNER%20&access=paid&sort=name")
      .set("Cookie", adminCookie());
    const query = mocks.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      trial: false,
      OR: ["name", "username", "email", "phone"].map((field) => ({
        [field]: { contains: "DINNER", mode: "insensitive" },
      })),
    });
    expect(query.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
    expect(mocks.count).toHaveBeenCalledWith({ where: query.where });
    await request(app).get("/admin/customer?access=trial&sort=oldest").set("Cookie", adminCookie());
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { trial: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    );
  });

  it.each([
    "page=0",
    "page=-1",
    "page=1.5",
    "page=1000001",
    "page=x",
    "search=one&search=two",
    "access=unknown",
    "sort=unknown",
    `search=${"x".repeat(201)}`,
  ])("rejects invalid input %s", async (query) => {
    const response = await request(app)
      .get(`/admin/customer?${query}`)
      .set("Cookie", adminCookie());
    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("handles empty pages without a location query", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    const response = await request(app).get("/admin/customer").set("Cookie", adminCookie());
    expect(response.status).toBe(200);
    expect(response.body.customers).toEqual([]);
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });

  it("does not expose database failure details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findMany.mockRejectedValue(new Error("Database unavailable"));
    const response = await request(app).get("/admin/customer").set("Cookie", adminCookie());
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Unable to load business accounts" });
  });
});

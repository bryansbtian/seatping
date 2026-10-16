import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/prisma.js", () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock("../../server/lib/restaurantCollation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/restaurantCollation.js")>();
  return {
    ...actual,
    loadRestaurantCollation: () => Promise.resolve(actual.restaurantCollationSql(null)),
  };
});
const searchRouter = (await import("../../server/routes/search.js")).default;
let ipCounter = 0;

function searchApp() {
  const app = express();
  app.use("/api/search", searchRouter);
  return supertest(app);
}

async function search(extra = "") {
  ipCounter++;
  return searchApp()
    .get(`/api/search/restaurants?${extra}`)
    .set("X-Forwarded-For", `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`);
}

beforeEach(() => {
  queryRaw.mockReset().mockResolvedValue([
    {
      total: 21,
      results: [{ locationId: "public" }],
      facets: { cuisines: ["Thai"], locations: ["City"] },
    },
  ]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("database-backed restaurant search route", () => {
  it("preserves the legacy response without pagination fields", async () => {
    const response = await search("query=restaurant");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      query: "restaurant",
      results: [{ locationId: "public", openNow: null }],
      total: 21,
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("returns fixed ten-result pagination metadata and global facets for version two", async () => {
    const response = await search("version=2&page=2&limit=1");
    expect(response.body).toEqual({
      query: "",
      results: [{ locationId: "public", openNow: null }],
      total: 21,
      page: 2,
      limit: 10,
      hasMore: true,
      totalPages: 3,
      facets: { cuisines: ["Thai"], locations: ["City"] },
    });
    expect(queryRaw.mock.calls[0][0].values).toContain(10);
  });

  it("retains optional legacy limits", async () => {
    const response = await search("limit=2&page=11");
    expect(response.body).toMatchObject({ page: 11, limit: 2, hasMore: false });
  });

  it("returns safe empty metadata when no aggregate row is returned", async () => {
    queryRaw.mockResolvedValue([]);
    expect((await search("version=2")).body).toMatchObject({
      results: [],
      total: 0,
      totalPages: 0,
      hasMore: false,
      facets: { cuisines: [], locations: [] },
    });
  });

  it("does not leak query values, credentials, or database errors", async () => {
    queryRaw.mockRejectedValue(new Error("password=secret guest=private"));
    const response = await search("query=private");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Search failed." });
    expect(console.error).toHaveBeenCalledWith("[search] Failed to load restaurants.");
  });

  it("rate limits without doing more database work", async () => {
    const app = searchApp();
    for (let attempt = 0; attempt < 60; attempt++) {
      await app.get("/api/search/restaurants").set("X-Forwarded-For", "10.99.99.99");
    }
    const calls = queryRaw.mock.calls.length;
    const response = await app.get("/api/search/restaurants").set("X-Forwarded-For", "10.99.99.99");
    expect(response.status).toBe(429);
    expect(queryRaw).toHaveBeenCalledTimes(calls);
  });
});

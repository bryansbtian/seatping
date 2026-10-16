import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());

vi.mock("../../server/lib/prisma.js", () => ({ prisma: { $queryRaw: queryRaw } }));

beforeEach(() => {
  vi.resetModules();
  queryRaw.mockReset();
});

describe("restaurant Unicode collation", () => {
  it("shares capability detection across concurrent callers", async () => {
    queryRaw.mockResolvedValue([{ name: "und-x-icu" }]);
    const { loadRestaurantCollation } = await import("../../server/lib/restaurantCollation.js");
    const results = await Promise.all([loadRestaurantCollation(), loadRestaurantCollation()]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.sql)).toEqual([
      'pg_catalog."und-x-icu"',
      'pg_catalog."und-x-icu"',
    ]);
  });

  it("retries capability detection after a failed database read", async () => {
    queryRaw.mockRejectedValueOnce(new Error("temporary database failure"));
    queryRaw.mockResolvedValueOnce([{ name: "en-US-x-icu" }]);
    const { loadRestaurantCollation } = await import("../../server/lib/restaurantCollation.js");
    await expect(loadRestaurantCollation()).rejects.toThrow("temporary database failure");
    expect((await loadRestaurantCollation()).sql).toBe('pg_catalog."en-US-x-icu"');
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("uses the installed default when no supported ICU collation exists", async () => {
    queryRaw.mockResolvedValue([]);
    const { loadRestaurantCollation } = await import("../../server/lib/restaurantCollation.js");
    expect((await loadRestaurantCollation()).sql).toBe('pg_catalog."default"');
  });

  it("emits only fixed SQL identifiers", async () => {
    const { restaurantCollationSql } = await import("../../server/lib/restaurantCollation.js");
    expect(restaurantCollationSql("en-x-icu").sql).toBe('pg_catalog."en-x-icu"');
    expect(restaurantCollationSql(null).sql).toBe('pg_catalog."default"');
  });
});

import { describe, expect, it } from "vitest";
import {
  buildRestaurantSearchQuery,
  restaurantOpenNow,
  restaurantSearchClocks,
  restaurantSearchOptions,
} from "../../server/lib/restaurantSearch.js";
import { restaurantSearchParams } from "../../shared/restaurantDiscovery.js";
import {
  EMPTY_FILTERS,
  filterSearchParams,
  filtersFromSearchParams,
  pageFromSearchParams,
  sortFromSearchParams,
} from "../../src/lib/restaurantDiscovery.js";

describe("restaurant discovery request contract", () => {
  it("fixes version two at ten and preserves legacy opt-in pagination", () => {
    expect(restaurantSearchOptions({ version: "2", limit: "100" })).toMatchObject({
      limit: 10,
      page: 1,
    });
    expect(restaurantSearchOptions({ limit: "1000", page: "3" })).toMatchObject({
      limit: 100,
      page: 3,
    });
    expect(restaurantSearchOptions({ limit: "0" }).limit).toBeNull();
    expect(restaurantSearchOptions({}).limit).toBeNull();
  });

  it.each(["0", "-1", "abc", "Infinity", "999999999999999999999"])(
    "rejects invalid page %s",
    (page) => {
      expect(restaurantSearchOptions({ page }).page).toBe(1);
      expect(pageFromSearchParams(new URLSearchParams({ page }))).toBe(1);
    },
  );

  it("accepts supported filters and ignores malformed structured inputs", () => {
    expect(
      restaurantSearchOptions({
        version: "2",
        query: "  Sushi  ",
        cuisine: "Japanese",
        price: "$$",
        minRating: "4.5",
        location: "City",
        queue: "true",
        reservation: "1",
        openNow: "1",
        sort: "reviews",
      }),
    ).toMatchObject({
      query: "Sushi",
      cuisine: ["Japanese"],
      price: ["$$"],
      minRating: [4.5],
      location: "City",
      queue: true,
      reservations: true,
      openNow: true,
      sort: "reviews",
    });
    expect(
      restaurantSearchOptions({ query: ["bad"], cuisine: {}, minRating: "6", sort: "SQL" }),
    ).toMatchObject({
      query: "",
      cuisine: [],
      minRating: [],
      sort: "recommended",
    });
  });

  it("round trips multiple selections and parameterizes alternatives within each filter group", () => {
    const filters = {
      ...EMPTY_FILTERS,
      cuisine: ["Japanese", "Italian"],
      price: ["$", "$$$"],
      minRating: [4, 4.5],
    };
    const params = filterSearchParams(new URLSearchParams("date=2027-01-01"), filters);
    expect(filtersFromSearchParams(params)).toEqual(filters);
    const request = restaurantSearchParams({
      query: "Dinner",
      page: 1,
      sort: "rating",
      ...filters,
    });
    expect(request.getAll("cuisine")).toEqual(filters.cuisine);
    expect(request.getAll("price")).toEqual(filters.price);
    expect(request.getAll("minRating")).toEqual(["4", "4.5"]);
    const options = restaurantSearchOptions({
      version: "2",
      cuisine: ["Japanese", "Italian", "Japanese", {}],
      price: ["$", "$$$"],
      minRating: ["4", "4.5", "bad", "6"],
    });
    expect(options).toMatchObject(filters);
    const statement = buildRestaurantSearchQuery(options);
    expect(statement.values).toEqual(
      expect.arrayContaining(["Japanese", "Italian", "$", "$$$", 4]),
    );
    expect(statement.sql).toContain(" IN (");
    expect(statement.sql).not.toContain("Japanese");
  });

  it("keeps literal wildcards and SQL payloads out of the query text", () => {
    const query = "%_\\あ'; DROP TABLE locations; --";
    const statement = buildRestaurantSearchQuery(
      restaurantSearchOptions({ version: "2", query, cuisine: query }),
    );
    expect(statement.sql).not.toContain(query);
    expect(statement.values).toContain(query);
    expect(statement.sql).toContain(
      'strpos(lower(field.value COLLATE pg_catalog."default"), lower(',
    );
    expect(statement.sql).toContain("LIMIT");
    expect(statement.sql).toContain("OFFSET");
  });

  it.each(["recommended", "rating", "reviews", "name-az", "name-za", "price-asc", "price-desc"])(
    "builds deterministic %s ordering",
    (sort) => {
      const statement = buildRestaurantSearchQuery(restaurantSearchOptions({ version: "2", sort }));
      expect(statement.sql).toContain('"createdAt" DESC, "locationId" ASC');
    },
  );

  it("round trips URL filters without changing booking selections and resets the page", () => {
    const original = new URLSearchParams({
      date: "2027-01-01",
      time: "19:00",
      partySize: "large",
      page: "4",
      sort: "rating",
    });
    const filters = {
      ...EMPTY_FILTERS,
      cuisine: ["A & B"],
      price: ["$$"],
      minRating: [4.5],
      queue: true,
    };
    const params = filterSearchParams(original, filters);
    expect(filtersFromSearchParams(params)).toEqual(filters);
    expect(params.get("page")).toBeNull();
    expect(params.get("date")).toBe("2027-01-01");
    expect(params.get("partySize")).toBe("large");
    expect(sortFromSearchParams(params)).toBe("rating");
    expect(
      restaurantSearchParams({ query: "日本", page: 2, sort: "rating", ...filters }).get("version"),
    ).toBe("2");
    expect(sortFromSearchParams(new URLSearchParams("sort=invalid"))).toBe("recommended");
  });
});

describe("opening-hours parity for paginated rows", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  it.each([
    [undefined, null],
    [null, null],
    ["closed", null],
    [[], false],
    [{ timezone: "UTC" }, false],
    [{ timezone: "UTC", monday: { enabled: false, open: "00:00", close: "23:59" } }, false],
    [{ timezone: "UTC", monday: { enabled: true, open: "9am", close: "10pm" } }, null],
    [{ timezone: "UTC", monday: { enabled: true, open: "00:00", close: "23:59" } }, true],
    [{ timezone: "UTC", monday: { enabled: true, open: "13:00", close: "14:00" } }, false],
    [{ timezone: "UTC", monday: { enabled: true, open: "00:00", close: "00:00" } }, true],
    [{ timezone: "UTC", monday: { enabled: true, open: "23:00", close: "13:00" } }, true],
    [{ timezone: "UTC", monday: { enabled: true, open: "13:00", close: "11:00" } }, false],
    [{ timezone: "Factory", monday: { enabled: true, open: "00:00", close: "00:00" } }, null],
    [{ timezone: "US/Eastern", monday: { enabled: true, open: "07:00", close: "09:00" } }, true],
    [{ timezone: "Asia/Calcutta", monday: { enabled: true, open: "17:00", close: "18:00" } }, true],
  ] as const)("preserves legacy semantics for %j", (hours, expected) => {
    expect(restaurantOpenNow(hours, now)).toBe(expected);
  });

  it("rejects invalid zones and supports case-insensitive zones and UTC offsets", () => {
    const clocks = restaurantSearchClocks(
      ["UTC", "UTC", "utc", "+01:00", "Invalid/Timezone", "Factory"],
      now,
    );
    expect(clocks).toEqual([
      { timezone: "UTC", weekday: "monday", time: "12:00" },
      { timezone: "utc", weekday: "monday", time: "12:00" },
      { timezone: "+01:00", weekday: "monday", time: "13:00" },
    ]);
  });
});

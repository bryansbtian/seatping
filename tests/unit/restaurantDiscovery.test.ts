import { describe, expect, it } from "vitest";
import {
  areaLabel,
  countActiveFilters,
  EMPTY_FILTERS,
  filterRestaurants,
  searchLocation,
  sortRestaurants,
} from "../../src/lib/restaurantDiscovery.js";
import { restaurant, SEARCH_RESTAURANTS } from "../helpers/searchRestaurants.js";

describe("restaurant discovery filters", () => {
  it.each([
    [{ cuisine: "Japanese" }, ["loc-1", "loc-3"]],
    [{ price: "$$$" }, ["loc-2"]],
    [{ minRating: 4.5 }, ["loc-1"]],
    [{ location: "Riverside" }, ["loc-2"]],
    [{ queue: true }, ["loc-1", "loc-3"]],
    [{ reservations: true }, ["loc-1", "loc-2"]],
    [{ openNow: true }, ["loc-1"]],
  ])("filters %j against actual result fields", (filter, ids) => {
    expect(
      filterRestaurants(SEARCH_RESTAURANTS, { ...EMPTY_FILTERS, ...filter }).map(
        ({ locationId }) => locationId,
      ),
    ).toEqual(ids);
  });

  it("combines filters and clears them without mutating results", () => {
    const filters = { ...EMPTY_FILTERS, cuisine: "Japanese", reservations: true, queue: true };
    expect(filterRestaurants(SEARCH_RESTAURANTS, filters)).toEqual([SEARCH_RESTAURANTS[0]]);
    expect(filterRestaurants(SEARCH_RESTAURANTS, EMPTY_FILTERS)).toEqual(SEARCH_RESTAURANTS);
    expect(SEARCH_RESTAURANTS).toHaveLength(3);
  });

  it("counts each selected filter once", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countActiveFilters({
        cuisine: "Japanese",
        price: "$$",
        minRating: 4.5,
        location: "Downtown",
        queue: true,
        reservations: true,
        openNow: true,
      }),
    ).toBe(7);
    expect(countActiveFilters({ ...EMPTY_FILTERS, minRating: 3.5, openNow: true })).toBe(2);
  });

  it("excludes unknown ratings, prices, cuisines, and hours from corresponding filters", () => {
    const missing = restaurant({ cuisine: null, priceRange: null, rating: null, openNow: null });
    for (const filter of [
      { cuisine: "Japanese" },
      { price: "$" },
      { minRating: 3.5 },
      { openNow: true },
    ]) {
      expect(filterRestaurants([missing], { ...EMPTY_FILTERS, ...filter })).toEqual([]);
    }
  });

  it("uses the established area, display name, and city fallbacks", () => {
    expect(areaLabel(restaurant({ area: null }))).toBe("Downtown");
    expect(areaLabel(restaurant({ area: null, locationDisplayName: null }))).toBe("Test City");
    expect(areaLabel(restaurant({ area: null, locationDisplayName: null, city: null }))).toBe("");
  });

  it("labels verified locations and avoids treating cuisine searches as cities", () => {
    expect(searchLocation(SEARCH_RESTAURANTS, "test city", EMPTY_FILTERS)).toBe("Test City");
    expect(searchLocation(SEARCH_RESTAURANTS, "Japanese", EMPTY_FILTERS)).toBe("");
    expect(
      searchLocation(SEARCH_RESTAURANTS, "", { ...EMPTY_FILTERS, location: "Riverside" }),
    ).toBe("Riverside");
  });
});

describe("restaurant discovery sorting", () => {
  it.each([
    ["recommended", ["loc-1", "loc-2", "loc-3"]],
    ["rating", ["loc-1", "loc-2", "loc-3"]],
    ["reviews", ["loc-2", "loc-1", "loc-3"]],
    ["name-az", ["loc-1", "loc-2", "loc-3"]],
    ["name-za", ["loc-3", "loc-2", "loc-1"]],
    ["price-asc", ["loc-3", "loc-1", "loc-2"]],
    ["price-desc", ["loc-2", "loc-1", "loc-3"]],
  ] as const)("sorts by %s", (sort, ids) => {
    expect(sortRestaurants(SEARCH_RESTAURANTS, sort).map(({ locationId }) => locationId)).toEqual(
      ids,
    );
    expect(SEARCH_RESTAURANTS[0].locationId).toBe("loc-1");
  });

  it("places unknown prices last in both price orders", () => {
    const missing = restaurant({ locationId: "missing", priceRange: null });
    for (const sort of ["price-asc", "price-desc"] as const) {
      expect(sortRestaurants([missing, ...SEARCH_RESTAURANTS], sort).at(-1)).toBe(missing);
    }
  });
});

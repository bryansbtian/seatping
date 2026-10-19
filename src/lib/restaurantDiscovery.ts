import type { RestaurantFilters, SearchResult, SortKey } from "@shared/restaurantDiscovery";
export type {
  RestaurantFilters,
  RestaurantSearchRequest,
  SearchFacets,
  SearchResponse,
  SearchResult,
  SortKey,
} from "@shared/restaurantDiscovery";
export { RESTAURANT_PAGE_SIZE, restaurantSearchParams } from "@shared/restaurantDiscovery";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "rating", label: "Highest Rated" },
  { key: "reviews", label: "Most Reviewed" },
  { key: "name-az", label: "Name A-Z" },
  { key: "name-za", label: "Name Z-A" },
  { key: "price-asc", label: "Price Low To High" },
  { key: "price-desc", label: "Price High To Low" },
];

export const PRICE_OPTIONS = ["$", "$$", "$$$", "$$$$"];
export const RATING_OPTIONS = [3.5, 4, 4.5];

export const EMPTY_FILTERS: RestaurantFilters = {
  cuisine: [],
  price: [],
  minRating: [],
  location: null,
  queue: false,
  reservations: false,
  openNow: false,
};

export function filtersFromSearchParams(params: URLSearchParams): RestaurantFilters {
  const minRating = Array.from(
    new Set(
      params
        .getAll("minRating")
        .filter(Boolean)
        .map(Number)
        .filter((rating) => Number.isFinite(rating) && rating >= 0 && rating <= 5),
    ),
  );
  const enabled = (name: string) => params.get(name) === "1" || params.get(name) === "true";
  return {
    cuisine: Array.from(new Set(params.getAll("cuisine").filter(Boolean))),
    price: Array.from(new Set(params.getAll("price").filter(Boolean))),
    location: params.get("location") || null,
    minRating,
    queue: enabled("queue"),
    reservations: enabled("reservations") || enabled("reservation"),
    openNow: enabled("openNow"),
  };
}

export function sortFromSearchParams(params: URLSearchParams): SortKey {
  return SORT_OPTIONS.find(({ key }) => key === params.get("sort"))?.key ?? "recommended";
}

export function pageFromSearchParams(params: URLSearchParams): number {
  const page = Number(params.get("page"));
  if (Number.isSafeInteger(page) && page >= 1 && page <= 2147483647) {
    return page;
  }
  return 1;
}

export function filterSearchParams(
  params: URLSearchParams,
  filters: RestaurantFilters,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("page");
  next.delete("reservation");
  for (const name of [
    "cuisine",
    "price",
    "location",
    "minRating",
    "queue",
    "reservations",
    "openNow",
  ] as const) {
    const value = filters[name];
    next.delete(name);
    if (Array.isArray(value)) {
      for (const selected of value) {
        next.append(name, String(selected));
      }
    } else if (value === true) {
      next.set(name, "1");
    } else if (typeof value === "string" && value) {
      next.set(name, value);
    }
  }
  return next;
}

export function areaLabel(restaurant: SearchResult): string {
  return restaurant.area || restaurant.locationDisplayName || restaurant.city || "";
}

export function countActiveFilters(filters: RestaurantFilters): number {
  return Object.values(filters).reduce<number>((count, value) => {
    if (Array.isArray(value)) {
      return count + value.length;
    }
    if (value !== null && value !== false) {
      return count + 1;
    }
    return count;
  }, 0);
}

export function filterRestaurants(
  results: SearchResult[],
  filters: RestaurantFilters,
): SearchResult[] {
  return results.filter((restaurant) => {
    if (
      filters.cuisine.length > 0 &&
      (!restaurant.cuisine || !filters.cuisine.includes(restaurant.cuisine))
    ) {
      return false;
    }
    if (
      filters.price.length > 0 &&
      (!restaurant.priceRange || !filters.price.includes(restaurant.priceRange))
    ) {
      return false;
    }
    if (
      filters.minRating.length > 0 &&
      (restaurant.rating === null || restaurant.rating < Math.min(...filters.minRating))
    ) {
      return false;
    }
    if (filters.location && areaLabel(restaurant) !== filters.location) {
      return false;
    }
    if (filters.queue && !restaurant.queueEnabled) {
      return false;
    }
    if (filters.reservations && !restaurant.reservationsEnabled) {
      return false;
    }
    if (filters.openNow && restaurant.openNow !== true) {
      return false;
    }
    return true;
  });
}

export function sortRestaurants(results: SearchResult[], sort: SortKey): SearchResult[] {
  return [...results].sort((a, b) => {
    switch (sort) {
      case "rating":
        return (b.rating ?? 0) - (a.rating ?? 0);
      case "reviews":
        return b.reviewCount - a.reviewCount;
      case "name-az":
        return a.name.localeCompare(b.name);
      case "name-za":
        return b.name.localeCompare(a.name);
      case "price-asc":
      case "price-desc": {
        if (!a.priceRange && !b.priceRange) {
          return 0;
        }
        if (!a.priceRange) {
          return 1;
        }
        if (!b.priceRange) {
          return -1;
        }
        if (sort === "price-desc") {
          return b.priceRange.length - a.priceRange.length;
        }
        return a.priceRange.length - b.priceRange.length;
      }
      default:
        return Number(b.featured) - Number(a.featured);
    }
  });
}

export function searchLocation(
  results: SearchResult[],
  query: string,
  filters: RestaurantFilters,
): string {
  if (filters.location) {
    return filters.location;
  }
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return "";
  }
  for (const restaurant of results) {
    for (const location of [restaurant.city, restaurant.area, restaurant.locationDisplayName]) {
      if (location?.toLocaleLowerCase() === normalized) {
        return location;
      }
    }
  }
  return "";
}

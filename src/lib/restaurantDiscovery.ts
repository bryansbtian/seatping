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
  cuisine: null,
  price: null,
  minRating: null,
  location: null,
  queue: false,
  reservations: false,
  openNow: false,
};

export function filtersFromSearchParams(params: URLSearchParams): RestaurantFilters {
  let minRating: number | null = null;
  const rating = Number(params.get("minRating"));
  if (params.has("minRating") && Number.isFinite(rating) && rating >= 0 && rating <= 5) {
    minRating = rating;
  }
  const enabled = (name: string) => params.get(name) === "1" || params.get(name) === "true";
  return {
    cuisine: params.get("cuisine") || null,
    price: params.get("price") || null,
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
    if (value !== null && value !== false && value !== "") {
      if (value === true) {
        next.set(name, "1");
      } else {
        next.set(name, String(value));
      }
    }
  }
  return next;
}

export function areaLabel(restaurant: SearchResult): string {
  return restaurant.area || restaurant.locationDisplayName || restaurant.city || "";
}

export function countActiveFilters(filters: RestaurantFilters): number {
  return Object.values(filters).filter((value) => value !== null && value !== false).length;
}

export function filterRestaurants(
  results: SearchResult[],
  filters: RestaurantFilters,
): SearchResult[] {
  return results.filter((restaurant) => {
    if (filters.cuisine && restaurant.cuisine !== filters.cuisine) {
      return false;
    }
    if (filters.price && restaurant.priceRange !== filters.price) {
      return false;
    }
    if (
      filters.minRating !== null &&
      (restaurant.rating === null || restaurant.rating < filters.minRating)
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

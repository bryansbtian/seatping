export const RESTAURANT_PAGE_SIZE = 10;

export type SearchResult = {
  locationId: string;
  businessUsername: string | null;
  businessName: string | null;
  name: string;
  shortAddress: string | null;
  description: string | null;
  tagline: string | null;
  cuisine: string | null;
  priceRange: string | null;
  address: string;
  area: string | null;
  city: string | null;
  bannerImageUrl: string | null;
  rating: number | null;
  reviewCount: number;
  queueEnabled: boolean;
  reservationsEnabled: boolean;
  openNow: boolean | null;
  locationDisplayName: string | null;
  featured: boolean;
};

export type SortKey =
  "recommended" | "rating" | "reviews" | "name-az" | "name-za" | "price-asc" | "price-desc";

export type RestaurantFilters = {
  cuisine: string[];
  price: string[];
  minRating: number[];
  location: string | null;
  queue: boolean;
  reservations: boolean;
  openNow: boolean;
};

export type RestaurantSearchRequest = RestaurantFilters & {
  query: string;
  page: number;
  sort: SortKey;
};

export type SearchFacets = { cuisines: string[]; locations: string[] };

export type SearchResponse = {
  query?: string;
  results: SearchResult[];
  total: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasMore?: boolean;
  facets?: SearchFacets;
};

export function restaurantSearchParams(request: RestaurantSearchRequest): URLSearchParams {
  const params = new URLSearchParams({ version: "2", page: String(request.page) });
  if (request.query) {
    params.set("query", request.query);
  }
  if (request.sort !== "recommended") {
    params.set("sort", request.sort);
  }
  for (const name of ["cuisine", "price", "minRating"] as const) {
    for (const value of request[name]) {
      params.append(name, String(value));
    }
  }
  if (request.location) {
    params.set("location", request.location);
  }
  for (const name of ["queue", "reservations", "openNow"] as const) {
    if (request[name]) {
      params.set(name, "1");
    }
  }
  return params;
}

import type { SearchResult } from "../../src/lib/restaurantDiscovery.js";

export function restaurant(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    locationId: "loc-1",
    businessUsername: "bistro",
    businessName: "Bistro",
    name: "Bistro Downtown",
    shortAddress: "Main Street",
    description: null,
    tagline: null,
    cuisine: "Japanese",
    priceRange: "$$",
    address: "1 Main Street",
    area: "Downtown",
    city: "Test City",
    bannerImageUrl: "/test-restaurant.jpg",
    rating: 4.7,
    reviewCount: 12,
    queueEnabled: true,
    reservationsEnabled: true,
    openNow: true,
    locationDisplayName: "Downtown",
    featured: true,
    ...overrides,
  };
}

export const SEARCH_RESTAURANTS = [
  restaurant(),
  restaurant({
    locationId: "loc-2",
    name: "Garden Bistro",
    cuisine: "Italian",
    priceRange: "$$$",
    area: "Riverside",
    shortAddress: "Riverside",
    rating: 4,
    reviewCount: 30,
    queueEnabled: false,
    openNow: false,
    featured: false,
  }),
  restaurant({
    locationId: "loc-3",
    name: "Local Kitchen",
    cuisine: "Japanese",
    priceRange: "$",
    rating: null,
    reviewCount: 0,
    reservationsEnabled: false,
    openNow: null,
    featured: false,
    bannerImageUrl: null,
  }),
];

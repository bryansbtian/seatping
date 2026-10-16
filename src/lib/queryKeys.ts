export const queryKeys = {
  session: ["private", "session"] as const,
  contact: (customerId: string | null) => ["private", "contact", customerId] as const,
  myReview: (customerId: string | null, locationId: string) =>
    ["private", "review", customerId, locationId] as const,
  search: (params: string) => ["public", "search", params] as const,
  suggestions: (query: string) => ["public", "suggestions", query] as const,
  profile: (username: string, locationId: string) =>
    ["public", "profile", username, locationId] as const,
  reviews: (username: string, locationId: string) =>
    ["public", "reviews", username, locationId] as const,
  featured: ["public", "featured"] as const,
  settings: (username: string, locationId: string) =>
    ["public", "booking-settings", username, locationId] as const,
  availability: (
    username: string,
    locationId: string,
    date: string,
    partySize: number | "larger",
  ) => ["public", "availability", username, locationId, date, partySize] as const,
};

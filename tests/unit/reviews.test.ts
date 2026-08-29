import { describe, expect, it } from "vitest";
import {
  chipCounts,
  filterByChip,
  filterByRange,
  formatReviewDate,
  restaurantNameOf,
  reviewInitials,
  sortReviews,
  summarizeReviews,
  visibleReviews,
  type Review,
} from "../../src/lib/reviews.js";

const NOW = new Date("2026-08-25T12:00:00.000Z");

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    customerName: "Bryan Susanto",
    rating: 5,
    description: "Great experience and quick service.",
    createdAt: "2026-08-25T12:00:00.000Z",
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("summarizeReviews", () => {
  it("reports an empty location with no average", () => {
    const summary = summarizeReviews([]);

    expect(summary.total).toBe(0);
    expect(summary.average).toBeNull();
    expect(summary.awaitingReply).toBe(0);
    expect(summary.distribution.map((bucket) => bucket.count)).toEqual([0, 0, 0, 0, 0]);
  });

  it("counts the total reviews", () => {
    const summary = summarizeReviews([review({ id: "a" }), review({ id: "b" })]);

    expect(summary.total).toBe(2);
  });

  it("averages the ratings to one decimal place", () => {
    const summary = summarizeReviews([
      review({ id: "a", rating: 5 }),
      review({ id: "b", rating: 4 }),
      review({ id: "c", rating: 5 }),
    ]);

    expect(summary.average).toBe(4.7);
  });

  it("counts the reviews still waiting on a reply", () => {
    const summary = summarizeReviews([
      review({ id: "a" }),
      review({ id: "b", businessReply: "Thank you" }),
      review({ id: "c" }),
    ]);

    expect(summary.awaitingReply).toBe(2);
  });

  it("matches the worked example from the brief", () => {
    const reviews: Review[] = [];
    const counts: Record<number, number> = { 5: 84, 4: 27, 3: 10, 2: 4, 1: 3 };
    let id = 0;
    for (const stars of [5, 4, 3, 2, 1]) {
      for (let i = 0; i < counts[stars]; i++) {
        id += 1;
        reviews.push(review({ id: `r${id}`, rating: stars }));
      }
    }

    const summary = summarizeReviews(reviews);

    expect(summary.total).toBe(128);
    expect(summary.average).toBe(4.4);
    expect(summary.distribution).toEqual([
      { stars: 5, count: 84, share: 84 / 128 },
      { stars: 4, count: 27, share: 27 / 128 },
      { stars: 3, count: 10, share: 10 / 128 },
      { stars: 2, count: 4, share: 4 / 128 },
      { stars: 1, count: 3, share: 3 / 128 },
    ]);
  });

  it("orders the distribution from five stars down to one", () => {
    const summary = summarizeReviews([review()]);

    expect(summary.distribution.map((bucket) => bucket.stars)).toEqual([5, 4, 3, 2, 1]);
  });

  it("rounds a fractional rating into the nearest star bucket", () => {
    const summary = summarizeReviews([review({ id: "a", rating: 4.6 })]);

    expect(summary.distribution[0].count).toBe(1);
    expect(summary.average).toBe(4.6);
  });

  it("clamps a rating that falls outside one to five", () => {
    const summary = summarizeReviews([
      review({ id: "a", rating: 0 }),
      review({ id: "b", rating: 9 }),
    ]);

    expect(summary.distribution[0].count).toBe(1);
    expect(summary.distribution[4].count).toBe(1);
  });
});

describe("filterByRange", () => {
  const recent = review({ id: "recent", createdAt: daysAgo(5) });
  const midway = review({ id: "midway", createdAt: daysAgo(45) });
  const old = review({ id: "old", createdAt: daysAgo(200) });
  const reviews = [recent, midway, old];

  it("keeps everything for all time", () => {
    expect(filterByRange(reviews, "all", "", "", NOW).map((r) => r.id)).toEqual([
      "recent",
      "midway",
      "old",
    ]);
  });

  it("keeps the last thirty days", () => {
    expect(filterByRange(reviews, "30d", "", "", NOW).map((r) => r.id)).toEqual(["recent"]);
  });

  it("keeps the last ninety days", () => {
    expect(filterByRange(reviews, "90d", "", "", NOW).map((r) => r.id)).toEqual([
      "recent",
      "midway",
    ]);
  });

  it("keeps a custom range inclusive of both ends", () => {
    const onTheDay = review({ id: "on-the-day", createdAt: "2026-08-10T23:30:00.000Z" });

    const kept = filterByRange([onTheDay, recent], "custom", "2026-08-01", "2026-08-10", NOW);

    expect(kept.map((r) => r.id)).toEqual(["on-the-day"]);
  });

  it("ignores a half filled custom range", () => {
    expect(filterByRange(reviews, "custom", "", "", NOW)).toHaveLength(3);
    expect(filterByRange(reviews, "custom", "2026-08-01", "", NOW).map((r) => r.id)).toEqual([
      "recent",
    ]);
  });

  it("ignores an unreadable custom bound", () => {
    expect(filterByRange(reviews, "custom", "nonsense", "nonsense", NOW)).toHaveLength(3);
  });
});

describe("filterByChip", () => {
  const reviews = [
    review({ id: "five", rating: 5 }),
    review({ id: "four", rating: 4, businessReply: "Thank you" }),
    review({ id: "one", rating: 1 }),
    review({ id: "three", rating: 3, businessReply: "Sorry" }),
  ];

  it("keeps every review under All", () => {
    expect(filterByChip(reviews, "all")).toHaveLength(4);
  });

  it("keeps only the reviews with no reply", () => {
    expect(filterByChip(reviews, "needs-reply").map((r) => r.id)).toEqual(["five", "one"]);
  });

  it("keeps only the reviews already replied to", () => {
    expect(filterByChip(reviews, "replied").map((r) => r.id)).toEqual(["four", "three"]);
  });

  it("keeps one to three stars for the low rating chip", () => {
    expect(filterByChip(reviews, "low").map((r) => r.id)).toEqual(["one", "three"]);
  });
});

describe("chipCounts", () => {
  it("counts each chip against the same set", () => {
    const reviews = [
      review({ id: "a", rating: 5 }),
      review({ id: "b", rating: 2 }),
      review({ id: "c", rating: 4, businessReply: "Thanks" }),
    ];

    expect(chipCounts(reviews)).toEqual({
      all: 3,
      "needs-reply": 2,
      replied: 1,
      low: 1,
    });
  });

  it("reports zeroes for an empty set", () => {
    expect(chipCounts([])).toEqual({ all: 0, "needs-reply": 0, replied: 0, low: 0 });
  });
});

describe("sortReviews", () => {
  const older = review({ id: "older", rating: 5, createdAt: "2026-08-01T00:00:00.000Z" });
  const newer = review({ id: "newer", rating: 2, createdAt: "2026-08-20T00:00:00.000Z" });
  const middle = review({ id: "middle", rating: 4, createdAt: "2026-08-10T00:00:00.000Z" });
  const reviews = [older, newer, middle];

  it("sorts newest first by default", () => {
    expect(sortReviews(reviews, "newest").map((r) => r.id)).toEqual(["newer", "middle", "older"]);
  });

  it("sorts oldest first", () => {
    expect(sortReviews(reviews, "oldest").map((r) => r.id)).toEqual(["older", "middle", "newer"]);
  });

  it("sorts by highest rating", () => {
    expect(sortReviews(reviews, "highest").map((r) => r.id)).toEqual(["older", "middle", "newer"]);
  });

  it("sorts by lowest rating", () => {
    expect(sortReviews(reviews, "lowest").map((r) => r.id)).toEqual(["newer", "middle", "older"]);
  });

  it("leaves the caller's array untouched", () => {
    const original = [...reviews];
    sortReviews(reviews, "oldest");

    expect(reviews).toEqual(original);
  });

  it("treats an unreadable date as the oldest possible", () => {
    const broken = review({ id: "broken", createdAt: "nonsense" });

    expect(sortReviews([broken, older], "newest").map((r) => r.id)).toEqual(["older", "broken"]);
  });
});

describe("visibleReviews", () => {
  it("filters by chip before it sorts", () => {
    const reviews = [
      review({ id: "a", rating: 5, createdAt: "2026-08-01T00:00:00.000Z" }),
      review({ id: "b", rating: 5, createdAt: "2026-08-20T00:00:00.000Z" }),
      review({ id: "c", rating: 3, createdAt: "2026-08-25T00:00:00.000Z" }),
    ];

    expect(visibleReviews(reviews, "low", "newest").map((r) => r.id)).toEqual(["c"]);
    expect(visibleReviews(reviews, "all", "oldest").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("reviewInitials", () => {
  it("takes the first and last initial of a full name", () => {
    expect(reviewInitials(review({ customerName: "Bryan Susanto" }))).toBe("BS");
    expect(reviewInitials(review({ customerName: "Ada Byron Lovelace" }))).toBe("AL");
  });

  it("takes two letters from a single name", () => {
    expect(reviewInitials(review({ customerName: "Bryan" }))).toBe("BR");
  });

  it("falls back to the username", () => {
    expect(reviewInitials(review({ customerName: null, customerUsername: "bryansbtian" }))).toBe(
      "BR",
    );
  });

  it("falls back to a placeholder with no identity at all", () => {
    expect(reviewInitials(review({ customerName: null, customerUsername: null }))).toBe("?");
    expect(reviewInitials(review({ customerName: "   ", customerUsername: null }))).toBe("?");
  });
});

describe("formatReviewDate", () => {
  it("gives back nothing for a missing or unreadable date", () => {
    expect(formatReviewDate(null)).toBe("");
    expect(formatReviewDate(undefined)).toBe("");
    expect(formatReviewDate("")).toBe("");
    expect(formatReviewDate("nonsense")).toBe("");
  });

  it("formats a real date", () => {
    expect(formatReviewDate("2026-08-25T12:00:00.000Z")).toContain("2026");
  });
});

describe("restaurantNameOf", () => {
  it("prefers the restaurant name from the published profile", () => {
    expect(
      restaurantNameOf({
        id: "loc-1",
        displayName: "PIK Avenue",
        name: "PIK",
        restaurantProfile: { displayName: "The Japanese Restaurant" },
      }),
    ).toBe("The Japanese Restaurant");
  });

  it("falls back to the location label when no profile name is set", () => {
    expect(
      restaurantNameOf({ id: "loc-1", displayName: "PIK Avenue", restaurantProfile: {} }),
    ).toBe("PIK Avenue");
    expect(restaurantNameOf({ id: "loc-1", displayName: "PIK Avenue" })).toBe("PIK Avenue");
    expect(restaurantNameOf({ id: "loc-1", name: "PIK" })).toBe("PIK");
  });

  it("gives back nothing when the location is missing or unnamed", () => {
    expect(restaurantNameOf(null)).toBe("");
    expect(restaurantNameOf({ id: "loc-1" })).toBe("");
  });
});

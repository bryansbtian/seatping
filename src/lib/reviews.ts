export type Review = {
  id: string;
  customerName?: string | null;
  customerUsername?: string | null;
  rating: number;
  description?: string | null;
  partySize?: number | null;
  serviceType?: string | null;
  createdAt: string;
  businessReply?: string | null;
  businessReplyCreatedAt?: string | null;
  businessReplyUpdatedAt?: string | null;
};

export type ReviewLocation = {
  id: string;
  displayName?: string | null;
  name?: string | null;
  address?: string;
  restaurantProfile?: { displayName?: string | null } | null;
};

export function restaurantNameOf(location: ReviewLocation | null): string {
  return location?.restaurantProfile?.displayName || location?.displayName || location?.name || "";
}

export type ReviewRange = "30d" | "90d" | "all" | "custom";
export type ReviewChip = "all" | "needs-reply" | "replied" | "low";
export type SortOption = "newest" | "oldest" | "highest" | "lowest";

export type RatingBucket = {
  stars: number;
  count: number;
  share: number;
};

export type ReviewSummary = {
  total: number;
  average: number | null;
  distribution: RatingBucket[];
  awaitingReply: number;
};

export type ChipCounts = Record<ReviewChip, number>;

export const MAX_REPLY_LENGTH = 500;
export const REVIEWS_PAGE_SIZE = 10;
export const LOW_RATING_CEILING = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export const RANGE_DAYS: Record<"30d" | "90d", number> = {
  "30d": 30,
  "90d": 90,
};

function ratingOf(review: Review): number {
  if (typeof review.rating === "number" && Number.isFinite(review.rating)) {
    return review.rating;
  }
  return 0;
}

export function starOf(review: Review): number {
  const rounded = Math.round(ratingOf(review));
  if (rounded < 1) {
    return 1;
  }
  if (rounded > 5) {
    return 5;
  }
  return rounded;
}

function createdAtMs(review: Review): number {
  const parsed = new Date(review.createdAt).getTime();
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

export function hasReply(review: Review): boolean {
  return Boolean(review.businessReply);
}

export function summarizeReviews(reviews: Review[]): ReviewSummary {
  const counts = new Map<number, number>();
  for (const stars of [1, 2, 3, 4, 5]) {
    counts.set(stars, 0);
  }

  let total = 0;
  let awaitingReply = 0;
  for (const review of reviews) {
    total += 1;
    counts.set(starOf(review), (counts.get(starOf(review)) ?? 0) + 1);
    if (!hasReply(review)) {
      awaitingReply += 1;
    }
  }

  let average: number | null = null;
  if (total > 0) {
    let sum = 0;
    for (const review of reviews) {
      sum += ratingOf(review);
    }
    average = Math.round((sum / total) * 10) / 10;
  }

  const distribution: RatingBucket[] = [];
  for (const stars of [5, 4, 3, 2, 1]) {
    const count = counts.get(stars) ?? 0;
    let share = 0;
    if (total > 0) {
      share = count / total;
    }
    distribution.push({ stars, count, share });
  }

  return { total, average, distribution, awaitingReply };
}

export function rangeStartMs(range: ReviewRange, from: string, now: Date): number | null {
  if (range === "all") {
    return null;
  }
  if (range === "custom") {
    if (!from) {
      return null;
    }
    const parsed = new Date(`${from}T00:00:00`).getTime();
    if (Number.isNaN(parsed)) {
      return null;
    }
    return parsed;
  }
  return now.getTime() - RANGE_DAYS[range] * DAY_MS;
}

export function rangeEndMs(range: ReviewRange, to: string): number | null {
  if (range !== "custom" || !to) {
    return null;
  }
  const parsed = new Date(`${to}T23:59:59.999`).getTime();
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

export function filterByRange(
  reviews: Review[],
  range: ReviewRange,
  from: string,
  to: string,
  now: Date,
): Review[] {
  const start = rangeStartMs(range, from, now);
  const end = rangeEndMs(range, to);
  if (start === null && end === null) {
    return reviews;
  }
  return reviews.filter((review) => {
    const at = createdAtMs(review);
    if (start !== null && at < start) {
      return false;
    }
    if (end !== null && at > end) {
      return false;
    }
    return true;
  });
}

export function filterByChip(reviews: Review[], chip: ReviewChip): Review[] {
  if (chip === "needs-reply") {
    return reviews.filter((review) => !hasReply(review));
  }
  if (chip === "replied") {
    return reviews.filter(hasReply);
  }
  if (chip === "low") {
    return reviews.filter((review) => starOf(review) <= LOW_RATING_CEILING);
  }
  return reviews;
}

export function chipCounts(reviews: Review[]): ChipCounts {
  return {
    all: reviews.length,
    "needs-reply": filterByChip(reviews, "needs-reply").length,
    replied: filterByChip(reviews, "replied").length,
    low: filterByChip(reviews, "low").length,
  };
}

export function sortReviews(reviews: Review[], sort: SortOption): Review[] {
  const sorted = [...reviews];
  if (sort === "oldest") {
    sorted.sort((a, b) => createdAtMs(a) - createdAtMs(b));
    return sorted;
  }
  if (sort === "highest") {
    sorted.sort((a, b) => ratingOf(b) - ratingOf(a));
    return sorted;
  }
  if (sort === "lowest") {
    sorted.sort((a, b) => ratingOf(a) - ratingOf(b));
    return sorted;
  }
  sorted.sort((a, b) => createdAtMs(b) - createdAtMs(a));
  return sorted;
}

export function visibleReviews(reviews: Review[], chip: ReviewChip, sort: SortOption): Review[] {
  return sortReviews(filterByChip(reviews, chip), sort);
}

export function reviewInitials(review: Review): string {
  const source = review.customerName || review.customerUsername || "";
  const parts = source
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatReviewDate(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

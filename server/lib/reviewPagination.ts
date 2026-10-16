import type { Prisma } from "@prisma/client";
import { ENTITY_ID_RE } from "./entityId.js";

export const REVIEW_PAGE_SIZE = 10;

type ReviewCursor = { locationId: string; createdAt: string; id: string };

export function encodeReviewCursor(locationId: string, review: { id: string; createdAt: Date }) {
  return Buffer.from(
    JSON.stringify({ locationId, id: review.id, createdAt: review.createdAt.toISOString() }),
  ).toString("base64url");
}

export function decodeReviewCursor(value: unknown, locationId: string): ReviewCursor | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid review cursor");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid review cursor");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("locationId" in parsed) ||
    parsed.locationId !== locationId ||
    !("id" in parsed) ||
    typeof parsed.id !== "string" ||
    !ENTITY_ID_RE.test(parsed.id) ||
    !("createdAt" in parsed) ||
    typeof parsed.createdAt !== "string" ||
    !Number.isFinite(Date.parse(parsed.createdAt))
  ) {
    throw new Error("Invalid review cursor");
  }
  return { locationId, id: parsed.id, createdAt: parsed.createdAt };
}

export function reviewPageWhere(
  locationId: string,
  cursor: ReviewCursor | null,
): Prisma.ReviewWhereInput {
  if (!cursor) {
    return { locationId };
  }
  const createdAt = new Date(cursor.createdAt);
  return {
    locationId,
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }],
  };
}

export function roundedReviewRating(value: number | null) {
  if (value === null) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

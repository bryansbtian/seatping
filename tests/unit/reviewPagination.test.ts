import { describe, expect, it } from "vitest";
import {
  decodeReviewCursor,
  encodeReviewCursor,
  reviewPageWhere,
  roundedReviewRating,
} from "../../server/lib/reviewPagination.js";

const locationId = "location-123";
const review = { id: "review-123", createdAt: new Date("2026-10-15T12:00:00.000Z") };

describe("public review pagination", () => {
  it("roundtrips a cursor without depending on the continued existence of its review", () => {
    const cursor = decodeReviewCursor(encodeReviewCursor(locationId, review), locationId);
    expect(cursor).toEqual({
      locationId,
      id: review.id,
      createdAt: review.createdAt.toISOString(),
    });
    expect(reviewPageWhere(locationId, cursor)).toEqual({
      locationId,
      OR: [
        { createdAt: { lt: review.createdAt } },
        { createdAt: review.createdAt, id: { lt: review.id } },
      ],
    });
  });

  it("scopes cursors to their location", () => {
    expect(() =>
      decodeReviewCursor(encodeReviewCursor(locationId, review), "other-location"),
    ).toThrow("Invalid review cursor");
  });

  it.each([
    null,
    "",
    "!",
    [],
    "a".repeat(513),
    Buffer.from("not json").toString("base64url"),
    Buffer.from(JSON.stringify({ locationId, id: review.id, createdAt: "invalid" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify({ locationId, id: "bad", createdAt: review.createdAt })).toString(
      "base64url",
    ),
    Buffer.from("null").toString("base64url"),
  ])("rejects invalid cursor %j", (cursor) => {
    expect(() => decodeReviewCursor(cursor, locationId)).toThrow("Invalid review cursor");
  });

  it("starts at the newest reviews without a cursor", () => {
    expect(decodeReviewCursor(undefined, locationId)).toBeNull();
    expect(reviewPageWhere(locationId, null)).toEqual({ locationId });
  });

  it("keeps overall ratings independent of the loaded page", () => {
    expect(roundedReviewRating(null)).toBeNull();
    expect(roundedReviewRating(4.6666666)).toBe(4.7);
    expect(roundedReviewRating(0)).toBe(0);
  });
});

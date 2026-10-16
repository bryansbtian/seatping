import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { getTestPrisma } from "../helpers/db.js";
import { seedBusinessWithLocation } from "../helpers/seed.js";

let path: string;
let locationId: string;
const db = getTestPrisma();

beforeAll(async () => {
  const seeded = await seedBusinessWithLocation();
  locationId = seeded.location.id;
  path = `/api/restaurants/${seeded.business.username}/${locationId}`;
  await db.review.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      id: `${locationId}-${String(i).padStart(3, "0")}`,
      locationId,
      customerName: `Diner ${i}`,
      rating: (i % 5) + 1,
      createdAt: new Date("2026-10-15T12:00:00.000Z"),
    })),
  });
});

describe("public restaurant review pages", () => {
  it("bounds version two profile reviews to ten while preserving whole-location rating and legacy API", async () => {
    const request = await api();
    const [modern, legacy] = await Promise.all([
      request.get(`${path}?version=2`),
      request.get(path),
    ]);
    expect(modern.status).toBe(200);
    expect(modern.body.restaurant.reviews).toHaveLength(10);
    expect(modern.body.restaurant.reviewCount).toBe(25);
    expect(modern.body.restaurant.rating).toBe(3);
    expect(modern.body.restaurant.reviewsPage.hasMore).toBe(true);
    expect(legacy.body.restaurant.reviews).toHaveLength(25);
    expect(legacy.body.restaurant.reviewsPage).toBeUndefined();
    expect(modern.body.restaurant.reviews[0].customerId).toBeUndefined();
  });

  it("walks tied timestamps with stable cursors and a final partial page", async () => {
    const request = await api();
    const first = await request.get(`${path}/reviews`);
    const second = await request.get(`${path}/reviews?cursor=${first.body.nextCursor}`);
    const third = await request.get(`${path}/reviews?cursor=${second.body.nextCursor}`);
    expect(first.body.reviews).toHaveLength(10);
    expect(second.body.reviews).toHaveLength(10);
    expect(third.body.reviews).toHaveLength(5);
    expect(third.body.nextCursor).toBeNull();
    expect(third.body.hasMore).toBe(false);
    const ids = [...first.body.reviews, ...second.body.reviews, ...third.body.reviews].map(
      (review: { id: string }) => review.id,
    );
    expect(new Set(ids).size).toBe(25);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(second.body.totalReviews).toBe(25);
    expect(second.body.avgRating).toBe(3);
  });

  it("rejects malformed and cross-location cursors and cross-business paths", async () => {
    const request = await api();
    const other = await seedBusinessWithLocation();
    const first = await request.get(`${path}/reviews`);
    const wrongScope = await request.get(
      `/api/restaurants/${other.business.username}/${other.location.id}/reviews?cursor=${first.body.nextCursor}`,
    );
    const wrongBusiness = await request.get(
      `/api/restaurants/${other.business.username}/${locationId}/reviews`,
    );
    const malformed = await request.get(`${path}/reviews?cursor=invalid!`);
    expect(wrongScope.status).toBe(400);
    expect(wrongBusiness.status).toBe(404);
    expect(malformed.status).toBe(400);
  });

  it("continues after a deleted cursor review and refreshes aggregates after edits, deletes, and replies", async () => {
    const request = await api();
    const first = await request.get(`${path}/reviews`);
    const boundary = first.body.reviews.at(-1);
    await db.review.delete({ where: { id: boundary.id } });
    const remainingId = first.body.reviews[0].id;
    await db.review.update({
      where: { id: remainingId },
      data: { rating: 1, businessReply: "Thank You", businessReplyCreatedAt: new Date() },
    });
    const next = await request.get(`${path}/reviews?cursor=${first.body.nextCursor}`);
    const profile = await request.get(`${path}?version=2`);
    const aggregate = await db.review.aggregate({
      where: { locationId },
      _count: true,
      _avg: { rating: true },
    });
    expect(next.status).toBe(200);
    expect(next.body.reviews).toHaveLength(10);
    expect(next.body.reviews[0].id).toBe(`${locationId}-014`);
    expect(profile.body.restaurant.reviewCount).toBe(24);
    expect(profile.body.restaurant.rating).toBe(Math.round((aggregate._avg.rating ?? 0) * 10) / 10);
    expect(
      profile.body.restaurant.reviews.find((review: { id: string }) => review.id === remainingId)
        .businessReply,
    ).toBe("Thank You");
  });

  it("retains direct-link visibility semantics and returns empty review metadata", async () => {
    const request = await api();
    const other = await seedBusinessWithLocation();
    await db.location.update({ where: { id: other.location.id }, data: { isPublished: false } });
    const response = await request.get(
      `/api/restaurants/${other.business.username}/${other.location.id}/reviews`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reviews: [],
      hasMore: false,
      nextCursor: null,
      totalReviews: 0,
      avgRating: null,
    });
  });
});

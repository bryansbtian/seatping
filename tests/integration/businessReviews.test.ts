import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { apiFromIp } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seedReview(
  location: { id: string },
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await db.review.create({
    data: {
      locationId: location.id,
      customerName: `Guest ${uniqueSuffix()}`,
      rating: 5,
      description: "Great experience and quick service.",
      ...overrides,
    } as never,
  });
}

async function reviewsFor(locationId: string, cookie: string) {
  const request = await apiFromIp();
  return request.get(`/api/locations/${locationId}/reviews`).set("Cookie", cookie);
}

describe("reading the reviews for a business location", () => {
  it("returns every review belonging to the location", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedReview(location, { customerName: "Bryan Susanto", rating: 5 });
    await seedReview(location, { customerName: "Kevin Nguyen", rating: 3 });

    const res = await reviewsFor(location.id, businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(2);
    const names = res.body.reviews.map((review: any) => review.customerName).sort();
    expect(names).toEqual(["Bryan Susanto", "Kevin Nguyen"]);
  });

  it("returns an empty list for a location with no reviews", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await reviewsFor(location.id, businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.reviews).toEqual([]);
  });

  it("never mixes in reviews from another location of the same business", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const other = await db.location.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        name: `Plaza ${uniqueSuffix()}`,
        address: "Jalan Thamrin",
      } as never,
    });
    await seedReview(location, { customerName: "PIK Guest" });
    await seedReview(other, { customerName: "Plaza Guest" });

    const res = await reviewsFor(location.id, businessCookie(business.id));

    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].customerName).toBe("PIK Guest");

    const otherRes = await reviewsFor(other.id, businessCookie(business.id));
    expect(otherRes.body.reviews).toHaveLength(1);
    expect(otherRes.body.reviews[0].customerName).toBe("Plaza Guest");
  });

  it("refuses a location that belongs to another business", async () => {
    const mine = await seedBusinessWithLocation();
    const theirs = await seedBusinessWithLocation();
    await seedReview(theirs.location, { customerName: "Their Guest" });

    const res = await reviewsFor(theirs.location.id, businessCookie(mine.business.id));

    expect(res.status).toBe(404);
    expect(res.body.reviews).toBeUndefined();
  });

  it("refuses a signed out request", async () => {
    const { location } = await seedBusinessWithLocation();
    await seedReview(location);

    const request = await apiFromIp();
    const res = await request.get(`/api/locations/${location.id}/reviews`);

    expect(res.status).toBe(401);
  });

  it("refuses a malformed location id", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await reviewsFor("not-an-id", businessCookie(business.id));

    expect(res.status).toBe(404);
  });

  it("carries the fields the reviews page renders", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedReview(location, {
      customerName: "Bryan Susanto",
      rating: 4,
      description: "Good food.",
      partySize: 2,
      serviceType: "queue",
      businessReply: "Thank you for visiting.",
    });

    const res = await reviewsFor(location.id, businessCookie(business.id));
    const review = res.body.reviews[0];

    expect(review.customerName).toBe("Bryan Susanto");
    expect(review.rating).toBe(4);
    expect(review.description).toBe("Good food.");
    expect(review.partySize).toBe(2);
    expect(review.serviceType).toBe("queue");
    expect(review.businessReply).toBe("Thank you for visiting.");
    expect(review.createdAt).toBeTruthy();
  });
});

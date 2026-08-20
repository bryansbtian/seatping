import { beforeAll, describe, expect, it } from "vitest";
import type { Business, Location, User } from "@prisma/client";
import { api } from "../helpers/app.js";
import { customerCookie } from "../helpers/auth.js";
import { getTestPrisma } from "../helpers/db.js";
import { seedBusinessWithLocation, seedCustomer } from "../helpers/seed.js";

let business: Business;
let location: Location;
let customer: User;
let cookie: string;

function reviewsPath(usernameOverride?: string, locationOverride?: string): string {
  const username = usernameOverride ?? business.username;
  const id = locationOverride ?? location.id;
  return `/api/restaurants/${username}/${id}/reviews`;
}

beforeAll(async () => {
  const seeded = await seedBusinessWithLocation();
  business = seeded.business;
  location = seeded.location;
  customer = await seedCustomer();
  cookie = customerCookie(customer.id);
});

describe("posting a restaurant review", () => {
  it("refuses an anonymous review", async () => {
    const res = await (await api()).post(reviewsPath()).send({ rating: 5 });

    expect(res.status).toBe(401);
  });

  it("stores a review for a signed-in customer", async () => {
    const res = await (
      await api()
    )
      .post(reviewsPath())
      .set("Cookie", cookie)
      .send({ rating: 5, description: "  Excellent service.  " });

    expect(res.status).toBe(200);
    expect(res.body.review.rating).toBe(5);
    expect(res.body.review.description).toBe("Excellent service.");
    expect(res.body.review.customerUsername).toBe(customer.username);
  });

  it("replaces the customer's earlier review rather than adding a second", async () => {
    const res = await (
      await api()
    )
      .post(reviewsPath())
      .set("Cookie", cookie)
      .send({ rating: 3, description: "Second visit was quieter." });

    expect(res.status).toBe(200);
    expect(res.body.review.rating).toBe(3);

    const stored = await getTestPrisma().review.findMany({
      where: { customerId: customer.id, locationId: location.id },
    });
    expect(stored).toHaveLength(1);
  });

  it("stores no description when the text is only whitespace", async () => {
    const other = await seedCustomer();

    const res = await (
      await api()
    )
      .post(reviewsPath())
      .set("Cookie", customerCookie(other.id))
      .send({ rating: 4, description: "   " });

    expect(res.status).toBe(200);
    expect(res.body.review.description).toBeNull();
  });

  it("rounds a fractional rating", async () => {
    const other = await seedCustomer();

    const res = await (
      await api()
    )
      .post(reviewsPath())
      .set("Cookie", customerCookie(other.id))
      .send({ rating: 4.4 });

    expect(res.body.review.rating).toBe(4);
  });

  it("rejects a non-numeric rating", async () => {
    const res = await (
      await api()
    )
      .post(reviewsPath())
      .set("Cookie", cookie)
      .send({ rating: "five" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("rating must be a number");
  });

  it("rejects a rating outside one to five", async () => {
    const low = await (await api()).post(reviewsPath()).set("Cookie", cookie).send({ rating: 0 });
    const high = await (await api()).post(reviewsPath()).set("Cookie", cookie).send({ rating: 6 });

    expect(low.status).toBe(400);
    expect(high.status).toBe(400);
    expect(low.body.error).toBe("rating must be between 1 and 5");
  });

  it("rejects a non-string description", async () => {
    const res = await (
      await api()
    )
      .post(reviewsPath())
      .set("Cookie", cookie)
      .send({ rating: 4, description: 12 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("description must be a string");
  });

  it("rejects a malformed location id", async () => {
    const res = await (
      await api()
    )
      .post(reviewsPath(undefined, "not-an-object-id"))
      .set("Cookie", cookie)
      .send({ rating: 4 });

    expect(res.status).toBe(404);
  });

  it("rejects an unknown business", async () => {
    const res = await (
      await api()
    )
      .post(reviewsPath("no-such-business"))
      .set("Cookie", cookie)
      .send({ rating: 4 });

    expect(res.status).toBe(404);
  });

  it("rejects a location that belongs to another business", async () => {
    const other = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post(reviewsPath(business.username, other.location.id))
      .set("Cookie", cookie)
      .send({ rating: 4 });

    expect(res.status).toBe(404);
  });

  it("rejects a session whose customer no longer exists", async () => {
    const ghost = await seedCustomer();
    const ghostCookie = customerCookie(ghost.id);
    await getTestPrisma().user.delete({ where: { id: ghost.id } });

    const res = await (
      await api()
    )
      .post(reviewsPath())
      .set("Cookie", ghostCookie)
      .send({ rating: 4 });

    expect(res.status).toBe(401);
  });
});

describe("reading a restaurant profile with reviews", () => {
  it("reports the rounded average rating and every review", async () => {
    const res = await (await api()).get(`/api/restaurants/${business.username}/${location.id}`);

    expect(res.status).toBe(200);
    expect(res.body.restaurant.reviewCount).toBeGreaterThan(0);
    expect(res.body.restaurant.rating).toBeGreaterThan(0);
    expect(res.body.restaurant.reviews.length).toBe(res.body.restaurant.reviewCount);
  });

  it("reports no rating for a restaurant with no reviews", async () => {
    const fresh = await seedBusinessWithLocation();

    const res = await (
      await api()
    ).get(`/api/restaurants/${fresh.business.username}/${fresh.location.id}`);

    expect(res.body.restaurant.rating).toBeNull();
    expect(res.body.restaurant.reviewCount).toBe(0);
  });

  it("surfaces the published restaurant profile over the raw location fields", async () => {
    const fresh = await seedBusinessWithLocation();
    await getTestPrisma().location.update({
      where: { id: fresh.location.id },
      data: {
        restaurantProfile: {
          displayName: "Profile Name",
          shortAddress: "Profile Address",
          tagline: "Profile Tagline",
          cuisineTypes: ["Indonesian"],
          menu: [{ name: "Nasi Goreng" }],
          menuUrl: "https://test.invalid/menu",
          openingHours: { monday: "09:00-22:00" },
          details: { phone: "+15550001111", city: "Profile City" },
          isPublished: true,
        },
      },
    });

    const res = await (
      await api()
    ).get(`/api/restaurants/${fresh.business.username}/${fresh.location.id}`);

    expect(res.body.restaurant.name).toBe("Profile Name");
    expect(res.body.restaurant.shortAddress).toBe("Profile Address");
    expect(res.body.restaurant.cuisineTypes).toEqual(["Indonesian"]);
    expect(res.body.restaurant.menuUrl).toBe("https://test.invalid/menu");
    expect(res.body.restaurant.phone).toBe("+15550001111");
    expect(res.body.restaurant.city).toBe("Profile City");
  });

  it("tolerates a location with no restaurant profile at all", async () => {
    const fresh = await seedBusinessWithLocation();
    await getTestPrisma().location.update({
      where: { id: fresh.location.id },
      data: { restaurantProfile: undefined },
    });

    const res = await (
      await api()
    ).get(`/api/restaurants/${fresh.business.username}/${fresh.location.id}`);

    expect(res.status).toBe(200);
    expect(res.body.restaurant.cuisineTypes).toEqual([]);
    expect(res.body.restaurant.menu).toEqual([]);
    expect(res.body.restaurant.openingHours).toBeNull();
  });

  it("rejects a malformed location id", async () => {
    const res = await (await api()).get(`/api/restaurants/${business.username}/not-an-object-id`);

    expect(res.status).toBe(404);
  });

  it("rejects an unknown business", async () => {
    const res = await (await api()).get(`/api/restaurants/no-such-business/${location.id}`);

    expect(res.status).toBe(404);
  });

  it("rejects a location that belongs to another business", async () => {
    const other = await seedBusinessWithLocation();

    const res = await (
      await api()
    ).get(`/api/restaurants/${business.username}/${other.location.id}`);

    expect(res.status).toBe(404);
  });
});

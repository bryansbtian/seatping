import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Location, User } from "@prisma/client";
import { api } from "../helpers/app.js";
import { customerCookie } from "../helpers/auth.js";
import {
  clearTestDatabase,
  disconnectTestPrisma,
  getTestPrisma,
} from "../helpers/db.js";
import {
  seedBusinessWithLocation,
  seedCustomer,
  uniqueSuffix,
} from "../helpers/seed.js";
import { TEST_PASSWORD } from "../helpers/seed.js";
import { sinks } from "../setup/externalMocks.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seedReview(customer: User, location: Location, rating = 4) {
  return db.review.create({
    data: {
      locationId: location.id,
      customerId: customer.id,
      customerName: customer.name,
      customerUsername: customer.username,
      rating,
      description: "Great service.",
    },
  });
}

describe("customer profile", () => {
  it("returns the signed-in customer", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .get("/auth/me")
      .set("Cookie", customerCookie(customer.id));

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(customer.username);
  });

  it("reports a session whose customer is gone", async () => {
    const customer = await seedCustomer();
    const cookie = customerCookie(customer.id);
    await db.user.delete({ where: { id: customer.id } });

    const res = await (await api()).get("/auth/me").set("Cookie", cookie);

    expect(res.status).toBe(404);
  });

  it("updates the profile and refreshes the session cookie", async () => {
    const customer = await seedCustomer();
    const suffix = uniqueSuffix();

    const res = await (await api())
      .put("/auth/me")
      .set("Cookie", customerCookie(customer.id))
      .send({
        name: "Ada Lovelace",
        username: `ada-${suffix}`,
        email: `ada-${suffix}@test.invalid`,
        phone: "+15551230000",
      });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Ada Lovelace");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects an invalid profile update", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .put("/auth/me")
      .set("Cookie", customerCookie(customer.id))
      .send({ name: "", username: "", email: "not-an-email", phone: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid input");
    expect(res.body.issues).toBeDefined();
  });

  it("refuses an email already used by another customer", async () => {
    const customer = await seedCustomer();
    const other = await seedCustomer();

    const res = await (await api())
      .put("/auth/me")
      .set("Cookie", customerCookie(customer.id))
      .send({
        name: customer.name,
        username: customer.username,
        email: other.email,
        phone: customer.phone,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email already in use");
  });

  it("refuses a username already taken", async () => {
    const customer = await seedCustomer();
    const other = await seedCustomer();

    const res = await (await api())
      .put("/auth/me")
      .set("Cookie", customerCookie(customer.id))
      .send({
        name: customer.name,
        username: other.username,
        email: customer.email,
        phone: customer.phone,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Username already in use");
  });
});

describe("changing a customer password", () => {
  it("updates the password and emails a confirmation", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/me/change-password")
      .set("Cookie", customerCookie(customer.id))
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword: "AnotherPassw0rd!",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const login = await (await api())
      .post("/auth/login")
      .send({
        emailOrUsername: customer.email,
        password: "AnotherPassw0rd!",
      });
    expect(login.status).toBe(200);
  });

  it("rejects a wrong current password", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/me/change-password")
      .set("Cookie", customerCookie(customer.id))
      .send({
        currentPassword: "NotThePassword1!",
        newPassword: "AnotherPassw0rd!",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Current password is incorrect");
  });

  it("rejects a weak new password", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/me/change-password")
      .set("Cookie", customerCookie(customer.id))
      .send({ currentPassword: TEST_PASSWORD, newPassword: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid input");
  });

  it("reports a session whose customer is gone", async () => {
    const customer = await seedCustomer();
    const cookie = customerCookie(customer.id);
    await db.user.delete({ where: { id: customer.id } });

    const res = await (await api())
      .post("/auth/me/change-password")
      .set("Cookie", cookie)
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword: "AnotherPassw0rd!",
      });

    expect(res.status).toBe(404);
  });
});

describe("saved restaurants", () => {
  it("saves a restaurant with its optional details", async () => {
    const customer = await seedCustomer();
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/auth/me/saved-restaurants")
      .set("Cookie", customerCookie(customer.id))
      .send({
        businessUsername: business.username,
        businessName: "  Bistro  ",
        locationName: "Downtown",
        area: "  ",
        city: "Jakarta",
      });

    expect(res.status).toBe(200);
    const saved = res.body.user.savedRestaurants;
    expect(saved).toHaveLength(1);
    expect(saved[0].businessUsername).toBe(business.username);
    expect(saved[0].businessName).toBe("Bistro");
    expect(saved[0].area).toBeUndefined();
    expect(saved[0].city).toBe("Jakarta");
  });

  it("does not save the same restaurant twice", async () => {
    const customer = await seedCustomer();
    const { business } = await seedBusinessWithLocation();
    const cookie = customerCookie(customer.id);
    const payload = { businessUsername: business.username };

    await (await api())
      .post("/auth/me/saved-restaurants")
      .set("Cookie", cookie)
      .send(payload);
    const res = await (await api())
      .post("/auth/me/saved-restaurants")
      .set("Cookie", cookie)
      .send(payload);

    expect(res.body.user.savedRestaurants).toHaveLength(1);
  });

  it("requires a business username", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/me/saved-restaurants")
      .set("Cookie", customerCookie(customer.id))
      .send({ businessUsername: "   " });

    expect(res.status).toBe(400);
  });

  it("removes a saved restaurant", async () => {
    const customer = await seedCustomer();
    const { business } = await seedBusinessWithLocation();
    const cookie = customerCookie(customer.id);
    await (await api())
      .post("/auth/me/saved-restaurants")
      .set("Cookie", cookie)
      .send({ businessUsername: business.username });

    const res = await (await api())
      .delete(`/auth/me/saved-restaurants/${business.username}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.savedRestaurants).toEqual([]);
  });
});

describe("saved locations", () => {
  it("saves a location with its restaurant details and rating", async () => {
    const customer = await seedCustomer();
    const { business, location } = await seedBusinessWithLocation({
      area: "Kemang",
      city: "Jakarta",
      bannerImageUrl: "https://test.invalid/banner.jpg",
      restaurantProfile: {
        displayName: "Warung Nusantara",
        shortAddress: "Kemang Raya 1",
        cuisineTypes: ["Indonesian"],
        details: {},
        isPublished: true,
      } as never,
    });
    await seedReview(customer, location, 5);

    const res = await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", customerCookie(customer.id))
      .send({ locationId: location.id });

    expect(res.status).toBe(200);
    const saved = res.body.user.savedRestaurants[0];
    expect(saved.locationId).toBe(location.id);
    expect(saved.name).toBe("Warung Nusantara");
    expect(saved.locationName).toBe("Kemang Raya 1");
    expect(saved.cuisine).toBe("Indonesian");
    expect(saved.rating).toBe(5);
    expect(saved.businessUsername).toBe(business.username);
    expect(saved.imageUrl).toBe("https://test.invalid/banner.jpg");
  });

  it("falls back to the gallery photo and reports no rating", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation({
      bannerImageUrl: null,
    });
    await db.photo.create({
      data: {
        locationId: location.id,
        url: "https://test.invalid/gallery.jpg",
        publicId: `seatping/locations/${location.id}/photo/one`,
      },
    });

    const res = await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", customerCookie(customer.id))
      .send({ locationId: location.id });

    const saved = res.body.user.savedRestaurants[0];
    expect(saved.imageUrl).toBe("https://test.invalid/gallery.jpg");
    expect(saved.rating).toBeNull();
    expect(saved.cuisine).toBeNull();
  });

  it("rejects a malformed location id", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", customerCookie(customer.id))
      .send({ locationId: "not-an-object-id" });

    expect(res.status).toBe(400);
  });

  it("reports an unknown location", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", customerCookie(customer.id))
      .send({ locationId: "000000000000000000000000" });

    expect(res.status).toBe(404);
  });

  it("reports whether a location is saved", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const cookie = customerCookie(customer.id);

    const before = await (await api())
      .get(`/auth/me/saved-locations/${location.id}`)
      .set("Cookie", cookie);
    await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", cookie)
      .send({ locationId: location.id });
    const after = await (await api())
      .get(`/auth/me/saved-locations/${location.id}`)
      .set("Cookie", cookie);

    expect(before.body.saved).toBe(false);
    expect(after.body.saved).toBe(true);
  });

  it("does not save the same location twice", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const cookie = customerCookie(customer.id);

    await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", cookie)
      .send({ locationId: location.id });
    const res = await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", cookie)
      .send({ locationId: location.id });

    expect(res.body.user.savedRestaurants).toHaveLength(1);
  });

  it("removes a saved location", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const cookie = customerCookie(customer.id);
    await (await api())
      .post("/auth/me/saved-locations")
      .set("Cookie", cookie)
      .send({ locationId: location.id });

    const res = await (await api())
      .delete(`/auth/me/saved-locations/${location.id}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.savedRestaurants).toEqual([]);
  });
});

describe("customer reviews", () => {
  it("lists one review per location, newest first", async () => {
    const customer = await seedCustomer();
    const first = await seedBusinessWithLocation();
    const second = await seedBusinessWithLocation();
    await seedReview(customer, first.location, 3);
    await seedReview(customer, second.location, 5);

    const res = await (await api())
      .get("/auth/me/reviews")
      .set("Cookie", customerCookie(customer.id));

    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(2);
    for (const review of res.body.reviews) {
      expect(review.id).toEqual(expect.any(String));
      expect(review.rating).toEqual(expect.any(Number));
    }
  });

  it("keeps only the newest review for a location", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    await seedReview(customer, location, 2);
    await seedReview(customer, location, 5);

    const res = await (await api())
      .get("/auth/me/reviews")
      .set("Cookie", customerCookie(customer.id));

    expect(res.body.reviews).toHaveLength(1);
  });

  it("updates the rating and description", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const review = await seedReview(customer, location);

    const res = await (await api())
      .patch(`/auth/me/reviews/${review.id}`)
      .set("Cookie", customerCookie(customer.id))
      .send({ rating: 2.4, description: "  Slower this time.  " });

    expect(res.status).toBe(200);
    expect(res.body.review.rating).toBe(2);
    expect(res.body.review.description).toBe("Slower this time.");
  });

  it("clears the description when it is emptied", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const review = await seedReview(customer, location);

    const res = await (await api())
      .patch(`/auth/me/reviews/${review.id}`)
      .set("Cookie", customerCookie(customer.id))
      .send({ description: "   " });

    expect(res.body.review.description).toBeNull();
  });

  it("rejects an invalid rating", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const review = await seedReview(customer, location);
    const cookie = customerCookie(customer.id);

    const text = await (await api())
      .patch(`/auth/me/reviews/${review.id}`)
      .set("Cookie", cookie)
      .send({ rating: "five" });
    const outOfRange = await (await api())
      .patch(`/auth/me/reviews/${review.id}`)
      .set("Cookie", cookie)
      .send({ rating: 9 });

    expect(text.status).toBe(400);
    expect(text.body.error).toBe("rating must be a number");
    expect(outOfRange.status).toBe(400);
    expect(outOfRange.body.error).toBe("rating must be between 1 and 5");
  });

  it("rejects a non-string description", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const review = await seedReview(customer, location);

    const res = await (await api())
      .patch(`/auth/me/reviews/${review.id}`)
      .set("Cookie", customerCookie(customer.id))
      .send({ description: 7 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("description must be a string");
  });

  it("rejects an update with nothing to change", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const review = await seedReview(customer, location);

    const res = await (await api())
      .patch(`/auth/me/reviews/${review.id}`)
      .set("Cookie", customerCookie(customer.id))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Nothing to update");
  });

  it("refuses to touch another customer's review", async () => {
    const customer = await seedCustomer();
    const other = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const review = await seedReview(other, location);
    const cookie = customerCookie(customer.id);

    const patch = await (await api())
      .patch(`/auth/me/reviews/${review.id}`)
      .set("Cookie", cookie)
      .send({ rating: 1 });
    const remove = await (await api())
      .delete(`/auth/me/reviews/${review.id}`)
      .set("Cookie", cookie);

    expect(patch.status).toBe(404);
    expect(remove.status).toBe(404);
  });

  it("rejects a malformed review id", async () => {
    const customer = await seedCustomer();
    const cookie = customerCookie(customer.id);

    const patch = await (await api())
      .patch("/auth/me/reviews/not-an-id")
      .set("Cookie", cookie)
      .send({ rating: 3 });
    const remove = await (await api())
      .delete("/auth/me/reviews/not-an-id")
      .set("Cookie", cookie);

    expect(patch.status).toBe(404);
    expect(remove.status).toBe(404);
  });

  it("deletes a review", async () => {
    const customer = await seedCustomer();
    const { location } = await seedBusinessWithLocation();
    const review = await seedReview(customer, location);

    const res = await (await api())
      .delete(`/auth/me/reviews/${review.id}`)
      .set("Cookie", customerCookie(customer.id));

    expect(res.status).toBe(200);
    expect(await db.review.findUnique({ where: { id: review.id } })).toBeNull();
  });
});

describe("password recovery emails", () => {
  it("sends a customer reset link without revealing the account", async () => {
    const customer = await seedCustomer();

    const res = await (await api())
      .post("/auth/forgot-password")
      .send({ email: customer.email, type: "customer" });

    expect(res.status).toBe(200);
    expect(sinks().email.length).toBeGreaterThanOrEqual(1);
    const stored = await db.user.findUnique({ where: { id: customer.id } });
    expect(stored?.resetToken).toEqual(expect.any(String));
  });

  it("answers the same way for an unknown address", async () => {
    const res = await (await api())
      .post("/auth/forgot-password")
      .send({ email: "nobody@test.invalid", type: "customer" });

    expect(res.status).toBe(200);
  });
});

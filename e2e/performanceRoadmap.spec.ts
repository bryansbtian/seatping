import { expect, test } from "./fixtures/seatping.js";
import { uniqueId } from "./helpers/db.js";

test("database-backed discovery pages ten rows and globally filters featured results with browser history", async ({
  page,
  db,
}) => {
  const marker = `Roadmap${uniqueId()}`;
  const business = await db.createBusiness();
  const locations = [];
  for (let index = 0; index < 23; index++) {
    let cuisine = "Common Cuisine";
    if (index >= 11) {
      cuisine = "Rare Cuisine";
    }
    locations.push(
      await db.createLocation(business, {
        area: "Roadmap Area",
        restaurantProfile: {
          displayName: `${marker} ${String(index).padStart(2, "0")}`,
          cuisineTypes: [cuisine],
          priceRange: "$$",
        },
        createdAt: new Date(1700000000000 + index * 1000),
      }),
    );
  }
  for (const index of [14, 18]) {
    await db.prisma.featuredRestaurant.create({
      data: { businessId: business.id, locationId: locations[index].id },
    });
  }
  const api = await page.request.get(`/api/search/restaurants?version=2&query=${marker}`);
  expect(api.status()).toBe(200);
  const data = await api.json();
  expect(data).toMatchObject({ total: 23, limit: 10, totalPages: 3 });
  expect(data.results.slice(0, 2).map((row: { featured: boolean }) => row.featured)).toEqual([
    true,
    true,
  ]);
  await page.goto(`/search/${marker}?date=2027-10-16&time=19%3A00&partySize=3`);
  await expect(page.getByRole("article")).toHaveCount(10);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("Page 2 Of 3")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(10);
  await page.getByRole("button", { name: "Page 3", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.goBack();
  await expect(page.getByText("Page 2 Of 3")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(10);
  await page.goForward();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Cuisine: Cuisine", exact: true }).click();
  await page.getByRole("button", { name: "Rare Cuisine", exact: true }).click();
  await expect(page).not.toHaveURL(/page=3/);
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.getByText("Page 1 Of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page).toHaveURL(/partySize=3/);
  await expect(page).toHaveURL(/cuisine=Rare\+Cuisine/);
});

test("autocomplete waits for focus and returns at most three database-ranked suggestions", async ({
  page,
  db,
}) => {
  const marker = `Suggest${uniqueId()}`;
  const business = await db.createBusiness();
  for (let index = 0; index < 5; index++) {
    await db.createLocation(business, { restaurantProfile: { displayName: `${marker} ${index}` } });
  }
  let suggestionReads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/locations/search-suggestions") {
      suggestionReads++;
    }
  });
  await page.goto(`/search/${marker}`);
  await expect(page.getByRole("article")).toHaveCount(5);
  await page.waitForTimeout(350);
  expect(suggestionReads).toBe(0);
  await page.getByRole("combobox", { name: /Search restaurants, cuisines, or areas/ }).click();
  await expect(page.getByRole("option")).toHaveCount(3);
  expect(suggestionReads).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("profile loads ten reviews initially and cursor pages without duplicating session or initial review reads", async ({
  page,
  db,
}) => {
  const marker = `Reviews${uniqueId()}`;
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: { displayName: marker },
  });
  await db.prisma.review.createMany({
    data: Array.from({ length: 21 }, (_, index) => ({
      locationId: location.id,
      rating: 4,
      description: `${marker} Review ${String(index).padStart(2, "0")}`,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })),
  });
  let sessions = 0;
  let reviewPages = 0;
  let contactReads = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/auth/session") {
      sessions++;
    }
    if (path === "/auth/me") {
      contactReads++;
    }
    if (path === `/api/restaurants/${business.username}/${location.id}/reviews`) {
      reviewPages++;
    }
  });
  const firstPage = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/restaurants/${business.username}/${location.id}`,
  );
  await page.goto(`/${business.username}/${location.id}`);
  const profile = await (await firstPage).json();
  expect(profile.restaurant.reviews).toHaveLength(10);
  expect(profile.restaurant).toMatchObject({ reviewCount: 21, rating: 4 });
  const descriptions = page.locator("#reviews").getByText(new RegExp(`^${marker} Review`));
  await expect(descriptions).toHaveCount(10);
  expect(sessions).toBe(1);
  expect(contactReads).toBe(0);
  expect(reviewPages).toBe(0);
  await page.getByRole("button", { name: "Load More Reviews", exact: true }).click();
  await expect(descriptions).toHaveCount(20);
  await page.getByRole("button", { name: "Load More Reviews", exact: true }).click();
  await expect(descriptions).toHaveCount(21);
  await expect(page.getByRole("button", { name: "Load More Reviews", exact: true })).toHaveCount(0);
  expect(reviewPages).toBe(2);
  expect(new Set(await descriptions.allTextContents()).size).toBe(21);
});

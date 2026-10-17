import { expect, test, type Page } from "@playwright/test";
import { restaurant } from "../tests/helpers/searchRestaurants.js";

const catalog = Array.from({ length: 23 }, (_, index) =>
  restaurant({
    locationId: `loc-${index + 1}`,
    name: `Restaurant ${String(index + 1).padStart(2, "0")}`,
    bannerImageUrl: null,
    cuisine: "Japanese",
    featured: index === 0,
  }),
);

async function guestFixtures(page: Page) {
  await page.route("https://**/*", (route) => route.abort());
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null, customerId: null } }),
  );
  await page.route("**/auth/business/*", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await page.route("**/api/featured-restaurants", (route) =>
    route.fulfill({ json: { featured: [] } }),
  );
  await page.route("**/api/locations/search-suggestions**", (route) =>
    route.fulfill({ json: { suggestions: [] } }),
  );
  await page.route("**/api/search/restaurants**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const current = Number(params.get("page") || "1");
    const query = (params.get("query") || "").toLowerCase();
    let matching = catalog.filter((item) => item.name.toLowerCase().includes(query));
    if (params.get("sort") === "name-za") {
      matching = [...matching].reverse();
    }
    return route.fulfill({
      json: {
        results: matching.slice((current - 1) * 10, current * 10),
        total: matching.length,
        page: current,
        limit: 10,
        totalPages: Math.ceil(matching.length / 10),
        hasMore: current * 10 < matching.length,
        facets: { cuisines: ["Japanese"], locations: ["Downtown"] },
      },
    });
  });
}

async function profileFixtures(page: Page) {
  await page.route("**/api/restaurants/bistro/loc-1/reviews?**", (route) =>
    route.fulfill({
      json: { reviews: [], totalReviews: 0, avgRating: null, nextCursor: null, hasMore: false },
    }),
  );
  await page.route("**/api/restaurants/bistro/loc-1?version=2", (route) =>
    route.fulfill({
      json: {
        restaurant: {
          ...catalog[0],
          photos: [],
          menu: [],
          reviews: [],
          reviewCount: 0,
          rating: null,
          reviewsPage: { nextCursor: null, hasMore: false },
          cuisineTypes: ["Japanese"],
          openingHours: null,
        },
      },
    }),
  );
  await page.route("**/api/reservations/bistro/loc-1/settings", (route) =>
    route.fulfill({
      json: {
        settings: {
          reservationStartTime: "12:00",
          reservationEndTime: "22:00",
          maxPartySize: 10,
          maxReservedGuestsPerHour: 0,
          bookingWindowDays: 540,
          minNoticeMinutes: 0,
          defaultReservationDurationMinutes: 90,
          reservationHoldMinutes: 15,
          confirmationMode: "auto",
          cancellationPolicy: "",
        },
      },
    }),
  );
  await page.route("**/api/reservations/bistro/loc-1/availability**", (route) =>
    route.fulfill({
      json: {
        slots: [{ time: "18:00", label: "6:00 PM", available: true, remaining: 2 }],
        availability: { status: "available" },
      },
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await guestFixtures(page);
});

test("restaurant pages contain ten results and preserve navigation state through browser history", async ({
  page,
}) => {
  await page.goto("/search?date=2027-10-16&time=18%3A00&partySize=4");
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Restaurant 01");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Restaurant 11");
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page).toHaveURL(/partySize=4&page=2/);
  await page.getByRole("button", { name: "Page 3", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.goBack();
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Restaurant 11");
  await page.goBack();
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Restaurant 01");
  await page.goForward();
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Restaurant 11");
  await expect(page.getByRole("button", { name: "Number of guests: 4 Guests" })).toBeVisible();
});

test("global sorting resets the page while retaining booking selections", async ({ page }) => {
  await page.goto("/search?page=2&date=2027-10-16&time=18%3A00&partySize=4");
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Restaurant 11");
  await page.getByRole("button", { name: "Sort By: Recommended" }).click();
  await page.getByRole("button", { name: "Name Z-A", exact: true }).click();
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Restaurant 23");
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page).toHaveURL(/partySize=4&sort=name-za/);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
});

test("profile header and booking share a session and reuse availability across viewport changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await profileFixtures(page);
  const counts = { session: 0, settings: 0, availability: 0, reviewPages: 0 };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/auth/session") {
      counts.session += 1;
    }
    if (path.endsWith("/settings")) {
      counts.settings += 1;
    }
    if (path.endsWith("/availability")) {
      counts.availability += 1;
    }
    if (path.endsWith("/reviews")) {
      counts.reviewPages += 1;
    }
  });
  await page.goto("/restaurants/bistro/loc-1?date=2027-10-16&time=18%3A00&partySize=4");
  await expect(page).toHaveURL(/\/bistro\/loc-1\?date=2027-10-16&time=18%3A00&partySize=4/);
  await expect(page.getByRole("heading", { name: "Restaurant 01", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Book Table", exact: true })).toBeEnabled();
  expect(counts).toEqual({ session: 1, settings: 1, availability: 1, reviewPages: 0 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Book Table", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Book a Table" })).toBeVisible();
  expect(counts).toEqual({ session: 1, settings: 1, availability: 1, reviewPages: 0 });
});

test("route loading is announced while a module is delayed", async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    /\/(?:src\/pages\/Terms\.tsx|assets\/Terms-[^/]+\.js)(?:\?.*)?$/,
    async (route) => {
      await pending;
      await route.continue();
    },
  );
  try {
    await page.goto("/terms", { waitUntil: "domcontentloaded" });
    const skeleton = page.getByRole("status", { name: "Loading Page" });
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveText("");
    release();
    await expect(page.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeVisible();
  } finally {
    release();
  }
});

test("consumer landing does not request business admin floor campaign or analytics modules", async ({
  page,
}) => {
  const unrelated: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/(?:src\/pages|assets)\/(?:Business|Admin|Floor|Campaign)|recharts/i.test(path)) {
      unrelated.push(path);
    }
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Featured Restaurants" })).toBeVisible();
  expect(unrelated).toEqual([]);
});

test("business deep links enforce the guest redirect before private modules load", async ({
  page,
}) => {
  const privateModules: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/(?:src\/pages|assets)\/(?:BusinessFloor|BusinessOverview)/.test(path)) {
      privateModules.push(path);
    }
  });
  await page.goto("/business/floor");
  await expect(page).toHaveURL(/\/business\/login$/);
  await expect(page.getByText("Business Log In", { exact: true })).toBeVisible();
  expect(privateModules).toEqual([]);
});

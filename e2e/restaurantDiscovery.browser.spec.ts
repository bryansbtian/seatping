import { expect, test, type Locator, type Page } from "@playwright/test";
import { restaurant, SEARCH_RESTAURANTS } from "../tests/helpers/searchRestaurants.js";
import {
  areaLabel,
  filterRestaurants,
  filtersFromSearchParams,
  sortFromSearchParams,
  sortRestaurants,
  type SearchResult,
} from "../src/lib/restaurantDiscovery.js";

function searchResponse(restaurants: SearchResult[], requestUrl: string) {
  const params = new URL(requestUrl).searchParams;
  const matching = sortRestaurants(
    filterRestaurants(restaurants, filtersFromSearchParams(params)),
    sortFromSearchParams(params),
  );
  const page = Math.max(1, Number(params.get("page")) || 1);
  return {
    results: matching.slice((page - 1) * 10, page * 10),
    total: matching.length,
    page,
    limit: 10,
    totalPages: Math.ceil(matching.length / 10),
    hasMore: page * 10 < matching.length,
    facets: {
      cuisines: [...new Set(restaurants.flatMap((item) => item.cuisine || []))],
      locations: [...new Set(restaurants.map(areaLabel).filter(Boolean))],
    },
  };
}

for (const path of ["/business/dashboard", "/unknown/nested/page"]) {
  test(`unknown route ${path} opens 404 without restaurant requests or skeletons`, async ({
    page,
  }) => {
    const restaurantRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/restaurants/")) {
        restaurantRequests.push(request.url());
      }
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /We couldn’t find/ })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    expect(restaurantRequests).toEqual([]);
    expect(new URL(page.url()).pathname).toBe(path);
  });
}

test("missing blog article resolves to its noindex 404 without restaurant requests", async ({
  page,
}) => {
  const restaurantRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/restaurants/")) {
      restaurantRequests.push(request.url());
    }
  });
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/blog/unknown", async (route) => {
    await pending;
    await route.fulfill({ status: 404, json: { error: "Article not found" } });
  });
  try {
    await page.goto("/blog/unknown");
    await expect(page.getByRole("status", { name: "Loading Article" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Loading Restaurant" })).toHaveCount(0);
    const response = page.waitForResponse(
      (result) => new URL(result.url()).pathname === "/api/blog/unknown",
    );
    release();
    expect((await response).status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Article Not Found", exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Back To Blogs" })).toHaveAttribute(
      "href",
      "/blog",
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    expect(restaurantRequests).toEqual([]);
    expect(new URL(page.url()).pathname).toBe("/blog/unknown");
  } finally {
    release();
  }
});

test("missing restaurant replaces the restaurant skeleton with 404 after validation", async ({
  page,
}) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/restaurants/missing/location-123?version=2", async (route) => {
    await pending;
    await route.fulfill({ status: 404, json: { error: "Restaurant not found" } });
  });
  try {
    await page.goto("/missing/location-123");
    const skeleton = page.getByRole("status", { name: "Loading Restaurant" });
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveText("");
    await expect(skeleton.locator(".animate-pulse").first()).toBeVisible();
    release();
    await expect(page.getByRole("heading", { name: /We couldn’t find/ })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  } finally {
    release();
  }
});

for (const width of [390, 768, 1440]) {
  test(`featured error card spans the section and retries at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/auth/session", (route) =>
      route.fulfill({ json: { customer: null, business: null } }),
    );
    let unavailable = true;
    await page.route("**/api/featured-restaurants", (route) => {
      if (unavailable) {
        return route.fulfill({ status: 503, json: { error: "Unavailable" } });
      }
      return route.fulfill({ json: { featured: [{ ...restaurant(), id: "featured-1" }] } });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const alert = page.locator("#featured").getByRole("alert");
    await expect(
      alert.getByRole("heading", { name: "Unable To Load Featured Restaurants" }),
    ).toBeVisible();
    await alert.scrollIntoViewIfNeeded();
    const bounds = await alert.evaluate((element) => {
      const card = element.getBoundingClientRect();
      const section = element.parentElement!.getBoundingClientRect();
      return {
        leftGap: Math.abs(card.left - section.left),
        rightGap: Math.abs(section.right - card.right),
        overflows: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(bounds.leftGap).toBeLessThanOrEqual(1);
    expect(bounds.rightGap).toBeLessThanOrEqual(1);
    expect(bounds.overflows).toBe(false);
    await alert.screenshot({ path: testInfo.outputPath(`featured-error-${width}.png`) });
    unavailable = false;
    await alert.getByRole("button", { name: "Try Again" }).click();
    await expect(page.getByRole("link", { name: "View Bistro Downtown" })).toBeVisible();
    await expect(alert).toHaveCount(0);
  });
}

test("featured restaurant skeletons stay within the viewport and resolve to cards", async ({
  page,
}, testInfo) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/featured-restaurants", async (route) => {
    await pending;
    await route.fulfill({ json: { featured: [{ ...restaurant(), id: "featured-1" }] } });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  try {
    await page.goto("/");
    const skeleton = page.getByRole("status", { name: "Loading Featured Restaurants" });
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveText("");
    await skeleton.scrollIntoViewIfNeeded();
    expect(
      await skeleton.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= window.innerWidth;
      }),
    ).toBe(true);
    expect(
      await skeleton
        .locator(".animate-pulse")
        .evaluateAll((elements) =>
          elements.every((element) => getComputedStyle(element).animationName === "none"),
        ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("featured-loading.png"),
      animations: "disabled",
    });
    release();
    await expect(page.getByRole("link", { name: "View Bistro Downtown" })).toBeVisible();
    await expect(skeleton).toHaveCount(0);
  } finally {
    release();
  }
});

test("search replaces skeletons and restaurant details wait for a valid profile", async ({
  page,
}, testInfo) => {
  let releaseSearch = () => {};
  const searchPending = new Promise<void>((resolve) => {
    releaseSearch = resolve;
  });
  await page.route("**/api/search/restaurants**", async (route) => {
    await searchPending;
    await route.fulfill({ json: searchResponse(SEARCH_RESTAURANTS, route.request().url()) });
  });
  let releaseProfile = () => {};
  const profilePending = new Promise<void>((resolve) => {
    releaseProfile = resolve;
  });
  await mockRestaurantVisit(page);
  await page.route("**/api/restaurants/bistro/loc-1?version=2", async (route) => {
    await profilePending;
    await route.fallback();
  });
  try {
    await page.goto("/search/Test%20City");
    const searchSkeleton = page.getByRole("status", { name: "Loading Restaurants" });
    await expect(searchSkeleton).toBeVisible();
    await expect(page.getByText("Searching Restaurants...")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("search-loading.png"),
      animations: "disabled",
    });
    releaseSearch();
    await expect(page.getByRole("article")).toHaveCount(3);
    await expect(searchSkeleton).toHaveCount(0);
    await page.getByRole("link", { name: "View Bistro Downtown" }).click();
    const profileLoading = page.getByRole("status", { name: "Loading Restaurant" });
    await expect(profileLoading).toHaveText("");
    await expect(profileLoading.locator(".animate-pulse").first()).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(
      await profileLoading.locator(".animate-pulse").evaluateAll((elements) =>
        elements.every((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= window.innerWidth;
        }),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("restaurant-loading.png"),
      animations: "disabled",
    });
    releaseProfile();
    await expect(page.getByRole("heading", { name: "Bistro Downtown", level: 1 })).toBeVisible();
    await expect(profileLoading).toHaveCount(0);
  } finally {
    releaseSearch();
    releaseProfile();
  }
});

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/api/search/restaurants**", (route) =>
    route.fulfill({ json: searchResponse(SEARCH_RESTAURANTS, route.request().url()) }),
  );
  await page.route("**/api/locations/search-suggestions**", (route) =>
    route.fulfill({ json: { suggestions: [] } }),
  );
  await page.route("**/test-restaurant.jpg", (route) => route.fulfill({ status: 404 }));
});

async function mockRestaurantVisit(page: Page, available = true) {
  await page.route("**/auth/me", (route) => route.fulfill({ json: { user: null } }));
  await page.route("**/api/restaurants/bistro/loc-1/reviews?**", (route) =>
    route.fulfill({
      json: { reviews: [], totalReviews: 12, avgRating: 4.7, nextCursor: null, hasMore: false },
    }),
  );
  await page.route("**/api/restaurants/bistro/loc-1?version=2", (route) =>
    route.fulfill({
      json: {
        restaurant: {
          ...SEARCH_RESTAURANTS[0],
          photos: [],
          menu: [],
          reviews: [],
          reviewsPage: { nextCursor: null, hasMore: false },
          cuisineTypes: ["Japanese"],
          openingHours: null,
          phone: null,
          website: null,
          googleMapsUrl: null,
          latitude: null,
          longitude: null,
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
  let remaining = 2;
  if (!available) {
    remaining = 0;
  }
  await page.route("**/api/reservations/bistro/loc-1/availability**", (route) =>
    route.fulfill({
      json: {
        slots: [{ time: "18:00", label: "6:00 PM", available, remaining }],
        availability: { status: "available" },
      },
    }),
  );
}

async function mobileSearchLayout(form: Locator) {
  return form.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const selectors = [
      "button[aria-label^='Date:']",
      "button[aria-label^='Time:']",
      "button[aria-label^='Number of guests:']",
      "input[role='combobox']",
      "button[type='submit']",
    ];
    const fields = selectors.map((selector) => {
      const field = element.querySelector(selector);
      if (!field) {
        throw new Error(`Missing search field: ${selector}`);
      }
      const fieldBounds = field.getBoundingClientRect();
      return { y: fieldBounds.y - bounds.y, height: fieldBounds.height };
    });
    return { height: bounds.height, radius: style.borderRadius, padding: style.padding, fields };
  });
}

async function buttonStyle(button: Locator) {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      font: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      radius: style.borderRadius,
    };
  });
}

async function cardContentSpacing(card: Locator) {
  return card.locator("h3").evaluate((title) => {
    const content = title.parentElement;
    const metadata = title.nextElementSibling;
    const location = metadata?.nextElementSibling;
    const actions = location?.nextElementSibling;
    if (!content || !metadata || !location || !actions) {
      throw new Error("Restaurant card sections missing");
    }
    const bounds = content.getBoundingClientRect();
    const titleBounds = title.getBoundingClientRect();
    const metadataBounds = metadata.getBoundingClientRect();
    const locationBounds = location.getBoundingClientRect();
    const action = actions.firstElementChild;
    if (!action) {
      throw new Error("Restaurant card action missing");
    }
    const actionBounds = action.getBoundingClientRect();
    return [
      bounds.height,
      titleBounds.y - bounds.y,
      metadataBounds.y - titleBounds.bottom,
      locationBounds.y - metadataBounds.bottom,
      actionBounds.y - locationBounds.bottom,
      bounds.bottom - actionBounds.bottom,
    ].map((value) => Math.round(value * 100) / 100);
  });
}

test("search and featured cards have the same content spacing and text-only actions", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/search");
  await expect(page.getByRole("article")).toHaveCount(3);
  const searchCard = page.getByRole("article", { name: "Bistro Downtown" });
  const searchSpacing = await cardContentSpacing(searchCard);
  expect(searchSpacing).toEqual([156, 16, 4, 8, 16, 16]);
  await expect(
    searchCard.getByRole("link", { name: "Book Table at Bistro Downtown" }).locator("svg"),
  ).toHaveCount(0);
  await expect(
    searchCard.getByRole("link", { name: "Join Queue at Bistro Downtown" }).locator("svg"),
  ).toHaveCount(0);
  await searchCard.screenshot({
    path: testInfo.outputPath("search-card.png"),
    animations: "disabled",
  });
  await page.route("**/api/featured-restaurants", (route) =>
    route.fulfill({
      json: {
        featured: SEARCH_RESTAURANTS.map((restaurant) => ({
          ...restaurant,
          id: restaurant.locationId,
        })),
      },
    }),
  );
  await page.route("https://images.unsplash.com/**", (route) => route.abort());
  await page.goto("/");
  const featuredCard = page.getByRole("link", { name: "View Bistro Downtown" });
  await expect(featuredCard).toBeVisible();
  expect(await cardContentSpacing(featuredCard)).toEqual(searchSpacing);
  await expect(
    featuredCard.getByRole("button", { name: "Book Table", exact: true }).locator("svg"),
  ).toHaveCount(0);
  await expect(
    featuredCard.getByRole("link", { name: "Join queue at Bistro Downtown" }).locator("svg"),
  ).toHaveCount(0);
  await featuredCard.screenshot({
    path: testInfo.outputPath("featured-card.png"),
    animations: "disabled",
  });
});

test("mobile search follows the homepage layout and cards use its photo proportions", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search");
  await expect(page.getByRole("article")).toHaveCount(3);
  const discoveryLayout = await mobileSearchLayout(page.getByRole("search"));
  const discoveryButton = await buttonStyle(
    page.getByRole("link", { name: "Book Table at Bistro Downtown" }),
  );
  const unavailableButton = await buttonStyle(
    page.getByRole("button", { name: "Reservations Unavailable at Local Kitchen" }),
  );
  expect(unavailableButton).toEqual(discoveryButton);
  const photo = await page
    .getByRole("link", { name: "View Bistro Downtown" })
    .locator(":scope > div")
    .boundingBox();
  expect(photo).not.toBeNull();
  if (photo) {
    expect(photo.width / photo.height).toBeCloseTo(4 / 3, 2);
  }
  await page.route("**/api/featured-restaurants", (route) =>
    route.fulfill({
      json: {
        featured: SEARCH_RESTAURANTS.map((restaurant) => ({
          ...restaurant,
          id: restaurant.locationId,
        })),
      },
    }),
  );
  await page.route("https://images.unsplash.com/**", (route) => route.abort());
  await page.goto("/");
  const homepageForm = page.locator("form").filter({
    has: page.getByRole("combobox", { name: "Search restaurants, cuisines, or areas" }),
  });
  await expect(homepageForm).toBeVisible();
  const homepageLayout = await mobileSearchLayout(homepageForm);
  expect(discoveryLayout.height).toBe(homepageLayout.height);
  expect(discoveryLayout.radius).toBe(homepageLayout.radius);
  expect(discoveryLayout.padding).toBe(homepageLayout.padding);
  expect(discoveryLayout.fields).toEqual(homepageLayout.fields);
  const homepageButton = page
    .getByRole("link", { name: "View Bistro Downtown" })
    .getByRole("button", { name: "Book Table", exact: true });
  await expect(homepageButton).toBeAttached();
  expect(discoveryButton).toEqual(await buttonStyle(homepageButton));
  await homepageForm.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("homepage-mobile-390.png"),
    animations: "disabled",
  });
});

test("restaurant visit actions stay side by side without icons or the removed instruction", async ({
  page,
}, testInfo) => {
  await mockRestaurantVisit(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/bistro/loc-1?date=2027-10-16&time=18%3A00&partySize=3");
    await expect(page.getByRole("heading", { name: "Bistro Downtown", level: 1 })).toBeVisible();
    const book = page.getByRole("button", { name: "Book Table", exact: true });
    const queue = page.getByRole("link", { name: "Join Queue", exact: true });
    await expect(book).toBeEnabled();
    await expect(book.locator("svg")).toHaveCount(0);
    await expect(queue.locator("svg")).toHaveCount(0);
    await expect(queue).toHaveAttribute("href", "/queue/bistro/loc-1");
    await expect(page.getByText("Select number of guests, date, and time to book.")).toHaveCount(0);
    const bookBounds = await book.boundingBox();
    const queueBounds = await queue.boundingBox();
    if (!bookBounds || !queueBounds) {
      throw new Error("Restaurant actions missing");
    }
    expect(queueBounds.y).toBe(bookBounds.y);
    const expectedGap = await book.evaluate(
      () => parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.75,
    );
    expect(queueBounds.x - bookBounds.x - bookBounds.width).toBeCloseTo(expectedGap, 0);
    await book.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`restaurant-actions-${width}.png`),
      animations: "disabled",
    });
    await book.click();
    const bookingDialog = page.getByRole("dialog", { name: "Book a Table" });
    await expect(bookingDialog).toBeVisible();
    if (width < 640) {
      const title = bookingDialog.getByRole("heading", { name: "Book a Table", exact: true });
      await expect(title).toHaveCSS("font-size", "15px");
      await expect(title).toHaveCSS("font-weight", "500");
      for (const label of await bookingDialog.locator("label").all()) {
        await expect(label).toHaveCSS("font-size", "12px");
        await expect(label).toHaveCSS("font-weight", "500");
      }
      await expect(bookingDialog).toHaveCSS("font-size", "13px");
      await expect
        .poll(() => bookingDialog.evaluate((element) => element.scrollWidth - element.clientWidth))
        .toBeLessThanOrEqual(1);
    }
  }
});

test("unavailable times notice has equal spacing above and below", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockRestaurantVisit(page, false);
  await page.goto("/bistro/loc-1?date=2027-10-16&time=18%3A00&partySize=3");
  const notice = page.getByText("Try another date or a smaller party to find an available time.");
  await expect(notice).toBeVisible();
  const topGap = await notice.evaluate((element) => {
    const slots = element.previousElementSibling;
    if (!slots) {
      throw new Error("Reservation slots missing");
    }
    return element.getBoundingClientRect().top - slots.getBoundingClientRect().bottom;
  });
  const noticeBounds = await notice.boundingBox();
  const book = page.getByRole("button", { name: "Book Table", exact: true });
  await expect(book).toBeDisabled();
  const bookBounds = await book.boundingBox();
  if (!noticeBounds || !bookBounds) {
    throw new Error("Reservation notice or actions missing");
  }
  expect(topGap).toBe(16);
  expect(bookBounds.y - noticeBounds.y - noticeBounds.height).toBe(16);
  await notice.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("unavailable-times-390.png"),
    animations: "disabled",
  });
});

for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
  test(`discovery fits ${width}px without horizontal overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/search/Test%20City?date=2027-10-16&time=19%3A00&partySize=3");
    await expect(page.getByRole("article")).toHaveCount(3);
    const controls = page.getByRole("group", { name: "Restaurant Controls" });
    const filterBounds = (await controls
      .getByRole("button", { name: "Filter", exact: true })
      .boundingBox())!;
    const sortBounds = (await controls
      .getByRole("button", { name: "Sort By: Recommended", exact: true })
      .boundingBox())!;
    expect(sortBounds.x).toBeGreaterThan(filterBounds.x + filterBounds.width);
    expect(Math.abs(sortBounds.y - filterBounds.y)).toBeLessThanOrEqual(1);
    const rightGap = await controls.evaluate(
      (element) =>
        element.parentElement!.getBoundingClientRect().right -
        element.getBoundingClientRect().right,
    );
    expect(Math.abs(rightGap)).toBeLessThanOrEqual(1);
    if (width < 768) {
      const controlsBounds = (await controls.boundingBox())!;
      expect(Math.abs(filterBounds.x - controlsBounds.x)).toBeLessThanOrEqual(1);
      const quickFilterBounds = (await page
        .getByRole("button", { name: "Open Now", exact: true })
        .boundingBox())!;
      expect(filterBounds.y).toBeGreaterThanOrEqual(quickFilterBounds.y + quickFilterBounds.height);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const cards = await page.getByRole("article").evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      }),
    );
    if (width < 640) {
      expect(cards[0].x).toBe(cards[1].x);
      expect(cards[1].y).toBeGreaterThan(cards[0].y);
    } else if (width >= 1024) {
      expect(cards[0].y).toBe(cards[2].y);
      expect(cards[0].height).toBe(cards[2].height);
      const dateValue = page
        .getByRole("button", { name: "Date: Oct 16, 2027" })
        .getByText("Oct 16, 2027", { exact: true });
      await expect(dateValue).toBeVisible();
      expect(
        await dateValue.evaluate((element) => {
          const container = element.parentElement;
          return Boolean(container && container.scrollWidth <= container.clientWidth + 1);
        }),
      ).toBe(true);
      const searchBounds = await page.getByRole("search").boundingBox();
      expect(searchBounds?.height).toBeLessThanOrEqual(68);
      const bookBounds = await page
        .getByRole("link", { name: "Book Table at Bistro Downtown" })
        .boundingBox();
      const queueBounds = await page
        .getByRole("link", { name: "Join Queue at Bistro Downtown" })
        .boundingBox();
      expect(bookBounds).not.toBeNull();
      expect(queueBounds).not.toBeNull();
      if (bookBounds && queueBounds) {
        expect(queueBounds.y).toBe(bookBounds.y);
        expect(queueBounds.x - bookBounds.x - bookBounds.width).toBeCloseTo(12, 0);
      }
    }
    if (width === 1440 || width === 390) {
      await page.screenshot({
        path: testInfo.outputPath(`discovery-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  });
}

test("mobile filters apply live, clear, trap focus, and return focus on Escape", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search/Test%20City");
  await expect(page.getByRole("article")).toHaveCount(3);
  const trigger = page.getByRole("button", { name: "Filter", exact: true });
  await trigger.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Show 3 Restaurants" })).toBeInViewport();
  expect(await page.locator("body").getAttribute("data-scroll-locked")).toBeTruthy();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(await sheet.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await sheet.getByRole("button", { name: "Japanese", exact: true }).click();
  await sheet.getByRole("button", { name: "$$", exact: true }).click();
  await expect(sheet.getByLabel("2 active filters")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Show 1 Restaurant" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("filters-390.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(sheet).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Filter 2" })).toBeFocused();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Filter 2" }).click();
  await sheet.getByRole("button", { name: "Clear All" }).click();
  await expect(sheet.getByRole("button", { name: "Show 3 Restaurants" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close Filters" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
});

test("filters sheet keeps its footer visible at 320px with short height", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/search");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: "Show 3 Restaurants" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sheet.getByRole("switch", { name: "Open Now" }).click();
  await sheet.getByRole("button", { name: "Show 1 Restaurant" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("date, time, and guests persist to search, booking, and browser history", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search/Test%20City?date=2027-10-16&time=19%3A00&partySize=3");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Date: Oct 16, 2027" }).click();
  await page
    .getByRole("grid", { name: "October 2027" })
    .getByRole("gridcell", { name: "17", exact: true })
    .click();
  await page.getByRole("button", { name: "Time: 7:00 PM" }).click();
  await page.getByRole("button", { name: "8:00 PM", exact: true }).click();
  await page.getByRole("button", { name: "Number of guests: 3 Guests" }).click();
  await page.getByRole("button", { name: "5 Guests", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/date=2027-10-17&time=20%3A00&partySize=5/);
  await expect(page.getByRole("link", { name: "Book Table at Bistro Downtown" })).toHaveAttribute(
    "href",
    "/bistro/loc-1?date=2027-10-17&time=20%3A00&book=1&partySize=5",
  );
  await page.goBack();
  await expect(page).toHaveURL(/date=2027-10-16&time=19%3A00&partySize=3/);
  await expect(page.getByRole("button", { name: "Date: Oct 16, 2027" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Time: 7:00 PM" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Number of guests: 3 Guests" })).toBeVisible();
});

test("desktop sorting and mobile filters share state after resizing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/search/Test%20City");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Sort By: Recommended" }).click();
  await page.getByRole("button", { name: "Most Reviewed", exact: true }).click();
  await expect(page.getByRole("article").first()).toHaveAccessibleName("Garden Bistro");
  await page.getByRole("button", { name: "Cuisine: Cuisine" }).click();
  await page.getByRole("button", { name: "Italian", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Filter 1" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Italian", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("dialog").getByRole("button", { name: "Show 1 Restaurant" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("theme tokens keep search and cards readable in dark mode", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search/Test%20City");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(page.locator(".discovery-page")).toHaveCSS("background-color", "rgb(15, 23, 41)");
  expect(
    await page
      .getByRole("article")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe("rgb(255, 255, 255)");
  await expect(page.getByRole("link", { name: "Book Table at Bistro Downtown" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("discovery-dark-390.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("long names and locations fit mobile cards and selected filters", async ({ page }) => {
  const longLocation = "A Very Long Restaurant Neighborhood With A Detailed Location Name";
  const longName = "A Very Long Restaurant Name That Wraps Across Multiple Lines";
  await page.route("**/api/search/restaurants**", (route) =>
    route.fulfill({
      json: searchResponse(
        [
          restaurant({ name: longName, shortAddress: longLocation, area: longLocation }),
          restaurant({ locationId: "loc-2", name: "Short Name", cuisine: "Other Cuisine" }),
        ],
        route.request().url(),
      ),
    }),
  );
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/search");
    await expect(page.getByRole("article")).toHaveCount(2);
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("combobox", { name: "Location" })).toHaveCount(
      0,
    );
    await page.getByRole("dialog").getByRole("button", { name: "Japanese", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Show 1 Restaurant" }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test("successful profile images fill the card and disabled services cannot navigate", async ({
  page,
}) => {
  await page.route("**/test-restaurant.jpg", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/search");
  await expect(page.getByRole("article")).toHaveCount(3);
  const image = page
    .getByRole("article", { name: "Bistro Downtown" })
    .getByRole("img", { name: "Bistro Downtown", exact: true });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate(
      (element) =>
        element instanceof HTMLImageElement &&
        element.complete &&
        element.naturalWidth > 0 &&
        getComputedStyle(element).objectFit === "cover",
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Reservations Unavailable at Local Kitchen" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Join Queue at Garden Bistro" })).toBeDisabled();
  for (const name of ["Reservations Unavailable at Local Kitchen", "Join Queue at Garden Bistro"]) {
    const action = page.getByRole("button", { name });
    await expect(action.locator("svg")).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "Join Queue at Bistro Downtown" })).toHaveAttribute(
    "href",
    "/queue/bistro/loc-1",
  );
  for (const name of ["Book Table at Bistro Downtown", "Join Queue at Bistro Downtown"]) {
    await expect(page.getByRole("link", { name }).locator("svg")).toHaveCount(0);
  }
});

for (const width of [390, 1440]) {
  test(`restaurant filters preserve multiple selections at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/search/Test%20City");
    await expect(page.getByRole("article")).toHaveCount(3);
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Location", { exact: true })).toHaveCount(0);
    for (const name of ["Japanese", "Italian", "$", "$$$", "4.0+", "4.5+"]) {
      await panel.getByRole("button", { name, exact: true }).click();
    }
    await expect(panel.getByRole("button", { name: "Show 1 Restaurant" })).toBeVisible();
    for (const name of ["Japanese", "Italian", "$", "$$$", "4.0+", "4.5+"]) {
      await expect(panel.getByRole("button", { name, exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    await page.screenshot({
      path: testInfo.outputPath(`restaurant-multiple-filters-${width}.png`),
      animations: "disabled",
    });
    await panel.getByRole("button", { name: "Show 1 Restaurant" }).click();
    await expect(page.getByRole("article", { name: "Garden Bistro" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("article", { name: "Garden Bistro" })).toBeVisible();
    const params = new URL(page.url()).searchParams;
    expect(params.getAll("cuisine")).toEqual(["Japanese", "Italian"]);
    expect(params.getAll("price")).toEqual(["$", "$$$"]);
    expect(params.getAll("minRating")).toEqual(["4", "4.5"]);
    if (width >= 768) {
      await page.getByRole("button", { name: "Cuisine: Cuisine (2)", exact: true }).click();
      const cuisine = page.getByRole("dialog", { name: "Cuisine", exact: true });
      await cuisine.getByRole("button", { name: "Italian", exact: true }).click();
      await expect(cuisine.getByRole("button", { name: "Japanese", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(cuisine.getByRole("button", { name: "Italian", exact: true })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await page.keyboard.press("Escape");
      await expect(cuisine).not.toBeVisible();
      await page.goBack();
      await expect(page.getByRole("article", { name: "Garden Bistro" })).toBeVisible();
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

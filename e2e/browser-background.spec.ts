import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL) {
      await route.abort();
      return;
    }
    if (url.pathname === "/auth/session") {
      await route.fulfill({ json: { customer: { name: "Guest" }, business: null } });
      return;
    }
    if (url.pathname === "/auth/business/example/addresses") {
      await route.fulfill({
        json: {
          addresses: [
            {
              id: "location",
              businessName: "Example",
              address: "Main Street",
              queueEnabled: false,
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/reservations/manage/example") {
      await route.fulfill({
        json: {
          reservation: {
            name: "Guest",
            status: "confirmed",
            reservationDateTime: "2026-10-01T18:00:00",
            partySize: 2,
          },
          restaurant: { name: "Example", address: "Main Street" },
          settings: {},
        },
      });
      return;
    }
    if (url.pathname === "/api/restaurants/example/location") {
      await route.fulfill({
        json: {
          restaurant: {
            businessUsername: "example",
            businessName: "Example",
            locationId: "location",
            name: "Example",
            address: "Main Street",
            photos: [],
            menu: [],
            reviews: [],
            cuisineTypes: [],
            reviewCount: 0,
            rating: null,
            queueEnabled: false,
            reservationsEnabled: false,
          },
        },
      });
      return;
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return;
    }
    await route.continue();
  });
});

const surfaces = [
  { path: "/login", surface: "auth", gradient: true },
  { path: "/signup", surface: "auth", gradient: true },
  { path: "/business/login", surface: "auth", gradient: true },
  { path: "/business/signup", surface: "auth", gradient: true },
  { path: "/forgot", surface: "auth", gradient: true },
  { path: "/reset", surface: "auth", gradient: true },
  { path: "/profile", surface: "auth", gradient: true },
  { path: "/help", surface: "auth", gradient: true },
  { path: "/feedback", surface: "auth", gradient: true },
  { path: "/sales", surface: "sales", gradient: true },
  { path: "/queue/example/location", surface: "queue", gradient: true },
  { path: "/search", surface: "muted", gradient: false },
  { path: "/reservations/manage/example", surface: "muted", gradient: false },
  { path: "/missing-page", surface: "not-found", gradient: false },
];

for (const { path, surface, gradient } of surfaces) {
  test(`${path} paints its surface on the document`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator(`[data-page-background="${surface}"]`)).toBeVisible();
    await expect(page.getByRole("heading").first()).toBeVisible();
    const body = page.locator("body");
    const html = page.locator("html");
    const color = await body.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(color).not.toBe("rgb(255, 255, 255)");
    expect(color).not.toBe("rgba(0, 0, 0, 0)");
    await expect(html).toHaveCSS("background-color", color);
    if (gradient) {
      await expect(body).toHaveCSS("background-image", /linear-gradient/);
    } else {
      await expect(body).toHaveCSS("background-image", "none");
    }
  });
}

for (const path of ["/", "/business", "/policy", "/terms", "/example/location", "/admin"]) {
  test(`${path} keeps the default document surface`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("#root")).not.toBeEmpty();
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.locator("body")).toHaveCSS("background-image", "none");
  });
}

test("navigation resets document color and gradients", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("body")).toHaveCSS("background-image", /linear-gradient/);
  await page.getByRole("link", { name: "SeatPing", exact: true }).first().click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("body")).toHaveCSS("background-image", "none");
  await page.goBack();
  await expect(page.locator("body")).toHaveCSS("background-image", /linear-gradient/);
  await page.goto("/missing-page");
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("a failed reservation load switches to the not-found surface", async ({ page }) => {
  await page.goto("/reservations/manage/missing");
  await expect(page.locator('[data-page-background="not-found"]')).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(251, 248, 239)");
  await expect(page.locator("body")).toHaveCSS("background-image", "none");
});

test("the business surface appears after the session loads", async ({ page }) => {
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: { name: "Restaurant" } } }),
  );
  await page.route("**/auth/business/me", (route) =>
    route.fulfill({ json: { user: { name: "Restaurant", locations: [] } } }),
  );
  await page.goto("/business/queue");
  await expect(page.locator('[data-page-background="business"]')).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await expect(page.locator("body")).toHaveCSS("background-image", /linear-gradient/);
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflows).toBe(false);
});

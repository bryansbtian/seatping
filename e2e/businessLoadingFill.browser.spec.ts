import { expect, test, type Locator, type Page } from "@playwright/test";

async function mockBusinessSession(page: Page) {
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: { name: "Example Restaurant" } } }),
  );
  await page.route("**/auth/business/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "business-fixture",
          name: "Example Restaurant",
          locations: [
            { id: "location-fixture", displayName: "PIK Avenue", address: "Example Street" },
          ],
        },
      },
    }),
  );
  await page.route("**/auth/business/language", (route) =>
    route.fulfill({ json: { language: "en" } }),
  );
}

async function expectFilledLoading(page: Page, loading: Locator) {
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCSS("flex-grow", "1");
  await expect
    .poll(() =>
      loading.evaluate((element) => {
        const main = element.closest("main")!.getBoundingClientRect();
        const container = element.closest(".container")!;
        const padding = Number.parseFloat(getComputedStyle(container).paddingBottom);
        const bounds = element.getBoundingClientRect();
        return Math.abs(main.bottom - bounds.bottom - padding);
      }),
    )
    .toBeLessThanOrEqual(2);
  await expect
    .poll(() =>
      page.getByRole("main").evaluate((element) => element.scrollHeight - element.clientHeight),
    )
    .toBeLessThanOrEqual(2);
  const placeholders = loading.locator(".animate-pulse").filter({ visible: true });
  expect(await placeholders.count()).toBeGreaterThan(0);
  for (const placeholder of await placeholders.all()) {
    await expect(placeholder).toHaveCSS("background-color", "rgb(226, 232, 240)");
    const complete = await placeholder.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const main = element.closest("main")!.getBoundingClientRect();
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.top >= main.top &&
        bounds.bottom <= main.bottom &&
        bounds.left >= main.left &&
        bounds.right <= main.right
      );
    });
    expect(complete).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
}

for (const width of [320, 390, 1440]) {
  test(`business pages show the shared no locations card at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 768 });
    await mockBusinessSession(page);
    await page.route("**/auth/business/me", (route) =>
      route.fulfill({
        json: { user: { id: "business-fixture", name: "Example Restaurant", locations: [] } },
      }),
    );
    const operationalRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/")) {
        operationalRequests.push(path);
      }
    });
    for (const section of [
      "overview",
      "queue",
      "reservations",
      "floor",
      "guests",
      "reviews",
      "campaigns",
      "performance",
    ]) {
      await page.goto(`/business/${section}`);
      const empty = page.getByTestId("business-no-locations");
      await expect(empty.getByRole("heading", { name: "No Locations Yet" })).toBeVisible();
      await expect(
        empty.getByText(
          "Add a location to start tracking guests from reservations and waitlist joins.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByText(/Choose a location|Select a location/),
      ).toHaveCount(0);
      const layout = await empty.evaluate((element) => {
        const card = element.getBoundingClientRect();
        const main = element.closest("main")!.getBoundingClientRect();
        const container = element.closest(".container")!;
        const bottomPadding = Number.parseFloat(getComputedStyle(container).paddingBottom);
        return {
          bottomGap: Math.abs(main.bottom - card.bottom - bottomPadding),
          withinViewport: card.left >= 0 && card.right <= window.innerWidth,
          overflows: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      expect(layout.bottomGap).toBeLessThanOrEqual(2);
      expect(layout.withinViewport).toBe(true);
      expect(layout.overflows).toBe(false);
      if (section === "queue") {
        await page.screenshot({ path: testInfo.outputPath(`no-locations-${width}.png`) });
      }
    }
    expect(operationalRequests).toEqual([]);
    await page.goto("/business/settings");
    await expect(page.getByRole("heading", { name: "Location Management" })).toBeVisible();
    await expect(page.getByTestId("business-no-locations")).toHaveCount(0);
  });

  test(`overview placeholders fill the viewport while its account loads at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 768 });
    await mockBusinessSession(page);
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/auth/business/me", async (route) => {
      await pending;
      await route.fulfill({
        json: {
          user: {
            id: "business-fixture",
            name: "Example Restaurant",
            locations: [
              { id: "location-fixture", displayName: "PIK Avenue", address: "Example Street" },
            ],
          },
        },
      });
    });
    try {
      await page.goto("/business/overview");
      const loading = page.getByTestId("overview-loading");
      await expect(loading.getByRole("status", { name: "Loading Page" })).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      for (const height of [768, 568, 320, 1024]) {
        await page.setViewportSize({ width, height });
        await expect
          .poll(() =>
            loading.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              const placeholders = Array.from(element.querySelectorAll(".animate-pulse")).filter(
                (placeholder) => placeholder.getBoundingClientRect().height > 0,
              );
              const status = element.querySelector("[role='status']")!;
              const inner = status.firstElementChild!;
              const innerBounds = inner.getBoundingClientRect();
              const styles = getComputedStyle(inner);
              const lastRow = inner.lastElementChild!.getBoundingClientRect();
              const expectedBottom = innerBounds.bottom - Number.parseFloat(styles.paddingBottom);
              return {
                top: bounds.top,
                viewportFilled: Math.abs(bounds.bottom - window.innerHeight) <= 1,
                rowsFilled: Math.abs(lastRow.bottom - expectedBottom) <= 1,
                pageFits:
                  document.documentElement.scrollHeight <= window.innerHeight + 1 &&
                  document.documentElement.scrollWidth <= window.innerWidth + 1,
                clipped: placeholders
                  .filter((placeholder) => {
                    const rectangle = placeholder.getBoundingClientRect();
                    return (
                      rectangle.top < bounds.top ||
                      rectangle.bottom > bounds.bottom ||
                      rectangle.left < bounds.left ||
                      rectangle.right > bounds.right
                    );
                  })
                  .map((placeholder) => {
                    const box = placeholder.getBoundingClientRect();
                    return {
                      x: box.x,
                      y: box.y,
                      width: box.width,
                      height: box.height,
                      viewport: window.innerHeight,
                    };
                  }),
              };
            }),
          )
          .toEqual({ top: 0, viewportFilled: true, rowsFilled: true, pageFits: true, clipped: [] });
      }
      release();
      await expect(loading).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Hello Example Restaurant!" }).filter({ visible: true }),
      ).toBeVisible();
    } finally {
      release();
    }
  });

  test(`business loading surfaces fill the remaining workspace at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 768 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockBusinessSession(page);
    for (const section of [
      {
        path: "/business/performance",
        endpoint: /\/api\/performance\/location-fixture\?/,
        testId: "performance-loading",
        floorMode: "live",
        json: { metrics: { hasActivity: false } },
      },
      {
        path: "/business/reviews",
        endpoint: "**/api/locations/location-fixture/reviews",
        testId: "reviews-loading",
        floorMode: "live",
        json: { reviews: [] },
      },
      {
        path: "/business/floor",
        endpoint: "**/api/floor/location-fixture/live",
        testId: "live-floor-loading",
        floorMode: "live",
        json: { rooms: [], waitingParties: [], admittedParties: [] },
      },
      {
        path: "/business/floor",
        endpoint: "**/api/floor/location-fixture",
        testId: "floor-editor-loading",
        floorMode: "edit",
        json: { rooms: [] },
      },
    ]) {
      if (page.url().startsWith("http")) {
        await page.evaluate((mode) => {
          localStorage.setItem("seatping.business.floorMode", mode);
        }, section.floorMode);
      }
      let release = () => {};
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(section.endpoint, async (route) => {
        await pending;
        await route.fulfill({ json: section.json });
      });
      try {
        await page.goto(section.path);
        const loading = page.getByTestId(section.testId);
        await expectFilledLoading(page, loading);
        if (section.testId === "reviews-loading") {
          await expect(loading).toHaveCSS("background-color", "rgb(255, 255, 255)");
          const rows = loading.getByRole("status").locator("[aria-hidden='true'] > div");
          expect(await rows.count()).toBeGreaterThan(0);
          const completeRows = await loading.getByRole("status").evaluate((element) => {
            const inner = element.firstElementChild!;
            const styles = getComputedStyle(inner);
            const bounds = inner.getBoundingClientRect();
            const first = inner.firstElementChild!.getBoundingClientRect();
            const last = inner.lastElementChild!.getBoundingClientRect();
            const top = bounds.top + Number.parseFloat(styles.paddingTop);
            const bottom = bounds.bottom - Number.parseFloat(styles.paddingBottom);
            return first.top >= top - 1 && Math.abs(last.bottom - bottom) <= 1;
          });
          expect(completeRows).toBe(true);
        }
        await page.screenshot({
          path: testInfo.outputPath(`${section.testId}-${width}.png`),
          animations: "disabled",
        });
        release();
        await expect(loading).toHaveCount(0);
      } finally {
        release();
        await page.unroute(section.endpoint);
      }
    }
  });
}

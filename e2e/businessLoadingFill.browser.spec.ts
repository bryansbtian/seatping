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

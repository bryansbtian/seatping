import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.route("**/auth/**", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/api/featured-restaurants", (route) =>
    route.fulfill({ json: { featured: [] } }),
  );
  await page.route("**/api/search/restaurants**", (route) =>
    route.fulfill({
      json: {
        results: [],
        total: 0,
        totalPages: 0,
        facets: { cuisines: [], locations: [] },
      },
    }),
  );
  await page.route("**/api/restaurants/example/location**", (route) =>
    route.fulfill({
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
          reviewsPage: { nextCursor: null, hasMore: false },
          cuisineTypes: [],
          reviewCount: 0,
          rating: null,
          queueEnabled: false,
          reservationsEnabled: false,
        },
      },
    }),
  );
});

for (const path of [
  "/",
  "/search",
  "/example/location",
  "/business",
  "/blog",
  "/policy",
  "/terms",
  "/help",
  "/feedback",
]) {
  test(`${path} renders exactly one public footer`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const footer = page.getByRole("contentinfo");
    await expect(footer).toHaveCount(1);
    await expect(footer.getByText("Smarter queues. Better guest relationships.")).toBeVisible();
    await expect(footer.getByText(`© ${new Date().getFullYear()} SeatPing.`)).toBeVisible();
    await expect(footer.getByRole("link", { name: "Blog", exact: true })).toHaveAttribute(
      "href",
      "/blog",
    );
  });
}

for (const width of [390, 640, 768, 1024, 1440]) {
  test(`all public pages match the business footer gap at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    let expectedGap = 48;
    if (width >= 1024) {
      expectedGap = 72;
    } else if (width >= 768) {
      expectedGap = 64;
    } else if (width >= 640) {
      expectedGap = 56;
    }
    for (const [path, selector] of [
      ["/business", "section:last-of-type > .container"],
      ["/", "#featured > div"],
      ["/search", "main > :last-child"],
      ["/example/location", ".container.max-w-7xl > .grid"],
      ["/blog", "main > div"],
      ["/policy", "section:last-of-type > div"],
      ["/terms", "section:last-of-type > div"],
      ["/help", '[data-page-background="auth"] > div'],
      ["/feedback", "main > div"],
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const footer = page.getByRole("contentinfo");
      await expect(footer).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      const content = page.locator(selector);
      await content.scrollIntoViewIfNeeded();
      if (path === "/business") {
        await expect(content).toHaveCSS("opacity", "1");
      }
      const measureGap = () =>
        page.evaluate((contentSelector) => {
          const contentBottom = document
            .querySelector(contentSelector)!
            .getBoundingClientRect().bottom;
          const footer = document.querySelector("footer")!;
          const dividerTop =
            footer.firstElementChild!.firstElementChild!.getBoundingClientRect().top;
          return Math.round(dividerTop - contentBottom);
        }, selector);
      await expect.poll(measureGap, `${path} content-to-footer gap`).toBe(expectedGap);
      if (width === 390 || width === 1440) {
        await footer.evaluate((element) => {
          window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 240 });
        });
        await expect.poll(measureGap, `${path} gap after scrolling`).toBe(expectedGap);
        let name = path.replaceAll("/", "-");
        if (path === "/") {
          name = "home";
        }
        await page.screenshot({ path: testInfo.outputPath(`footer-gap-${name}-${width}.png`) });
      }
    }
  });
}

test("all management routes remain footer-free with their navigation intact", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: { name: "Restaurant" } } }),
  );
  await page.route("**/auth/business/me", (route) =>
    route.fulfill({ json: { user: { name: "Restaurant", locations: [] } } }),
  );

  for (const route of [
    "overview",
    "queue",
    "reservations",
    "floor",
    "guests",
    "reviews",
    "campaigns",
    "performance",
    "settings",
  ]) {
    await page.goto(`/business/${route}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-page-background="business"]')).toBeVisible();
    await expect(page.getByRole("main")).not.toBeEmpty();
    await expect(page.locator("footer")).toHaveCount(0);
    await expect(page.getByText(/© \d{4} SeatPing/)).toHaveCount(0);
    if (page.viewportSize()!.width < 1024) {
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
    }
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log Out", exact: true })).toBeVisible();
  }
});

for (const [path, heading] of [
  ["/login", "Welcome Back"],
  ["/signup", "Create Your Account"],
  ["/business/login", "Business Log In"],
  ["/business/signup", "Create Your Business Account"],
  ["/forgot", "Forgot Password?"],
  ["/reset?token=example", "Reset Your Password"],
]) {
  test(`${path} keeps its authentication form without a footer`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator("form")).toBeVisible();
    await expect(page.locator("footer")).toHaveCount(0);
  });
}

for (const width of [390, 1440]) {
  test(`Blog construction page is responsive and respects reduced motion at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/blog", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Under Construction" })).toBeVisible();
    const load = page.locator("[data-construction-load]");
    await expect(load).toHaveCSS("animation-name", "construction-swing");
    await expect(load).toHaveCSS("animation-iteration-count", "infinite");
    const brickGap = await load.evaluate((element) => {
      const ground = Array.from(element.parentElement!.querySelectorAll(":scope > rect"));
      const top = Math.min(...ground.map((brick) => brick.getBoundingClientRect().top));
      return top - element.getBoundingClientRect().bottom;
    });
    expect(brickGap).toBeGreaterThan(0);
    const initial = await load.evaluate((element) => getComputedStyle(element).transform);
    await expect
      .poll(() => load.evaluate((element) => getComputedStyle(element).transform))
      .not.toBe(initial);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(load).toHaveCSS("animation-name", "none");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`blog-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Back to Home", exact: true }).click();
    await expect(page).toHaveURL("/");
  });
}

for (const width of [320, 390, 768, 1024, 1440, 1923]) {
  test(`footer fits and stacks at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/help", { waitUntil: "domcontentloaded" });
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await expect(footer).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const balancedPadding = await footer
      .getByText(`© ${new Date().getFullYear()} SeatPing.`)
      .evaluate((element) => {
        const style = getComputedStyle(element.parentElement!);
        return style.paddingTop === style.paddingBottom;
      });
    expect(balancedPadding).toBe(true);
    if (width < 640) {
      const copyright = await footer
        .getByText(`© ${new Date().getFullYear()} SeatPing.`)
        .boundingBox();
      const legal = await footer.getByRole("navigation", { name: "Legal" }).boundingBox();
      expect(copyright).not.toBeNull();
      expect(legal).not.toBeNull();
      expect(Math.abs(copyright!.x + copyright!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(legal!.x + legal!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      const links = footer.getByRole("navigation", { name: "Resources" }).getByRole("link");
      const first = await links.nth(0).boundingBox();
      const second = await links.nth(1).boundingBox();
      const rowHeight = await footer.evaluate(
        () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 2,
      );
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first!.height).toBe(rowHeight);
      expect(Math.abs(second!.y - first!.y - rowHeight)).toBeLessThanOrEqual(1);
      expect(Math.abs(legal!.y - copyright!.y - rowHeight)).toBeLessThanOrEqual(1);
    }

    const layout = await footer.evaluate((element) => {
      const groups = element.querySelector(".grid")!;
      return {
        columns: getComputedStyle(groups).gridTemplateColumns.split(" ").length,
        overflows: document.documentElement.scrollWidth > window.innerWidth,
        linksFit: Array.from(element.querySelectorAll("a")).every((link) => {
          const bounds = link.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= window.innerWidth;
        }),
      };
    });
    let columns = 2;
    if (width >= 1024) {
      columns = 5;
    } else if (width >= 640) {
      columns = 4;
    }
    expect(layout).toEqual({ columns, overflows: false, linksFit: true });
    await footer.screenshot({ path: testInfo.outputPath(`footer-${width}.png`) });
  });
}

for (const [name, path, heading] of [
  ["SeatPing", "/", "Discover Restaurants and Join the Wait Effortlessly"],
  ["Find Restaurants", "/search", "Search Restaurants"],
  ["SeatPing for Business", "/business", "Run Your Front of House From One Place"],
  ["Business Login", "/business/login", "Business Log In"],
  ["Blog", "/blog", "Under Construction"],
  ["Help & FAQ", "/help", "Help & FAQ"],
  ["Feedback", "/feedback", "Tell Us What We Can Improve"],
  ["Privacy Policy", "/policy", "Privacy Policy"],
  ["Terms of Service", "/terms", "Terms of Service"],
]) {
  test(`${name} opens its existing destination`, async ({ page }) => {
    await page.goto("/help", { waitUntil: "domcontentloaded" });
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await footer.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    let footerCount = 1;
    if (path === "/business/login") {
      footerCount = 0;
    }
    await expect(page.getByRole("contentinfo")).toHaveCount(footerCount);
  });
}

for (const path of ["/help", "/", "/#featured"]) {
  test(`Featured Restaurants scrolls below the header from ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    if (path !== "/help") {
      await expect(page.getByText("No featured restaurants yet.")).toBeVisible();
    }
    await page.getByRole("contentinfo").getByRole("link", { name: "Featured Restaurants" }).click();
    await expect(page).toHaveURL("/#featured");
    await expect(page.getByText("No featured restaurants yet.")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.getByRole("heading", { name: "Featured Restaurants", exact: true }),
    ).toBeInViewport();
    await expect
      .poll(() =>
        page.locator("#featured").evaluate((element) => element.getBoundingClientRect().top),
      )
      .toBeCloseTo(96, 0);
  });
}

test("Featured Restaurants stays below the header when loading finishes after navigation", async ({
  page,
}) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/featured-restaurants", async (route) => {
    await pending;
    await route.fulfill({ json: { featured: [] } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("status", { name: "Loading Featured Restaurants" })).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "Featured Restaurants" }).click();
  await expect(page).toHaveURL("/#featured");
  await expect
    .poll(() =>
      page.locator("#featured").evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeCloseTo(96, 0);
  release();
  await expect(page.getByText("No featured restaurants yet.")).toBeVisible();
  await expect
    .poll(() =>
      page.locator("#featured").evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeCloseTo(96, 0);
});

test("footer supports keyboard focus and an accessible LinkedIn icon", async ({
  page,
  browserName,
}) => {
  await page.goto("/help", { waitUntil: "domcontentloaded" });
  const footer = page.getByRole("contentinfo");
  const brand = footer.getByRole("link", { name: "SeatPing", exact: true });
  await brand.focus();
  await expect(brand).toBeFocused();
  if (browserName === "webkit") {
    await page.keyboard.press("Alt+Tab");
  } else {
    await page.keyboard.press("Tab");
  }
  const search = footer.getByRole("link", { name: "Find Restaurants" });
  await expect(search).toBeFocused();
  await expect(search).toHaveCSS("outline-style", "solid");
  await expect(search).toHaveCSS("outline-width", "2px");
  const social = footer.getByRole("link", { name: "SeatPing on LinkedIn" });
  await expect(social).toHaveAttribute("href", "https://www.linkedin.com/company/seatpinghq");
  await expect(social).toHaveText("");
  await expect(social.locator("svg")).toHaveAttribute("aria-hidden", "true");
});

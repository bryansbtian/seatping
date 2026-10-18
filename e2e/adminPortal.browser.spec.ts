import { expect, test, type Locator, type Page } from "@playwright/test";

async function mockAdminApi(page: Page, authenticated = true) {
  const state = { authenticated, loginRequests: 0 };
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/auth/admin/session", (route) =>
    route.fulfill({ json: { authenticated: state.authenticated } }),
  );
  await page.route("**/auth/admin/login", (route) => {
    state.loginRequests += 1;
    state.authenticated = true;
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/auth/admin/logout", (route) => {
    state.authenticated = false;
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/tickets/stats", (route) =>
    route.fulfill({
      json: { stats: { total: 0, open: 0, inProgress: 0, closed: 0, sales: 0, feedback: 0 } },
    }),
  );
  await page.route(/\/tickets\?/, (route) => route.fulfill({ json: { tickets: [] } }));
  await page.route("**/admin/featured-restaurants", (route) =>
    route.fulfill({ json: { featured: [] } }),
  );
  await page.route(/\/admin\/campaign-templates\?/, (route) =>
    route.fulfill({ json: { templates: [], counts: {} } }),
  );
  return state;
}

async function expectNoOverflow(page: Page) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
}

async function expectStandardEmptyState(card: Locator, title: string) {
  const heading = card.getByRole("heading", { name: title, exact: true });
  const emptyState = heading.locator("..");
  const circle = emptyState.locator(":scope > div").first();
  const icon = circle.locator("svg");
  const body = emptyState.locator(":scope > p");
  await expect(heading).toBeVisible();
  await expect(body).not.toBeEmpty();
  await expect(heading).toHaveCSS("text-align", "center");
  await expect(heading).toHaveCSS("font-weight", "600");
  await expect(body).toHaveCSS("text-align", "center");
  await expect(body).toHaveCSS("color", "rgb(100, 116, 139)");
  await expect(circle).toHaveCSS("height", "48px");
  await expect(circle).toHaveCSS("width", "48px");
  await expect(circle).toHaveCSS("border-radius", "9999px");
  await expect(circle).toHaveCSS("background-color", "rgb(241, 245, 249)");
  await expect(icon).toHaveCSS("height", "24px");
  await expect(icon).toHaveCSS("width", "24px");
  await expect(emptyState).toHaveCSS("align-items", "center");
  await expect(emptyState).toHaveCSS("justify-content", "center");
  const alignment = await emptyState.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const iconBounds = element.querySelector("svg")!.parentElement!.getBoundingClientRect();
    const lastChildBounds = element.lastElementChild!.getBoundingClientRect();
    const cardBounds = element
      .closest("[data-testid='admin-content-card']")!
      .getBoundingClientRect();
    return {
      horizontalOffset: Math.abs(
        iconBounds.left + iconBounds.width / 2 - cardBounds.left - cardBounds.width / 2,
      ),
      verticalOffset: Math.abs(
        (iconBounds.top + lastChildBounds.bottom) / 2 - bounds.top - bounds.height / 2,
      ),
    };
  });
  expect(alignment.horizontalOffset).toBeLessThanOrEqual(2);
  expect(alignment.verticalOffset).toBeLessThanOrEqual(2);
}

async function expectBusinessSidebarRegularWeight(sidebar: Locator) {
  for (const label of [
    "Overview",
    "Queue",
    "Reservations",
    "Floor",
    "Guests",
    "Reviews",
    "Campaigns",
    "Performance",
    "Settings",
  ]) {
    await expect(sidebar.getByRole("link", { name: label, exact: true })).toHaveCSS(
      "font-weight",
      "400",
    );
  }
  for (const label of ["Operations", "Customers", "Insights"]) {
    await expect(sidebar.getByText(label, { exact: true })).toHaveCSS("font-weight", "400");
  }
  await expect(sidebar.getByRole("button", { name: "Log Out", exact: true })).toHaveCSS(
    "font-weight",
    "400",
  );
}

test("admin login uses inline validation and retains a protected deep link", async ({
  page,
}, testInfo) => {
  const state = await mockAdminApi(page, false);
  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { name: "Admin Log In" })).toBeVisible();
  await expect(page.getByLabel("Business Username")).toHaveCount(0);
  const form = page.locator("form");
  await expect(form).toHaveAttribute("novalidate", "");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByText("Username is required", { exact: true })).toBeVisible();
  await expect(page.getByText("Password is required", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toBeFocused();
  expect(state.loginRequests).toBe(0);
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("admin-login-validation.png"),
    fullPage: true,
  });
  await page.getByLabel("Username", { exact: true }).fill("test-admin");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByLabel("Business Username")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/customers$/);
  expect(state.loginRequests).toBe(1);
  await expectNoOverflow(page);
});

test("desktop admin sidebar supports collapse, route history, reloads, and logout", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockAdminApi(page);
  await page.goto("/admin/dashboard");
  const sidebar = page.locator("aside");
  await expect(sidebar.getByRole("link", { name: "Ticket Management" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const label of [
    "Ticket Management",
    "Customer Management",
    "Featured Restaurants",
    "Campaign Templates",
  ]) {
    await expect(sidebar.getByRole("link", { name: label, exact: true })).toHaveCSS(
      "font-weight",
      "400",
    );
  }
  await expect(page.getByRole("heading", { name: "Ticket Management", exact: true })).toBeVisible();
  await expect(sidebar).toHaveCSS("width", "256px");
  await sidebar.getByRole("button", { name: /collapse/i }).click();
  await expect(sidebar).toHaveCSS("width", "64px");
  await expect(sidebar.getByText("SP", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "SeatPing Admin Portal" })).toHaveCount(0);
  await sidebar.getByRole("link", { name: "Customer Management" }).click();
  await page.getByLabel("Business Username").fill("example-restaurant");
  await sidebar.getByRole("link", { name: "Featured Restaurants" }).click();
  await expect(page).toHaveURL(/\/admin\/featured$/);
  await expect(page.getByRole("heading", { name: "Add Featured Restaurant" })).toBeVisible();
  await sidebar.getByRole("link", { name: "Campaign Templates" }).click();
  await expect(page).toHaveURL(/\/admin\/templates$/);
  await expect(
    page.getByRole("heading", { name: "No Templates Found", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/featured$/);
  await expect(sidebar.getByRole("link", { name: "Featured Restaurants" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goBack();
  await expect(page.getByLabel("Business Username")).toHaveValue("example-restaurant");
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/featured$/);
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "64px");
  await sidebar.getByRole("button", { name: /expand/i }).click();
  await expect(sidebar).toHaveCSS("width", "256px");
  await expect(sidebar.getByRole("link", { name: "SeatPing Admin Portal" })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("admin-desktop-sidebar.png"), fullPage: true });
  await sidebar.getByRole("button", { name: "Log Out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Admin Log In" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Customer Management" })).toHaveCount(0);
});

test("mobile admin menu closes on navigation and leaves every section within the viewport", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdminApi(page);
  await page.goto("/admin/dashboard");
  const openMenu = page.getByRole("button", { name: /open menu/i });
  await expect(openMenu).toBeVisible();
  await expect(page.locator("aside")).toBeHidden();
  await expectNoOverflow(page);
  for (const [label, path] of [
    ["Customer Management", "/admin/customers"],
    ["Featured Restaurants", "/admin/featured"],
    ["Campaign Templates", "/admin/templates"],
    ["Ticket Management", "/admin/dashboard"],
  ]) {
    await openMenu.click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: label, exact: true }).click();
    await expect(menu).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(path);
    await expectNoOverflow(page);
  }
  await openMenu.click();
  await page.screenshot({
    path: testInfo.outputPath("admin-mobile-menu.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /close menu/i })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`admin primary cards fill the remaining viewport at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAdminApi(page);
    for (const [path, readyText] of [
      ["/admin/dashboard", "No Tickets Found"],
      ["/admin/customers", "Find a Business Account"],
      ["/admin/featured", "No Featured Restaurants Yet"],
      ["/admin/templates", "No Templates Found"],
    ]) {
      await page.goto(path);
      await expect(page.getByText(readyText, { exact: true })).toBeVisible();
      if (path === "/admin/featured" && width === 390) {
        await expect(page.getByLabel("Business Username", { exact: true })).toHaveCSS(
          "height",
          "36px",
        );
      }
      const card = page.getByTestId("admin-content-card");
      await expect(card).toBeVisible();
      await expect
        .poll(() =>
          card.evaluate((element) => element.getBoundingClientRect().bottom - window.innerHeight),
        )
        .toBeGreaterThanOrEqual(-33);
      await page.getByRole("main").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect
        .poll(() =>
          card.evaluate((element) =>
            Math.abs(element.getBoundingClientRect().bottom - window.innerHeight + 32),
          ),
        )
        .toBeLessThanOrEqual(2);
      await expectStandardEmptyState(card, readyText);
      await expectNoOverflow(page);
      expect(
        await page
          .getByRole("main")
          .evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBe(false);
      if (width === 1440) {
        const sidebar = page.locator("aside");
        await sidebar.getByRole("button", { name: "Collapse Sidebar" }).click();
        await expect(sidebar).toHaveCSS("width", "64px");
        await expect(sidebar.getByText("SP", { exact: true })).toHaveCount(0);
        await expect(sidebar.getByRole("link", { name: "SeatPing Admin Portal" })).toHaveCount(0);
        await expect
          .poll(() =>
            card.evaluate((element) =>
              Math.abs(element.getBoundingClientRect().bottom - window.innerHeight + 32),
            ),
          )
          .toBeLessThanOrEqual(2);
        await sidebar.getByRole("button", { name: "Expand Sidebar" }).click();
        await expect(sidebar).toHaveCSS("width", "256px");
        await expect(sidebar.getByRole("link", { name: "SeatPing Admin Portal" })).toBeVisible();
        await expect
          .poll(() =>
            card.evaluate((element) =>
              Math.abs(element.getBoundingClientRect().bottom - window.innerHeight + 32),
            ),
          )
          .toBeLessThanOrEqual(2);
      }
      await page.screenshot({
        path: testInfo.outputPath(`admin-${path.split("/").at(-1)}-${width}.png`),
        animations: "disabled",
      });
    }
  });
}

test("long admin ticket lists remain reachable in the content scroll area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdminApi(page);
  await page.route(/\/tickets\?/, (route) =>
    route.fulfill({
      json: {
        tickets: Array.from({ length: 20 }, (_, index) => ({
          id: `ticket-${index + 1}`,
          ticketNumber: `SP-${index + 1}`,
          subject: `Support Ticket ${index + 1}`,
          type: "feedback",
          status: "open",
          priority: "low",
          senderName: "Test Operator",
          senderEmail: "operator@example.test",
          data: {},
          messages: [],
          createdAt: "2026-10-01T12:00:00.000Z",
          updatedAt: "2026-10-01T12:00:00.000Z",
        })),
      },
    }),
  );
  await page.goto("/admin/dashboard");
  const lastTicket = page.getByRole("heading", { name: "Support Ticket 20", exact: true });
  await expect(lastTicket).toBeAttached();
  const main = page.getByRole("main");
  expect(await main.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await lastTicket.scrollIntoViewIfNeeded();
  await expect(lastTicket).toBeInViewport();
  expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectNoOverflow(page);
});

test("business sidebar labels use regular weight on desktop, collapsed, and mobile navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: { name: "Example Restaurant" } } }),
  );
  await page.route("**/auth/business/me", (route) =>
    route.fulfill({
      json: { user: { name: "Example Restaurant", email: "operator@example.test", locations: [] } },
    }),
  );
  await page.route("**/auth/business/language", (route) =>
    route.fulfill({ json: { language: "en" } }),
  );
  await page.goto("/business/queue");
  const sidebar = page.locator("aside");
  await expect(sidebar.getByRole("link", { name: "Queue", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expectBusinessSidebarRegularWeight(sidebar);
  await sidebar.getByRole("button", { name: "Collapse Sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "64px");
  await expectBusinessSidebarRegularWeight(sidebar);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const mobileSidebar = page.getByRole("dialog");
  await expect(mobileSidebar).toBeVisible();
  await expectBusinessSidebarRegularWeight(mobileSidebar);
  await expectNoOverflow(page);
});

test("admin campaign filters use standard buttons and preserve status requests", async ({
  page,
}, testInfo) => {
  await mockAdminApi(page);
  await page.route(/\/admin\/campaign-templates\?/, (route) =>
    route.fulfill({
      json: {
        templates: [],
        counts: { DRAFT: 2, PENDING_SEATPING_REVIEW: 3, APPROVED: 4, REJECTED: 1 },
      },
    }),
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/admin/templates");
    await expect(
      page.getByRole("heading", { name: "No Templates Found", exact: true }),
    ).toBeVisible();
    const card = page.getByTestId("admin-content-card");
    const refresh = card.getByRole("button", { name: "Refresh", exact: true });
    let expectedHeight = "28px";
    if (width < 640) {
      expectedHeight = "32px";
    }
    await expect(refresh).toHaveCSS("border-radius", "10px");
    await expect(refresh).toHaveCSS("height", expectedHeight);
    await expect(refresh).toHaveCSS("font-size", "13px");
    for (const label of [
      "All",
      "Draft (2)",
      "Pending Review (3)",
      "Approved (4)",
      "Rejected (1)",
    ]) {
      const filter = card.getByRole("button", { name: label, exact: true });
      await expect(filter).toHaveCSS("border-radius", "10px");
      await expect(filter).toHaveCSS("height", expectedHeight);
      await expect(filter).toHaveCSS("font-size", "13px");
      if (label === "All") {
        await expect(filter).toHaveAttribute("aria-pressed", "true");
        await expect(filter).toHaveCSS("background-color", "rgb(15, 23, 42)");
        await expect(filter).toHaveCSS("color", "rgb(255, 255, 255)");
      } else {
        await expect(filter).toHaveAttribute("aria-pressed", "false");
        await expect(filter).toHaveCSS("background-color", "rgb(255, 255, 255)");
        await expect(filter).toHaveCSS("color", "rgb(15, 23, 42)");
      }
    }
    const statusRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.pathname === "/admin/campaign-templates" &&
        url.searchParams.get("status") === "PENDING_SEATPING_REVIEW"
      );
    });
    const pendingFilter = card.getByRole("button", { name: "Pending Review (3)", exact: true });
    await pendingFilter.click();
    await statusRequest;
    await page.mouse.move(0, 0);
    await expect(pendingFilter).toHaveAttribute("aria-pressed", "true");
    await expect(pendingFilter).toHaveCSS("background-color", "rgb(15, 23, 42)");
    const allFilter = card.getByRole("button", { name: "All", exact: true });
    await expect(allFilter).toHaveAttribute("aria-pressed", "false");
    await expect(allFilter).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`admin-campaign-standard-filters-${width}.png`),
      animations: "disabled",
    });
  }
});

for (const width of [390, 1440]) {
  test(`admin loading skeletons cover the remaining card without expanding the page at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAdminApi(page);
    for (const section of [
      {
        path: "/admin/dashboard",
        api: /\/tickets\?/,
        label: "Loading Tickets",
        emptyTitle: "No Tickets Found",
        json: { tickets: [] },
        status: 200,
      },
      {
        path: "/admin/customers",
        api: "**/admin/customer/missing-business",
        label: "Searching Customers",
        emptyTitle: "No Customer Found",
        json: { error: "Not Found" },
        status: 404,
      },
      {
        path: "/admin/featured",
        api: "**/admin/featured-restaurants",
        label: "Loading Featured Restaurants",
        emptyTitle: "No Featured Restaurants Yet",
        json: { featured: [] },
        status: 200,
      },
      {
        path: "/admin/templates",
        api: /\/admin\/campaign-templates\?/,
        label: "Loading Templates",
        emptyTitle: "No Templates Found",
        json: { templates: [], counts: {} },
        status: 200,
      },
    ]) {
      let release = () => {};
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(section.api, async (route) => {
        await pending;
        await route.fulfill({ status: section.status, json: section.json });
      });
      try {
        await page.goto(section.path);
        if (section.path === "/admin/customers") {
          await page.getByLabel("Business Username", { exact: true }).fill("missing-business");
          await page.getByRole("button", { name: "Search Customer", exact: true }).click();
        }
        const card = page.getByTestId("admin-content-card");
        const skeleton = card.getByRole("status", { name: section.label, exact: true });
        await expect(skeleton).toBeVisible();
        await expect(skeleton).toHaveCSS("flex-grow", "1");
        await expect
          .poll(() =>
            skeleton.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              const cardBounds = element
                .closest("[data-testid='admin-content-card']")!
                .getBoundingClientRect();
              const inner = element.firstElementChild!;
              const innerBounds = inner.getBoundingClientRect();
              const innerStyles = getComputedStyle(inner);
              const paddingTop = Number.parseFloat(innerStyles.paddingTop) || 0;
              const paddingBottom = Number.parseFloat(innerStyles.paddingBottom) || 0;
              const firstRowBounds = inner.firstElementChild!.getBoundingClientRect();
              const lastRowBounds = inner.lastElementChild!.getBoundingClientRect();
              return (
                bounds.height >= 223 &&
                cardBounds.bottom - bounds.bottom <= 25 &&
                firstRowBounds.top >= innerBounds.top + paddingTop - 1 &&
                lastRowBounds.bottom >= innerBounds.bottom - paddingBottom - 1 &&
                lastRowBounds.bottom <= innerBounds.bottom - paddingBottom + 1
              );
            }),
          )
          .toBe(true);
        const main = page.getByRole("main");
        const pendingPageHeight = await main.evaluate((element) => element.scrollHeight);
        await main.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await expectNoOverflow(page);
        await page.screenshot({
          path: testInfo.outputPath(`admin-loading-${section.path.split("/").at(-1)}-${width}.png`),
          animations: "disabled",
        });
        release();
        await expect(
          card.getByRole("heading", { name: section.emptyTitle, exact: true }),
        ).toBeVisible();
        const loadedPageHeight = await main.evaluate((element) => element.scrollHeight);
        expect(pendingPageHeight).toBeLessThanOrEqual(loadedPageHeight + 2);
      } finally {
        release();
      }
    }
  });

  test(`admin error states use shared styling and recover with retry at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAdminApi(page);
    let statsUnavailable = true;
    let ticketsUnavailable = true;
    let featuredUnavailable = true;
    const internalError = "Internal Server Error: private-provider-detail";
    await page.route("**/tickets/stats", (route) => {
      if (statsUnavailable) {
        return route.fulfill({ status: 503, json: { error: internalError } });
      }
      return route.fulfill({
        json: { stats: { total: 0, open: 0, inProgress: 0, closed: 0, sales: 0, feedback: 0 } },
      });
    });
    await page.route(/\/tickets\?/, (route) => {
      if (ticketsUnavailable) {
        return route.fulfill({ status: 503, json: { error: internalError } });
      }
      return route.fulfill({ json: { tickets: [] } });
    });
    await page.route("**/admin/featured-restaurants", (route) => {
      if (featuredUnavailable) {
        return route.fulfill({ status: 503, json: { error: internalError } });
      }
      return route.fulfill({ json: { featured: [] } });
    });
    await page.goto("/admin/dashboard");
    const statsHeading = page.getByRole("heading", {
      name: "Unable To Load Ticket Statistics",
      exact: true,
    });
    await expect(statsHeading).toBeVisible();
    const statsError = statsHeading.locator("..");
    await expect(statsError).toHaveAttribute("role", "alert");
    await expect(statsError).toHaveCSS("padding", "32px");
    await expect(statsError).toHaveCSS("text-align", "center");
    await expect(statsHeading).toHaveCSS("font-size", "16px");
    await expect(statsError.locator(":scope > p")).toHaveCSS("font-size", "14px");
    const card = page.getByTestId("admin-content-card");
    await expectStandardEmptyState(card, "Unable To Load Tickets");
    await expect(page.getByText(/Internal Server Error|private-provider-detail/)).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`admin-ticket-errors-${width}.png`),
      animations: "disabled",
    });
    statsUnavailable = false;
    await statsError.getByRole("button", { name: "Try Again", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Total", exact: true })).toBeVisible();
    await expect(statsHeading).toHaveCount(0);
    ticketsUnavailable = false;
    await card.getByRole("button", { name: "Retry Tickets", exact: true }).click();
    await expect(
      card.getByRole("heading", { name: "No Tickets Found", exact: true }),
    ).toBeVisible();
    await page.goto("/admin/featured");
    const featuredCard = page.getByTestId("admin-content-card");
    await expectStandardEmptyState(featuredCard, "Unable To Load Featured Restaurants");
    await expect(page.getByText(/Internal Server Error|private-provider-detail/)).toHaveCount(0);
    await page.getByRole("main").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.screenshot({
      path: testInfo.outputPath(`admin-featured-error-${width}.png`),
      animations: "disabled",
    });
    featuredUnavailable = false;
    await featuredCard.getByRole("button", { name: "Try Again", exact: true }).click();
    await expect(
      featuredCard.getByRole("heading", { name: "No Featured Restaurants Yet", exact: true }),
    ).toBeVisible();
    await expectNoOverflow(page);
  });
}

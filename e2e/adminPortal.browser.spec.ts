import { readFile } from "node:fs/promises";
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
  await page.route(/\/admin\/customer\?/, (route) =>
    route.fulfill({ json: { customers: [], total: 0, page: 1, pageSize: 25 } }),
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
  await expect(page.getByLabel("Search Business Accounts")).toBeVisible();
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
  await expect(sidebar).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await expect(page.locator("body")).toHaveCSS("background-image", /linear-gradient/);
  const workspace = page.getByRole("main");
  await expect(workspace).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(workspace).toHaveCSS("border-radius", "0px");
  await expect(workspace).toHaveCSS("margin", "0px");
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
  await expect(sidebar).toHaveCSS("width", "48px");
  expect((await page.getByRole("main").boundingBox())?.x).toBe(48);
  await page.screenshot({
    path: testInfo.outputPath("admin-collapsed-sidebar.png"),
    fullPage: true,
    animations: "disabled",
  });
  await expect(sidebar.getByText("SP", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "SeatPing Admin Portal" })).toHaveCount(0);
  await sidebar.getByRole("link", { name: "Customer Management" }).click();
  await page.getByLabel("Search Business Accounts").fill("example-restaurant");
  await sidebar.getByRole("link", { name: "Featured Restaurants" }).click();
  await expect(page).toHaveURL(/\/admin\/featured$/);
  await expect(page.getByRole("button", { name: "Add Restaurant", exact: true })).toBeVisible();
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
  await expect(page.getByLabel("Search Business Accounts")).toHaveValue("example-restaurant");
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/featured$/);
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "48px");
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
    await expect(menu.locator("nav").locator("..")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await menu.getByRole("link", { name: label, exact: true }).click();
    await expect(menu).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(path);
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");
    await expect(page.locator("body")).toHaveCSS("background-image", /linear-gradient/);
    await expect(page.getByRole("main")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.getByRole("main")).toHaveCSS("border-radius", "0px");
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
      ["/admin/customers", "No Accounts Found"],
      ["/admin/featured", "No Featured Restaurants Yet"],
      ["/admin/templates", "No Templates Found"],
    ]) {
      await page.goto(path);
      await expect(page.getByText(readyText, { exact: true })).toBeVisible();
      await expect(page.getByRole("main").locator(".container").first()).toHaveCSS(
        "font-size",
        "14px",
      );
      if (path === "/admin/featured" && width === 390) {
        await expect(page.getByRole("button", { name: "Add Restaurant", exact: true })).toHaveCSS(
          "height",
          "36px",
        );
      }
      const card = page.getByTestId("admin-content-card");
      await expect(card).toBeVisible();
      await expect
        .poll(() =>
          card.evaluate(
            (element) =>
              element.getBoundingClientRect().bottom -
              element.closest("main")!.getBoundingClientRect().bottom,
          ),
        )
        .toBeGreaterThanOrEqual(-33);
      await page.getByRole("main").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect
        .poll(() =>
          card.evaluate((element) =>
            Math.abs(
              element.getBoundingClientRect().bottom -
                element.closest("main")!.getBoundingClientRect().bottom +
                32,
            ),
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
        await expect(sidebar).toHaveCSS("width", "48px");
        await expect(sidebar.getByText("SP", { exact: true })).toHaveCount(0);
        await expect(sidebar.getByRole("link", { name: "SeatPing Admin Portal" })).toHaveCount(0);
        await expect
          .poll(() =>
            card.evaluate((element) =>
              Math.abs(
                element.getBoundingClientRect().bottom -
                  element.closest("main")!.getBoundingClientRect().bottom +
                  32,
              ),
            ),
          )
          .toBeLessThanOrEqual(2);
        await sidebar.getByRole("button", { name: "Expand Sidebar" }).click();
        await expect(sidebar).toHaveCSS("width", "256px");
        await expect(sidebar.getByRole("link", { name: "SeatPing Admin Portal" })).toBeVisible();
        await expect
          .poll(() =>
            card.evaluate((element) =>
              Math.abs(
                element.getBoundingClientRect().bottom -
                  element.closest("main")!.getBoundingClientRect().bottom +
                  32,
              ),
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
}, testInfo) => {
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
  await expect(sidebar).toHaveCSS("width", "48px");
  expect((await page.getByRole("main").boundingBox())?.x).toBe(48);
  for (const control of [
    sidebar.getByRole("button", { name: "Expand Sidebar", exact: true }),
    sidebar.getByRole("button", { name: "Switch Location", exact: true }),
    sidebar.getByRole("link", { name: "Queue", exact: true }),
    sidebar.getByRole("link", { name: "Settings", exact: true }),
    sidebar.getByRole("button", { name: "Log Out", exact: true }),
  ]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(32);
    expect(bounds!.height).toBeGreaterThanOrEqual(32);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(48);
  }
  await page.screenshot({
    path: testInfo.outputPath("business-collapsed-sidebar.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "48px");
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
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/admin/templates");
    await expect(
      page.getByRole("heading", { name: "No Templates Found", exact: true }),
    ).toBeVisible();
    const card = page.getByTestId("admin-content-card");
    const statuses = card.getByRole("group", { name: "Template Statuses" });
    await expect(statuses.getByRole("button")).toHaveText([
      "All",
      "Draft",
      "Pending Review",
      "Approved",
      "Rejected",
    ]);
    const toolbar = await card.evaluate((element) => {
      const categories = element
        .querySelector("[aria-label='Template Statuses']")!
        .getBoundingClientRect();
      const controls = element
        .querySelector("[aria-label='Template Controls']")!
        .getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const padding = Number.parseFloat(getComputedStyle(element.firstElementChild!).paddingRight);
      return {
        categoriesLeft: categories.left,
        categoriesBottom: categories.bottom,
        categoriesRight: categories.right,
        controlsLeft: controls.left,
        controlsTop: controls.top,
        rightGap: Math.abs(bounds.right - 1 - padding - controls.right),
      };
    });
    if (width >= 768) {
      expect(toolbar.rightGap).toBeLessThanOrEqual(1);
      expect(toolbar.categoriesRight).toBeLessThan(toolbar.controlsLeft);
    } else {
      expect(Math.abs(toolbar.controlsLeft - toolbar.categoriesLeft)).toBeLessThanOrEqual(1);
      expect(toolbar.controlsTop).toBeGreaterThanOrEqual(toolbar.categoriesBottom);
    }
    await expect(card.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(0);
    const filterButton = card.getByRole("button", { name: "Filter", exact: true });
    const sortButton = card.getByRole("button", { name: "Sort By: Newest First", exact: true });
    let expectedHeight = "28px";
    if (width < 640) {
      expectedHeight = "32px";
    }
    for (const control of [filterButton, sortButton]) {
      await expect(control).toHaveCSS("border-radius", "10px");
      await expect(control).toHaveCSS("height", expectedHeight);
      await expect(control).toHaveCSS("font-size", "13px");
    }
    for (const label of ["All", "Draft", "Pending Review", "Approved", "Rejected"]) {
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
    const pendingFilter = card.getByRole("button", { name: "Pending Review", exact: true });
    await pendingFilter.click();
    await statusRequest;
    await page.mouse.move(0, 0);
    await expect(pendingFilter).toHaveAttribute("aria-pressed", "true");
    await expect(pendingFilter).toHaveCSS("background-color", "rgb(15, 23, 42)");
    const allFilter = card.getByRole("button", { name: "All", exact: true });
    await expect(allFilter).toHaveAttribute("aria-pressed", "false");
    await expect(allFilter).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await filterButton.click();
    const panel = page.getByRole("dialog", { name: "Filter", exact: true });
    await expect(panel.getByRole("textbox", { name: "Business" })).toHaveCount(0);
    await panel.getByRole("button", { name: "Last 7 Days", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`campaign-filters-${width}.png`),
      animations: "disabled",
    });
    await panel.getByRole("button", { name: "Show Templates", exact: true }).click();
    await expect(panel).not.toBeVisible();
    await expect(filterButton.getByLabel("1 Active Filters")).toBeVisible();
    await card.getByRole("button", { name: "Clear Filters", exact: true }).click();
    await expect(filterButton.getByLabel("1 Active Filters")).toHaveCount(0);
    await expect(pendingFilter).toHaveAttribute("aria-pressed", "true");
    await sortButton.click();
    await page.getByRole("button", { name: "Template Name", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "Sort By: Template Name", exact: true }),
    ).toBeVisible();
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
        api: /\/admin\/customer\?/,
        label: "Loading Business Accounts",
        emptyTitle: "No Accounts Found",
        json: { customers: [], total: 0, pageSize: 25 },
        status: 200,
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
    await expect(page.getByRole("heading", { name: "Total Tickets", exact: true })).toBeVisible();
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

for (const width of [320, 390, 768, 1440]) {
  test(`ticket workspace filters and rows fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAdminApi(page);
    await page.route("**/tickets/stats", (route) =>
      route.fulfill({
        json: { stats: { total: 8, open: 3, inProgress: 2, closed: 3, sales: 2, feedback: 6 } },
      }),
    );
    await page.route(/\/tickets\?/, (route) =>
      route.fulfill({
        json: {
          tickets: [
            {
              id: "ticket-support",
              ticketNumber: "FEEDBACK-20261018-0001",
              type: "feedback",
              status: "open",
              priority: "high",
              subject: "Help With Reservation Availability",
              senderName: "Test Operator",
              senderEmail: "operator@example.test",
              businessName: "Example Restaurant",
              data: { feedbackType: "bug" },
              messages: [],
              createdAt: "2026-10-18T12:00:00.000Z",
              updatedAt: "2026-10-18T12:00:00.000Z",
            },
          ],
        },
      }),
    );
    await page.goto("/admin/dashboard");
    const overview = page.getByRole("region", { name: "Ticket Overview" });
    await expect(overview.getByRole("heading", { name: "Needs Attention" })).toBeVisible();
    await expect(overview.getByText("5", { exact: true })).toBeVisible();
    const values = await overview.locator("p").evaluateAll((elements) =>
      elements.map((element) => {
        const styles = getComputedStyle(element);
        return {
          family: styles.fontFamily,
          size: styles.fontSize,
          weight: styles.fontWeight,
          spacing: styles.letterSpacing,
        };
      }),
    );
    expect(values).toHaveLength(3);
    expect(values[1]).toEqual(values[0]);
    expect(values[2]).toEqual(values[0]);

    const card = page.getByTestId("admin-content-card");
    await expect(
      card.getByRole("heading", { name: "Help With Reservation Availability" }),
    ).toBeVisible();
    for (const label of ["All", "Support", "Feedback"]) {
      const button = card.getByRole("button", { name: label, exact: true });
      await expect(button).toBeInViewport();
      await expect(button).toHaveCSS("border-radius", "10px");
    }
    await expect(card.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(card.getByRole("button", { name: "Sales", exact: true })).toHaveCount(0);
    await expect(card.getByRole("heading", { name: /^\d+ Tickets?$/ })).toHaveCount(0);
    await expect(
      card.getByRole("button", { name: "Sort By: Newest First", exact: true }),
    ).toBeVisible();
    await expect(overview.getByText(/Open|In Progress/)).toHaveCount(0);
    const controls = card.getByRole("group", { name: "Ticket Controls" });
    for (const control of [
      card.getByRole("button", { name: "All", exact: true }),
      controls.getByRole("button", { name: "Filter", exact: true }),
      controls.getByRole("button", { name: "Sort By: Newest First", exact: true }),
    ]) {
      let expectedHeight = "28px";
      if (width < 640) {
        expectedHeight = "32px";
      }
      await expect(control).toHaveCSS("height", expectedHeight);
    }
    const search = card.getByRole("textbox", { name: "Search Tickets" });
    await expect(search).toBeVisible();
    await search.fill("example restaurant");
    await expect(
      card.getByRole("heading", { name: "Help With Reservation Availability" }),
    ).toBeVisible();
    await search.fill("missing ticket");
    await expect(card.getByRole("heading", { name: "No Tickets Found" })).toBeVisible();
    await card.getByRole("button", { name: "Clear Search And Filters" }).click();
    await expect(search).toHaveValue("");
    await expect(
      card.getByRole("heading", { name: "Help With Reservation Availability" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`ticket-workspace-${width}.png`),
      animations: "disabled",
    });
    await card.getByRole("button", { name: "Support", exact: true }).click();
    await expect(card.getByRole("button", { name: "Support", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const request = page.waitForRequest((item) => {
      const url = new URL(item.url());
      return (
        url.pathname === "/tickets" &&
        url.searchParams.get("status") === "in_progress" &&
        url.searchParams.get("type") === "feedback"
      );
    });
    const filterButton = card.getByRole("button", { name: "Filter", exact: true });
    const positions = await card.evaluate((element) => {
      const categories = element
        .querySelector("[aria-label='Ticket Categories']")!
        .getBoundingClientRect();
      const controls = element
        .querySelector("[aria-label='Ticket Controls']")!
        .getBoundingClientRect();
      const filters = element.querySelector("button[aria-label='Filter']")!.getBoundingClientRect();
      const sort = element.querySelector("button[aria-label^='Sort By:']")!.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const padding = Number.parseFloat(getComputedStyle(element.firstElementChild!).paddingRight);
      return {
        categoriesLeft: categories.left,
        categoriesRight: categories.right,
        controlsLeft: controls.left,
        controlsTop: controls.top,
        categoriesBottom: categories.bottom,
        rightGap: Math.abs(bounds.right - 1 - padding - controls.right),
        centerOffset: Math.abs(
          categories.top + categories.height / 2 - controls.top - controls.height / 2,
        ),
        controlOffset: Math.abs(filters.top + filters.height / 2 - sort.top - sort.height / 2),
      };
    });
    expect(positions.controlOffset).toBeLessThanOrEqual(1);
    if (width >= 768) {
      expect(positions.rightGap).toBeLessThanOrEqual(1);
      expect(positions.categoriesRight).toBeLessThan(positions.controlsLeft);
      expect(positions.centerOffset).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(positions.controlsLeft - positions.categoriesLeft)).toBeLessThanOrEqual(1);
      expect(positions.controlsTop).toBeGreaterThanOrEqual(positions.categoriesBottom);
    }
    await filterButton.click();
    const filters = page.getByRole("dialog", { name: "Filter", exact: true });
    await expect(filters).toBeVisible();
    await filters.getByRole("button", { name: "In Progress", exact: true }).click();
    await request;
    await expect(filters.getByRole("button", { name: "In Progress", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.screenshot({
      path: testInfo.outputPath(`ticket-filters-${width}.png`),
      animations: "disabled",
    });
    await filters.getByRole("button", { name: "Show Tickets", exact: true }).click();
    await expect(filters).not.toBeVisible();
    await expect(filterButton.getByLabel("1 Active Filters")).toBeVisible();
    await filterButton.click();
    await expect(filters.getByRole("button", { name: "In Progress", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await filters.getByRole("button", { name: "Clear Filters", exact: true }).click();
    await filters.getByRole("button", { name: "Close Filters", exact: true }).click();
    await expect(filters).not.toBeVisible();
    await expect(filterButton.getByLabel("1 Active Filters")).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Support", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await card.getByRole("button", { name: "All", exact: true }).click();
    await expect(card.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expectNoOverflow(page);
    expect(
      await page.getByRole("main").evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(false);
  });
}

test("ticket workspace uses the same container and card treatment as the other admin pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockAdminApi(page);
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("main").locator("..")).toHaveCSS("padding-left", "256px");
  const ticketStyles = await page.getByTestId("admin-content-card").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    return {
      left: bounds.left,
      width: bounds.width,
      radius: styles.borderRadius,
      shadow: styles.boxShadow,
      background: styles.backgroundColor,
    };
  });
  for (const path of ["/admin/customers", "/admin/featured", "/admin/templates"]) {
    await page.goto(path);
    await expect(page.getByRole("main").locator("..")).toHaveCSS("padding-left", "256px");
    const styles = await page.getByTestId("admin-content-card").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        left: bounds.left,
        width: bounds.width,
        radius: styles.borderRadius,
        shadow: styles.boxShadow,
        background: styles.backgroundColor,
      };
    });
    expect(styles).toEqual(ticketStyles);
  }
});

for (const width of [390, 1440]) {
  test(`campaign review uses neutral surfaces and truthful submission metadata at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAdminApi(page);
    let approvalStatus = "DRAFT";
    await page.route(/\/admin\/campaign-templates\?/, (route) =>
      route.fulfill({
        json: {
          templates: [
            {
              id: "review-template",
              name: "Birthday Treat",
              slug: "birthday_treat",
              approvalStatus,
              businessUsername: "demo",
              business: {
                id: "demo-business",
                name: "Demo Restaurant",
                username: "demo",
                email: "demo@example.test",
              },
              locationId: null,
              purpose: "Bring guests back during their birthday month.",
              body: "Hi {{first_name}}, happy birthday month from {{business_name}}! Enjoy {{offer}} on your next visit.",
              variables: ["first_name", "business_name", "offer"],
              exampleValues: {
                first_name: "Alex",
                business_name: "Demo Restaurant",
                offer: "10% off",
              },
              submittedAt: null,
              createdAt: "2026-10-01T12:00:00.000Z",
              updatedAt: "2026-10-01T12:00:00.000Z",
            },
          ],
          counts: {},
        },
      }),
    );
    await page.goto("/admin/templates");
    for (const status of ["DRAFT", "PENDING_SEATPING_REVIEW"]) {
      if (status !== approvalStatus) {
        approvalStatus = status;
        await page.reload();
      }
      await page.getByRole("button", { name: /Birthday Treat/ }).click();
      const dialog = page.getByRole("dialog", { name: /Birthday Treat/ });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/Submitted/)).toHaveCount(0);
      await expect(
        dialog.getByRole("heading", { name: "Template Content", exact: true }),
      ).toBeVisible();
      const metadata = dialog.getByText("Template Name", { exact: true }).locator("../..");
      await expect(metadata).toHaveCSS("background-color", "rgb(248, 250, 252)");
      for (const code of await dialog.locator("code").all()) {
        await expect(code).toHaveCSS("color", "rgb(51, 65, 85)");
        await expect(code).toHaveCSS("background-color", "rgb(255, 255, 255)");
      }
      const approve = dialog.getByRole("button", { name: "Approve", exact: true });
      const reject = dialog.getByRole("button", { name: "Reject", exact: true });
      if (status === "DRAFT") {
        await expect(approve).toHaveCount(0);
        await expect(reject).toHaveCount(0);
      } else {
        await approve.scrollIntoViewIfNeeded();
        await expect(approve).toHaveCSS("background-color", "rgb(15, 23, 42)");
        await expect(approve).toHaveCSS("color", "rgb(255, 255, 255)");
        await expect(reject).toBeVisible();
      }
      expect(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        false,
      );
      await expectNoOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`campaign-review-${status}-${width}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
    }
  });
}

for (const width of [320, 390, 1440]) {
  test(`customer account table edits and reloads saved information at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAdminApi(page);
    const account = {
      id: "business-fixture",
      name: "Example Restaurant",
      username: "example-restaurant",
      email: "operator@example.test",
      phone: "+12025550123",
      trial: true,
      trialDurationDays: 7,
      maxLocations: 2,
      baseCredits: 300,
      locationCount: 1,
      creditsStartedAt: null,
      locations: [{ address: "Example Street", displayName: "Main Branch", credits: 50 }],
    };
    await page.route(/\/admin\/customer\?/, (route) =>
      route.fulfill({ json: { customers: [account], total: 1, pageSize: 25 } }),
    );
    await page.route("**/admin/customer/example-restaurant", async (route) => {
      if (route.request().method() === "PATCH") {
        Object.assign(account, route.request().postDataJSON());
      }
      await route.fulfill({ json: { customer: account } });
    });
    await page.goto("/admin/customers");
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Business", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
    await expect(page.getByText(/of 1 Accounts/)).toHaveCount(0);
    for (const column of ["Access", "Locations", "Base Credits"]) {
      await expect(table.getByRole("columnheader", { name: column, exact: true })).toHaveCSS(
        "text-align",
        "center",
      );
    }
    const cells = table.locator("tbody tr").first().getByRole("cell");
    for (const index of [1, 2, 3]) {
      await expect(cells.nth(index)).toHaveCSS("text-align", "center");
    }
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const csvPath = testInfo.outputPath("accounts.csv");
    await download.saveAs(csvPath);
    const csv = await readFile(csvPath, "utf8");
    expect(csv).toContain("Example Restaurant");
    expect(csv).toContain("operator@example.test");
    const refreshRequest = page.waitForRequest((request) =>
      request.url().includes("/admin/customer?"),
    );
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await refreshRequest;
    await expect(table).toBeVisible();
    const accountFilter = page.getByRole("button", { name: "Filter", exact: true });
    await accountFilter.click();
    const accountPanel = page.getByRole("dialog", { name: "Filter", exact: true });
    await expect(accountPanel.getByRole("button", { name: "Show Accounts" })).toBeInViewport();
    await accountPanel.getByRole("button", { name: "Show Accounts" }).click();
    await expect(accountPanel).not.toBeVisible();
    const edit = table.getByRole("button", { name: "Edit example-restaurant" });
    if (width < 768) {
      await expect(edit).not.toBeInViewport();
      await page.getByRole("region", { name: "Business Accounts Table" }).evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
    }
    await expect(edit).toBeInViewport();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`account-table-${width}.png`),
      animations: "disabled",
    });
    await edit.click();
    const dialog = page.getByRole("dialog", { name: "Edit Customer" });
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("Example Restaurant");
    await dialog.getByLabel("Name", { exact: true }).fill("Updated Restaurant");
    await dialog.getByLabel("Base Credits", { exact: true }).fill("450");
    await page.screenshot({
      path: testInfo.outputPath(`account-editor-${width}.png`),
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Save Changes", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(table.getByText("Updated Restaurant", { exact: true })).toBeVisible();
    await expect(table.getByText("450", { exact: true })).toBeVisible();
    await expectNoOverflow(page);
  });

  test(`guest toolbar keeps search between filter sort and export refresh at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
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
    await page.route("**/api/guests/meta", (route) =>
      route.fulfill({
        json: {
          locations: [{ id: "location-fixture", label: "PIK Avenue" }],
          suggestedTags: ["VIP"],
        },
      }),
    );
    const guest = {
      id: "guest-fixture",
      fullName: "Alex Guest",
      firstName: "Alex",
      lastName: "Guest",
      phone: "+12025550123",
      normalizedPhone: "+12025550123",
      email: "guest@example.test",
      tags: ["VIP"],
      totalVisits: 2,
      waitlistVisitCount: 2,
      upcomingReservationCount: 0,
      pastReservationCount: 0,
      noShowCount: 0,
      cancelledCount: 0,
      firstVisitAt: "2026-10-01T12:00:00.000Z",
      lastVisitAt: "2026-10-02T12:00:00.000Z",
      hasNotes: false,
      returning: true,
      locationId: "location-fixture",
    };
    await page.route(/\/api\/guests\?/, (route) => route.fulfill({ json: { guests: [guest] } }));
    await page.goto("/business/guests");
    if (width >= 768) {
      await expect(
        page.getByRole("table").getByRole("row").filter({ hasText: "Alex Guest" }),
      ).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: /Alex Guest/ })).toBeVisible();
    }
    const guestCard = page.getByTestId("guest-crm-card");
    const mainBottom = await page
      .locator("main")
      .evaluate((element) => element.getBoundingClientRect().bottom);
    const cardBounds = (await guestCard.boundingBox())!;
    expect(mainBottom - cardBounds.y - cardBounds.height).toBeLessThanOrEqual(36);
    if (width >= 768) {
      await expect(page.getByRole("columnheader", { name: "Last Visit", exact: true })).toHaveCSS(
        "text-align",
        "center",
      );
      await expect(
        page.getByRole("table").locator("tbody tr").first().getByRole("cell").nth(4),
      ).toHaveCSS("text-align", "center");
    }
    await expect(page.getByText("Guests At PIK Avenue", { exact: true })).toHaveCount(0);
    await expect(page.getByText("1 Guest", { exact: true })).toHaveCount(0);
    const filter = page.getByRole("button", { name: "Filter", exact: true });
    const sort = page.getByRole("button", { name: "Sort: Recent Visit", exact: true });
    const search = page.getByRole("textbox", {
      name: "Search Name, Phone, Email, Or Tag",
      exact: true,
    });
    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    for (const control of [filter, sort]) {
      await expect(control).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
      await expect(control.locator("svg")).toHaveCSS("width", "16px");
    }
    if (width >= 768) {
      const sortBounds = (await sort.boundingBox())!;
      const searchBounds = (await search.boundingBox())!;
      const exportBounds = (await exportButton.boundingBox())!;
      expect(searchBounds.x).toBeGreaterThan(sortBounds.x + sortBounds.width);
      expect(searchBounds.x + searchBounds.width).toBeLessThan(exportBounds.x);
      expect(
        Math.abs(searchBounds.y + searchBounds.height / 2 - sortBounds.y - sortBounds.height / 2),
      ).toBeLessThanOrEqual(2);
    }
    await filter.click();
    const filters = page.getByRole("dialog", { name: "Filter", exact: true });
    await expect(filters.getByRole("button", { name: "Has Notes", exact: true })).toBeVisible();
    await expect(
      filters.getByRole("button", { name: "Show Guests", exact: true }),
    ).toBeInViewport();
    await expect(
      filters.getByRole("button", { name: "Clear Filters", exact: true }),
    ).toBeDisabled();
    await expect
      .poll(async () => {
        const panelBounds = (await filters.boundingBox())!;
        if (width >= 768) {
          return Math.max(
            Math.abs(panelBounds.width - 448),
            Math.abs(panelBounds.x + panelBounds.width / 2 - width / 2),
          );
        }
        return Math.max(
          Math.abs(panelBounds.width - width),
          Math.abs(panelBounds.y + panelBounds.height - 1000),
        );
      })
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`guest-filter-${width}.png`),
      animations: "disabled",
    });
    await filters.getByRole("button", { name: "Show Guests", exact: true }).click();
    await expect(filters).not.toBeVisible();
    await sort.click();
    await expect(page.getByRole("button", { name: "Recent Visit", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Name (A To Z)", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sort: Name (A To Z)" })).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`guest-toolbar-${width}.png`),
      animations: "disabled",
    });
  });
}

for (const width of [390, 1440]) {
  test(`campaign history fills its workspace while loading and empty at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
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
    await page.route("**/api/campaigns/meta", (route) =>
      route.fulfill({
        json: {
          locations: [{ id: "location-fixture", label: "PIK Avenue" }],
          audiences: [],
          channels: ["EMAIL"],
        },
      }),
    );
    await page.route("**/api/campaigns/templates", (route) =>
      route.fulfill({ json: { templates: [] } }),
    );
    await page.route(/\/api\/audiences\?/, (route) => route.fulfill({ json: { audiences: [] } }));
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/api\/campaigns\?/, async (route) => {
      await pending;
      await route.fulfill({ json: { campaigns: [] } });
    });
    try {
      await page.goto("/business/campaigns");
      await page.getByRole("button", { name: "History", exact: true }).click();
      const card = page.getByTestId("campaign-history-card");
      await expect(card.getByRole("status")).toBeVisible();
      const mainBounds = (await page.getByRole("main").boundingBox())!;
      await expect
        .poll(async () => {
          const bounds = (await card.boundingBox())!;
          return Math.abs(mainBounds.y + mainBounds.height - bounds.y - bounds.height - 32);
        })
        .toBeLessThanOrEqual(2);
      release();
      await expect(
        card.getByRole("heading", { name: "No Sent Campaigns Yet", exact: true }),
      ).toBeVisible();
      await expect(card.getByRole("status")).toHaveCount(0);
      await expect
        .poll(async () => {
          const bounds = (await card.boundingBox())!;
          return Math.abs(mainBounds.y + mainBounds.height - bounds.y - bounds.height - 32);
        })
        .toBeLessThanOrEqual(2);
      await expectNoOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`campaign-history-fill-${width}.png`),
        animations: "disabled",
      });
    } finally {
      release();
    }
  });
}

for (const width of [390, 1440]) {
  test(`customer accounts load additional rows by scrolling at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAdminApi(page);
    const accounts = Array.from({ length: 55 }, (_, index) => ({
      id: `account-${index}`,
      name: `Business ${index + 1}`,
      username: `business-${index + 1}`,
      email: `operator-${index + 1}@example.test`,
      phone: "+12025550123",
      trial: false,
      maxLocations: 2,
      baseCredits: 100,
      locationCount: 1,
    }));
    await page.route(/\/admin\/customer\?/, (route) => {
      const pageNumber = Number(new URL(route.request().url()).searchParams.get("page"));
      return route.fulfill({
        json: {
          customers: accounts.slice((pageNumber - 1) * 25, pageNumber * 25),
          total: accounts.length,
          pageSize: 25,
        },
      });
    });
    await page.goto("/admin/customers");
    await expect(page.getByRole("button", { name: "Edit business-1", exact: true })).toBeVisible();
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await pendingDownload;
    const exportPath = testInfo.outputPath("all-accounts.csv");
    await download.saveAs(exportPath);
    const exported = await readFile(exportPath, "utf8");
    expect(exported).toContain("Business 55");
    expect(exported.trim().split(/\r?\n/)).toHaveLength(56);

    await page
      .getByRole("button", { name: "Edit business-25", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Edit business-50", exact: true }),
    ).toBeAttached();
    await page
      .getByRole("button", { name: "Edit business-50", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Edit business-55", exact: true }),
    ).toBeAttached();
    await page
      .getByRole("button", { name: "Edit business-55", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Edit business-55", exact: true }),
    ).toBeInViewport();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(55);
    await expectNoOverflow(page);
  });
}

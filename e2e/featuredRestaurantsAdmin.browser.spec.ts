import { expect, test, type Page } from "@playwright/test";
import type { FeaturedRestaurant } from "../src/components/featured-restaurants/types";

async function featuredWorkspace(page: Page) {
  const state = {
    rows: ["Aurora", "Harbor", "Cedar"].map((name, index): FeaturedRestaurant => ({
      id: `featured-${index}`,
      name,
      businessId: `business-${index}`,
      locationId: `location-${index}`,
      isActive: true,
      sortOrder: index,
      createdAt: "2026-10-01T12:00:00.000Z",
      business: { id: `business-${index}`, name: "Demo Restaurant", username: name.toLowerCase() },
      location: { id: `location-${index}`, displayName: "Main Branch", address: "Example Street" },
    })),
    failOrder: false,
    orderRequests: [] as string[][],
  };
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/auth/admin/session", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await page.route("**/tickets/stats", (route) =>
    route.fulfill({ json: { stats: { total: 0, open: 0, inProgress: 0, closed: 0 } } }),
  );
  await page.route(/\/tickets\?/, (route) => route.fulfill({ json: { tickets: [] } }));
  await page.route("**/admin/featured-restaurants/reorder", (route) => {
    const ids = route.request().postDataJSON().ids as string[];
    state.orderRequests.push(ids);
    if (state.failOrder) {
      return route.fulfill({ status: 503, json: { error: "Order could not be saved." } });
    }
    state.rows = ids.map((id, index) => {
      const row = state.rows.find((entry) => entry.id === id);
      if (!row) {
        throw new Error("Unknown Featured Fixture");
      }
      return { ...row, sortOrder: index };
    });
    return route.fulfill({ json: { featured: state.rows } });
  });
  await page.route(/\/admin\/featured-restaurants\/featured-\d+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    if (route.request().method() === "DELETE") {
      state.rows = state.rows.filter((row) => row.id !== id);
      return route.fulfill({ json: { success: true } });
    }
    const update = route.request().postDataJSON() as { isActive: boolean };
    state.rows = state.rows.map((row) => {
      if (row.id === id) {
        return { ...row, ...update };
      }
      return row;
    });
    return route.fulfill({ json: { featured: state.rows.find((row) => row.id === id) } });
  });
  await page.route("**/admin/featured-restaurants", (route) => {
    if (route.request().method() === "POST") {
      const data = route.request().postDataJSON();
      expect(data.sortOrder).toBeUndefined();
      const added: FeaturedRestaurant = {
        id: "featured-3",
        businessId: data.businessId,
        locationId: data.locationId,
        isActive: data.isActive,
        sortOrder: state.rows.length,
        createdAt: "2026-10-02T12:00:00.000Z",
        business: { id: data.businessId, username: "new-restaurant", name: "New Restaurant" },
        location: { id: data.locationId, displayName: "New Branch", address: "Another Street" },
      };
      state.rows.push(added);
      return route.fulfill({ json: { featured: added } });
    }
    return route.fulfill({ json: { featured: state.rows } });
  });
  await page.route("**/admin/businesses/search?username=new", (route) =>
    route.fulfill({
      json: {
        businesses: [{ id: "business-new", username: "new-restaurant", name: "New Restaurant" }],
      },
    }),
  );
  await page.route("**/admin/businesses/business-new/locations", (route) =>
    route.fulfill({
      json: {
        locations: [
          { id: "location-new", displayName: "New Branch", address: "Another Street ".repeat(30) },
          {
            id: "location-long",
            displayName: "A Long Location Name ".repeat(12),
            address: "Full Address",
          },
        ],
      },
    }),
  );
  await page.route("**/api/featured-restaurants", (route) =>
    route.fulfill({
      json: {
        featured: state.rows
          .filter((row) => row.isActive)
          .map((row) => ({
            ...row,
            name: row.name || row.business?.name,
            businessName: row.business?.name,
            businessUsername: row.business?.username,
            shortAddress: row.location?.address,
            queueEnabled: true,
            reservationsEnabled: true,
            rating: null,
            reviewCount: 0,
            cuisine: null,
            priceRange: null,
            bannerImageUrl: null,
          })),
      },
    }),
  );
  await page.route("**/api/locations/search-suggestions**", (route) =>
    route.fulfill({ json: { suggestions: [] } }),
  );
  return state;
}

async function keyboardMove(page: Page, name: string, direction: "ArrowDown" | "ArrowUp") {
  const handle = page.getByRole("button", { name: `Reorder ${name}`, exact: true });
  const names = await page.getByRole("button", { name: /^Reorder / }).allTextContents();
  const handles = page.getByRole("button", { name: /^Reorder / });
  let position = 0;
  for (let index = 0; index < names.length; index += 1) {
    if ((await handles.nth(index).getAttribute("aria-label")) === `Reorder ${name}`) {
      position = index + 1;
    }
  }
  let nextPosition = position + 1;
  if (direction === "ArrowUp") {
    nextPosition = position - 1;
  }
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("status").filter({ hasText: `${name} is at position ${position}` }),
  ).toBeAttached();
  await page.keyboard.press(direction);
  await expect(
    page.getByRole("status").filter({ hasText: `${name} is at position ${nextPosition}` }),
  ).toBeAttached();
  await page.keyboard.press("Space");
}

for (const width of [320, 390, 1440]) {
  test(`featured management shows restaurant names deletes adds and persists keyboard order at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    const state = await featuredWorkspace(page);
    await page.goto("/admin/featured");
    await expect(
      page.getByRole("heading", { name: "Featured Restaurants", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reorder Aurora" })).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await expect(
      page.getByText("Drag To Reorder Homepage Restaurants", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Business Username")).toHaveCount(0);
    await keyboardMove(page, "Aurora", "ArrowDown");
    await expect(page.getByText("Order Saved", { exact: true })).toBeVisible();
    expect(state.orderRequests).toEqual([["featured-1", "featured-0", "featured-2"]]);
    await expect(page.locator('[data-testid^="featured-row-"]').first()).toContainText("Harbor");
    await page.reload();
    await expect(page.locator('[data-testid^="featured-row-"]').first()).toContainText("Harbor");
    await expect(page.getByRole("switch")).toHaveCount(0);
    await expect(page.getByText("Demo Restaurant", { exact: true })).toHaveCount(0);
    for (const restaurantName of ["Harbor", "Cedar"]) {
      const previousCount = state.rows.length;
      await page.getByRole("button", { name: `Delete ${restaurantName}`, exact: true }).click();
      const confirmation = page.getByRole("alertdialog");
      await expect(confirmation).toBeVisible();
      expect(state.rows).toHaveLength(previousCount);
      await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(confirmation).not.toBeVisible();
      await expect(page.getByRole("button", { name: `Reorder ${restaurantName}` })).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Add Restaurant", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add Restaurant" });
    await expect(dialog.getByRole("switch")).toHaveCount(0);
    await dialog.getByLabel("Business Username").fill("new");
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    await dialog.getByRole("button", { name: /New Restaurant.*new-restaurant/ }).click();
    const locationTrigger = dialog.getByRole("combobox", { name: "Location", exact: true });
    const triggerBounds = (await locationTrigger.boundingBox())!;
    await locationTrigger.click();
    const options = page.getByTestId("featured-location-options");
    await expect(options.getByRole("option", { name: "New Branch", exact: true })).toBeVisible();
    await expect(options).not.toContainText("Another Street");
    await expect
      .poll(async () => {
        const menuBounds = (await options.boundingBox())!;
        return Math.abs(menuBounds.width - triggerBounds.width);
      })
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`featured-location-options-${width}.png`),
      animations: "disabled",
    });
    await page.getByRole("option", { name: "New Branch", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`featured-add-${width}.png`),
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Add Restaurant", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('[data-testid^="featured-row-"]').last()).toContainText(
      "New Restaurant",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`featured-list-${width}.png`),
      animations: "disabled",
    });
    await page.goto("/");
    const cards = page.locator("#featured").getByRole("link", { name: /^View / });
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("Aurora");
    await expect(cards.last()).toContainText("New Restaurant");
    await expect(page.locator("#featured").getByText("Harbor", { exact: true })).toHaveCount(0);
  });
}

test("featured mobile rows and modal use compact consistent controls at 320px", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 768 });
  const state = await featuredWorkspace(page);
  state.rows[0].name = "Imperial Shanghai & Lamian Xiao Long Bao";
  state.rows[0].location!.displayName = "Plaza Indonesia";
  state.rows[0].location!.address = "A Very Long Street Address, Jakarta, Indonesia";
  await page.goto("/admin/featured");
  const row = page.getByTestId("featured-row-featured-0");
  await expect(row.getByText("Plaza Indonesia", { exact: true })).toBeVisible();
  await expect(row.getByText(/Very Long Street Address/)).not.toBeVisible();
  await expect(row).toHaveCSS("border-bottom-width", "1px");
  await expect(page.getByTestId("featured-row-featured-2")).toHaveCSS("border-bottom-width", "1px");
  const remove = row.getByRole("button", { name: /^Delete / });
  await expect(remove.getByText("Delete", { exact: true })).not.toBeVisible();
  const add = page.getByRole("button", { name: "Add Restaurant", exact: true });
  await expect(add.getByText("Add Restaurant", { exact: true })).not.toBeVisible();
  await expect(add).toHaveCSS("width", "36px");
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Add Restaurant" });
  const input = dialog.getByLabel("Business Username");
  const search = dialog.getByRole("button", { name: "Search", exact: true });
  await expect(input).toHaveCSS("height", "32px");
  await expect(input).toHaveCSS("font-size", "13px");
  await expect(search).toHaveCSS("height", "32px");
  await input.fill("new");
  await search.click();
  await dialog.getByRole("button", { name: /New Restaurant.*new-restaurant/ }).click();
  const location = dialog.getByRole("combobox", { name: "Location", exact: true });
  await expect(location).toHaveCSS("height", "32px");
  await expect(location).toHaveCSS("font-size", "13px");
  await location.click();
  await page.getByRole("option", { name: "New Branch", exact: true }).click();
  await location.click();
  const selected = page.getByRole("option", { name: "New Branch", exact: true });
  await expect(selected).toHaveCSS("color", "rgb(15, 23, 42)");
  await expect(selected).toHaveCSS("background-color", "rgb(241, 245, 249)");
  await page.screenshot({
    path: testInfo.outputPath("featured-dropdown-320.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(15);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(305);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("featured-modal-320.png"),
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await remove.click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("button", { name: "Delete", exact: true })).toBeInViewport();
  await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("featured-confirm-320.png"),
    animations: "disabled",
  });
});

test.describe("Featured Pointer Sorting", () => {
  test.use({ hasTouch: false, isMobile: false });
  test("featured pointer dragging saves and a rejected reorder restores the list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const state = await featuredWorkspace(page);
    await page.goto("/admin/featured");
    const source = page.getByRole("button", { name: "Reorder Cedar" });
    const target = page.getByRole("button", { name: "Reorder Aurora" });
    await expect(source).toBeVisible();
    const sourceBounds = (await source.boundingBox())!;
    const targetBounds = (await target.boundingBox())!;
    await source.hover();
    await page.mouse.down();
    await page.mouse.move(
      sourceBounds.x + sourceBounds.width / 2,
      sourceBounds.y + sourceBounds.height / 2 - 12,
      { steps: 3 },
    );
    await expect(source).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(
      targetBounds.x + targetBounds.width / 2,
      targetBounds.y + targetBounds.height / 2,
      { steps: 12 },
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Cedar is at position 1" }),
    ).toBeAttached();
    await page.mouse.up();
    await expect(page.getByText("Order Saved", { exact: true })).toBeVisible();
    expect(state.orderRequests[0]).toEqual(["featured-2", "featured-0", "featured-1"]);
    await expect(page.locator('[data-testid^="featured-row-"]').first()).toContainText("Cedar");
    state.failOrder = true;
    await keyboardMove(page, "Cedar", "ArrowDown");
    await expect(page.getByText("Unable To Save Order", { exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-testid^="featured-row-"]').first()).toContainText("Cedar");
    expect(state.rows[0].id).toBe("featured-2");
  });
});

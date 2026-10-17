import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-01T12:00:00Z"));
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/api/demo/availability?*", (route) => {
    let slots = ["2026-10-02T13:00:00.000Z", "2026-10-02T13:15:00.000Z"];
    if (route.request().url().includes("2026-11")) {
      slots = ["2026-11-02T14:00:00.000Z"];
    }
    return route.fulfill({ json: { slots } });
  });
  await page.route("**/api/demo/book", (route) =>
    route.fulfill({
      status: 201,
      json: {
        start: "2026-10-02T13:00:00.000Z",
        end: "2026-10-02T13:15:00.000Z",
        meetLink: "https://meet.google.com/abc-defg-hij",
      },
    }),
  );
});

test("books from the landing page without navigating on desktop and mobile", async ({ page }) => {
  await page.goto("/business");
  const trigger = page.getByRole("button", { name: "Book a Demo" }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Discover SeatPing" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/business$/);
  const timezone = page.getByRole("combobox", { name: "Timezone", exact: true });
  if (!(await timezone.textContent())?.includes("America/New York")) {
    await timezone.click();
    await page.getByPlaceholder("Search timezone or city...").fill("New York");
    await page.getByRole("option", { name: /America\/New York/ }).click();
    await expect(timezone).toBeFocused();
  }
  await expect(dialog.getByRole("columnheader")).toHaveText([
    "Su",
    "Mo",
    "Tu",
    "We",
    "Th",
    "Fr",
    "Sa",
  ]);
  const friday = dialog.getByRole("grid").getByRole("gridcell", { name: "2", exact: true });
  await expect(friday).toBeEnabled();
  await expect(
    dialog.getByRole("grid").getByRole("gridcell", { name: "3", exact: true }),
  ).toBeDisabled();
  await friday.click();
  await page.getByRole("button", { name: "24h", exact: true }).click();
  await page.getByRole("button", { name: "09:00", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Details" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Confirm Booking" })).toBeDisabled();
  await page.getByLabel("Full Name", { exact: true }).fill("Test Guest");
  await page.getByLabel("Email Address", { exact: true }).fill("guest@test.invalid");
  await page
    .getByLabel("Restaurant Or Company Name (Optional)", { exact: true })
    .fill("Test Bistro");
  const summary = dialog.getByRole("region", { name: "Meeting Details" });
  await expect(summary).toContainText("Friday, October 2, 2026");
  await expect(summary).toContainText("09:00 - 09:15");
  await expect(summary).toContainText("America/New York");
  await expect(dialog.getByRole("combobox", { name: "Timezone", exact: true })).toHaveCount(0);
  const name = await page.getByLabel("Full Name", { exact: true }).boundingBox();
  const email = await page.getByLabel("Email Address", { exact: true }).boundingBox();
  const confirm = await page.getByRole("button", { name: "Confirm Booking" }).boundingBox();
  expect(name).not.toBeNull();
  expect(email).not.toBeNull();
  expect(confirm).not.toBeNull();
  expect(email!.y).toBeGreaterThan(name!.y + name!.height);
  expect(Math.abs(name!.x - email!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(name!.width - email!.width)).toBeLessThanOrEqual(1);
  expect(confirm!.width).toBeLessThan(email!.width * 0.75);
  const notes = page.getByLabel("Additional Notes (Optional)", { exact: true });
  const initialNotesHeight = await notes.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await notes.fill("We would like to discuss reservations and guest management. ".repeat(30));
  await expect
    .poll(() => notes.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(initialNotesHeight);
  const notesDimensions = await notes.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(notesDimensions.scrollHeight).toBeLessThanOrEqual(notesDimensions.clientHeight + 1);
  await notes.fill("A short note.");
  await expect
    .poll(() => notes.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(initialNotesHeight);
  await page.screenshot({
    animations: "disabled",
    path: `performance-artifacts/demo-details-${test.info().project.name}.png`,
  });
  await page.getByRole("button", { name: "Confirm Booking" }).click();
  await expect(page.getByRole("heading", { name: "Your Demo Is Booked" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Google Meet" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
  const bookedHeading = page.getByRole("heading", { name: "Your Demo Is Booked" });
  const centered = await bookedHeading.evaluate((element) => {
    const heading = element.getBoundingClientRect();
    const panel = element.parentElement!.getBoundingClientRect();
    return Math.abs(heading.x + heading.width / 2 - (panel.x + panel.width / 2));
  });
  expect(centered).toBeLessThanOrEqual(1);
  await page.screenshot({
    animations: "disabled",
    path: `performance-artifacts/demo-confirmation-${test.info().project.name}.png`,
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByRole("grid")).toBeVisible();
  await expect(page.locator('a[href="/sales"]')).toHaveCount(0);
});

test("supports month navigation, focus trapping, Escape, X, and outside click", async ({
  page,
}) => {
  await page.goto("/business");
  const trigger = page.getByRole("button", { name: "Book a Demo" }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: /next month/i }).click();
  await expect(page.getByText("November 2026")).toBeVisible();
  await page.getByRole("button", { name: /previous month/i }).click();
  await expect(page.getByText("October 2026")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Timezone", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await trigger.click();
  const timezone = page.getByRole("combobox", { name: "Timezone", exact: true });
  if (!(await timezone.textContent())?.includes("America/New York")) {
    await timezone.click();
    await page.getByPlaceholder("Search timezone or city...").fill("New York");
    await page.getByRole("option", { name: /America\/New York/ }).click();
    await expect(timezone).toBeFocused();
  }
  await dialog.getByRole("gridcell", { name: "2", exact: true }).click();
  await expect(page.getByRole("button", { name: "9:00 AM", exact: true })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: `performance-artifacts/demo-scheduler-${test.info().project.name}.png`,
  });
  if (test.info().project.use.hasTouch) {
    await page.touchscreen.tap(2, 2);
  } else {
    await page.mouse.click(2, 2);
  }
  await expect(dialog).toBeHidden();
});

test("shows calendar errors without selectable dates", async ({ page }) => {
  await page.route("**/api/demo/availability?*", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/business");
  await page.getByRole("button", { name: "Book a Demo" }).first().click();
  const times = page.getByRole("region", { name: "Available Times" });
  await expect(times).toContainText(
    "No meeting slots are available right now. Please check back later.",
  );
  await expect(page.getByRole("button", { name: "Try Again" })).toHaveCount(0);
  await expect(
    page.getByText("Calendar availability could not be verified. Please try again later."),
  ).toHaveCount(0);
  await expect(page.getByRole("grid").locator("button:enabled")).toHaveCount(0);
  const alert = times.getByRole("status");
  const dimensions = await alert.evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height);
  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 1024) {
    const toggle = await page.getByRole("group", { name: "Time Format" }).boundingBox();
    const close = await page.getByRole("button", { name: "Close", exact: true }).boundingBox();
    expect(toggle).not.toBeNull();
    expect(close).not.toBeNull();
    expect(close!.x - (toggle!.x + toggle!.width)).toBeGreaterThanOrEqual(12);
  }
  await page.screenshot({
    animations: "disabled",
    path: `performance-artifacts/demo-error-${test.info().project.name}.png`,
  });
});

test("uses the shared timezone picker and returns focus without closing the booking dialog", async ({
  page,
}) => {
  await page.goto("/business");
  await page.getByRole("button", { name: "Book a Demo" }).first().click();
  const timezone = page.getByRole("combobox", { name: "Timezone", exact: true });
  await timezone.click();
  const search = page.getByPlaceholder("Search timezone or city...");
  await expect(search).toBeFocused();
  await search.fill("no matching timezone");
  await expect(page.getByText("No timezone found.")).toBeVisible();
  await search.fill("London");
  const option = page.getByRole("option", { name: /Europe\/London/ });
  await expect(option).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: `performance-artifacts/demo-timezone-${test.info().project.name}.png`,
  });
  await option.click();
  await expect(timezone).toContainText("Europe/London");
  await expect(timezone).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Discover SeatPing" })).toBeVisible();
  await timezone.click();
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(timezone).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Discover SeatPing" })).toBeVisible();
});

test("retired sales page shows the normal missing-page state", async ({ page }) => {
  await page.goto("/sales");
  await expect(page.locator('[data-page-background="not-found"]')).toBeVisible();
});

test("keeps the scheduler size stable between months", async ({ page }) => {
  await page.goto("/business");
  await page.getByRole("button", { name: "Book a Demo" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Discover SeatPing" });
  await expect(dialog.getByRole("gridcell", { name: "2", exact: true })).toBeEnabled();
  await expect(dialog).toHaveCSS("opacity", "1");
  const october = await dialog.boundingBox();
  await page.getByRole("button", { name: "Next Month", exact: true }).click();
  await expect(page.getByText("November 2026")).toBeVisible();
  await expect(dialog.getByRole("gridcell", { name: "2", exact: true })).toBeEnabled();
  const november = await dialog.boundingBox();
  expect(october).not.toBeNull();
  expect(november).not.toBeNull();
  expect(Math.abs(october!.height - november!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(october!.width - november!.width)).toBeLessThanOrEqual(1);
  await expect(page.getByText("Checking calendar availability...")).toHaveCount(0);
  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 1024) {
    const grid = await dialog.getByRole("grid").boundingBox();
    expect(grid).not.toBeNull();
    expect(november!.y + november!.height - (grid!.y + grid!.height)).toBeLessThanOrEqual(40);
  }
});

test("keeps the fixed header links in place when the booking dialog locks page scrolling", async ({
  page,
}) => {
  await page.goto("/business");
  await expect(page.getByRole("button", { name: "Book a Demo" }).first()).toBeVisible();
  if (!test.info().project.use.hasTouch) {
    await page.addStyleTag({ content: "::-webkit-scrollbar { width: 16px; }" });
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const links = page.locator("header a");
  const positions = () =>
    links.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, width: box.width };
      }),
    );
  const before = await positions();
  expect(before.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Book a Demo" }).first().click();
  await expect(page.getByRole("dialog", { name: "Discover SeatPing" })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", "1");
  const after = await positions();
  expect(after).toHaveLength(before.length);
  for (let index = 0; index < before.length; index += 1) {
    expect(Math.abs(before[index].x - after[index].x)).toBeLessThanOrEqual(1);
    expect(Math.abs(before[index].width - after[index].width)).toBeLessThanOrEqual(1);
  }
});

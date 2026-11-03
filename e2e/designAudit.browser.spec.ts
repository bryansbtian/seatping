import { expect, test, type Locator, type Page } from "@playwright/test";
import { restaurant } from "../tests/helpers/searchRestaurants.js";

function reservation(id: string, name: string, date: string, status: string) {
  return {
    id,
    name,
    firstName: name,
    lastName: "Guest",
    contactMethod: "email",
    email: "guest@example.test",
    phone: "",
    countryCode: "+1",
    partySize: 2,
    reservationDateTime: `${date}T18:00`,
    notes: "",
    status,
    source: "seatping_public",
    createdAt: "2026-10-01T12:00:00.000Z",
  };
}

const RESERVATIONS = [
  reservation("today", "Today Guest", "2026-10-17", "confirmed"),
  reservation("upcoming", "Upcoming Guest", "2026-10-18", "confirmed"),
  reservation("past", "Past Guest", "2026-10-16", "completed"),
  reservation("cancelled", "Cancelled Guest", "2026-10-17", "cancelled"),
  reservation("no-show", "No-Show Guest", "2026-10-17", "no_show"),
];

async function mockBusiness(page: Page, locationOverrides: Record<string, unknown> = {}) {
  const user = {
    id: "business-design-audit",
    name: "Example Restaurant",
    username: "example-restaurant",
    email: "operator@example.test",
    phone: "+12025550123",
    trial: false,
    maxLocations: 1,
    locations: [
      {
        id: "location-design-audit",
        displayName: "Main Restaurant",
        address: "Example Street",
        credits: 100,
        queueEnabled: true,
        reservationsEnabled: true,
        queue: [],
        reservations: RESERVATIONS,
        restaurantProfile: {
          openingHours: {
            timezone: "UTC",
            monday: { enabled: true, open: "09:00", close: "22:00" },
          },
        },
        ...locationOverrides,
      },
    ],
  };
  await page.clock.setFixedTime(new Date("2026-10-17T12:00:00.000Z"));
  await page.route("https://maps.googleapis.com/**", (route) => route.abort());
  await page.route("https://maps.gstatic.com/**", (route) => route.abort());
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: { name: user.name } } }),
  );
  await page.route("**/auth/business/me", (route) => route.fulfill({ json: { user } }));
  await page.route("**/auth/business/language", (route) => {
    if (route.request().method() === "PUT") {
      return route.fulfill({ json: route.request().postDataJSON() });
    }
    return route.fulfill({ json: { language: "en" } });
  });
}

async function expectRegularNavigation(sidebar: Locator) {
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
  await expect(sidebar.getByRole("button", { name: "Log Out", exact: true })).toHaveCSS(
    "font-weight",
    "400",
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
}

for (const width of [320, 390, 1440]) {
  test(`queue contact ellipses and overview chart labels fit at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const email = "guest.with.a.very.long.email.address.for.mobile@example.test";
    const waiting = {
      id: "queue-email",
      firstName: "Alex",
      lastName: "Morgan",
      joinedAt: "2026-10-17T10:30:00Z",
      numGuests: 2,
      notificationMethod: "email",
      email,
    };
    await mockBusiness(page, {
      credits: 0,
      queue: [waiting],
      reservations: [
        {
          ...reservation("email-reservation", "Long Email Guest", "2026-10-17", "confirmed"),
          email,
        },
      ],
      removedCustomers: ["removed", "left"].map((status) => ({
        ...waiting,
        id: status,
        firstName: "Jordan",
        lastName: status,
        status,
        leftAt: "2026-10-17T11:00:00Z",
        removedAt: "2026-10-17T11:00:00Z",
      })),
      admittedCustomers: Array.from({ length: 8 }, (_, index) => {
        const joined = new Date(Date.UTC(2026, 9, 16, 9 + index));
        const wait = [3, 7, 12, 20, 40][index % 5];
        return {
          ...waiting,
          id: `served-${index}`,
          finalStatus: "served",
          joinedAt: joined.toISOString(),
          admittedAt: new Date(joined.getTime() + wait * 60000).toISOString(),
        };
      }),
    });
    await page.route("**/api/floor/**", (route) =>
      route.fulfill({ json: { rooms: [], waitingParties: [], upcomingReservations: [] } }),
    );
    await page.route("**/queue-etas", (route) => route.fulfill({ json: { etas: [] } }));
    await page.goto("/business/overview");
    const creditTitle = page.getByRole("heading", { name: "No Credits Available", exact: true });
    await expect(creditTitle).toBeVisible();
    const creditBanner = page.locator(".bg-red-600").filter({ has: creditTitle });
    await expect(creditBanner).toHaveCSS("background-image", "none");
    await expect(creditBanner).toHaveCSS("background-color", "rgb(220, 38, 38)");
    const contacts = page.getByText(`Email: ${email}`, { exact: true });
    await expect(contacts).toHaveCount(2);
    for (const contact of await contacts.all()) {
      await expect(contact).toHaveAttribute("title", `Email: ${email}`);
      await expect(contact).toHaveCSS("text-overflow", "ellipsis");
      await expect(contact).toHaveCSS("white-space", "nowrap");
      if (width === 320) {
        expect(await contact.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
          true,
        );
      }
    }
    for (const testId of ["overview-peak-hours", "overview-wait-distribution"]) {
      const chart = page.getByTestId(testId);
      await expect(chart).toBeVisible();
      const labelsFit = await chart.locator("li").evaluateAll((items) =>
        items.every((item) => {
          const label = item.lastElementChild;
          if (!(label instanceof HTMLElement)) {
            return false;
          }
          const range = document.createRange();
          range.selectNodeContents(label);
          const text = range.getBoundingClientRect();
          const bounds = item.getBoundingClientRect();
          return (
            text.left >= bounds.left - 1 &&
            text.right <= bounds.right + 1 &&
            label.scrollHeight <= label.clientHeight
          );
        }),
      );
      expect(labelsFit).toBe(true);
      if (width === 320 && testId === "overview-peak-hours") {
        const hourLabel = chart.locator('span[title="1 PM"] > span:visible');
        const lineBreak = await hourLabel.evaluate((element) => {
          const text = element.firstChild;
          if (!(text instanceof Text)) {
            return 0;
          }
          const range = document.createRange();
          range.setStart(text, 0);
          range.setEnd(text, 1);
          const firstLine = range.getBoundingClientRect().top;
          range.setStart(text, 2);
          range.setEnd(text, 4);
          return range.getBoundingClientRect().top - firstLine;
        });
        expect(lineBreak).toBeGreaterThanOrEqual(15);
      }
      await chart.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${testId}-${width}.png`) });
    }
    await expectNoHorizontalOverflow(page);
    await page.goto("/business/queue");
    const queueContact = page
      .getByTestId("queue-row-queue-email")
      .getByText(`Email: ${email}`, { exact: true });
    await expect(queueContact).toHaveAttribute("title", `Email: ${email}`);
    await expect(queueContact).toHaveCSS("text-overflow", "ellipsis");
    await expect(queueContact).toHaveCSS("white-space", "nowrap");
    if (width === 320) {
      expect(
        await queueContact.evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBe(true);
    }
    await expectNoHorizontalOverflow(page);
    await page.goto("/business/reservations");
    const reservationContact = page.getByText(email, { exact: true });
    await expect(reservationContact).toHaveAttribute("title", email);
    await expect(reservationContact).toHaveCSS("text-overflow", "ellipsis");
    await expect(reservationContact).toHaveCSS("white-space", "nowrap");
    const actions = page.getByRole("button", { name: /^(Mark Arrived|No-Show|Cancel)$/ });
    await expect(actions).toHaveCount(3);
    let actionFontSize = "13px";
    if (width < 640) {
      actionFontSize = "11px";
    }
    for (const action of await actions.all()) {
      await expect(action).toHaveCSS("font-size", actionFontSize);
      await expect(action).toHaveCSS("white-space", "nowrap");
    }
    const bounds = await actions.evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(button);
        return {
          top: rect.top,
          height: rect.height,
          textFits: button.scrollHeight <= button.clientHeight,
          textWidthFits: button.scrollWidth <= button.clientWidth,
          textHeight: text.getBoundingClientRect().height,
        };
      }),
    );
    expect(
      Math.max(...bounds.map((box) => box.top)) - Math.min(...bounds.map((box) => box.top)),
    ).toBeLessThan(1);
    for (const box of bounds) {
      expect(box.height).toBeGreaterThanOrEqual(28);
      expect(box.textFits).toBe(true);
      expect(box.textWidthFits).toBe(true);
      expect(box.textHeight).toBeLessThan(20);
    }
    if (width === 320) {
      expect(
        await reservationContact.evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBe(true);
    }
    await actions.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`reservation-actions-${width}.png`) });
    await expectNoHorizontalOverflow(page);
  });
}

for (const width of [320, 390, 1440]) {
  test(`campaign manage menus and shared pill alignment at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockBusiness(page);
    const statuses = ["DRAFT", "READY", "CANCELLED", "SCHEDULED", "RECURRING", "PAUSED"];
    const campaigns = statuses.map((status, index) => ({
      id: `campaign-${status}`,
      name: `${status} Campaign`,
      status,
      channel: ["SMS", "WHATSAPP", "EMAIL"][index % 3],
      templateId: "template",
      templateName: "Welcome Guests",
      audienceType: "all_guests",
      audienceLabel: "All Guests",
      audienceConfig: {},
      templateValues: {},
      recipientCount: 12,
      recurrenceFrequency: "WEEKLY",
      nextRunAtLabel: "Nov 3, 2026, 12:24 AM",
      createdAt: "2026-10-17T12:00:00Z",
    }));
    await page.route("**/api/campaigns/meta", (route) =>
      route.fulfill({
        json: { locations: [], channels: ["SMS", "WHATSAPP", "EMAIL"], audiences: [] },
      }),
    );
    await page.route("**/api/campaigns/templates", (route) =>
      route.fulfill({ json: { templates: [] } }),
    );
    await page.route("**/api/audiences**", (route) => route.fulfill({ json: { audiences: [] } }));
    await page.route("**/api/campaigns?**", (route) => route.fulfill({ json: { campaigns } }));
    await page.goto("/business/campaigns");
    await expect(
      page.getByRole("button", { name: "Manage DRAFT Campaign", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    if (width < 768) {
      const timing = "Weekly · Next Nov 3, 2026, 12:24 AM";
      const summary = page.getByTitle(timing, { exact: true });
      await expect(summary).toHaveText(timing);
      await expect(summary).toHaveCSS("white-space", "nowrap");
      await expect(summary).toHaveCSS("text-overflow", "ellipsis");
    }
    if (width >= 768) {
      await expect(
        page.getByRole("columnheader", { name: "Actions", exact: true }).locator("span"),
      ).toHaveClass("sr-only");
    }
    const expected = [
      ["Edit"],
      ["Edit"],
      ["Edit"],
      ["Cancel"],
      ["Pause", "Cancel"],
      ["Resume", "Cancel"],
    ];
    for (const [index, status] of statuses.entries()) {
      await page.getByRole("button", { name: `Manage ${status} Campaign`, exact: true }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem")).toHaveText(expected[index]);
      await expect(menu).toBeFocused();
      await expect(page.locator("body")).toHaveCSS("pointer-events", "none");
      await expect(menu).toHaveCSS("pointer-events", "auto");
      await menu.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(page.locator("body")).toHaveCSS("pointer-events", "auto");
    }
    const badges = page.locator(".h-badge:visible");
    const alignment = await badges.evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        const text = node.querySelector("span");
        if (!text) {
          throw new Error("Missing Badge Text");
        }
        const box = node.getBoundingClientRect();
        const content = text.getBoundingClientRect();
        return {
          height: box.height,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
          trim: getComputedStyle(text).getPropertyValue("text-box-trim"),
          difference: Math.abs(content.top - box.top - (box.bottom - content.bottom)),
        };
      }),
    );
    expect(alignment.length).toBeGreaterThan(0);
    for (const badge of alignment) {
      expect(badge.height).toBe(20);
      expect(badge.paddingTop).toBe(badge.paddingBottom);
      expect(badge.trim).toBe("trim-both");
      expect(badge.difference).toBeLessThan(0.1);
    }
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Manage RECURRING Campaign", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`campaign-manage-${width}.png`) });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Manage DRAFT Campaign", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Edit Campaign", exact: true })).toBeVisible();
  });
}

test("reservation filters use standard buttons and badges while preserving each reservation bucket", async ({
  page,
}, testInfo) => {
  await mockBusiness(page);
  const filters = [
    ["Today", "Today Guest"],
    ["Upcoming", "Upcoming Guest"],
    ["Past", "Past Guest"],
    ["Cancelled", "Cancelled Guest"],
    ["No-Shows", "No-Show Guest"],
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/business/reservations");
    await expect(page.getByText("Today Guest", { exact: true })).toBeVisible();
    let buttonHeight = "28px";
    if (width < 640) {
      buttonHeight = "32px";
    }
    for (const [label] of filters) {
      const filter = page
        .getByRole("main")
        .getByRole("button", { name: new RegExp(`^${label}\\s+1$`) });
      await expect(filter).toHaveCSS("height", buttonHeight);
      await expect(filter).toHaveCSS("border-radius", "10px");
      await expect(filter).toHaveCSS("font-size", "13px");
      const count = filter.locator(".h-badge").filter({ hasText: /^1$/ });
      await expect(count).toHaveCSS("height", "20px");
      await expect(count).toHaveCSS("border-radius", "6px");
      if (label === "Today") {
        await expect(filter).toHaveAttribute("aria-pressed", "true");
        await expect(filter).toHaveCSS("background-color", "rgb(15, 23, 42)");
      } else {
        await expect(filter).toHaveAttribute("aria-pressed", "false");
        await expect(filter).toHaveCSS("background-color", "rgb(255, 255, 255)");
      }
    }
    for (const [label, name] of filters) {
      const filter = page
        .getByRole("main")
        .getByRole("button", { name: new RegExp(`^${label}\\s+1$`) });
      await filter.click();
      await page.mouse.move(0, 0);
      await expect(filter).toHaveAttribute("aria-pressed", "true");
      await expect(filter).toHaveCSS("background-color", "rgb(15, 23, 42)");
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      for (const [, otherName] of filters) {
        if (otherName !== name) {
          await expect(page.getByText(otherName, { exact: true })).toHaveCount(0);
        }
      }
      await expectNoHorizontalOverflow(page);
    }
    if (width === 1440) {
      await expectRegularNavigation(page.locator("aside"));
    } else {
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
      const menu = page.getByRole("dialog");
      await expectRegularNavigation(menu);
      await menu.getByRole("button", { name: "Close menu", exact: true }).click();
    }
    await page.screenshot({
      path: testInfo.outputPath(`business-reservation-filters-${width}.png`),
      animations: "disabled",
    });
  }
});

test("business settings use standard language, timezone, and time controls with working selections", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mockBusiness(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/business/settings");
    const language = page.getByRole("combobox", { name: "Language", exact: true });
    await expect(language).toBeVisible();
    let controlHeight = "32px";
    let largeControlHeight = "40px";
    if (width < 640) {
      controlHeight = "36px";
      largeControlHeight = "44px";
    }
    await expect(language).toHaveCSS("height", controlHeight);
    await expect(language).toHaveCSS("border-radius", "10px");
    const languageRequest = page.waitForRequest(
      (request) => request.url().endsWith("/auth/business/language") && request.method() === "PUT",
    );
    await language.click();
    await page.getByRole("option", { name: "Bahasa Indonesia", exact: true }).click();
    expect((await languageRequest).postDataJSON()).toEqual({ language: "id" });
    const indonesianLanguage = page.getByRole("combobox", { name: "Bahasa", exact: true });
    await expect(indonesianLanguage).toHaveText("Bahasa Indonesia");
    await indonesianLanguage.click();
    await page.getByRole("option", { name: "English", exact: true }).click();
    await expect(language).toHaveText("English");
    await page.getByRole("button", { name: "Edit Restaurant Profile", exact: true }).click();
    const dialog = page.getByRole("dialog");
    if (width < 640) {
      controlHeight = "32px";
      largeControlHeight = "32px";
    }
    const timezone = dialog.getByRole("combobox", { name: "Timezone", exact: true });
    await timezone.scrollIntoViewIfNeeded();
    await expect(timezone).toHaveCSS("height", controlHeight);
    await expect(timezone).toHaveCSS("border-radius", "10px");
    await timezone.click();
    await page.getByPlaceholder("Search timezone or city...").fill("Asia/Jakarta");
    await page.getByRole("option", { name: /Asia\/Jakarta/ }).click();
    await expect(timezone).toContainText("Asia/Jakarta");
    const openTime = dialog.getByRole("button", { name: "monday open time", exact: true });
    await openTime.scrollIntoViewIfNeeded();
    await expect(openTime).toHaveCSS("height", largeControlHeight);
    await expect(openTime).toHaveCSS("border-radius", "10px");
    await openTime.click();
    await dialog.getByRole("button", { name: "10:00 AM", exact: true }).click();
    await expect(openTime).toContainText("10:00 AM");
    await expectNoHorizontalOverflow(page);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
});

for (const width of [320, 390, 1440]) {
  test(`restaurant profile editor keeps cards and controls inside the modal at ${width}px`, async ({
    page,
  }, testInfo) => {
    await mockBusiness(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/business/settings");
    await page.getByRole("button", { name: "Edit Restaurant Profile", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Restaurant Profile", exact: true });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
    let expectedWidth = 672;
    let expectedPadding = "24px";
    let expectedInputFont = "14px";
    let expectedTitleFont = "16px";
    let expectedBodyFont = "14px";
    let expectedLabelFont = "13px";
    const expectedControlHeight = "32px";
    if (width < 640) {
      expectedWidth = width - 32;
      expectedPadding = "16px";
      expectedInputFont = "13px";
      expectedTitleFont = "15px";
      expectedBodyFont = "13px";
      expectedLabelFont = "12px";
    }
    await expect
      .poll(() =>
        dialog.evaluate(
          (element) =>
            element.getAnimations().filter((animation) => animation.playState === "running").length,
        ),
      )
      .toBe(0);
    await expect
      .poll(async () => {
        const bounds = await dialog.boundingBox();
        if (!bounds) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(bounds.width - expectedWidth),
          Math.abs(bounds.x - (width - bounds.width) / 2),
          bounds.height - 844 * 0.85,
        );
      })
      .toBeLessThanOrEqual(1);
    await expect(dialog).toHaveCSS("padding", expectedPadding);
    await expect(dialog).toHaveCSS("border-radius", "16px");
    const title = dialog.getByRole("heading", { name: "Edit Restaurant Profile", exact: true });
    await expect(title).toHaveCSS("font-size", expectedTitleFont);
    await expect(title).toHaveCSS("line-height", "20px");
    await expect(title).toHaveCSS("font-weight", "500");
    await expect(title).toHaveCSS("font-family", /Inter/);
    const sectionTitles = dialog.locator(".shadow-sm.border > div > h3");
    expect(await sectionTitles.count()).toBeGreaterThanOrEqual(8);
    for (const heading of await sectionTitles.all()) {
      await expect(heading).toHaveCSS("font-size", expectedTitleFont);
      await expect(heading).toHaveCSS("font-weight", "500");
      const description = heading.locator("..").locator(":scope > p").first();
      await expect(description).toHaveCSS("font-size", expectedBodyFont);
      await expect(description).toHaveCSS("font-weight", "400");
    }
    await expect(
      dialog.getByText("This information powers your customer-facing restaurant page.", {
        exact: true,
      }),
    ).toHaveCSS("font-size", expectedBodyFont);
    const labels = dialog.locator("label");
    expect(await labels.count()).toBeGreaterThan(15);
    for (const label of await labels.all()) {
      await expect(label).toHaveCSS("font-size", expectedLabelFont);
      await expect(label).toHaveCSS("font-weight", "500");
    }
    const inputs = dialog.locator('input:not([type="file"]), textarea');
    expect(await inputs.count()).toBeGreaterThan(15);
    for (const input of await inputs.all()) {
      await expect(input).toHaveCSS("font-size", expectedInputFont);
    }
    const name = dialog.getByLabel("Restaurant Name", { exact: true });
    await expect(name).toHaveCSS("height", expectedControlHeight);
    const description = dialog.getByLabel("About / Description", { exact: true });
    const originalHeight = await description.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    await description.evaluate((element) => {
      element.style.height = "1px";
    });
    expect(await description.evaluate((element) => element.getBoundingClientRect().height)).toBe(
      originalHeight,
    );
    await expect(description).toHaveCSS("resize", "vertical");
    const clippedElements = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return Array.from(
        element.querySelectorAll<HTMLElement>(
          'label, input:not([type="file"]), textarea, button, [role="combobox"], h3, p, .shadow-sm.border',
        ),
      )
        .filter((candidate) => {
          const rectangle = candidate.getBoundingClientRect();
          return rectangle.width > 0 && rectangle.height > 0;
        })
        .filter((candidate) => {
          const rectangle = candidate.getBoundingClientRect();
          return rectangle.left < bounds.left + 15 || rectangle.right > bounds.right - 15;
        })
        .map((candidate) => ({
          tag: candidate.tagName,
          text: candidate.textContent?.trim().slice(0, 80),
        }));
    });
    expect(clippedElements).toEqual([]);
    const save = dialog.getByRole("button", { name: "Save Changes", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await dialog.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: testInfo.outputPath(`restaurant-profile-modal-${width}.png`),
      animations: "disabled",
    });
  });
}

test("selected restaurant booking times keep readable contrast while hovered", async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-10-17T12:00:00.000Z"));
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/auth/me", (route) => route.fulfill({ json: { user: null } }));
  await page.route("**/api/restaurants/bistro/loc-1?version=2", (route) =>
    route.fulfill({
      json: {
        restaurant: {
          ...restaurant({ name: "Design Bistro", bannerImageUrl: null }),
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
  await page.route("**/api/restaurants/bistro/loc-1/reviews?**", (route) =>
    route.fulfill({
      json: { reviews: [], totalReviews: 0, avgRating: null, nextCursor: null, hasMore: false },
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
        slots: [
          { time: "18:00", label: "6:00 PM", available: true, remaining: 4 },
          { time: "18:30", label: "6:30 PM", available: true, remaining: 4 },
        ],
        availability: { status: "available" },
      },
    }),
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/bistro/loc-1?date=2026-10-18&partySize=2");
    const slot = page
      .getByRole("button", { name: "6:00 PM", exact: true })
      .filter({ visible: true });
    await slot.click();
    await slot.hover();
    await expect(slot).toHaveCSS("background-color", "rgb(30, 41, 59)");
    await expect(slot).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(slot).toHaveCSS("border-radius", "10px");
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`selected-booking-slot-${width}.png`),
      animations: "disabled",
    });
  }
});

test("public featured loading placeholders show complete restaurant cards without clipping", async ({
  page,
}, testInfo) => {
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/featured-restaurants", async (route) => {
      await pending;
      await route.fulfill({
        json: {
          featured: [{ ...restaurant({ bannerImageUrl: null }), id: "featured-design-audit" }],
        },
      });
    });
    try {
      await page.goto("/");
      const loading = page.getByRole("status", {
        name: "Loading Featured Restaurants",
        exact: true,
      });
      await expect(loading).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await loading.scrollIntoViewIfNeeded();
      const cards = loading.locator(".overflow-hidden").filter({ visible: true });
      let expectedCards = 3;
      if (width < 1024) {
        expectedCards = 1;
      }
      await expect(cards).toHaveCount(expectedCards);
      const completeCards = await cards.evaluateAll((elements) =>
        elements.every((element) => {
          const card = element.getBoundingClientRect();
          const placeholders = Array.from(element.querySelectorAll(".animate-pulse"));
          return (
            card.left >= 0 &&
            card.right <= window.innerWidth &&
            card.top >= 0 &&
            card.bottom <= window.innerHeight &&
            element.scrollHeight <= element.clientHeight + 1 &&
            placeholders.every((placeholder) => {
              const bounds = placeholder.getBoundingClientRect();
              return (
                bounds.width > 0 &&
                bounds.height > 0 &&
                bounds.top >= card.top &&
                bounds.bottom <= card.bottom &&
                bounds.left >= card.left &&
                bounds.right <= card.right
              );
            })
          );
        }),
      );
      expect(completeCards).toBe(true);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`public-featured-complete-loading-${width}.png`),
        animations: "disabled",
      });
      release();
      await expect(
        page.getByRole("link", { name: "View Bistro Downtown", exact: true }),
      ).toBeVisible();
      await expect(loading).toHaveCount(0);
    } finally {
      release();
    }
  }
});

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

async function mockBusiness(page: Page) {
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
      const count = filter.getByText("1", { exact: true });
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

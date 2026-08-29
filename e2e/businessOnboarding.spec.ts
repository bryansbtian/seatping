import { expect, test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";
import { uniqueId } from "./helpers/db.js";

test("a business creates a location from the settings page and it survives a reload", async ({
  page,
  db,
}) => {
  const business = await db.createBusiness({ maxLocations: 3 });
  const displayName = `E2E Location ${uniqueId()}`;
  const address = "88 Playwright Street, Jakarta, Indonesia";

  await signInBusiness(page, business);
  await page.goto("/business/settings");

  await expect(page.getByRole("heading", { name: "Location Management" })).toBeVisible();
  await expect(page.getByText("No Locations Yet")).toBeVisible();

  await page.getByLabel("Location Display Name").fill(displayName);
  await page.getByLabel("Search Address").fill(address);
  await page.getByRole("button", { name: "Add Location" }).filter({ visible: true }).click();

  await expect
    .poll(async () => {
      return db.prisma.location.count({ where: { businessId: business.id } });
    })
    .toBe(1);

  const created = await db.prisma.location.findFirstOrThrow({
    where: { businessId: business.id },
  });
  expect(created.displayName).toBe(displayName);
  expect(created.address).toBe(address);
  expect(created.businessUsername).toBe(business.username);
  expect(created.isPublished).toBe(false);

  await page.reload();
  await expect(page.getByRole("main").getByText(displayName)).toBeVisible();
});

test("a business configures opening hours, reservation limits and publishes the restaurant profile", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    isPublished: false,
    restaurantProfile: {},
  });
  const restaurantName = `E2E Bistro ${uniqueId()}`;

  await signInBusiness(page, business);
  await page.goto("/business/settings");

  await page.getByRole("button", { name: "Edit Restaurant Profile" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Restaurant Name")).toBeVisible();
  await dialog.getByLabel("Restaurant Name").fill(restaurantName);
  await dialog.getByLabel("Short Address").fill("Playwright District");
  await dialog.getByLabel("Address", { exact: true }).fill("88 Playwright Street");

  await dialog.getByRole("button", { name: "monday open time" }).click();
  await dialog.getByRole("button", { name: "9:00 AM", exact: true }).click();

  await dialog.getByLabel("Max Reserved Guests Per Hour").fill("12");

  const publishToggle = dialog
    .getByText("Publish Profile", { exact: true })
    .locator("xpath=../preceding-sibling::button[@role='switch']");
  await expect(publishToggle).toHaveAttribute("aria-checked", "false");
  await publishToggle.click();
  await expect(publishToggle).toHaveAttribute("aria-checked", "true");

  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Profile Saved", { exact: true })).toBeVisible();

  await expect
    .poll(async () => {
      const stored = await db.prisma.location.findUnique({
        where: { id: location.id },
      });
      return stored?.isPublished;
    })
    .toBe(true);

  const stored = await db.prisma.location.findUniqueOrThrow({
    where: { id: location.id },
  });
  const profile = stored.restaurantProfile as Record<string, any>;
  const settings = stored.reservationSettings as Record<string, any>;

  expect(profile.displayName).toBe(restaurantName);
  expect(profile.shortAddress).toBe("Playwright District");
  expect(profile.isPublished).toBe(true);
  expect(profile.openingHours.monday.open).toBe("09:00");
  expect(profile.openingHours.monday.enabled).toBe(true);
  expect(settings.maxReservedGuestsPerHour).toBe(12);
  expect(stored.reservationsEnabled).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Edit Restaurant Profile" }).click();
  await expect(page.getByRole("dialog").getByLabel("Restaurant Name")).toHaveValue(restaurantName);
});

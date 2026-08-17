import { expect, test } from "./fixtures/seatping.js";
import { uniqueId } from "./helpers/db.js";
import { openAllDayEveryDay, publishedProfile } from "./helpers/time.js";

test("an unpublished location is kept out of public discovery while its published sibling is listed", async ({
  page,
  db,
}) => {
  const marker = `Marker${uniqueId()}`;
  const business = await db.createBusiness();

  const published = await db.createLocation(business, {
    isPublished: true,
    displayName: `${marker} Published`,
    restaurantProfile: publishedProfile(
      `${marker} Published`,
      openAllDayEveryDay(),
    ),
  });
  const unpublished = await db.createLocation(business, {
    isPublished: false,
    displayName: `${marker} Draft`,
    restaurantProfile: {
      ...publishedProfile(`${marker} Draft`, openAllDayEveryDay()),
      isPublished: false,
    },
  });

  const response = await page.request.get(
    `/api/search/restaurants?query=${marker}`,
  );
  expect(response.status()).toBe(200);
  const body = await response.json();
  const listedIds = body.results.map((r: { locationId: string }) => r.locationId);
  expect(listedIds).toContain(published.id);
  expect(listedIds).not.toContain(unpublished.id);

  const suggestions = await page.request.get(
    `/api/locations/search-suggestions?query=${marker}`,
  );
  expect(suggestions.status()).toBe(200);
  const suggestionText = JSON.stringify(await suggestions.json());
  expect(suggestionText).not.toContain(`${marker} Draft`);

  await page.goto(`/search/${marker}`);
  await expect(page.getByText(`${marker} Published`).first()).toBeVisible();
  await expect(page.getByText(`${marker} Draft`)).toHaveCount(0);
});

test("a published restaurant page shows its details and offers the queue and reservation actions", async ({
  page,
  db,
}) => {
  const marker = `Marker${uniqueId()}`;
  const { business, location } = await db.createBusinessWithLocation({
    isPublished: true,
    displayName: `${marker} Dining Room`,
    restaurantProfile: publishedProfile(
      `${marker} Dining Room`,
      openAllDayEveryDay(),
    ),
  });

  await page.goto(`/${business.username}/${location.id}`);

  await expect(
    page.getByRole("heading", { name: `${marker} Dining Room`, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Seated without the wait").first()).toBeVisible();
  await expect(page.getByText("1 Playwright Street, Jakarta").first()).toBeVisible();

  await expect(page.getByRole("link", { name: "Join Queue" })).toHaveAttribute(
    "href",
    `/queue/${business.username}/${location.id}`,
  );
  await expect(page.getByText("Plan Your Visit")).toBeVisible();
  await expect(page.getByRole("button", { name: "Book Table" })).toBeVisible();
});

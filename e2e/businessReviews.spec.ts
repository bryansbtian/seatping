import { expect } from "@playwright/test";
import { test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";

test("Reviews sits under Customers in the sidebar and opens the reviews page", async ({
  page,
  db,
}) => {
  const seed = await db.createBusinessWithLocation();
  await signInBusiness(page, seed.business);
  await page.goto("/business/overview");

  const reviewsLink = page.getByRole("link", { name: "Reviews" });
  await expect(reviewsLink).toBeVisible();

  await reviewsLink.click();

  await expect(page).toHaveURL(/\/business\/reviews$/);
  await expect(page.getByRole("heading", { name: "Customer Reviews" })).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  await expect(reviewsLink).toHaveAttribute("aria-current", "page");
});

test("the reviews page summarises and lists the reviews for the selected location", async ({
  page,
  db,
}) => {
  const seed = await db.createBusinessWithLocation();
  await db.prisma.review.createMany({
    data: [
      {
        locationId: seed.location.id,
        customerName: "Bryan Susanto",
        rating: 5,
        description: "Great experience and quick service.",
      },
      {
        locationId: seed.location.id,
        customerName: "Kevin Nguyen",
        rating: 3,
        description: "Slow on a busy night.",
      },
    ],
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/reviews");

  await expect(page.getByTestId("reviews-average")).toHaveText("4.0");
  await expect(page.getByTestId("reviews-reply-status")).toHaveText("2 guests are waiting, chef.");
  await expect(page.getByTestId("reviews-reply-status-body")).toHaveText(
    "Send a quick reply and keep the good vibes simmering.",
  );
  await expect(page.getByTestId("reviews-distribution-5")).toContainText("1");
  await expect(page.getByTestId("reviews-distribution-3")).toContainText("1");

  const list = page.getByTestId("reviews-list");
  await expect(list.getByText("Bryan Susanto")).toBeVisible();
  await expect(list.getByText("Kevin Nguyen")).toBeVisible();
  await expect(list.getByText("Great experience and quick service.")).toBeVisible();
});

test("a location with no reviews shows the empty state instead of a summary", async ({
  page,
  db,
}) => {
  const seed = await db.createBusinessWithLocation();
  await signInBusiness(page, seed.business);
  await page.goto("/business/reviews");

  await expect(page.getByTestId("reviews-empty")).toBeVisible();
  await expect(page.getByTestId("reviews-summary")).toHaveCount(0);
  await expect(page.getByTestId("reviews-list")).toHaveCount(0);
});

test("switching the sidebar location swaps the reviews without leaving the page", async ({
  page,
  db,
}) => {
  const seed = await db.createBusinessWithLocation({ displayName: "PIK Avenue" });
  const second = await db.createLocation(seed.business, { displayName: "Plaza Indonesia" });
  await db.prisma.review.createMany({
    data: [
      {
        locationId: seed.location.id,
        customerName: "PIK Guest",
        rating: 5,
        description: "Loved the seaside view.",
      },
      {
        locationId: second.id,
        customerName: "Plaza Guest",
        rating: 4,
        description: "Quick service downtown.",
      },
    ],
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/reviews");

  const list = page.getByTestId("reviews-list");
  await expect(list.getByText("PIK Guest")).toBeVisible();
  await expect(list.getByText("Plaza Guest")).toHaveCount(0);

  await page.getByRole("button", { name: "Switch location" }).click();
  await page.getByRole("button", { name: /Plaza Indonesia/ }).click();

  await expect(page).toHaveURL(/\/business\/reviews$/);
  await expect(page.getByTestId("reviews-list").getByText("Plaza Guest")).toBeVisible();
  await expect(page.getByTestId("reviews-list").getByText("PIK Guest")).toHaveCount(0);
});

test("Settings keeps its location actions but no longer offers View Reviews", async ({
  page,
  db,
}) => {
  const seed = await db.createBusinessWithLocation();
  await db.prisma.review.create({
    data: {
      locationId: seed.location.id,
      customerName: "Bryan Susanto",
      rating: 5,
      description: "Great experience and quick service.",
    },
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/settings");

  await expect(page.getByRole("heading", { name: "Location Management" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View Reviews" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Restaurant Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "QR Code" })).toBeVisible();

  await page.goto("/business/reviews");
  await expect(page.getByTestId("reviews-list").getByText("Bryan Susanto")).toBeVisible();
});

test("the range toggle narrows the reviews to a recent window", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
  await db.prisma.review.createMany({
    data: [
      {
        locationId: seed.location.id,
        customerName: "Recent Guest",
        rating: 5,
        description: "Came in this week.",
      },
      {
        locationId: seed.location.id,
        customerName: "Old Guest",
        rating: 2,
        description: "Visited a long time ago.",
        createdAt: longAgo,
      },
    ],
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/reviews");

  await expect(page.getByTestId("reviews-range-all")).toHaveClass(/bg-slate-900/);
  await expect(page.getByTestId("reviews-list").getByText("Old Guest")).toBeVisible();

  await page.getByTestId("reviews-range-30d").click();

  await expect(page.getByTestId("reviews-list").getByText("Recent Guest")).toBeVisible();
  await expect(page.getByTestId("reviews-list").getByText("Old Guest")).toHaveCount(0);
  await expect(page.getByTestId("reviews-average")).toHaveText("5.0");
});

test("the quick filter chips narrow the list and carry counts", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  await db.prisma.review.createMany({
    data: [
      {
        locationId: seed.location.id,
        customerName: "Happy Guest",
        rating: 5,
        description: "Delicious food.",
        businessReply: "Thank you!",
        businessReplyCreatedAt: new Date(),
      },
      {
        locationId: seed.location.id,
        customerName: "Unhappy Guest",
        rating: 2,
        description: "Long wait.",
      },
    ],
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/reviews");

  await expect(page.getByTestId("reviews-chip-all")).toContainText("2");
  await expect(page.getByTestId("reviews-chip-needs-reply")).toContainText("1");
  await expect(page.getByTestId("reviews-chip-replied")).toContainText("1");
  await expect(page.getByTestId("reviews-chip-low")).toContainText("1");

  await page.getByTestId("reviews-chip-needs-reply").click();
  await expect(
    page.getByTestId("reviews-list").getByText("Unhappy Guest", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("reviews-list").getByText("Happy Guest", { exact: true }),
  ).toHaveCount(0);

  await page.getByTestId("reviews-chip-replied").click();
  await expect(
    page.getByTestId("reviews-list").getByText("Happy Guest", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("reviews-list").getByText("Unhappy Guest", { exact: true }),
  ).toHaveCount(0);
});

test("a replied review names the restaurant as the owner and ends the list", async ({
  page,
  db,
}) => {
  const seed = await db.createBusinessWithLocation({
    displayName: "PIK Avenue",
    restaurantProfile: { displayName: "The Japanese Restaurant" },
  });
  await db.prisma.review.create({
    data: {
      locationId: seed.location.id,
      customerName: "Bryan Susanto",
      customerUsername: "bryansbtian",
      rating: 5,
      description: "Delicious Food!",
      serviceType: "queue",
      businessReply: "Thank you!",
      businessReplyCreatedAt: new Date(),
    },
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/reviews");

  const card = page.getByTestId("reviews-list");
  await expect(card.getByText("Bryan Susanto")).toBeVisible();
  await expect(card.getByText("@bryansbtian")).toBeVisible();
  await expect(card.getByText("Walk-in")).toBeVisible();
  await expect(page.getByTestId(/^review-owner-/)).toHaveText("The Japanese Restaurant");
  await expect(page.getByTestId(/^review-owner-/)).not.toHaveText("PIK Avenue");
  await expect(card.getByText("Owner")).toBeVisible();
  await expect(card.getByText("Thank you!")).toBeVisible();

  await expect(page.getByTestId("reviews-reply-status")).toHaveText("Inbox zero, chef.");
  await expect(page.getByTestId("reviews-reply-status-body")).toHaveText(
    "Every guest who spoke up has heard back from you.",
  );
  await expect(page.getByTestId("reviews-end")).toBeVisible();
});

test("a range with no reviews shows the same empty state treatment as Performance", async ({
  page,
  db,
}) => {
  const seed = await db.createBusinessWithLocation();
  await db.prisma.review.create({
    data: {
      locationId: seed.location.id,
      customerName: "Old Guest",
      rating: 4,
      description: "Visited a long time ago.",
      createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
    },
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/reviews");
  await page.getByTestId("reviews-range-30d").click();

  const empty = page.getByTestId("reviews-range-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("No Reviews Yet");
  await expect(page.getByTestId("reviews-summary")).toHaveCount(0);
  await expect(page.getByTestId("reviews-chips")).toHaveCount(0);
});

test("Settings keeps the location actions on one row on a tablet", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation({ displayName: "PIK Avenue" });
  await signInBusiness(page, seed.business);

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/business/settings");

    const edit = page.getByRole("button", { name: "Edit Restaurant Profile" });
    const qr = page.getByRole("button", { name: "QR Code" });
    await expect(edit).toBeVisible();
    await expect(qr).toBeVisible();

    const editBox = await edit.boundingBox();
    const qrBox = await qr.boundingBox();
    const nameBox = await page.getByTestId(`loc-name-${seed.location.id}`).boundingBox();
    expect(editBox).not.toBeNull();
    expect(qrBox).not.toBeNull();
    expect(nameBox).not.toBeNull();

    expect(Math.abs(editBox!.y - qrBox!.y)).toBeLessThan(4);
    expect(qrBox!.x).toBeGreaterThan(editBox!.x);
    expect(editBox!.x).toBeGreaterThan(nameBox!.x);
  }
});

test("the tablet location actions fall back to icons only", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation({ displayName: "PIK Avenue" });
  await signInBusiness(page, seed.business);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/business/settings");

  const edit = page.getByRole("button", { name: "Edit Restaurant Profile" });
  await expect(edit).toBeVisible();
  await expect(page.getByTestId("loc-edit-label")).toBeHidden();
  await expect(page.getByTestId("loc-qr-label")).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("loc-edit-label")).toBeVisible();
  await expect(page.getByTestId("loc-qr-label")).toBeVisible();
});

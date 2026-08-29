import { expect, test } from "./fixtures/seatping.js";
import { openBusinessDashboard } from "./helpers/auth.js";
import { legacyKeyOf, uniqueId } from "./helpers/db.js";
import {
  buildGuest,
  dashboardCard,
  fullNameOf,
  joinQueueThroughUi,
  openQueuePage,
  waitingCardFor,
} from "./helpers/queue.js";
import { closedEveryDay, openAllDayEveryDay, publishedProfile } from "./helpers/time.js";

test("a closed restaurant blocks queue joining in the browser and on the server", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Closed Diner", closedEveryDay()),
  });
  const guest = buildGuest();

  await openQueuePage(page, business.username, location.id);

  await expect(page.getByRole("heading", { name: "Restaurant Closed" })).toBeVisible();
  await expect(page.getByLabel("First Name")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Join Queue" })).toHaveCount(0);

  const response = await page.request.post(`/auth/business/${business.username}/queue`, {
    data: {
      locationId: location.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      numGuests: 2,
      email: guest.email,
      notificationMethod: "email",
    },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain("currently closed");

  expect(await db.prisma.queueEntry.count({ where: { locationId: location.id } })).toBe(0);
});

test("a customer joins the queue and reaches the live queue status view", async ({ page, db }) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Open Diner", openAllDayEveryDay()),
  });
  const guest = buildGuest();
  const creditsBefore = location.credits;

  await joinQueueThroughUi(page, business.username, location.id, guest);

  await expect(page.getByText("You are #1 in line")).toBeVisible();
  await expect(page.getByText(fullNameOf(guest))).toBeVisible();

  const entry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: location.id, lastName: guest.lastName },
  });
  expect(entry.status).toBe("WAITING");
  expect(entry.guestCount).toBe(guest.guestCount);
  expect(entry.email).toBe(guest.email);
  expect(entry.notificationMethod).toBe("email");

  const status = await page.request.get(
    `/auth/business/${business.username}/queue/token/${entry.queueToken}/status`,
  );
  expect(status.status()).toBe(200);
  const statusBody = await status.json();
  expect(statusBody.position).toBe(1);
  expect(statusBody.admitted).toBe(false);
  expect(statusBody.removed).toBe(false);

  const stored = await db.prisma.location.findUniqueOrThrow({
    where: { id: location.id },
  });
  expect(stored.credits).toBe(creditsBefore - 1);
});

test("a second join with the same contact is rejected while the first entry is still waiting", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Open Diner", openAllDayEveryDay()),
  });
  const guest = buildGuest();

  await joinQueueThroughUi(page, business.username, location.id, guest);

  const duplicate = await page.request.post(`/auth/business/${business.username}/queue`, {
    data: {
      locationId: location.id,
      firstName: guest.firstName,
      lastName: `${guest.lastName}Again`,
      numGuests: 4,
      email: guest.email,
      notificationMethod: "email",
    },
  });
  expect(duplicate.status()).toBe(409);
  const body = await duplicate.json();
  expect(body.alreadyInQueue).toBe(true);

  const waiting = await db.prisma.queueEntry.findMany({
    where: { locationId: location.id, status: "WAITING" },
  });
  expect(waiting).toHaveLength(1);
  expect(waiting[0].lastName).toBe(guest.lastName);
});

test("queue positions shift up when the guest ahead is admitted", async ({
  page,
  extraPage,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Open Diner", openAllDayEveryDay()),
  });
  const ahead = {
    firstName: "Ada",
    lastName: `Ahead${uniqueId()}`,
    email: `e2e-ahead-${uniqueId()}@test.invalid`,
    guestCount: 2,
  };
  await db.createQueueEntry(location, {
    firstName: ahead.firstName,
    lastName: ahead.lastName,
    email: ahead.email,
    joinedAt: new Date(Date.now() - 10 * 60 * 1000),
  });

  const behind = buildGuest("Ben");
  await joinQueueThroughUi(page, business.username, location.id, behind);
  await expect(page.getByText("You are #2 in line")).toBeVisible();

  await openBusinessDashboard(extraPage, business);
  const aheadCard = waitingCardFor(extraPage, ahead);
  await expect(aheadCard).toContainText("#1");
  await expect(waitingCardFor(extraPage, behind)).toContainText("#2");

  await aheadCard.getByRole("button", { name: "Admit" }).click();

  await expect
    .poll(async () => {
      const entry = await db.prisma.queueEntry.findFirst({
        where: { locationId: location.id, lastName: ahead.lastName },
      });
      return entry?.status;
    })
    .toBe("ADMITTED");

  await expect(page.getByText("You are #1 in line")).toBeVisible();

  const behindEntry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: location.id, lastName: behind.lastName },
  });
  expect(behindEntry.status).toBe("WAITING");

  const status = await page.request.get(
    `/auth/business/${business.username}/queue/token/${behindEntry.queueToken}/status`,
  );
  expect((await status.json()).position).toBe(1);
});

test("a newly joined guest appears in the business queue dashboard with their details", async ({
  page,
  extraPage,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Open Diner", openAllDayEveryDay()),
  });
  const guest = buildGuest();
  guest.guestCount = 5;

  await joinQueueThroughUi(page, business.username, location.id, guest);
  await openBusinessDashboard(extraPage, business);

  const card = waitingCardFor(extraPage, guest);
  await expect(card).toBeVisible();
  await expect(card).toContainText("#1");
  await expect(card).toContainText("5 Guests");
  await expect(card).toContainText(`Email: ${guest.email}`);
  await expect(card.getByRole("button", { name: "Admit" })).toBeVisible();
});

test("a business admits a waiting customer and the customer view switches to their turn", async ({
  page,
  extraPage,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Open Diner", openAllDayEveryDay()),
  });
  const guest = buildGuest();

  await joinQueueThroughUi(page, business.username, location.id, guest);
  await openBusinessDashboard(extraPage, business);

  await waitingCardFor(extraPage, guest).getByRole("button", { name: "Admit" }).click();

  await expect
    .poll(async () => {
      const entry = await db.prisma.queueEntry.findFirst({
        where: { locationId: location.id, lastName: guest.lastName },
      });
      return entry?.status;
    })
    .toBe("ADMITTED");

  const entry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: location.id, lastName: guest.lastName },
  });
  expect(entry.admittedAt).not.toBeNull();
  expect(entry.finalStatus).toBe("pending");

  await expect(
    extraPage.getByRole("heading", { name: "Awaiting Arrival Confirmation" }),
  ).toBeVisible();
  await expect(page.getByText("It's Your Turn!")).toBeVisible();
});

test("an admitted customer marked arrived leaves the waiting queue for good", async ({
  page,
  extraPage,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Open Diner", openAllDayEveryDay()),
  });
  const guest = buildGuest();

  await joinQueueThroughUi(page, business.username, location.id, guest);
  await openBusinessDashboard(extraPage, business);

  await waitingCardFor(extraPage, guest).getByRole("button", { name: "Admit" }).click();
  await expect(extraPage.getByRole("button", { name: "Seat" })).toBeVisible();
  await extraPage.getByRole("button", { name: "Seat" }).click();

  await expect
    .poll(async () => {
      const entry = await db.prisma.queueEntry.findFirst({
        where: { locationId: location.id, lastName: guest.lastName },
      });
      return entry?.status;
    })
    .toBe("ARRIVED");

  const entry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: location.id, lastName: guest.lastName },
  });
  expect(entry.finalStatus).toBe("arrived");
  expect(entry.arrivedAt).not.toBeNull();

  expect(
    await db.prisma.queueEntry.count({
      where: { locationId: location.id, status: "WAITING" },
    }),
  ).toBe(0);

  await expect(extraPage.getByTestId("queue-empty")).toBeVisible();
  await expect(page.getByText("You're Checked In.")).toBeVisible();
});

test("an admitted customer can be marked as a no-show and is removed from the active queue", async ({
  page,
  extraPage,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Open Diner", openAllDayEveryDay()),
  });
  const guest = buildGuest();

  await joinQueueThroughUi(page, business.username, location.id, guest);
  await openBusinessDashboard(extraPage, business);

  await waitingCardFor(extraPage, guest).getByRole("button", { name: "Admit" }).click();
  await expect(extraPage.getByRole("button", { name: "No Show" })).toBeVisible();
  await extraPage.getByRole("button", { name: "No Show" }).click();

  await expect
    .poll(async () => {
      const entry = await db.prisma.queueEntry.findFirst({
        where: { locationId: location.id, lastName: guest.lastName },
      });
      return entry?.status;
    })
    .toBe("NO_SHOW");

  const entry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: location.id, lastName: guest.lastName },
  });
  expect(entry.finalStatus).toBe("no_show");
  expect(entry.noShowAt).not.toBeNull();

  expect(
    await db.prisma.queueEntry.count({
      where: { locationId: location.id, status: { in: ["WAITING", "ADMITTED"] } },
    }),
  ).toBe(0);

  await expect(
    extraPage.getByRole("heading", { name: "Awaiting Arrival Confirmation" }),
  ).toHaveCount(0);
  await expect(extraPage.getByTestId("queue-empty")).toBeVisible();

  const status = await page.request.get(
    `/auth/business/${business.username}/queue/token/${entry.queueToken}/status`,
  );
  const body = await status.json();
  expect(body.status).toBe("no_show");
  expect(body.removed).toBe(true);
});

test("a customer leaves the queue and disappears from the business active queue", async ({
  page,
  extraPage,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Open Diner", openAllDayEveryDay()),
  });
  const guest = buildGuest();

  await joinQueueThroughUi(page, business.username, location.id, guest);
  await openBusinessDashboard(extraPage, business);
  await expect(waitingCardFor(extraPage, guest)).toBeVisible();

  await page.getByRole("button", { name: "Leave Queue" }).click();

  await expect
    .poll(async () => {
      const entry = await db.prisma.queueEntry.findFirst({
        where: { locationId: location.id, lastName: guest.lastName },
      });
      return entry?.status;
    })
    .toBe("LEFT");

  const entry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: location.id, lastName: guest.lastName },
  });
  expect(entry.leftAt).not.toBeNull();
  expect(entry.legacyKey).toBe(legacyKeyOf(guest.firstName, guest.lastName, entry.joinedAt));

  await expect(extraPage.getByTestId("queue-empty")).toBeVisible({ timeout: 30_000 });
  await expect(waitingCardFor(extraPage, guest)).toHaveCount(0);

  await extraPage.goto("/business/overview");
  const recentlyLeft = dashboardCard(extraPage, "Recently Left Customers");
  await expect(recentlyLeft.getByText(fullNameOf(guest))).toBeVisible();
  await expect(recentlyLeft.getByText("Left Queue").filter({ visible: true })).toBeVisible();
});

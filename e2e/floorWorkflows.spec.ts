import { expect, test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";
import { DEFAULT_RESERVATION_SETTINGS, uniqueId, type TestData } from "./helpers/db.js";
import { buildGuest, joinQueueThroughUi } from "./helpers/queue.js";
import { dateKeyInTimeZone, openAllDayEveryDay, publishedProfile } from "./helpers/time.js";

type FloorSeed = {
  business: { id: string };
  location: { id: string; businessId: string; businessUsername: string | null };
};

type Booking = {
  firstName: string;
  lastName: string;
  email: string;
};

async function seedSingleTable(db: TestData, seed: FloorSeed) {
  const room = await db.prisma.floorPlan.create({
    data: {
      businessId: seed.business.id,
      locationId: seed.location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });
  return db.prisma.diningTable.create({
    data: {
      floorPlanId: room.id,
      businessId: seed.business.id,
      locationId: seed.location.id,
      name: "T1",
      capacity: 4,
      minimumPartySize: 1,
      x: 60,
      y: 60,
      width: 130,
      height: 80,
    },
  });
}

function booking(): Booking {
  const id = uniqueId();
  return {
    firstName: "Rita",
    lastName: `Workflow${id}`,
    email: `floor-workflow-${id}@test.invalid`,
  };
}

function middaySlot(): { date: string; time: string; timeZone: string } {
  const now = new Date();
  const offset = 12 - now.getUTCHours();
  let timeZone = "UTC";
  if (offset > 0) {
    timeZone = `Etc/GMT-${offset}`;
  } else if (offset < 0) {
    timeZone = `Etc/GMT+${Math.abs(offset)}`;
  }
  return { date: dateKeyInTimeZone(now, timeZone), time: "14:00", timeZone };
}

async function bookThroughUi(
  page: import("@playwright/test").Page,
  businessUsername: string,
  locationId: string,
  slot: { date: string; time: string },
  guest: Booking,
): Promise<void> {
  await page.goto(
    `/${businessUsername}/${locationId}?date=${slot.date}&time=${slot.time}&partySize=2&book=1`,
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Book a Table")).toBeVisible();
  await dialog.getByLabel("First Name").fill(guest.firstName);
  await dialog.getByLabel("Last Name").fill(guest.lastName);
  await dialog.getByLabel("Email").fill(guest.email);
  await dialog.getByRole("button", { name: "Confirm Reservation" }).click();
  await expect(dialog.getByText("Reservation Confirmed")).toBeVisible();
}

test("a queue guest moves from a smart recommendation through cleaning and availability", async ({
  page,
  extraPage,
  db,
}) => {
  const seed = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Queue Workflow", openAllDayEveryDay()),
  });
  const table = await seedSingleTable(db, seed);
  const guest = buildGuest("Queue");

  await joinQueueThroughUi(page, seed.business.username, seed.location.id, guest);
  const entry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: seed.location.id, email: guest.email },
  });

  await signInBusiness(extraPage, seed.business);
  await extraPage.goto("/business/floor");

  await expect(extraPage.getByTestId(`waiting-suggestion-${entry.id}`)).toHaveText("T1");
  await extraPage.getByTestId(`waiting-party-${entry.id}`).click();
  await extraPage.getByTestId("queue-party-admit").click();
  await extraPage.getByTestId(`admitted-party-${entry.id}`).click();
  await extraPage.getByTestId("assign-option-T1").click();
  await extraPage.getByTestId("assign-confirm").click();

  const node = extraPage.getByTestId("live-table-T1");
  await expect(node).toHaveAttribute("data-status", "OCCUPIED");
  await node.click();
  await extraPage
    .getByTestId("live-table-detail")
    .getByRole("button", {
      name: "Complete Visit",
    })
    .click();
  await expect(node).toHaveAttribute("data-status", "CLEANING");
  await extraPage
    .getByTestId("live-table-detail")
    .getByRole("button", { name: "Mark Available" })
    .click();
  await expect(node).toHaveAttribute("data-status", "AVAILABLE");

  const assignment = await db.prisma.tableAssignment.findFirstOrThrow({
    where: { tableId: table.id, queueEntryId: entry.id },
  });
  const storedEntry = await db.prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
  const storedTable = await db.prisma.diningTable.findUniqueOrThrow({ where: { id: table.id } });
  expect(assignment.status).toBe("COMPLETED");
  expect(storedEntry.status).toBe("ARRIVED");
  expect(storedTable.cleaningSince).toBeNull();
});

test("a reservation keeps its smart table through seating, completion, and release", async ({
  page,
  db,
}) => {
  const slot = middaySlot();
  const seed = await db.createBusinessWithLocation({
    reservationSettings: {
      ...DEFAULT_RESERVATION_SETTINGS,
      reservationStartTime: "00:00",
      reservationEndTime: "23:59",
      maxReservedGuestsPerHour: 0,
    },
    restaurantProfile: publishedProfile("Reservation Workflow", openAllDayEveryDay(slot.timeZone)),
  });
  const table = await seedSingleTable(db, seed);
  const guest = booking();

  await bookThroughUi(page, seed.business.username, seed.location.id, slot, guest);
  const reservation = await db.prisma.reservation.findFirstOrThrow({
    where: { locationId: seed.location.id, email: guest.email },
  });
  const smartAssignment = await db.prisma.tableAssignment.findFirstOrThrow({
    where: { reservationId: reservation.id },
  });
  expect(smartAssignment.source).toBe("SMART");
  expect(smartAssignment.status).toBe("RESERVED");

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  const node = page.getByTestId("live-table-T1");
  await expect(node).toHaveAttribute("data-status", "RESERVED");
  await node.click();
  await page
    .getByTestId("live-table-detail")
    .getByRole("button", { name: "Seat Reserved Party" })
    .click();
  await expect(node).toHaveAttribute("data-status", "OCCUPIED");
  await page
    .getByTestId("live-table-detail")
    .getByRole("button", { name: "Complete Visit" })
    .click();
  await expect(node).toHaveAttribute("data-status", "CLEANING");
  await page
    .getByTestId("live-table-detail")
    .getByRole("button", { name: "Mark Available" })
    .click();
  await expect(node).toHaveAttribute("data-status", "AVAILABLE");

  const storedReservation = await db.prisma.reservation.findUniqueOrThrow({
    where: { id: reservation.id },
  });
  const storedAssignment = await db.prisma.tableAssignment.findUniqueOrThrow({
    where: { id: smartAssignment.id },
  });
  const storedTable = await db.prisma.diningTable.findUniqueOrThrow({ where: { id: table.id } });
  expect(storedReservation.status).toBe("COMPLETED");
  expect(storedAssignment.status).toBe("COMPLETED");
  expect(storedTable.cleaningSince).toBeNull();
});

test("staff resolve a confirmed reservation after its table conflict clears", async ({
  page,
  db,
}) => {
  const slot = middaySlot();
  const seed = await db.createBusinessWithLocation({
    reservationSettings: {
      ...DEFAULT_RESERVATION_SETTINGS,
      reservationStartTime: "00:00",
      reservationEndTime: "23:59",
      maxReservedGuestsPerHour: 0,
    },
    restaurantProfile: publishedProfile("Conflict Workflow", openAllDayEveryDay(slot.timeZone)),
  });
  const table = await seedSingleTable(db, seed);
  const first = booking();
  const second = booking();

  const blocker = await page.request.post(
    `/api/reservations/${seed.business.username}/${seed.location.id}`,
    {
      data: {
        firstName: first.firstName,
        lastName: first.lastName,
        email: first.email,
        partySize: 2,
        date: slot.date,
        time: slot.time,
      },
    },
  );
  expect(blocker.status()).toBe(200);
  const conflictedBooking = await page.request.post(
    `/api/reservations/${seed.business.username}/${seed.location.id}`,
    {
      data: {
        firstName: second.firstName,
        lastName: second.lastName,
        email: second.email,
        partySize: 2,
        date: slot.date,
        time: slot.time,
      },
    },
  );
  expect(conflictedBooking.status()).toBe(200);

  const conflicted = await db.prisma.reservation.findFirstOrThrow({
    where: { locationId: seed.location.id, email: second.email },
  });
  expect(conflicted.status).toBe("CONFIRMED");
  expect(conflicted.needsReview).toBe(true);
  expect(conflicted.needsReviewNotifiedAt).not.toBeNull();

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");
  await expect(page.getByTestId(`reservation-review-${conflicted.id}`)).toHaveText("Needs Review");

  const blockingAssignment = await db.prisma.tableAssignment.findFirstOrThrow({
    where: { tableId: table.id, status: "RESERVED" },
  });
  await db.prisma.tableAssignment.update({
    where: { id: blockingAssignment.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  await page.reload();

  await page.getByTestId(`reservation-${conflicted.id}`).click();
  await page.getByTestId("assign-resolve").click();
  await expect(page.getByTestId(`reservation-review-${conflicted.id}`)).toHaveCount(0);

  await expect
    .poll(async () => {
      const resolved = await db.prisma.reservation.findUniqueOrThrow({
        where: { id: conflicted.id },
      });
      return resolved.needsReview;
    })
    .toBe(false);
  const resolvedAssignment = await db.prisma.tableAssignment.findFirstOrThrow({
    where: { reservationId: conflicted.id, status: "RESERVED" },
  });
  expect(resolvedAssignment.tableId).toBe(table.id);
  expect(resolvedAssignment.source).toBe("SMART");
});

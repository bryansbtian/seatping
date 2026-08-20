import { expect, test } from "./fixtures/seatping.js";
import { openBusinessDashboard } from "./helpers/auth.js";
import { DEFAULT_RESERVATION_SETTINGS, uniqueId } from "./helpers/db.js";
import {
  futureDateKey,
  openAllDayEveryDay,
  openingHoursEveryDay,
  publishedProfile,
  todayKey,
  TEST_TIMEZONE,
} from "./helpers/time.js";

type Booking = {
  firstName: string;
  lastName: string;
  email: string;
};

function buildBooking(): Booking {
  const id = uniqueId();
  return {
    firstName: "Rita",
    lastName: `Booking${id}`,
    email: `e2e-booking-${id}@test.invalid`,
  };
}

test("a customer books a table from the public restaurant page and it is confirmed straight away", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Booking Bistro", openAllDayEveryDay()),
  });
  const booking = buildBooking();
  const date = futureDateKey(3);

  await page.goto(
    `/${business.username}/${location.id}?date=${date}&time=18:00&partySize=2&book=1`,
  );

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Book a Table")).toBeVisible();
  await dialog.getByLabel("First Name").fill(booking.firstName);
  await dialog.getByLabel("Last Name").fill(booking.lastName);
  await dialog.getByLabel("Email").fill(booking.email);
  await dialog.getByRole("button", { name: "Confirm Reservation" }).click();

  await expect(dialog.getByText("Reservation Confirmed")).toBeVisible();

  const reservation = await db.prisma.reservation.findFirstOrThrow({
    where: { locationId: location.id, email: booking.email },
  });
  expect(reservation.status).toBe("CONFIRMED");
  expect(reservation.reservationDateTime).toBe(`${date}T18:00`);
  expect(reservation.guestCount).toBe(2);
  expect(reservation.source).toBe("seatping_public");
  expect(reservation.manageToken).toHaveLength(48);

  const counter = await db.prisma.slotCounter.findFirstOrThrow({
    where: { locationId: location.id, dateKey: date, hour: 18 },
  });
  expect(counter.reservedGuests).toBe(2);

  await expect(dialog.getByRole("link", { name: "Manage Reservation" })).toBeVisible();
});

test("a reservation outside the configured opening hours is offered nowhere and refused by the server", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Morning Only", openingHoursEveryDay("09:00", "12:00")),
  });
  const booking = buildBooking();
  const date = futureDateKey(3);

  await page.goto(`/${business.username}/${location.id}?date=${date}&partySize=2`);

  await expect(page.getByRole("button", { name: "9:00 AM" })).toBeVisible();
  await expect(page.getByRole("button", { name: "11:30 AM" })).toBeVisible();
  await expect(page.getByRole("button", { name: "6:00 PM" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "12:00 PM" })).toHaveCount(0);

  const availability = await page.request.get(
    `/api/reservations/${business.username}/${location.id}/availability?date=${date}&partySize=2`,
  );
  const slots = (await availability.json()).slots as Array<{ time: string }>;
  expect(slots.map((s) => s.time)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);

  const rejected = await page.request.post(
    `/api/reservations/${business.username}/${location.id}`,
    {
      data: {
        firstName: booking.firstName,
        lastName: booking.lastName,
        email: booking.email,
        partySize: 2,
        date,
        time: "18:00",
      },
    },
  );
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).error).toContain("outside the restaurant's operating hours");

  expect(await db.prisma.reservation.count({ where: { locationId: location.id } })).toBe(0);
});

test("hourly reservation capacity is enforced on the server and never oversells the hour", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    reservationSettings: {
      ...DEFAULT_RESERVATION_SETTINGS,
      maxPartySize: 4,
      maxReservedGuestsPerHour: 4,
    },
    restaurantProfile: publishedProfile("Tiny Room", openAllDayEveryDay()),
  });
  const date = futureDateKey(4);
  const first = buildBooking();
  const second = buildBooking();

  await page.goto(
    `/${business.username}/${location.id}?date=${date}&time=18:00&partySize=4&book=1`,
  );

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First Name").fill(first.firstName);
  await dialog.getByLabel("Last Name").fill(first.lastName);
  await dialog.getByLabel("Email").fill(first.email);
  await dialog.getByRole("button", { name: "Confirm Reservation" }).click();
  await expect(dialog.getByText("Reservation Confirmed")).toBeVisible();

  const counter = await db.prisma.slotCounter.findFirstOrThrow({
    where: { locationId: location.id, dateKey: date, hour: 18 },
  });
  expect(counter.reservedGuests).toBe(4);

  const overbook = await page.request.post(
    `/api/reservations/${business.username}/${location.id}`,
    {
      data: {
        firstName: second.firstName,
        lastName: second.lastName,
        email: second.email,
        partySize: 1,
        date,
        time: "18:30",
      },
    },
  );
  expect(overbook.status()).toBe(400);
  expect((await overbook.json()).error).toContain("fully booked");

  const availability = await page.request.get(
    `/api/reservations/${business.username}/${location.id}/availability?date=${date}&partySize=1`,
  );
  const slots = (await availability.json()).slots as Array<{
    time: string;
    available: boolean;
    reason?: string;
  }>;
  const sixPm = slots.find((s) => s.time === "18:00");
  expect(sixPm?.available).toBe(false);
  expect(sixPm?.reason).toBe("full");

  const reservations = await db.prisma.reservation.findMany({
    where: {
      locationId: location.id,
      reservationDateTime: { startsWith: `${date}T18` },
      status: { in: ["CONFIRMED", "ARRIVED"] },
    },
  });
  const bookedGuests = reservations.reduce((sum, r) => sum + r.guestCount, 0);
  expect(bookedGuests).toBe(4);

  const finalCounter = await db.prisma.slotCounter.findFirstOrThrow({
    where: { locationId: location.id, dateKey: date, hour: 18 },
  });
  expect(finalCounter.reservedGuests).toBe(4);
});

test("a guest opens the secure manage link, sees the booking and cancels it", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Manage Bistro", openAllDayEveryDay()),
  });
  const booking = buildBooking();
  const date = futureDateKey(5);

  const created = await page.request.post(`/api/reservations/${business.username}/${location.id}`, {
    data: {
      firstName: booking.firstName,
      lastName: booking.lastName,
      email: booking.email,
      partySize: 3,
      date,
      time: "19:00",
    },
  });
  expect(created.status()).toBe(200);
  const manageToken = (await created.json()).manageToken as string;

  const beforeCancel = await db.prisma.slotCounter.findFirstOrThrow({
    where: { locationId: location.id, dateKey: date, hour: 19 },
  });
  expect(beforeCancel.reservedGuests).toBe(3);

  await page.goto(`/reservations/manage/${manageToken}`);

  await expect(page.getByRole("heading", { name: "Manage Your Reservation" })).toBeVisible();
  await expect(page.getByText("7:00 PM")).toBeVisible();
  await expect(page.getByText("3 guests")).toBeVisible();

  await page.getByRole("button", { name: "Cancel Reservation" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel Reservation" }).click();

  await expect
    .poll(async () => {
      const stored = await db.prisma.reservation.findFirst({
        where: { manageToken },
      });
      return stored?.status;
    })
    .toBe("CANCELLED");

  const cancelled = await db.prisma.reservation.findFirstOrThrow({
    where: { manageToken },
  });
  expect(cancelled.cancelledAt).not.toBeNull();

  const afterCancel = await db.prisma.slotCounter.findFirstOrThrow({
    where: { locationId: location.id, dateKey: date, hour: 19 },
  });
  expect(afterCancel.reservedGuests).toBe(0);

  await expect(page.getByText("This reservation can no longer be changed.")).toBeVisible();
});

test("reservations land in the right business dashboard tab and move when the status changes", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Tabbed Bistro", openAllDayEveryDay()),
  });

  const today = todayKey(TEST_TIMEZONE);
  const upcoming = futureDateKey(3, TEST_TIMEZONE);
  const cancelledDate = futureDateKey(4, TEST_TIMEZONE);

  const todayReservation = await db.createReservation(location, {
    firstName: "Tina",
    lastName: `Today${uniqueId()}`,
    name: "Tina Today",
    reservationDateTime: `${today}T12:00`,
  });
  const upcomingReservation = await db.createReservation(location, {
    firstName: "Uma",
    lastName: `Upcoming${uniqueId()}`,
    name: "Uma Upcoming",
    reservationDateTime: `${upcoming}T19:00`,
  });
  const cancelledReservation = await db.createReservation(location, {
    firstName: "Cara",
    lastName: `Cancelled${uniqueId()}`,
    name: "Cara Cancelled",
    reservationDateTime: `${cancelledDate}T19:00`,
    status: "CANCELLED",
    cancelledAt: new Date(),
  });

  await openBusinessDashboard(page, business);

  const reservationsCard = page
    .getByRole("heading", { name: "Reservations Management" })
    .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");

  await expect(reservationsCard.getByText("Tina Today")).toBeVisible();
  await expect(reservationsCard.getByText("Uma Upcoming")).toHaveCount(0);

  await reservationsCard.getByRole("button", { name: "Upcoming" }).click();
  await expect(reservationsCard.getByText("Uma Upcoming")).toBeVisible();
  await expect(reservationsCard.getByText("Tina Today")).toHaveCount(0);

  await reservationsCard.getByRole("button", { name: "Cancelled" }).click();
  await expect(reservationsCard.getByText("Cara Cancelled")).toBeVisible();

  await reservationsCard.getByRole("button", { name: "Today" }).click();
  await reservationsCard.getByRole("button", { name: "Mark Arrived" }).click();

  await expect
    .poll(async () => {
      const stored = await db.prisma.reservation.findUnique({
        where: { id: todayReservation.id },
      });
      return stored?.status;
    })
    .toBe("ARRIVED");

  await expect(reservationsCard.getByText("Tina Today")).toBeVisible();
  await expect(reservationsCard.getByRole("button", { name: "Mark Completed" })).toBeVisible();

  const untouched = await db.prisma.reservation.findMany({
    where: { id: { in: [upcomingReservation.id, cancelledReservation.id] } },
    orderBy: { reservationDateTime: "asc" },
  });
  expect(untouched.map((r) => r.status)).toEqual(["CONFIRMED", "CANCELLED"]);
});

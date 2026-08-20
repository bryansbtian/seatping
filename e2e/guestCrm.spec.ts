import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";
import { buildGuest, fullNameOf, joinQueueThroughUi, type QueueGuest } from "./helpers/queue.js";
import { futureDateKey, openAllDayEveryDay, publishedProfile } from "./helpers/time.js";

async function completeQueueVisit(
  businessPage: Page,
  businessUsername: string,
  legacyKey: string,
): Promise<void> {
  const admitted = await businessPage.request.post(
    `/auth/business/${businessUsername}/queue/${encodeURIComponent(legacyKey)}/admit`,
  );
  expect(admitted.status()).toBe(200);
  const arrived = await businessPage.request.post(
    `/auth/business/${businessUsername}/admitted/${encodeURIComponent(legacyKey)}/confirm-arrival`,
  );
  expect(arrived.status()).toBe(200);
}

async function joinQueueThroughApi(
  page: Page,
  businessUsername: string,
  locationId: string,
  guest: QueueGuest,
  email: string,
): Promise<void> {
  const response = await page.request.post(`/auth/business/${businessUsername}/queue`, {
    data: {
      locationId,
      firstName: guest.firstName,
      lastName: guest.lastName,
      numGuests: guest.guestCount,
      email,
      notificationMethod: "email",
    },
  });
  expect(response.status()).toBe(200);
}

test("a completed queue visit creates a guest profile the business can see in the CRM", async ({
  page,
  extraPage,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("CRM Bistro", openAllDayEveryDay()),
  });
  const guest = buildGuest("Grace");

  await joinQueueThroughUi(page, business.username, location.id, guest);

  const entry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: location.id, lastName: guest.lastName },
  });

  await signInBusiness(extraPage, business);
  await completeQueueVisit(extraPage, business.username, entry.legacyKey);

  await expect
    .poll(async () => {
      const profile = await db.prisma.guestProfile.findFirst({
        where: { locationId: location.id, normalizedEmail: guest.email },
      });
      return profile?.totalVisits;
    })
    .toBe(1);

  const profile = await db.prisma.guestProfile.findFirstOrThrow({
    where: { locationId: location.id, normalizedEmail: guest.email },
  });
  expect(profile.businessId).toBe(business.id);
  expect(profile.fullName).toBe(fullNameOf(guest));
  expect(profile.waitlistVisitCount).toBe(1);
  expect(profile.sourceQueueEntryIds).toEqual([entry.id]);
  expect(profile.lastVisitAt).not.toBeNull();

  await extraPage.goto("/business/guests");
  await expect(extraPage.getByRole("heading", { name: "Guests" }).first()).toBeVisible();
  await expect(extraPage.getByText(fullNameOf(guest)).first()).toBeVisible();
  await expect(extraPage.getByText(guest.email).first()).toBeVisible();

  const listed = await extraPage.request.get(`/api/guests?locationId=${location.id}`);
  const rows = (await listed.json()).guests as Array<Record<string, unknown>>;
  expect(rows).toHaveLength(1);
  expect(rows[0].totalVisits).toBe(1);
  expect(rows[0].waitlistVisitCount).toBe(1);
});

test("repeat visits under the same normalized contact update one guest profile instead of creating duplicates", async ({
  page,
  extraPage,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation({
    restaurantProfile: publishedProfile("Loyalty Bistro", openAllDayEveryDay()),
  });
  const guest = buildGuest("Rita");
  const shoutingEmail = `  ${guest.email.toUpperCase()}  `;

  await signInBusiness(extraPage, business);

  await joinQueueThroughUi(page, business.username, location.id, guest);
  const firstEntry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: location.id, lastName: guest.lastName },
  });
  await completeQueueVisit(extraPage, business.username, firstEntry.legacyKey);

  const reservationDate = futureDateKey(6);
  const reservation = await page.request.post(
    `/api/reservations/${business.username}/${location.id}`,
    {
      data: {
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: shoutingEmail,
        partySize: 2,
        date: reservationDate,
        time: "19:00",
      },
    },
  );
  expect(reservation.status()).toBe(200);

  const secondGuest = { ...guest, lastName: `${guest.lastName}Return` };
  await joinQueueThroughApi(
    page,
    business.username,
    location.id,
    secondGuest,
    guest.email.toUpperCase(),
  );
  const secondEntry = await db.prisma.queueEntry.findFirstOrThrow({
    where: { locationId: location.id, lastName: secondGuest.lastName },
  });
  await completeQueueVisit(extraPage, business.username, secondEntry.legacyKey);

  await expect
    .poll(async () => {
      const profile = await db.prisma.guestProfile.findFirst({
        where: { locationId: location.id, normalizedEmail: guest.email },
      });
      return profile?.waitlistVisitCount;
    })
    .toBe(2);

  const profiles = await db.prisma.guestProfile.findMany({
    where: { businessId: business.id },
  });
  expect(profiles).toHaveLength(1);

  const profile = profiles[0];
  expect(profile.normalizedEmail).toBe(guest.email);
  expect(profile.email).toBe(guest.email);
  expect(profile.sourceQueueEntryIds).toEqual([firstEntry.id, secondEntry.id]);
  expect(profile.sourceReservationIds).toHaveLength(1);
  expect(profile.waitlistVisitCount).toBe(2);
  expect(profile.upcomingReservationCount).toBe(1);
  expect(profile.totalVisits).toBe(2);

  const listed = await extraPage.request.get(`/api/guests?locationId=${location.id}`);
  const rows = (await listed.json()).guests as Array<Record<string, unknown>>;
  expect(rows).toHaveLength(1);
  expect(rows[0].returning).toBe(true);
  expect(rows[0].upcomingReservationCount).toBe(1);
});

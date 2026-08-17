import { expect, test } from "./fixtures/seatping.js";
import {
  queueManagementHeading,
  signInBusiness,
  signInBusinessThroughForm,
  signInCustomerThroughForm,
} from "./helpers/auth.js";

test("a business signs in through the login form and reaches an authenticated dashboard", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation();

  await signInBusinessThroughForm(page, business);

  await expect(page).toHaveURL(/\/business\/dashboard$/);
  await expect(queueManagementHeading(page)).toBeVisible();
  await expect(
    page
      .getByText(`Managing queue for: ${location.displayName}`)
      .filter({ visible: true }),
  ).toBeVisible();

  const cookies = await page.context().cookies();
  expect(cookies.map((c) => c.name)).toContain("sp_auth_business");

  const me = await page.request.get("/auth/business/me");
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.user.username).toBe(business.username);
  expect(body.user.locations).toHaveLength(1);
});

test("a customer signs in through the login form and opens the customer-only profile page", async ({
  page,
  db,
}) => {
  const customer = await db.createCustomer();

  const unauthenticated = await page.request.get("/auth/me");
  expect(unauthenticated.status()).toBe(401);

  await signInCustomerThroughForm(page, customer);
  await expect(page).toHaveURL(/localhost:\d+\/$/);

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();
  await expect(page.getByText(customer.email).first()).toBeVisible();

  const me = await page.request.get("/auth/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).user.email).toBe(customer.email);
});

test("an unauthenticated visitor cannot use the business dashboard on the client or the server", async ({
  page,
  db,
}) => {
  const { business, location } = await db.createBusinessWithLocation();

  await page.goto("/business/dashboard");
  await expect(page).toHaveURL(/\/business\/login$/);
  await expect(queueManagementHeading(page)).toHaveCount(0);

  const me = await page.request.get("/auth/business/me");
  expect(me.status()).toBe(401);

  const mutation = await page.request.put(
    `/auth/business/locations/${location.id}`,
    { data: { queueEnabled: false } },
  );
  expect(mutation.status()).toBe(401);

  const stored = await db.prisma.location.findUnique({
    where: { id: location.id },
  });
  expect(stored?.queueEnabled).toBe(true);
  expect(business.username).toBeTruthy();
});

test("a signed in business cannot read or mutate another business's location, queue entry or reservation", async ({
  page,
  db,
}) => {
  const { business: businessA } = await db.createBusinessWithLocation();
  const { business: businessB, location: locationB } =
    await db.createBusinessWithLocation();

  const entryB = await db.createQueueEntry(locationB, {
    firstName: "Victim",
    lastName: "Guest",
  });
  const reservationB = await db.createReservation(locationB);

  await signInBusiness(page, businessA);

  const readGuests = await page.request.get(
    `/api/guests?locationId=${locationB.id}`,
  );
  expect(readGuests.status()).toBe(404);

  const updateLocation = await page.request.put(
    `/auth/business/locations/${locationB.id}`,
    { data: { queueEnabled: false } },
  );
  expect(updateLocation.status()).toBe(404);

  const admit = await page.request.post(
    `/auth/business/${businessB.username}/queue/${entryB.legacyKey}/admit`,
  );
  expect(admit.status()).toBe(404);

  const cancelReservation = await page.request.patch(
    `/auth/business/locations/${locationB.id}/reservations/${reservationB.id}`,
    { data: { status: "cancelled" } },
  );
  expect(cancelReservation.status()).toBe(404);

  const storedLocation = await db.prisma.location.findUnique({
    where: { id: locationB.id },
  });
  const storedEntry = await db.prisma.queueEntry.findUnique({
    where: { id: entryB.id },
  });
  const storedReservation = await db.prisma.reservation.findUnique({
    where: { id: reservationB.id },
  });

  expect(storedLocation?.queueEnabled).toBe(true);
  expect(storedEntry?.status).toBe("WAITING");
  expect(storedReservation?.status).toBe("CONFIRMED");
});

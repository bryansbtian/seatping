import { expect, test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";
import type { TestData } from "./helpers/db.js";

type Seed = {
  business: { id: string };
  location: { id: string; businessId: string; businessUsername: string | null };
};

async function seedRoom(db: TestData, seed: Seed, names: { name: string; capacity: number }[]) {
  const room = await db.prisma.floorPlan.create({
    data: {
      businessId: seed.business.id,
      locationId: seed.location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });
  const tables = [];
  for (let i = 0; i < names.length; i += 1) {
    tables.push(
      await db.prisma.diningTable.create({
        data: {
          floorPlanId: room.id,
          businessId: seed.business.id,
          locationId: seed.location.id,
          name: names[i].name,
          capacity: names[i].capacity,
          minimumPartySize: 1,
          x: 40 + i * 200,
          y: 60,
          width: 130,
          height: 80,
        },
      }),
    );
  }
  return tables;
}

test("staff manually assign a waiting guest to a table", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const tables = await seedRoom(db, seed, [
    { name: "T1", capacity: 2 },
    { name: "T2", capacity: 6 },
  ]);
  const entry = await db.createQueueEntry(seed.location, {
    firstName: "Ada",
    lastName: "Lovelace",
    guestCount: 2,
    joinedAt: new Date(Date.now() - 20 * 60 * 1000),
    status: "ADMITTED",
    admittedAt: new Date(),
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  await page.getByTestId(`admitted-party-${entry.id}`).click();

  const options = page.getByTestId("assign-table-options");
  await expect(options).toBeVisible();
  await expect(options.getByTestId("assign-recommended-badge")).toBeVisible();

  await page.getByTestId("assign-option-T2").click();
  await expect(page.getByTestId("assign-confirm")).toContainText("Assign T2");
  await page.getByTestId("assign-confirm").click();

  await expect(page.getByTestId("live-table-T2")).toHaveAttribute("data-status", "OCCUPIED");

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findFirst({
        where: { locationId: seed.location.id },
      });
      return { table: stored?.tableId, source: stored?.source, status: stored?.status };
    })
    .toEqual({ table: tables[1].id, source: "MANUAL", status: "SEATED" });

  await expect
    .poll(async () => {
      const stored = await db.prisma.queueEntry.findUnique({ where: { id: entry.id } });
      return stored?.status;
    })
    .toBe("ARRIVED");
});

test("staff manually change the table held by a reservation", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const tables = await seedRoom(db, seed, [
    { name: "T1", capacity: 4 },
    { name: "T2", capacity: 4 },
  ]);
  const jakarta = new Date(Date.now() + 7 * 3600 * 1000);
  const reservation = await db.createReservation(seed.location, {
    firstName: "Grace",
    lastName: "Hopper",
    guestCount: 2,
    reservationDateTime: `${jakarta.toISOString().slice(0, 10)}T23:30`,
  });
  await db.prisma.tableAssignment.create({
    data: {
      tableId: tables[0].id,
      businessId: seed.business.id,
      locationId: seed.location.id,
      reservationId: reservation.id,
      partySize: 2,
      source: "MANUAL",
      status: "RESERVED",
      expectedStartAt: new Date(Date.now() + 30 * 60 * 1000),
      expectedEndAt: new Date(Date.now() + 120 * 60 * 1000),
    },
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await page.getByTestId(`reservation-${reservation.id}`).click();

  const options = page.getByTestId("assign-table-options");
  await expect(options).toBeVisible();
  await expect(options.getByTestId("assign-option-T1")).toHaveCount(0);

  await page.getByTestId("assign-option-T2").click();
  await page.getByTestId("assign-confirm").click();

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findMany({
        where: { reservationId: reservation.id },
      });
      return { count: stored.length, table: stored[0]?.tableId };
    })
    .toEqual({ count: 1, table: tables[1].id });
});

test("a party too large for every table cannot be assigned", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  await seedRoom(db, seed, [{ name: "T1", capacity: 2 }]);
  const entry = await db.createQueueEntry(seed.location, {
    firstName: "Big",
    lastName: "Group",
    guestCount: 9,
    status: "ADMITTED",
    admittedAt: new Date(),
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await page.getByTestId(`admitted-party-${entry.id}`).click();

  await expect(page.getByText("No single table can take this party right now.")).toBeVisible();

  await page.getByTestId("assign-confirm").click();
  await page.getByTestId("assign-join-T1").click();

  await expect(page.getByTestId("assign-confirm")).toBeDisabled();

  const count = await db.prisma.tableAssignment.count({
    where: { locationId: seed.location.id },
  });
  expect(count).toBe(0);
});

test("a large party can be seated by joining two tables", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const tables = await seedRoom(db, seed, [
    { name: "T1", capacity: 4 },
    { name: "T2", capacity: 4 },
  ]);
  const entry = await db.createQueueEntry(seed.location, {
    firstName: "John",
    lastName: "Cena",
    guestCount: 7,
    status: "ADMITTED",
    admittedAt: new Date(),
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await page.getByTestId(`admitted-party-${entry.id}`).click();
  await page.getByTestId("assign-confirm").click();

  await page.getByTestId("assign-join-T1").click();
  await expect(page.getByTestId("assign-confirm")).toBeDisabled();

  await page.getByTestId("assign-join-T2").click();
  await expect(page.getByTestId("assign-confirm")).toContainText("T1 + T2");
  await page.getByTestId("assign-confirm").click();

  await expect(page.getByTestId("live-table-T1")).toHaveAttribute("data-status", "OCCUPIED");
  await expect(page.getByTestId("live-table-T2")).toHaveAttribute("data-status", "OCCUPIED");

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findFirst({
        where: { locationId: seed.location.id },
      });
      return {
        tables: stored?.tableIds.slice().sort(),
        partySize: stored?.partySize,
        source: stored?.source,
      };
    })
    .toEqual({
      tables: [tables[0].id, tables[1].id].sort(),
      partySize: 7,
      source: "MANUAL",
    });
});

test("tables in another room cannot be joined", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  await seedRoom(db, seed, [{ name: "T1", capacity: 4 }]);
  const patio = await db.prisma.floorPlan.create({
    data: {
      businessId: seed.business.id,
      locationId: seed.location.id,
      name: "Patio",
      width: 800,
      height: 600,
    },
  });
  await db.prisma.diningTable.create({
    data: {
      floorPlanId: patio.id,
      businessId: seed.business.id,
      locationId: seed.location.id,
      name: "T8",
      capacity: 4,
      minimumPartySize: 1,
      x: 40,
      y: 60,
      width: 130,
      height: 80,
    },
  });
  const entry = await db.createQueueEntry(seed.location, {
    firstName: "John",
    lastName: "Cena",
    guestCount: 7,
    status: "ADMITTED",
    admittedAt: new Date(),
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await page.getByTestId(`admitted-party-${entry.id}`).click();
  await page.getByTestId("assign-confirm").click();

  await expect(page.getByTestId("assign-join-T8")).toBeEnabled();

  await page.getByTestId("assign-join-T1").click();

  await expect(page.getByTestId("assign-join-T8")).toBeDisabled();

  const count = await db.prisma.tableAssignment.count({
    where: { locationId: seed.location.id },
  });
  expect(count).toBe(0);
});

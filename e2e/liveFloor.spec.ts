import { expect, test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";
import type { TestData } from "./helpers/db.js";

type FloorSeed = {
  business: { id: string };
  location: { id: string; businessId: string; businessUsername: string | null };
};

async function seedRoomWithTables(
  db: TestData,
  seed: FloorSeed,
  tables: { name: string; capacity: number; x: number; minimumPartySize?: number }[],
) {
  const room = await db.prisma.floorPlan.create({
    data: {
      businessId: seed.business.id,
      locationId: seed.location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });

  const created = [];
  for (const table of tables) {
    created.push(
      await db.prisma.diningTable.create({
        data: {
          floorPlanId: room.id,
          businessId: seed.business.id,
          locationId: seed.location.id,
          name: table.name,
          capacity: table.capacity,
          minimumPartySize: table.minimumPartySize ?? 1,
          x: table.x,
          y: 60,
          width: 130,
          height: 80,
        },
      }),
    );
  }

  return { room, tables: created };
}

test("staff seat a waiting party from the live floor and the table turns occupied", async ({
  page,
  db,
}) => {
  const seed = await db.createBusinessWithLocation();
  await seedRoomWithTables(db, seed, [{ name: "T1", capacity: 4 }]);
  await db.createQueueEntry(seed.location, {
    firstName: "Ada",
    lastName: "Lovelace",
    guestCount: 2,
    joinedAt: new Date(Date.now() - 25 * 60 * 1000),
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  const node = page.getByTestId("live-table-T1");
  await expect(node).toBeVisible();
  await expect(node).toHaveAttribute("data-status", "AVAILABLE");
  await expect(page.getByText("Ada Lovelace")).toBeVisible();

  await node.scrollIntoViewIfNeeded();
  await node.click();

  const detail = page.getByTestId("live-table-detail");
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("recommended-party")).toContainText("Ada Lovelace");

  await detail.getByRole("button", { name: "Seat Ada Lovelace" }).click();

  await expect(node).toHaveAttribute("data-status", "OCCUPIED");
  await expect(detail).toContainText("Current Party");
  await expect(detail).toContainText("Ada Lovelace");

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findFirst({
        where: { locationId: seed.location.id },
      });
      return { status: stored?.status, partySize: stored?.partySize, source: stored?.source };
    })
    .toEqual({ status: "SEATED", partySize: 2, source: "MANUAL" });
});

test("staff complete a visit and the table goes to cleaning then available", async ({
  page,
  db,
}) => {
  const seed = await db.createBusinessWithLocation();
  const { tables } = await seedRoomWithTables(db, seed, [{ name: "T1", capacity: 4 }]);
  await db.prisma.tableAssignment.create({
    data: {
      tableId: tables[0].id,
      businessId: seed.business.id,
      locationId: seed.location.id,
      partySize: 2,
      source: "MANUAL",
      status: "SEATED",
      seatedAt: new Date(Date.now() - 45 * 60 * 1000),
      expectedStartAt: new Date(Date.now() - 45 * 60 * 1000),
      expectedEndAt: new Date(Date.now() + 45 * 60 * 1000),
    },
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  const node = page.getByTestId("live-table-T1");
  await expect(node).toHaveAttribute("data-status", "OCCUPIED");

  await node.scrollIntoViewIfNeeded();
  await node.click();

  const detail = page.getByTestId("live-table-detail");
  await expect(detail).toContainText("Seated 45 Min");

  await detail.getByRole("button", { name: "Complete Visit" }).click();

  await expect(node).toHaveAttribute("data-status", "CLEANING");

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findFirst({
        where: { locationId: seed.location.id },
      });
      return stored?.status;
    })
    .toBe("COMPLETED");

  await node.click();
  await page
    .getByTestId("live-table-detail")
    .getByRole("button", { name: "Mark Available" })
    .click();

  await expect(node).toHaveAttribute("data-status", "AVAILABLE");
});

test("staff move a party to another table", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const { tables } = await seedRoomWithTables(db, seed, [
    { name: "T1", capacity: 4, x: 40 },
    { name: "T2", capacity: 6, x: 400 },
  ]);
  const assignment = await db.prisma.tableAssignment.create({
    data: {
      tableId: tables[0].id,
      businessId: seed.business.id,
      locationId: seed.location.id,
      partySize: 3,
      source: "MANUAL",
      status: "SEATED",
      seatedAt: new Date(),
      expectedStartAt: new Date(),
      expectedEndAt: new Date(Date.now() + 90 * 60 * 1000),
    },
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  const source = page.getByTestId("live-table-T1");
  await expect(source).toHaveAttribute("data-status", "OCCUPIED");
  await source.scrollIntoViewIfNeeded();
  await source.click();

  const detail = page.getByTestId("live-table-detail");
  await detail.getByRole("button", { name: "Move Party" }).click();
  await page.getByTestId("move-target-T2").click();

  await expect(page.getByTestId("live-table-T1")).toHaveAttribute("data-status", "AVAILABLE");
  await expect(page.getByTestId("live-table-T2")).toHaveAttribute("data-status", "OCCUPIED");

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findUnique({
        where: { id: assignment.id },
      });
      return stored?.tableId;
    })
    .toBe(tables[1].id);
});

test("staff mark a table for cleaning and then available again", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const { tables } = await seedRoomWithTables(db, seed, [{ name: "T1", capacity: 4 }]);

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  const node = page.getByTestId("live-table-T1");
  await node.scrollIntoViewIfNeeded();
  await node.click();

  const detail = page.getByTestId("live-table-detail");
  await detail.getByRole("button", { name: "Mark Cleaning" }).click();
  await expect(node).toHaveAttribute("data-status", "CLEANING");

  await expect
    .poll(async () => {
      const stored = await db.prisma.diningTable.findUnique({ where: { id: tables[0].id } });
      return stored?.cleaningSince !== null;
    })
    .toBe(true);

  await detail.getByRole("button", { name: "Mark Available" }).click();
  await expect(node).toHaveAttribute("data-status", "AVAILABLE");

  await expect
    .poll(async () => {
      const stored = await db.prisma.diningTable.findUnique({ where: { id: tables[0].id } });
      return stored?.cleaningSince;
    })
    .toBeNull();
});

test("a reserved table shows the upcoming party and can seat them", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const { tables } = await seedRoomWithTables(db, seed, [{ name: "T1", capacity: 4 }]);
  const reservation = await db.createReservation(seed.location, {
    firstName: "Grace",
    lastName: "Hopper",
    guestCount: 2,
  });
  const assignment = await db.prisma.tableAssignment.create({
    data: {
      tableId: tables[0].id,
      businessId: seed.business.id,
      locationId: seed.location.id,
      reservationId: reservation.id,
      partySize: 2,
      source: "MANUAL",
      status: "RESERVED",
      expectedStartAt: new Date(Date.now() + 20 * 60 * 1000),
      expectedEndAt: new Date(Date.now() + 110 * 60 * 1000),
    },
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  const node = page.getByTestId("live-table-T1");
  await expect(node).toHaveAttribute("data-status", "RESERVED");
  await node.scrollIntoViewIfNeeded();
  await node.click();

  const detail = page.getByTestId("live-table-detail");
  await expect(detail).toContainText("Upcoming Reservation");
  await expect(detail).toContainText("Grace Hopper");

  await detail.getByRole("button", { name: "Seat Reserved Party" }).click();
  await expect(node).toHaveAttribute("data-status", "OCCUPIED");

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findUnique({
        where: { id: assignment.id },
      });
      return stored?.status;
    })
    .toBe("SEATED");

  const all = await db.prisma.tableAssignment.count({ where: { locationId: seed.location.id } });
  expect(all).toBe(1);
});

test("a blocked table cannot take a party from the live floor", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  await seedRoomWithTables(db, seed, [{ name: "T1", capacity: 4 }]);
  await db.createQueueEntry(seed.location, { guestCount: 2 });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  const node = page.getByTestId("live-table-T1");
  await node.scrollIntoViewIfNeeded();
  await node.click();

  const detail = page.getByTestId("live-table-detail");
  await detail.getByRole("button", { name: "Block Table" }).click();

  await expect(node).toHaveAttribute("data-status", "BLOCKED");
  await expect(detail.getByRole("button", { name: "Choose Queue Party" })).toHaveCount(0);
  await expect(detail.getByTestId("recommended-party")).toHaveCount(0);
});

test("each location loads its own live floor", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation({}, { maxLocations: 3 });
  const second = await db.createLocation(seed.business, { displayName: "Second Location" });

  await seedRoomWithTables(db, seed, [{ name: "T1", capacity: 4 }]);
  await seedRoomWithTables(db, { business: seed.business, location: second }, [
    { name: "P1", capacity: 2 },
  ]);

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await expect(page.getByTestId("live-table-T1")).toBeVisible();

  await page.getByRole("button", { name: "Switch Location" }).click();
  await page.getByRole("button", { name: /Second Location/ }).click();

  await expect(page.getByTestId("live-table-P1")).toBeVisible();
  await expect(page.getByTestId("live-table-T1")).toHaveCount(0);
});

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

test("a waiting party shows its recommended table without being seated", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  await seedRoom(db, seed, [
    { name: "T1", capacity: 2 },
    { name: "T2", capacity: 8 },
  ]);
  const guest = await db.createQueueEntry(seed.location, {
    firstName: "Ada",
    lastName: "Lovelace",
    guestCount: 2,
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await expect(page.getByTestId(`waiting-suggestion-${guest.id}`)).toHaveText("T1");
  await expect(page.getByTestId("live-table-T1")).toHaveAttribute("data-status", "AVAILABLE");

  const assignments = await db.prisma.tableAssignment.count({
    where: { locationId: seed.location.id },
  });
  expect(assignments).toBe(0);

  const stored = await db.prisma.queueEntry.findUnique({ where: { id: guest.id } });
  expect(stored?.status).toBe("WAITING");
});

test("a party that fits no table shows no match", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  await seedRoom(db, seed, [{ name: "T1", capacity: 2 }]);
  const crowd = await db.createQueueEntry(seed.location, {
    firstName: "Big",
    lastName: "Group",
    guestCount: 12,
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await expect(page.getByTestId(`waiting-nomatch-${crowd.id}`)).toHaveText("No Table Match");
  await expect(page.getByTestId(`waiting-suggestion-${crowd.id}`)).toHaveCount(0);
});

test("seating one party updates the recommendation for the next", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const tables = await seedRoom(db, seed, [
    { name: "T1", capacity: 4 },
    { name: "T2", capacity: 4 },
  ]);
  const first = await db.createQueueEntry(seed.location, {
    firstName: "First",
    lastName: "Guest",
    guestCount: 2,
    joinedAt: new Date(Date.now() - 60 * 60 * 1000),
  });
  const second = await db.createQueueEntry(seed.location, {
    firstName: "Second",
    lastName: "Guest",
    guestCount: 2,
    joinedAt: new Date(Date.now() - 5 * 60 * 1000),
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await expect(page.getByTestId(`waiting-suggestion-${first.id}`)).toHaveText("T1");
  await expect(page.getByTestId(`waiting-suggestion-${second.id}`)).toHaveText("T2");

  await page.getByTestId(`waiting-party-${first.id}`).click();
  await page.getByTestId("queue-party-admit").click();

  await page.getByTestId(`admitted-party-${first.id}`).click();
  await page.getByTestId("assign-option-T1").click();
  await page.getByTestId("assign-confirm").click();

  await expect(page.getByTestId("live-table-T1")).toHaveAttribute("data-status", "OCCUPIED");
  await expect(page.getByTestId(`waiting-suggestion-${second.id}`)).toHaveText("T2");
  await expect(page.getByTestId(`waiting-party-${first.id}`)).toHaveCount(0);

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findFirst({
        where: { locationId: seed.location.id },
      });
      return stored?.tableId;
    })
    .toBe(tables[0].id);
});

test("staff can seat a party at a table other than the recommended one", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const tables = await seedRoom(db, seed, [
    { name: "T1", capacity: 2 },
    { name: "T2", capacity: 8 },
  ]);
  const guest = await db.createQueueEntry(seed.location, {
    firstName: "Ada",
    lastName: "Lovelace",
    guestCount: 2,
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  await expect(page.getByTestId(`waiting-suggestion-${guest.id}`)).toHaveText("T1");

  await page.getByTestId(`waiting-party-${guest.id}`).click();
  await page.getByTestId("queue-party-admit").click();

  await page.getByTestId(`admitted-party-${guest.id}`).click();
  await page.getByTestId("assign-option-T2").click();
  await page.getByTestId("assign-confirm").click();

  await expect(page.getByTestId("live-table-T2")).toHaveAttribute("data-status", "OCCUPIED");

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findFirst({
        where: { locationId: seed.location.id },
      });
      return stored?.tableId;
    })
    .toBe(tables[1].id);
});

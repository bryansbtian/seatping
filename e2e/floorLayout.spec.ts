import { expect, test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";

test("a business builds a floor layout and it survives a reload", async ({ page, db }) => {
  const { business, location } = await db.createBusinessWithLocation();

  await signInBusiness(page, business);
  await page.goto("/business/floor");

  await expect(page.getByRole("heading", { name: "Floor" })).toBeVisible();
  await expect(page.getByText("No Floor Plan Yet")).toBeVisible();

  await page.getByRole("button", { name: "Create Floor Plan" }).click();
  await expect(page.getByRole("button", { name: "Add Rectangle Table" })).toBeVisible();

  await expect
    .poll(async () => {
      return db.prisma.floorPlan.count({ where: { locationId: location.id } });
    })
    .toBe(1);

  await page.getByRole("button", { name: "Add Rectangle Table" }).click();
  await expect(page.getByTestId("table-node-T1")).toBeVisible();
  await expect(page.getByTestId("table-inspector")).toBeVisible();

  await page.getByLabel("Table Name").fill("Patio 3");
  await page.getByLabel("Capacity").fill("6");
  await page.getByLabel("Minimum Party Size").fill("2");
  await page.getByLabel("Shape").selectOption("ROUND");
  await page.getByRole("button", { name: "Rotate Right" }).click();
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(page.getByTestId("table-node-Patio 3")).toBeVisible();

  await expect
    .poll(async () => {
      const stored = await db.prisma.diningTable.findFirst({
        where: { locationId: location.id },
      });
      return {
        name: stored?.name,
        capacity: stored?.capacity,
        minimumPartySize: stored?.minimumPartySize,
        shape: stored?.shape,
        rotation: stored?.rotation,
      };
    })
    .toEqual({
      name: "Patio 3",
      capacity: 6,
      minimumPartySize: 2,
      shape: "ROUND",
      rotation: 15,
    });

  await page.reload();
  await expect(page.getByTestId("table-node-Patio 3")).toBeVisible();
  await expect(page.getByText(/1 Table/)).toBeVisible();
});

test("a table can be dragged and the new position is stored", async ({ page, db }) => {
  const { business, location } = await db.createBusinessWithLocation();
  const plan = await db.prisma.floorPlan.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });
  const table = await db.prisma.diningTable.create({
    data: {
      floorPlanId: plan.id,
      businessId: business.id,
      locationId: location.id,
      name: "Table 1",
      capacity: 4,
      minimumPartySize: 1,
      x: 40,
      y: 40,
      width: 130,
      height: 80,
    },
  });

  await signInBusiness(page, business);
  await page.goto("/business/floor");

  const node = page.getByTestId("table-node-Table 1");
  await expect(node).toBeVisible();
  await node.scrollIntoViewIfNeeded();

  const box = await node.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2 + 60, {
    steps: 10,
  });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const stored = await db.prisma.diningTable.findUnique({ where: { id: table.id } });
      return { x: stored?.x, y: stored?.y };
    })
    .not.toEqual({ x: 40, y: 40 });

  const moved = await db.prisma.diningTable.findUniqueOrThrow({ where: { id: table.id } });
  expect(moved.x).toBeGreaterThan(40);
  expect(moved.y).toBeGreaterThan(40);
  expect(moved.x % 10).toBe(0);
  expect(moved.y % 10).toBe(0);
  expect(moved.width).toBe(130);
  expect(moved.height).toBe(80);
});

test("blocking a table from the editor leaves its assignments untouched", async ({ page, db }) => {
  const { business, location } = await db.createBusinessWithLocation();
  const plan = await db.prisma.floorPlan.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });
  const table = await db.prisma.diningTable.create({
    data: {
      floorPlanId: plan.id,
      businessId: business.id,
      locationId: location.id,
      name: "Table 1",
      capacity: 4,
      minimumPartySize: 1,
    },
  });
  const assignment = await db.prisma.tableAssignment.create({
    data: {
      tableId: table.id,
      businessId: business.id,
      locationId: location.id,
      partySize: 2,
      source: "MANUAL",
      status: "RESERVED",
      expectedStartAt: new Date("2026-08-30T19:00:00.000Z"),
      expectedEndAt: new Date("2026-08-30T21:00:00.000Z"),
    },
  });

  await signInBusiness(page, business);
  await page.goto("/business/floor");

  await page.getByTestId("table-node-Table 1").click();
  await expect(page.getByTestId("table-inspector")).toBeVisible();

  await page.getByRole("button", { name: "Block Table" }).click();

  await expect
    .poll(async () => {
      const stored = await db.prisma.diningTable.findUnique({ where: { id: table.id } });
      return stored?.isBlocked;
    })
    .toBe(true);

  const untouched = await db.prisma.tableAssignment.findUniqueOrThrow({
    where: { id: assignment.id },
  });
  expect(untouched.status).toBe("RESERVED");
  expect(untouched.tableId).toBe(table.id);
});

test("each location keeps its own floor layout", async ({ page, db }) => {
  const { business, location } = await db.createBusinessWithLocation({}, { maxLocations: 3 });
  const second = await db.createLocation(business, { displayName: "Second Location" });

  for (const [target, tableName] of [
    [location, "Main Table"],
    [second, "Patio Table"],
  ] as const) {
    const plan = await db.prisma.floorPlan.create({
      data: {
        businessId: business.id,
        locationId: target.id,
        name: "Main Dining Room",
        width: 1200,
        height: 800,
      },
    });
    await db.prisma.diningTable.create({
      data: {
        floorPlanId: plan.id,
        businessId: business.id,
        locationId: target.id,
        name: tableName,
        capacity: 4,
        minimumPartySize: 1,
      },
    });
  }

  await signInBusiness(page, business);
  await page.goto("/business/floor");

  await expect(page.getByTestId("table-node-Main Table")).toBeVisible();
  await expect(page.getByTestId("table-node-Patio Table")).toHaveCount(0);

  await page.getByRole("button", { name: "Switch Location" }).click();
  await page.getByRole("button", { name: /Second Location/ }).click();

  await expect(page.getByTestId("table-node-Patio Table")).toBeVisible();
  await expect(page.getByTestId("table-node-Main Table")).toHaveCount(0);
});

test("the editor rejects invalid capacity before it reaches the server", async ({ page, db }) => {
  const { business, location } = await db.createBusinessWithLocation();
  const plan = await db.prisma.floorPlan.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });
  await db.prisma.diningTable.create({
    data: {
      floorPlanId: plan.id,
      businessId: business.id,
      locationId: location.id,
      name: "Table 1",
      capacity: 4,
      minimumPartySize: 1,
    },
  });

  await signInBusiness(page, business);
  await page.goto("/business/floor");

  await page.getByTestId("table-node-Table 1").click();
  await page.getByLabel("Minimum Party Size").fill("9");
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(page.getByRole("alert")).toHaveText("Minimum party size cannot exceed capacity.");

  const stored = await db.prisma.diningTable.findFirstOrThrow({
    where: { locationId: location.id },
  });
  expect(stored.minimumPartySize).toBe(1);
});

test("a business adds a second room and a zone that both persist", async ({ page, db }) => {
  const { business, location } = await db.createBusinessWithLocation();
  const room = await db.prisma.floorPlan.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });
  await db.prisma.diningTable.create({
    data: {
      floorPlanId: room.id,
      businessId: business.id,
      locationId: location.id,
      name: "T1",
      capacity: 4,
      minimumPartySize: 1,
    },
  });

  await signInBusiness(page, business);
  await page.goto("/business/floor");

  await expect(page.getByTestId("table-node-T1")).toBeVisible();

  await page.getByRole("button", { name: "New Room" }).click();

  await expect
    .poll(async () => {
      return db.prisma.floorPlan.count({ where: { locationId: location.id } });
    })
    .toBe(2);

  await expect(page.getByTestId("table-node-T1")).toHaveCount(0);

  await page.getByRole("button", { name: "Add Zone" }).click();

  await expect
    .poll(async () => {
      return db.prisma.floorZone.count({ where: { locationId: location.id } });
    })
    .toBe(1);

  await expect(page.getByTestId("zone-node-New Zone")).toBeVisible();

  await page.getByLabel("Zone Name").fill("Patio zone");
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect
    .poll(async () => {
      const stored = await db.prisma.floorZone.findFirst({ where: { locationId: location.id } });
      return stored?.name;
    })
    .toBe("Patio zone");

  await page.reload();
  await expect(page.getByRole("button", { name: /Main Dining Room/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Room 2/ })).toBeVisible();

  await page.getByRole("button", { name: /Main Dining Room/ }).click();
  await expect(page.getByTestId("table-node-T1")).toBeVisible();
});

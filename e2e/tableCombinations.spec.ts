import { expect, test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";

test("configure a combination then seat a large party", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  const room = await db.prisma.floorPlan.create({
    data: {
      businessId: seed.business.id,
      locationId: seed.location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });
  for (let i = 1; i <= 3; i += 1) {
    await db.prisma.diningTable.create({
      data: {
        floorPlanId: room.id,
        businessId: seed.business.id,
        locationId: seed.location.id,
        name: `T${i}`,
        capacity: 4,
        minimumPartySize: 1,
        x: 40 + i * 180,
        y: 60,
        width: 130,
        height: 80,
      },
    });
  }
  const crowd = await db.createQueueEntry(seed.location, {
    firstName: "John",
    lastName: "Cena",
    guestCount: 7,
  });

  await signInBusiness(page, seed.business);
  await page.goto("/business/floor");

  // Before configuring anything, a party of 7 has no match.
  await expect(page.getByTestId(`waiting-nomatch-${crowd.id}`)).toHaveText("No Table Match");

  // Configure T1 + T2 in Edit Layout.
  await page.getByRole("button", { name: "Edit Layout" }).click();
  await expect(page.getByTestId("combination-picker")).toBeVisible();
  await page.getByTestId("combination-pick-T1").click();
  await page.getByTestId("combination-pick-T2").click();
  await page.getByTestId("combination-create").click();
  await expect(page.getByTestId("combination-T1 + T2")).toBeVisible();

  // Back on the live floor the party should now be matched.
  await page.getByRole("button", { name: "Live Floor" }).click();
  await expect(page.getByTestId(`waiting-suggestion-${crowd.id}`)).toHaveText("T1 + T2");
  await expect(page.getByTestId(`waiting-nomatch-${crowd.id}`)).toHaveCount(0);

  // The assign dialog should offer it.
  await page.getByTestId(`assign-waiting-${crowd.id}`).click();
  const options = page.getByTestId("assign-table-options");
  await expect(options).toBeVisible();
  await expect(options.getByTestId("assign-option-T1 + T2")).toBeVisible();

  await page.getByTestId("assign-option-T1 + T2").click();
  await page.getByTestId("assign-confirm").click();

  await expect(page.getByTestId("live-table-T1")).toHaveAttribute("data-status", "OCCUPIED");
  await expect(page.getByTestId("live-table-T2")).toHaveAttribute("data-status", "OCCUPIED");

  await expect
    .poll(async () => {
      const stored = await db.prisma.tableAssignment.findFirst({
        where: { locationId: seed.location.id },
      });
      return stored?.tableIds.length;
    })
    .toBe(2);
});

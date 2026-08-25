import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie, customerCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedCustomer } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function at(hour: number): string {
  return new Date(Date.UTC(2026, 7, 30, hour, 0, 0)).toISOString();
}

async function seedFloorFor(businessId: string, locationId: string) {
  const plan = await db.floorPlan.create({
    data: { businessId, locationId, name: "Main Floor", width: 1200, height: 800 },
  });
  const table = await db.diningTable.create({
    data: {
      floorPlanId: plan.id,
      businessId,
      locationId,
      name: "Table 1",
      capacity: 4,
      minimumPartySize: 1,
    },
  });
  const assignment = await db.tableAssignment.create({
    data: {
      tableId: table.id,
      businessId,
      locationId,
      partySize: 2,
      source: "MANUAL",
      status: "RESERVED",
      expectedStartAt: new Date(at(19)),
      expectedEndAt: new Date(at(21)),
    },
  });
  return { plan, table, assignment };
}

describe("floor data is isolated per business", () => {
  it("refuses every floor route without a business session", async () => {
    const { location } = await seedBusinessWithLocation();
    const request = await api();

    const routes = [
      request.get(`/api/floor/${location.id}`),
      request.post(`/api/floor/${location.id}`).send({}),
      request.patch(`/api/floor/${location.id}`).send({ name: "Nope" }),
      request.post(`/api/floor/${location.id}/tables`).send({ name: "T", capacity: 2 }),
      request.get(`/api/floor/${location.id}/assignments`),
    ];

    for (const route of routes) {
      const response = await route;
      expect(response.status).toBe(401);
    }
  });

  it("refuses a customer session on business floor routes", async () => {
    const { location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();

    const response = await (
      await api()
    )
      .get(`/api/floor/${location.id}`)
      .set("Cookie", customerCookie(customer.id));

    expect(response.status).toBe(401);
  });

  it("hides another business's floor plan behind a not found response", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();
    await seedFloorFor(owner.business.id, owner.location.id);

    const response = await (
      await api()
    )
      .get(`/api/floor/${owner.location.id}`)
      .set("Cookie", businessCookie(intruder.business.id));

    expect(response.status).toBe(404);
    expect(response.body.floorPlan).toBeUndefined();
  });

  it("stops another business from creating a floor plan on a location it does not own", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();

    const response = await (
      await api()
    )
      .post(`/api/floor/${owner.location.id}`)
      .set("Cookie", businessCookie(intruder.business.id))
      .send({ name: "Hijacked" });

    expect(response.status).toBe(404);
    expect(await db.floorPlan.count({ where: { locationId: owner.location.id } })).toBe(0);
  });

  it("stops another business from editing or deleting a table it does not own", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();
    const { table } = await seedFloorFor(owner.business.id, owner.location.id);
    const cookie = businessCookie(intruder.business.id);
    const request = await api();

    const renamed = await request
      .patch(`/api/floor/${owner.location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({ name: "Hijacked" });
    expect(renamed.status).toBe(404);

    const blocked = await request
      .post(`/api/floor/${owner.location.id}/tables/${table.id}/block`)
      .set("Cookie", cookie)
      .send({});
    expect(blocked.status).toBe(404);

    const removed = await request
      .delete(`/api/floor/${owner.location.id}/tables/${table.id}`)
      .set("Cookie", cookie);
    expect(removed.status).toBe(404);

    const stored = await db.diningTable.findUnique({ where: { id: table.id } });
    expect(stored?.name).toBe("Table 1");
    expect(stored?.isBlocked).toBe(false);
  });

  it("stops a business reaching another business's table through its own location", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();
    const { table } = await seedFloorFor(owner.business.id, owner.location.id);
    await seedFloorFor(intruder.business.id, intruder.location.id);

    const response = await (
      await api()
    )
      .patch(`/api/floor/${intruder.location.id}/tables/${table.id}`)
      .set("Cookie", businessCookie(intruder.business.id))
      .send({ name: "Hijacked" });

    expect(response.status).toBe(404);
    const stored = await db.diningTable.findUnique({ where: { id: table.id } });
    expect(stored?.name).toBe("Table 1");
  });

  it("stops another business from reading or changing an assignment", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();
    const { assignment } = await seedFloorFor(owner.business.id, owner.location.id);
    const cookie = businessCookie(intruder.business.id);
    const request = await api();

    const listed = await request
      .get(`/api/floor/${owner.location.id}/assignments`)
      .set("Cookie", cookie);
    expect(listed.status).toBe(404);

    const patched = await request
      .patch(`/api/floor/${owner.location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({ status: "CANCELLED" });
    expect(patched.status).toBe(404);

    const completed = await request
      .post(`/api/floor/${owner.location.id}/assignments/${assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});
    expect(completed.status).toBe(404);

    const stored = await db.tableAssignment.findUnique({ where: { id: assignment.id } });
    expect(stored?.status).toBe("RESERVED");
  });

  it("does not leak another location's assignments into a listing", async () => {
    const owner = await seedBusinessWithLocation();
    const second = await db.location.create({
      data: {
        businessId: owner.business.id,
        businessUsername: owner.business.username,
        displayName: "Second",
        address: "2 Test Street",
      },
    });
    await seedFloorFor(owner.business.id, owner.location.id);
    await seedFloorFor(owner.business.id, second.id);

    const response = await (
      await api()
    )
      .get(`/api/floor/${second.id}/assignments`)
      .set("Cookie", businessCookie(owner.business.id));

    expect(response.status).toBe(200);
    expect(response.body.assignments).toHaveLength(1);
    expect(response.body.assignments[0].locationId).toBe(second.id);
  });

  it("treats a malformed location id as not found rather than a server error", async () => {
    const { business } = await seedBusinessWithLocation();
    const response = await (
      await api()
    )
      .get("/api/floor/not-an-object-id")
      .set("Cookie", businessCookie(business.id));

    expect(response.status).toBe(404);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie, customerCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedCustomer, seedQueueEntry } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seedSeatedTable(businessId: string, locationId: string, name = "Table 1") {
  const plan = await db.floorPlan.create({
    data: { businessId, locationId, name: `Room ${name}`, width: 1200, height: 800 },
  });
  const table = await db.diningTable.create({
    data: {
      floorPlanId: plan.id,
      businessId,
      locationId,
      name,
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
      status: "SEATED",
      seatedAt: new Date(),
      expectedStartAt: new Date(),
      expectedEndAt: new Date(Date.now() + 90 * 60 * 1000),
    },
  });
  return { plan, table, assignment };
}

describe("live floor routes require a business session", () => {
  it("refuses every live route without a cookie", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const { table, assignment } = await seedSeatedTable(business.id, location.id);
    const request = await api();

    const routes = [
      request.get(`/api/floor/${location.id}/live`),
      request.post(`/api/floor/${location.id}/tables/${table.id}/seat`).send({ partySize: 2 }),
      request.post(`/api/floor/${location.id}/tables/${table.id}/cleaning`).send({}),
      request.post(`/api/floor/${location.id}/tables/${table.id}/available`).send({}),
      request
        .post(`/api/floor/${location.id}/assignments/${assignment.id}/move`)
        .send({ tableId: table.id }),
    ];

    for (const route of routes) {
      const response = await route;
      expect(response.status).toBe(401);
    }
  });

  it("refuses live routes for a customer session", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const { table } = await seedSeatedTable(business.id, location.id);
    const customer = await seedCustomer();

    const response = await (
      await api()
    )
      .get(`/api/floor/${location.id}/live`)
      .set("Cookie", customerCookie(customer.id));

    expect(response.status).toBe(401);

    const seat = await (
      await api()
    )
      .post(`/api/floor/${location.id}/tables/${table.id}/seat`)
      .set("Cookie", customerCookie(customer.id))
      .send({ partySize: 2 });

    expect(seat.status).toBe(401);
  });
});

describe("live floor data is isolated per business", () => {
  it("hides another business floor behind a 404", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();
    await seedSeatedTable(owner.business.id, owner.location.id);

    const response = await (
      await api()
    )
      .get(`/api/floor/${owner.location.id}/live`)
      .set("Cookie", businessCookie(intruder.business.id));

    expect(response.status).toBe(404);
  });

  it("refuses to seat a party at another business table", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();
    const { table } = await seedSeatedTable(owner.business.id, owner.location.id);

    const response = await (
      await api()
    )
      .post(`/api/floor/${intruder.location.id}/tables/${table.id}/seat`)
      .set("Cookie", businessCookie(intruder.business.id))
      .send({ partySize: 2 });

    expect(response.status).toBe(404);
  });

  it("refuses to seat a queue party that belongs to another business", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();
    const { table } = await seedSeatedTable(intruder.business.id, intruder.location.id);
    const foreignParty = await seedQueueEntry(owner.location);

    const response = await (
      await api()
    )
      .post(`/api/floor/${intruder.location.id}/tables/${table.id}/seat`)
      .set("Cookie", businessCookie(intruder.business.id))
      .send({ queueEntryId: foreignParty.id, partySize: 2 });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("Queue entry not found");
  });

  it("refuses to mark another business table for cleaning", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();
    const { table } = await seedSeatedTable(owner.business.id, owner.location.id);

    const response = await (
      await api()
    )
      .post(`/api/floor/${intruder.location.id}/tables/${table.id}/cleaning`)
      .set("Cookie", businessCookie(intruder.business.id))
      .send({});

    expect(response.status).toBe(404);

    const stored = await db.diningTable.findUnique({ where: { id: table.id } });
    expect(stored?.cleaningSince).toBeNull();
  });

  it("refuses to move another business party", async () => {
    const owner = await seedBusinessWithLocation();
    const intruder = await seedBusinessWithLocation();
    const ownerFloor = await seedSeatedTable(owner.business.id, owner.location.id);
    const intruderFloor = await seedSeatedTable(intruder.business.id, intruder.location.id);

    const response = await (
      await api()
    )
      .post(`/api/floor/${intruder.location.id}/assignments/${ownerFloor.assignment.id}/move`)
      .set("Cookie", businessCookie(intruder.business.id))
      .send({ tableId: intruderFloor.table.id });

    expect(response.status).toBe(404);

    const stored = await db.tableAssignment.findUnique({
      where: { id: ownerFloor.assignment.id },
    });
    expect(stored?.tableId).toBe(ownerFloor.table.id);
  });

  it("refuses to move a party onto a table in another location", async () => {
    const owner = await seedBusinessWithLocation();
    const second = await db.location.create({
      data: {
        businessId: owner.business.id,
        businessUsername: owner.business.username,
        displayName: "Second",
        address: "2 Test Street",
      },
    });
    const first = await seedSeatedTable(owner.business.id, owner.location.id, "First Table");
    const other = await seedSeatedTable(owner.business.id, second.id, "Other Table");

    const response = await (
      await api()
    )
      .post(`/api/floor/${owner.location.id}/assignments/${first.assignment.id}/move`)
      .set("Cookie", businessCookie(owner.business.id))
      .send({ tableId: other.table.id });

    expect(response.status).toBe(404);
  });

  it("scopes the live floor to the requested location only", async () => {
    const owner = await seedBusinessWithLocation();
    const second = await db.location.create({
      data: {
        businessId: owner.business.id,
        businessUsername: owner.business.username,
        displayName: "Second",
        address: "2 Test Street",
      },
    });
    await seedSeatedTable(owner.business.id, owner.location.id, "First Table");
    await seedSeatedTable(owner.business.id, second.id, "Other Table");
    await seedQueueEntry(owner.location);

    const response = await (
      await api()
    )
      .get(`/api/floor/${second.id}/live`)
      .set("Cookie", businessCookie(owner.business.id));

    expect(response.status).toBe(200);
    expect(response.body.rooms).toHaveLength(1);
    expect(response.body.rooms[0].tables).toHaveLength(1);
    expect(response.body.rooms[0].tables[0].name).toBe("Other Table");
    expect(response.body.waitingParties).toEqual([]);
  });

  it("keeps contact details out of the live floor payload", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedSeatedTable(business.id, location.id);
    await seedQueueEntry(location, {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@test.invalid",
      phone: "+15551234567",
    });

    const response = await (
      await api()
    )
      .get(`/api/floor/${location.id}/live`)
      .set("Cookie", businessCookie(business.id));

    const serialized = JSON.stringify(response.body);
    expect(serialized).toContain("Ada Lovelace");
    expect(serialized).not.toContain("ada@test.invalid");
    expect(serialized).not.toContain("+15551234567");
  });
});

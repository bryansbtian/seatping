import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function setupFloor(capacities: number[] = [4, 4, 4]) {
  const { business, location } = await seedBusinessWithLocation();
  const cookie = businessCookie(business.id);
  const request = await api();

  const room = await db.floorPlan.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "Main Dining Room",
      width: 1200,
      height: 800,
    },
  });

  const tables: any[] = [];
  for (let index = 0; index < capacities.length; index += 1) {
    tables.push(
      await db.diningTable.create({
        data: {
          floorPlanId: room.id,
          businessId: business.id,
          locationId: location.id,
          name: `T${index + 1}`,
          capacity: capacities[index],
          minimumPartySize: 1,
        },
      }),
    );
  }

  return { business, location, cookie, request, room, tables };
}

function partyNamed(body: any, id: string) {
  return body.waitingParties.find((party: any) => party.id === id);
}

describe("configuring table combinations", () => {
  it("creates a combination and names it after its tables", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id] });

    expect(response.status).toBe(201);
    expect(response.body.combination.name).toBe("T1 + T2");
    expect(response.body.combination.capacity).toBe(8);
    expect(response.body.combination.tableIds).toEqual([tables[0].id, tables[1].id]);
  });

  it("lists the combinations for a location", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id] });

    const response = await request
      .get(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.combinations).toHaveLength(1);
    expect(response.body.combinations[0].capacity).toBe(8);
  });

  it("refuses a combination of fewer than two tables", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id] });

    expect(response.status).toBe(400);
  });

  it("refuses a combination that lists the same table twice", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[0].id] });

    expect(response.status).toBe(400);
  });

  it("refuses a table that belongs to another business", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const other = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, other.tables[0].id] });

    expect(response.status).toBe(404);
  });

  it("refuses a duplicate combination name", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const payload = { tableIds: [tables[0].id, tables[1].id], name: "Big Setup" };

    await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send(payload);
    const second = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send(payload);

    expect(second.status).toBe(409);
  });

  it("deletes a combination that is not in use", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const created = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id] });

    const response = await request
      .delete(`/api/floor/${location.id}/combinations/${created.body.combination.id}`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(await db.tableCombination.count({ where: { locationId: location.id } })).toBe(0);
  });

  it("refuses to delete a combination that is currently seated", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const created = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id] });

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: created.body.combination.id, partySize: 7 });

    const response = await request
      .delete(`/api/floor/${location.id}/combinations/${created.body.combination.id}`)
      .set("Cookie", cookie);

    expect(response.status).toBe(409);
  });

  it("refuses every combination route without a business session", async () => {
    const { location, tables } = await setupFloor();
    const request = await api();

    const listed = await request.get(`/api/floor/${location.id}/combinations`);
    const created = await request
      .post(`/api/floor/${location.id}/combinations`)
      .send({ tableIds: [tables[0].id, tables[1].id] });

    expect(listed.status).toBe(401);
    expect(created.status).toBe(401);
  });
});

describe("recommending a combination", () => {
  async function withCombination(capacities = [4, 4, 4]) {
    const setup = await setupFloor(capacities);
    const created = await setup.request
      .post(`/api/floor/${setup.location.id}/combinations`)
      .set("Cookie", setup.cookie)
      .send({ tableIds: [setup.tables[0].id, setup.tables[1].id] });
    return { ...setup, combination: created.body.combination };
  }

  it("recommends a combination for a party too large for one table", async () => {
    const { location, cookie, request, combination } = await withCombination();
    const crowd = await seedQueueEntry(location, { guestCount: 7 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = partyNamed(live.body, crowd.id);

    expect(party.recommendedTableId).toBe(combination.id);
    expect(party.recommendedTableName).toBe("T1 + T2");
    expect(party.recommendedReasons).toContain("COMBINATION");
    expect(party.matchState).toBe("MATCHED");
  });

  it("prefers a single table when one can seat the party", async () => {
    const { location, cookie, request, tables } = await withCombination([4, 4, 8]);
    const party = await seedQueueEntry(location, { guestCount: 7 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(partyNamed(live.body, party.id).recommendedTableId).toBe(tables[2].id);
  });

  it("stops recommending the combination when one table is occupied", async () => {
    const { location, cookie, request, tables } = await withCombination();
    const crowd = await seedQueueEntry(location, { guestCount: 7 });

    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = partyNamed(live.body, crowd.id);

    expect(party.recommendedTableId).toBeNull();
    expect(party.matchState).toBe("NO_AVAILABILITY");
  });

  it("stops recommending the combination when one table is blocked", async () => {
    const { location, cookie, request, tables } = await withCombination();
    const crowd = await seedQueueEntry(location, { guestCount: 7 });

    await request
      .post(`/api/floor/${location.id}/tables/${tables[1].id}/block`)
      .set("Cookie", cookie)
      .send({});

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(partyNamed(live.body, crowd.id).matchState).toBe("NO_AVAILABILITY");
  });

  it("stops recommending the combination when one table is being cleaned", async () => {
    const { location, cookie, request, tables } = await withCombination();
    const crowd = await seedQueueEntry(location, { guestCount: 7 });

    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/cleaning`)
      .set("Cookie", cookie)
      .send({});

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(partyNamed(live.body, crowd.id).matchState).toBe("NO_AVAILABILITY");
  });

  it("reports no capacity when no table or combination is large enough", async () => {
    const { location, cookie, request } = await withCombination();
    const huge = await seedQueueEntry(location, { guestCount: 20 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = partyNamed(live.body, huge.id);

    expect(party.matchState).toBe("NO_CAPACITY");
    expect(party.recommendedTableId).toBeNull();
  });

  it("never recommends two overlapping combinations at once", async () => {
    const setup = await setupFloor([4, 4, 4]);
    await setup.request
      .post(`/api/floor/${setup.location.id}/combinations`)
      .set("Cookie", setup.cookie)
      .send({ tableIds: [setup.tables[0].id, setup.tables[1].id] });
    await setup.request
      .post(`/api/floor/${setup.location.id}/combinations`)
      .set("Cookie", setup.cookie)
      .send({ tableIds: [setup.tables[1].id, setup.tables[2].id] });

    await seedQueueEntry(setup.location, { guestCount: 7 });
    await seedQueueEntry(setup.location, { guestCount: 7 });

    const live = await setup.request
      .get(`/api/floor/${setup.location.id}/live`)
      .set("Cookie", setup.cookie);

    const matched = live.body.waitingParties.filter((p: any) => p.recommendedTableId);
    expect(matched).toHaveLength(1);
  });
});

describe("seating a party on a combination", () => {
  async function withCombination() {
    const setup = await setupFloor([4, 4, 4]);
    const created = await setup.request
      .post(`/api/floor/${setup.location.id}/combinations`)
      .set("Cookie", setup.cookie)
      .send({ tableIds: [setup.tables[0].id, setup.tables[1].id] });
    return { ...setup, combination: created.body.combination };
  }

  it("occupies every constituent table as one assignment", async () => {
    const { location, cookie, request, tables, combination } = await withCombination();
    const crowd = await seedQueueEntry(location, { guestCount: 7 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: combination.id, queueEntryId: crowd.id });

    expect(response.status).toBe(201);

    const stored = await db.tableAssignment.findMany({ where: { locationId: location.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].combinationId).toBe(combination.id);
    expect([...stored[0].tableIds].sort()).toEqual([tables[0].id, tables[1].id].sort());

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const occupied = live.body.rooms[0].tables.filter((t: any) => t.status === "OCCUPIED");
    expect(occupied.map((t: any) => t.name).sort()).toEqual(["T1", "T2"]);
  });

  it("records the seating once for the party", async () => {
    const { location, cookie, request, combination } = await withCombination();
    const crowd = await seedQueueEntry(location, { guestCount: 7 });

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: combination.id, queueEntryId: crowd.id });

    const stored = await db.tableAssignment.findMany({ where: { locationId: location.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].seatedAt).toBeTruthy();

    const entry = await db.queueEntry.findUnique({ where: { id: crowd.id } });
    expect(entry?.status).toBe("ARRIVED");
  });

  it("refuses to seat a constituent table independently while combined", async () => {
    const { location, cookie, request, tables, combination } = await withCombination();
    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: combination.id, partySize: 7 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, partySize: 2 });

    expect(response.status).toBe(409);
  });

  it("refuses a combination when one table is already taken", async () => {
    const { location, cookie, request, tables, combination } = await withCombination();
    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, partySize: 2 });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: combination.id, partySize: 7 });

    expect(response.status).toBe(409);
  });

  it("refuses to seat a party larger than the combined capacity", async () => {
    const { location, cookie, request, combination } = await withCombination();

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: combination.id, partySize: 20 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("seats");
  });

  it("frees every constituent table when the visit completes", async () => {
    const { location, cookie, request, combination } = await withCombination();
    const seated = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: combination.id, partySize: 7 });

    await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const statuses = live.body.rooms[0].tables.map((t: any) => t.status);
    expect(statuses.every((status: string) => status === "AVAILABLE")).toBe(true);
  });

  it("rejects a combination that belongs to another business", async () => {
    const { location, cookie, request } = await withCombination();
    const other = await setupFloor();
    const foreign = await other.request
      .post(`/api/floor/${other.location.id}/combinations`)
      .set("Cookie", other.cookie)
      .send({ tableIds: [other.tables[0].id, other.tables[1].id] });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: foreign.body.combination.id, partySize: 7 });

    expect(response.status).toBe(404);
  });
});

describe("combination validation branches", () => {
  it("accepts an explicit name instead of the generated one", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id], name: "  Window Bay  " });

    expect(response.status).toBe(201);
    expect(response.body.combination.name).toBe("Window Bay");
  });

  it("falls back to the generated name when the given one is blank", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id], name: "   " });

    expect(response.status).toBe(201);
    expect(response.body.combination.name).toBe("T1 + T2");
  });

  it("rejects a name longer than the limit", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id], name: "x".repeat(200) });

    expect(response.status).toBe(400);
  });

  it("stores an explicit minimum party size", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id], minimumPartySize: 5 });

    expect(response.status).toBe(201);
    expect(response.body.combination.minimumPartySize).toBe(5);
  });

  it("rejects a minimum party size outside the allowed range", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id], minimumPartySize: 0 });

    expect(response.status).toBe(400);
  });

  it("rejects a minimum party size larger than the combined capacity", async () => {
    const { location, cookie, request, tables } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id], minimumPartySize: 30 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("combined capacity");
  });

  it("rejects tableIds that are not a list", async () => {
    const { location, cookie, request } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: "T1" });

    expect(response.status).toBe(400);
  });

  it("rejects a malformed combination id on delete", async () => {
    const { location, cookie, request } = await setupFloor();

    const response = await request
      .delete(`/api/floor/${location.id}/combinations/not-an-id`)
      .set("Cookie", cookie);

    expect(response.status).toBe(404);
  });

  it("rejects deleting a combination that belongs to another business", async () => {
    const { location, cookie, request } = await setupFloor();
    const other = await setupFloor();
    const foreign = await other.request
      .post(`/api/floor/${other.location.id}/combinations`)
      .set("Cookie", other.cookie)
      .send({ tableIds: [other.tables[0].id, other.tables[1].id] });

    const response = await request
      .delete(`/api/floor/${location.id}/combinations/${foreign.body.combination.id}`)
      .set("Cookie", cookie);

    expect(response.status).toBe(404);
    expect(await db.tableCombination.count({ where: { id: foreign.body.combination.id } })).toBe(1);
  });

  it("deletes a combination once its visit is finished", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const created = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id] });

    const seated = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: created.body.combination.id, partySize: 7 });
    await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const response = await request
      .delete(`/api/floor/${location.id}/combinations/${created.body.combination.id}`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
  });

  it("refuses an inactive combination when seating", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const created = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id] });

    await db.tableCombination.update({
      where: { id: created.body.combination.id },
      data: { isActive: false },
    });

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: created.body.combination.id, partySize: 7 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("not active");
  });

  it("rejects a malformed combination id when seating", async () => {
    const { location, cookie, request } = await setupFloor();

    const response = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ combinationId: "nope", partySize: 7 });

    expect(response.status).toBe(400);
  });

  it("leaves an inactive combination out of the live floor candidates", async () => {
    const { location, cookie, request, tables } = await setupFloor();
    const created = await request
      .post(`/api/floor/${location.id}/combinations`)
      .set("Cookie", cookie)
      .send({ tableIds: [tables[0].id, tables[1].id] });
    await db.tableCombination.update({
      where: { id: created.body.combination.id },
      data: { isActive: false },
    });
    const crowd = await seedQueueEntry(location, { guestCount: 7 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = live.body.waitingParties.find((p: any) => p.id === crowd.id);

    expect(party.recommendedTableId).toBeNull();
    expect(live.body.combinations[0].available).toBe(false);
  });
});

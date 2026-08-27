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

async function setupFloor(tables: { name: string; capacity: number; minimumPartySize?: number }[]) {
  const { business, location } = await seedBusinessWithLocation();
  const cookie = businessCookie(business.id);
  const request = await api();

  const roomResponse = await request
    .post(`/api/floor/${location.id}/rooms`)
    .set("Cookie", cookie)
    .send({ name: "Main Dining Room", width: 1200, height: 800 });
  const room = roomResponse.body.room;

  const created: any[] = [];
  for (const table of tables) {
    const response = await request
      .post(`/api/floor/${location.id}/rooms/${room.id}/tables`)
      .set("Cookie", cookie)
      .send({
        name: table.name,
        capacity: table.capacity,
        minimumPartySize: table.minimumPartySize ?? 1,
      });
    created.push(response.body.table);
  }

  return { business, location, cookie, request, room, tables: created };
}

function tableNamed(body: any, name: string) {
  for (const room of body.rooms) {
    const found = room.tables.find((table: any) => table.name === name);
    if (found) {
      return found;
    }
  }
  return null;
}

describe("smart recommendations on the live floor", () => {
  it("recommends the tightest table that fits the waiting party", async () => {
    const { location, cookie, request } = await setupFloor([
      { name: "T1", capacity: 2 },
      { name: "T2", capacity: 4 },
      { name: "T3", capacity: 8 },
    ]);
    const guest = await seedQueueEntry(location, { guestCount: 4 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(tableNamed(live.body, "T2").recommendedPartyId).toBe(guest.id);
    expect(tableNamed(live.body, "T2").recommendedReasons).toContain("EXACT_FIT");
    expect(tableNamed(live.body, "T3").recommendedPartyId).toBeNull();
  });

  it("explains why a table was recommended", async () => {
    const { location, cookie, request } = await setupFloor([{ name: "T1", capacity: 6 }]);
    await seedQueueEntry(location, { guestCount: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const reasons = tableNamed(live.body, "T1").recommendedReasons;

    expect(reasons).toContain("OVERSIZED");
    expect(reasons).toContain("FREE_ALL_WINDOW");
  });

  it("serves the longest waiting party first", async () => {
    const { location, cookie, request } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const patient = await seedQueueEntry(location, {
      guestCount: 2,
      joinedAt: new Date(Date.now() - 90 * 60 * 1000),
    });
    await seedQueueEntry(location, {
      guestCount: 2,
      joinedAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(tableNamed(live.body, "T1").recommendedPartyId).toBe(patient.id);
  });

  it("never recommends the same party to two tables", async () => {
    const { location, cookie, request } = await setupFloor([
      { name: "T1", capacity: 4 },
      { name: "T2", capacity: 4 },
    ]);
    await seedQueueEntry(location, { guestCount: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const claimed = live.body.rooms[0].tables
      .map((table: any) => table.recommendedPartyId)
      .filter(Boolean);

    expect(claimed).toHaveLength(1);
  });

  it("leaves a blocked table out of the recommendations", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    await seedQueueEntry(location, { guestCount: 2 });
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/block`)
      .set("Cookie", cookie)
      .send({});

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(tableNamed(live.body, "T1").recommendedPartyId).toBeNull();
  });

  it("leaves an occupied table out of the recommendations", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    await seedQueueEntry(location, { guestCount: 2 });
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(tableNamed(live.body, "T1").recommendedPartyId).toBeNull();
  });

  it("respects the table minimum party size", async () => {
    const { location, cookie, request } = await setupFloor([
      { name: "T1", capacity: 8, minimumPartySize: 5 },
      { name: "T2", capacity: 4 },
    ]);
    const guest = await seedQueueEntry(location, { guestCount: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(tableNamed(live.body, "T1").recommendedPartyId).toBeNull();
    expect(tableNamed(live.body, "T2").recommendedPartyId).toBe(guest.id);
  });

  it("recommends nothing when the party fits nowhere", async () => {
    const { location, cookie, request } = await setupFloor([{ name: "T1", capacity: 2 }]);
    await seedQueueEntry(location, { guestCount: 12 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(tableNamed(live.body, "T1").recommendedPartyId).toBeNull();
  });

  it("returns the same recommendation when asked twice", async () => {
    const { location, cookie, request } = await setupFloor([
      { name: "T1", capacity: 4 },
      { name: "T2", capacity: 4 },
    ]);
    await seedQueueEntry(location, { guestCount: 2 });
    await seedQueueEntry(location, { guestCount: 4 });

    const first = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const second = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    const pick = (body: any) =>
      body.rooms[0].tables.map((t: any) => [t.name, t.recommendedPartyId]);
    expect(pick(first.body)).toEqual(pick(second.body));
  });

  it("does not create an assignment when it recommends a table", async () => {
    const { location, cookie, request } = await setupFloor([{ name: "T1", capacity: 4 }]);
    await seedQueueEntry(location, { guestCount: 2 });

    await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    const assignments = await db.tableAssignment.findMany({ where: { locationId: location.id } });
    expect(assignments).toEqual([]);
  });

  it("leaves the queue untouched when it recommends a table", async () => {
    const { location, cookie, request } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const guest = await seedQueueEntry(location, { guestCount: 2, status: "WAITING" });

    await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    const stored = await db.queueEntry.findUnique({ where: { id: guest.id } });
    expect(stored?.status).toBe("WAITING");
    expect(stored?.arrivedAt).toBeNull();
  });
});

function partyNamed(body: any, id: string) {
  return body.waitingParties.find((party: any) => party.id === id);
}

describe("queue integration", () => {
  it("tells each waiting party which table it should take", async () => {
    const { location, cookie, request } = await setupFloor([
      { name: "T1", capacity: 2 },
      { name: "T2", capacity: 6 },
    ]);
    const pair = await seedQueueEntry(location, { guestCount: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = partyNamed(live.body, pair.id);

    expect(party.recommendedTableName).toBe("T1");
    expect(party.recommendedReasons).toContain("EXACT_FIT");
    expect(party.matchState).toBe("MATCHED");
  });

  it("agrees with the table side of the same recommendation", async () => {
    const { location, cookie, request } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const guest = await seedQueueEntry(location, { guestCount: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = partyNamed(live.body, guest.id);
    const table = tableNamed(live.body, "T1");

    expect(party.recommendedTableId).toBe(table.id);
    expect(table.recommendedPartyId).toBe(guest.id);
  });

  it("reports no match when the party fits no table at all", async () => {
    const { location, cookie, request } = await setupFloor([{ name: "T1", capacity: 2 }]);
    const crowd = await seedQueueEntry(location, { guestCount: 12 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = partyNamed(live.body, crowd.id);

    expect(party.recommendedTableId).toBeNull();
    expect(party.matchState).toBe("NO_CAPACITY");
  });

  it("does not call it no match when the party is simply queued behind another", async () => {
    const { location, cookie, request } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const first = await seedQueueEntry(location, {
      guestCount: 2,
      joinedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const second = await seedQueueEntry(location, {
      guestCount: 2,
      joinedAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(partyNamed(live.body, first.id).recommendedTableName).toBe("T1");
    expect(partyNamed(live.body, second.id).recommendedTableId).toBeNull();
    expect(partyNamed(live.body, second.id).matchState).toBe("QUEUED");
  });

  it("reports no match once every table is blocked", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const guest = await seedQueueEntry(location, { guestCount: 2 });
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/block`)
      .set("Cookie", cookie)
      .send({});

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(partyNamed(live.body, guest.id).matchState).toBe("NO_AVAILABILITY");
  });

  it("moves the recommendation to the next party once one is seated", async () => {
    const { location, cookie, request, tables } = await setupFloor([
      { name: "T1", capacity: 4 },
      { name: "T2", capacity: 4 },
    ]);
    const first = await seedQueueEntry(location, {
      guestCount: 2,
      joinedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const second = await seedQueueEntry(location, {
      guestCount: 2,
      joinedAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const before = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(partyNamed(before.body, first.id).recommendedTableId).toBe(tables[0].id);

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: first.id });

    const after = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(after.body.waitingParties).toHaveLength(1);
    expect(partyNamed(after.body, second.id).recommendedTableId).toBe(tables[1].id);
  });

  it("drops the recommendation when the table becomes occupied", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const guest = await seedQueueEntry(location, { guestCount: 2 });

    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 4 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(partyNamed(live.body, guest.id).recommendedTableId).toBeNull();
    expect(partyNamed(live.body, guest.id).matchState).toBe("NO_AVAILABILITY");
  });

  it("brings the recommendation back once the visit is completed", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const guest = await seedQueueEntry(location, { guestCount: 2 });

    const seated = await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/seat`)
      .set("Cookie", cookie)
      .send({ partySize: 4 });
    await request
      .post(`/api/floor/${location.id}/assignments/${seated.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    expect(partyNamed(live.body, guest.id).recommendedTableId).toBe(tables[0].id);
  });

  it("still recommends a table that is being cleaned and says why", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const guest = await seedQueueEntry(location, { guestCount: 2 });
    await request
      .post(`/api/floor/${location.id}/tables/${tables[0].id}/cleaning`)
      .set("Cookie", cookie)
      .send({});

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = partyNamed(live.body, guest.id);
    expect(party.recommendedTableId).toBe(tables[0].id);
    expect(party.recommendedReasons).toContain("NEEDS_CLEANING");
    expect(party.matchState).toBe("MATCHED");
  });
});

describe("a recommendation is not a lock", () => {
  it("rejects a stale recommendation instead of double booking the table", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const first = await seedQueueEntry(location, {
      guestCount: 2,
      joinedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const second = await seedQueueEntry(location, { guestCount: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const staleTableId = partyNamed(live.body, first.id).recommendedTableId;
    expect(staleTableId).toBe(tables[0].id);

    const winner = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: staleTableId, queueEntryId: second.id });
    expect(winner.status).toBe(201);

    const loser = await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: staleTableId, queueEntryId: first.id });

    expect(loser.status).toBe(409);

    const stored = await db.tableAssignment.findMany({ where: { tableId: tables[0].id } });
    expect(stored).toHaveLength(1);
  });

  it("leaves the losing guest in the queue when the recommendation goes stale", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const first = await seedQueueEntry(location, { guestCount: 2 });
    const second = await seedQueueEntry(location, { guestCount: 2 });

    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: second.id });
    await request
      .post(`/api/floor/${location.id}/assign`)
      .set("Cookie", cookie)
      .send({ tableId: tables[0].id, queueEntryId: first.id });

    const stored = await db.queueEntry.findUnique({ where: { id: first.id } });
    expect(stored?.status).toBe("WAITING");
  });
});

describe("a table held for later tonight", () => {
  it("shows as reserved once the booking is inside the lookahead", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const tonight = new Date(Date.now() + 60 * 60 * 1000);
    await db.tableAssignment.create({
      data: {
        tableId: tables[0].id,
        tableIds: [tables[0].id],
        businessId: location.businessId,
        locationId: location.id,
        partySize: 3,
        source: "SMART",
        status: "RESERVED",
        expectedStartAt: tonight,
        expectedEndAt: new Date(tonight.getTime() + 90 * 60 * 1000),
      },
    });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const table = live.body.rooms[0].tables[0];

    expect(table.status).toBe("RESERVED");
  });

  it("stays available while the booking is beyond the lookahead", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const tonight = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.tableAssignment.create({
      data: {
        tableId: tables[0].id,
        tableIds: [tables[0].id],
        businessId: location.businessId,
        locationId: location.id,
        partySize: 3,
        source: "SMART",
        status: "RESERVED",
        expectedStartAt: tonight,
        expectedEndAt: new Date(tonight.getTime() + 90 * 60 * 1000),
      },
    });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);

    expect(live.body.rooms[0].tables[0].status).toBe("AVAILABLE");
  });

  it("can still be recommended for a walk in right now", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const tonight = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.tableAssignment.create({
      data: {
        tableId: tables[0].id,
        tableIds: [tables[0].id],
        businessId: location.businessId,
        locationId: location.id,
        partySize: 3,
        source: "SMART",
        status: "RESERVED",
        expectedStartAt: tonight,
        expectedEndAt: new Date(tonight.getTime() + 90 * 60 * 1000),
      },
    });
    const walkIn = await seedQueueEntry(location, { guestCount: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = live.body.waitingParties.find((entry: any) => entry.id === walkIn.id);

    expect(party.matchState).toBe("MATCHED");
    expect(party.recommendedTableId).toBe(tables[0].id);
  });

  it("is not offered to a walk in whose turn would overlap the booking", async () => {
    const { location, cookie, request, tables } = await setupFloor([{ name: "T1", capacity: 4 }]);
    const soon = new Date(Date.now() + 15 * 60 * 1000);
    await db.tableAssignment.create({
      data: {
        tableId: tables[0].id,
        tableIds: [tables[0].id],
        businessId: location.businessId,
        locationId: location.id,
        partySize: 3,
        source: "SMART",
        status: "RESERVED",
        expectedStartAt: soon,
        expectedEndAt: new Date(soon.getTime() + 90 * 60 * 1000),
      },
    });
    const walkIn = await seedQueueEntry(location, { guestCount: 2 });

    const live = await request.get(`/api/floor/${location.id}/live`).set("Cookie", cookie);
    const party = live.body.waitingParties.find((entry: any) => entry.id === walkIn.id);

    expect(party.recommendedTableId).toBeNull();
  });
});

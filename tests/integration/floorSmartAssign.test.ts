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

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation } from "../helpers/seed.js";

const db = getTestPrisma();

const MISSING_ID = "0123456789abcdef01234567";

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function setup() {
  const { business, location } = await seedBusinessWithLocation();
  const cookie = businessCookie(business.id);
  const request = await api();

  const roomResponse = await request
    .post(`/api/floor/${location.id}/rooms`)
    .set("Cookie", cookie)
    .send({ width: 1200, height: 800 });
  expect(roomResponse.status).toBe(201);

  return { business, location, cookie, request, room: roomResponse.body.room };
}

async function addZone(
  request: Awaited<ReturnType<typeof api>>,
  locationId: string,
  cookie: string,
  roomId: string,
  body: Record<string, unknown>,
) {
  return request
    .post(`/api/floor/${locationId}/rooms/${roomId}/zones`)
    .set("Cookie", cookie)
    .send(body);
}

describe("zone creation", () => {
  it("creates a zone with the geometry it was given", async () => {
    const { location, cookie, request, room } = await setup();

    const response = await addZone(request, location.id, cookie, room.id, {
      name: "Patio zone",
      x: 100,
      y: 60,
      width: 400,
      height: 300,
    });

    expect(response.status).toBe(201);
    expect(response.body.zone).toMatchObject({
      name: "Patio zone",
      x: 100,
      y: 60,
      width: 400,
      height: 300,
      floorPlanId: room.id,
      locationId: location.id,
    });
  });

  it("falls back to a default footprint", async () => {
    const { location, cookie, request, room } = await setup();

    const response = await addZone(request, location.id, cookie, room.id, { name: "Bar zone" });

    expect(response.status).toBe(201);
    expect(response.body.zone.width).toBe(300);
    expect(response.body.zone.height).toBe(200);
  });

  it("clamps a zone that would spill outside the room", async () => {
    const { location, cookie, request, room } = await setup();

    const response = await addZone(request, location.id, cookie, room.id, {
      name: "Oversized",
      x: 1100,
      y: 700,
      width: 900,
      height: 900,
    });

    expect(response.status).toBe(201);
    const zone = response.body.zone;
    expect(zone.width).toBeLessThanOrEqual(1200);
    expect(zone.height).toBeLessThanOrEqual(800);
    expect(zone.x + zone.width).toBeLessThanOrEqual(1200);
    expect(zone.y + zone.height).toBeLessThanOrEqual(800);
  });

  it("requires a name", async () => {
    const { location, cookie, request, room } = await setup();

    const blank = await addZone(request, location.id, cookie, room.id, { name: "   " });
    expect(blank.status).toBe(400);

    const missing = await addZone(request, location.id, cookie, room.id, {});
    expect(missing.status).toBe(400);

    expect(await db.floorZone.count()).toBe(0);
  });

  it("rejects malformed geometry", async () => {
    const { location, cookie, request, room } = await setup();

    const cases: [string, Record<string, unknown>][] = [
      ["x", { x: -10 }],
      ["y", { y: "far" }],
      ["width", { width: 5 }],
      ["height", { height: 99999 }],
    ];

    for (const [field, overrides] of cases) {
      const response = await addZone(request, location.id, cookie, room.id, {
        name: `Zone ${field}`,
        ...overrides,
      });
      expect(response.status, `${field} should be rejected`).toBe(400);
    }

    expect(await db.floorZone.count()).toBe(0);
  });

  it("refuses a duplicate zone name in the same room but allows it in another", async () => {
    const { location, cookie, request, room } = await setup();

    await addZone(request, location.id, cookie, room.id, { name: "Patio zone" });
    const duplicate = await addZone(request, location.id, cookie, room.id, { name: "Patio zone" });
    expect(duplicate.status).toBe(409);

    const second = await request
      .post(`/api/floor/${location.id}/rooms`)
      .set("Cookie", cookie)
      .send({ name: "Patio" });

    const elsewhere = await addZone(request, location.id, cookie, second.body.room.id, {
      name: "Patio zone",
    });
    expect(elsewhere.status).toBe(201);
  });

  it("returns not found for a room that does not exist", async () => {
    const { location, cookie, request } = await setup();

    const missing = await addZone(request, location.id, cookie, MISSING_ID, { name: "Zone" });
    expect(missing.status).toBe(404);

    const malformed = await addZone(request, location.id, cookie, "not-an-id", { name: "Zone" });
    expect(malformed.status).toBe(404);
  });
});

describe("zone updates", () => {
  async function withZone() {
    const context = await setup();
    const created = await addZone(
      context.request,
      context.location.id,
      context.cookie,
      context.room.id,
      {
        name: "Patio zone",
        x: 100,
        y: 100,
        width: 300,
        height: 200,
      },
    );
    return { ...context, zone: created.body.zone };
  }

  it("renames a zone", async () => {
    const { location, cookie, request, zone } = await withZone();

    const response = await request
      .patch(`/api/floor/${location.id}/zones/${zone.id}`)
      .set("Cookie", cookie)
      .send({ name: "Bar zone" });

    expect(response.status).toBe(200);
    expect(response.body.zone.name).toBe("Bar zone");
  });

  it("moves and resizes a zone", async () => {
    const { location, cookie, request, zone } = await withZone();

    const response = await request
      .patch(`/api/floor/${location.id}/zones/${zone.id}`)
      .set("Cookie", cookie)
      .send({ x: 200, y: 150, width: 500, height: 400 });

    expect(response.status).toBe(200);
    expect(response.body.zone).toMatchObject({ x: 200, y: 150, width: 500, height: 400 });
  });

  it("clamps a move that would leave the room", async () => {
    const { location, cookie, request, zone } = await withZone();

    const response = await request
      .patch(`/api/floor/${location.id}/zones/${zone.id}`)
      .set("Cookie", cookie)
      .send({ x: 5000, y: 5000 });

    expect(response.status).toBe(200);
    const updated = response.body.zone;
    expect(updated.x + updated.width).toBeLessThanOrEqual(1200);
    expect(updated.y + updated.height).toBeLessThanOrEqual(800);
  });

  it("rejects an empty update and malformed values", async () => {
    const { location, cookie, request, zone } = await withZone();

    const empty = await request
      .patch(`/api/floor/${location.id}/zones/${zone.id}`)
      .set("Cookie", cookie)
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error).toContain("No zone changes");

    const blankName = await request
      .patch(`/api/floor/${location.id}/zones/${zone.id}`)
      .set("Cookie", cookie)
      .send({ name: "  " });
    expect(blankName.status).toBe(400);

    const badWidth = await request
      .patch(`/api/floor/${location.id}/zones/${zone.id}`)
      .set("Cookie", cookie)
      .send({ width: 1 });
    expect(badWidth.status).toBe(400);
  });

  it("refuses a rename onto another zone in the same room", async () => {
    const { location, cookie, request, room, zone } = await withZone();

    await addZone(request, location.id, cookie, room.id, { name: "Bar zone" });

    const clash = await request
      .patch(`/api/floor/${location.id}/zones/${zone.id}`)
      .set("Cookie", cookie)
      .send({ name: "Bar zone" });
    expect(clash.status).toBe(409);

    const noop = await request
      .patch(`/api/floor/${location.id}/zones/${zone.id}`)
      .set("Cookie", cookie)
      .send({ name: "Patio zone" });
    expect(noop.status).toBe(200);
  });

  it("returns not found for a missing or malformed zone id", async () => {
    const { location, cookie, request } = await setup();

    const missing = await request
      .patch(`/api/floor/${location.id}/zones/${MISSING_ID}`)
      .set("Cookie", cookie)
      .send({ name: "Nope" });
    expect(missing.status).toBe(404);

    const malformed = await request
      .patch(`/api/floor/${location.id}/zones/not-an-id`)
      .set("Cookie", cookie)
      .send({ name: "Nope" });
    expect(malformed.status).toBe(404);
  });
});

describe("zone deletion", () => {
  it("deletes a zone and leaves the room and its tables alone", async () => {
    const { location, cookie, request, room } = await setup();

    const table = await request
      .post(`/api/floor/${location.id}/rooms/${room.id}/tables`)
      .set("Cookie", cookie)
      .send({ name: "T1", capacity: 4 });
    const zone = await addZone(request, location.id, cookie, room.id, { name: "Patio zone" });

    const deleted = await request
      .delete(`/api/floor/${location.id}/zones/${zone.body.zone.id}`)
      .set("Cookie", cookie);

    expect(deleted.status).toBe(200);
    expect(await db.floorZone.count({ where: { locationId: location.id } })).toBe(0);
    expect(await db.diningTable.count({ where: { id: table.body.table.id } })).toBe(1);
    expect(await db.floorPlan.count({ where: { id: room.id } })).toBe(1);
  });

  it("returns not found for a missing or malformed zone id", async () => {
    const { location, cookie, request } = await setup();

    const missing = await request
      .delete(`/api/floor/${location.id}/zones/${MISSING_ID}`)
      .set("Cookie", cookie);
    expect(missing.status).toBe(404);

    const malformed = await request
      .delete(`/api/floor/${location.id}/zones/not-an-id`)
      .set("Cookie", cookie);
    expect(malformed.status).toBe(404);
  });

  it("hides another business's zone", async () => {
    const owner = await setup();
    const intruder = await seedBusinessWithLocation();
    const zone = await addZone(owner.request, owner.location.id, owner.cookie, owner.room.id, {
      name: "Patio zone",
    });

    const patched = await owner.request
      .patch(`/api/floor/${intruder.location.id}/zones/${zone.body.zone.id}`)
      .set("Cookie", businessCookie(intruder.business.id))
      .send({ name: "Hijacked" });
    expect(patched.status).toBe(404);

    const deleted = await owner.request
      .delete(`/api/floor/${intruder.location.id}/zones/${zone.body.zone.id}`)
      .set("Cookie", businessCookie(intruder.business.id));
    expect(deleted.status).toBe(404);

    const stored = await db.floorZone.findUniqueOrThrow({ where: { id: zone.body.zone.id } });
    expect(stored.name).toBe("Patio zone");
  });
});

describe("zone limits", () => {
  it("stops a room from exceeding the zone limit", async () => {
    const { location, cookie, request, room } = await setup();

    for (let index = 1; index <= 20; index += 1) {
      const created = await addZone(request, location.id, cookie, room.id, {
        name: `Zone ${index}`,
      });
      expect(created.status).toBe(201);
    }

    const overflow = await addZone(request, location.id, cookie, room.id, { name: "One Too Many" });

    expect(overflow.status).toBe(409);
    expect(overflow.body.error).toContain("maximum zones");
    expect(await db.floorZone.count({ where: { floorPlanId: room.id } })).toBe(20);
  });
});

describe("room deletion", () => {
  it("returns not found for a missing or malformed room id", async () => {
    const { location, cookie, request } = await setup();

    const missing = await request
      .delete(`/api/floor/${location.id}/rooms/${MISSING_ID}`)
      .set("Cookie", cookie);
    expect(missing.status).toBe(404);

    const malformed = await request
      .delete(`/api/floor/${location.id}/rooms/not-an-id`)
      .set("Cookie", cookie);
    expect(malformed.status).toBe(404);
  });
});

describe("room limits", () => {
  it("refuses a room whose name is already taken on rename", async () => {
    const { location, cookie, request, room } = await setup();

    await request.post(`/api/floor/${location.id}/rooms`).set("Cookie", cookie).send({
      name: "Patio",
    });

    const clash = await request
      .patch(`/api/floor/${location.id}/rooms/${room.id}`)
      .set("Cookie", cookie)
      .send({ name: "Patio" });

    expect(clash.status).toBe(409);
  });

  it("stops a location from exceeding the room limit", async () => {
    const { location, cookie, request } = await setup();

    for (let index = 2; index <= 20; index += 1) {
      const created = await request
        .post(`/api/floor/${location.id}/rooms`)
        .set("Cookie", cookie)
        .send({ name: `Room ${index}` });
      expect(created.status).toBe(201);
    }

    const overflow = await request
      .post(`/api/floor/${location.id}/rooms`)
      .set("Cookie", cookie)
      .send({ name: "One Too Many" });

    expect(overflow.status).toBe(409);
    expect(overflow.body.error).toContain("maximum rooms");
    expect(await db.floorPlan.count({ where: { locationId: location.id } })).toBe(20);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

const MISSING_ID = "0123456789abcdef01234567";

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function at(hour: number, minute = 0): string {
  return new Date(Date.UTC(2026, 7, 30, hour, minute, 0)).toISOString();
}

async function setup() {
  const { business, location } = await seedBusinessWithLocation();
  const cookie = businessCookie(business.id);
  const request = await api();

  await request.post(`/api/floor/${location.id}`).set("Cookie", cookie).send({});
  const tableResponse = await request
    .post(`/api/floor/${location.id}/tables`)
    .set("Cookie", cookie)
    .send({ name: "Table 12", capacity: 4, minimumPartySize: 2 });

  return { business, location, cookie, request, table: tableResponse.body.table };
}

describe("floor plan validation", () => {
  it("falls back to sensible defaults when the body is empty", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(response.status).toBe(201);
    expect(response.body.floorPlan.name).toBe("Main Floor");
    expect(response.body.floorPlan.width).toBe(1200);
    expect(response.body.floorPlan.height).toBe(800);
  });

  it("rejects a blank or overlong floor plan name", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    const request = await api();

    const blank = await request.post(`/api/floor/${location.id}`).set("Cookie", cookie).send({
      name: "   ",
    });
    expect(blank.status).toBe(400);

    const overlong = await request
      .post(`/api/floor/${location.id}`)
      .set("Cookie", cookie)
      .send({ name: "a".repeat(61) });
    expect(overlong.status).toBe(400);

    expect(await db.floorPlan.count()).toBe(0);
  });

  it("rejects an out of range height on creation", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const response = await (
      await api()
    )
      .post(`/api/floor/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ height: 99999 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("height");
  });

  it("returns not found when updating a floor plan that does not exist", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const response = await (
      await api()
    )
      .patch(`/api/floor/${location.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ name: "Nope" });

    expect(response.status).toBe(404);
  });

  it("rejects an empty floor plan update and invalid dimensions", async () => {
    const { location, cookie, request } = await setup();

    const empty = await request.patch(`/api/floor/${location.id}`).set("Cookie", cookie).send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error).toContain("No floor plan changes");

    const badName = await request
      .patch(`/api/floor/${location.id}`)
      .set("Cookie", cookie)
      .send({ name: "" });
    expect(badName.status).toBe(400);

    const badWidth = await request
      .patch(`/api/floor/${location.id}`)
      .set("Cookie", cookie)
      .send({ width: 1 });
    expect(badWidth.status).toBe(400);

    const badHeight = await request
      .patch(`/api/floor/${location.id}`)
      .set("Cookie", cookie)
      .send({ height: "tall" });
    expect(badHeight.status).toBe(400);
  });

  it("resizes a floor plan width on its own", async () => {
    const { location, cookie, request } = await setup();

    const response = await request
      .patch(`/api/floor/${location.id}`)
      .set("Cookie", cookie)
      .send({ width: 2000 });

    expect(response.status).toBe(200);
    expect(response.body.floorPlan.width).toBe(2000);
    expect(response.body.floorPlan.height).toBe(800);
  });
});

describe("table creation validation", () => {
  it("rejects a missing name and a missing capacity", async () => {
    const { location, cookie, request } = await setup();

    const noName = await request
      .post(`/api/floor/${location.id}/tables`)
      .set("Cookie", cookie)
      .send({ capacity: 2 });
    expect(noName.status).toBe(400);

    const noCapacity = await request
      .post(`/api/floor/${location.id}/tables`)
      .set("Cookie", cookie)
      .send({ name: "Table 99" });
    expect(noCapacity.status).toBe(400);
  });

  it("rejects invalid enum, text, and geometry values", async () => {
    const { location, cookie, request } = await setup();

    const cases: [string, Record<string, unknown>][] = [
      ["shape", { shape: "HEXAGON" }],
      ["section", { section: 12 }],
      ["section", { section: "a".repeat(61) }],
      ["minimumPartySize", { minimumPartySize: 0 }],
      ["x", { x: -5 }],
      ["y", { y: "far" }],
      ["width", { width: 1 }],
      ["height", { height: 99999 }],
      ["rotation", { rotation: 99999 }],
    ];

    for (const [field, overrides] of cases) {
      const response = await request
        .post(`/api/floor/${location.id}/tables`)
        .set("Cookie", cookie)
        .send({ name: `Table ${uniqueSuffix()}`, capacity: 4, ...overrides });
      expect(response.status, `${field} should be rejected`).toBe(400);
    }

    expect(await db.diningTable.count({ where: { locationId: location.id } })).toBe(1);
  });

  it("accepts a null minimum party size and treats it as one", async () => {
    const { location, cookie, request } = await setup();

    const response = await request
      .post(`/api/floor/${location.id}/tables`)
      .set("Cookie", cookie)
      .send({ name: "Bar 1", capacity: 2, minimumPartySize: null, shape: "COUNTER" });

    expect(response.status).toBe(201);
    expect(response.body.table.minimumPartySize).toBe(1);
    expect(response.body.table.shape).toBe("COUNTER");
  });
});

describe("table update validation", () => {
  it("returns not found for a missing or malformed table id", async () => {
    const { location, cookie, request } = await setup();

    const missing = await request
      .patch(`/api/floor/${location.id}/tables/${MISSING_ID}`)
      .set("Cookie", cookie)
      .send({ name: "Nope" });
    expect(missing.status).toBe(404);

    const malformed = await request
      .patch(`/api/floor/${location.id}/tables/not-an-id`)
      .set("Cookie", cookie)
      .send({ name: "Nope" });
    expect(malformed.status).toBe(404);
  });

  it("rejects an empty update", async () => {
    const { location, cookie, request, table } = await setup();

    const response = await request
      .patch(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("No table changes");
  });

  it("rejects invalid values on every editable field", async () => {
    const { location, cookie, request, table } = await setup();

    const cases: [string, Record<string, unknown>][] = [
      ["name", { name: "" }],
      ["capacity", { capacity: 0 }],
      ["minimumPartySize", { minimumPartySize: 99 }],
      ["shape", { shape: "TRIANGLE" }],
      ["section", { section: "a".repeat(61) }],
      ["x", { x: -1 }],
      ["y", { y: 99999 }],
      ["width", { width: 0 }],
      ["height", { height: "tall" }],
      ["rotation", { rotation: -99999 }],
    ];

    for (const [field, body] of cases) {
      const response = await request
        .patch(`/api/floor/${location.id}/tables/${table.id}`)
        .set("Cookie", cookie)
        .send(body);
      expect(response.status, `${field} should be rejected`).toBe(400);
    }

    const stored = await db.diningTable.findUnique({ where: { id: table.id } });
    expect(stored?.name).toBe("Table 12");
    expect(stored?.capacity).toBe(4);
  });

  it("rejects a minimum party size raised above the existing capacity", async () => {
    const { location, cookie, request, table } = await setup();

    const response = await request
      .patch(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({ minimumPartySize: 6 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("minimumPartySize");
  });

  it("allows lowering capacity and minimum party size together", async () => {
    const { location, cookie, request, table } = await setup();

    const response = await request
      .patch(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({ capacity: 2, minimumPartySize: 1 });

    expect(response.status).toBe(200);
    expect(response.body.table.capacity).toBe(2);
    expect(response.body.table.minimumPartySize).toBe(1);
  });

  it("refuses a rename onto another table's name but allows renaming to itself", async () => {
    const { location, cookie, request, table } = await setup();

    await request
      .post(`/api/floor/${location.id}/tables`)
      .set("Cookie", cookie)
      .send({ name: "Table 13", capacity: 2 });

    const clash = await request
      .patch(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({ name: "Table 13" });
    expect(clash.status).toBe(409);

    const noop = await request
      .patch(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({ name: "Table 12" });
    expect(noop.status).toBe(200);
    expect(noop.body.table.name).toBe("Table 12");
  });

  it("changes only the table shape", async () => {
    const { location, cookie, request, table } = await setup();

    const response = await request
      .patch(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({ shape: "ROUND" });

    expect(response.status).toBe(200);
    expect(response.body.table.shape).toBe("ROUND");
    expect(response.body.table.name).toBe("Table 12");
  });

  it("clears a section when it is set to null and normalizes rotation", async () => {
    const { location, cookie, request, table } = await setup();

    await request
      .patch(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({ section: "Patio" });

    const cleared = await request
      .patch(`/api/floor/${location.id}/tables/${table.id}`)
      .set("Cookie", cookie)
      .send({ section: null, rotation: -90 });

    expect(cleared.status).toBe(200);
    expect(cleared.body.table.section).toBeNull();
    expect(cleared.body.table.rotation).toBe(270);
  });
});

describe("block and delete validation", () => {
  it("returns not found for block, unblock, and delete on a missing table", async () => {
    const { location, cookie, request } = await setup();

    const blocked = await request
      .post(`/api/floor/${location.id}/tables/${MISSING_ID}/block`)
      .set("Cookie", cookie)
      .send({});
    expect(blocked.status).toBe(404);

    const unblocked = await request
      .post(`/api/floor/${location.id}/tables/${MISSING_ID}/unblock`)
      .set("Cookie", cookie)
      .send({});
    expect(unblocked.status).toBe(404);

    const deleted = await request
      .delete(`/api/floor/${location.id}/tables/${MISSING_ID}`)
      .set("Cookie", cookie);
    expect(deleted.status).toBe(404);
  });

  it("rejects an overlong block reason and blocks without one", async () => {
    const { location, cookie, request, table } = await setup();

    const overlong = await request
      .post(`/api/floor/${location.id}/tables/${table.id}/block`)
      .set("Cookie", cookie)
      .send({ reason: "a".repeat(201) });
    expect(overlong.status).toBe(400);

    const blocked = await request
      .post(`/api/floor/${location.id}/tables/${table.id}/block`)
      .set("Cookie", cookie)
      .send({});
    expect(blocked.status).toBe(200);
    expect(blocked.body.table.isBlocked).toBe(true);
    expect(blocked.body.table.blockedReason).toBeNull();
  });
});

describe("assignment listing validation", () => {
  it("rejects malformed query filters", async () => {
    const { location, cookie, request } = await setup();

    const badTable = await request
      .get(`/api/floor/${location.id}/assignments?tableId=nope`)
      .set("Cookie", cookie);
    expect(badTable.status).toBe(400);

    const badStatus = await request
      .get(`/api/floor/${location.id}/assignments?status=PENDING`)
      .set("Cookie", cookie);
    expect(badStatus.status).toBe(400);

    const badFrom = await request
      .get(`/api/floor/${location.id}/assignments?from=yesterday`)
      .set("Cookie", cookie);
    expect(badFrom.status).toBe(400);

    const badTo = await request
      .get(`/api/floor/${location.id}/assignments?to=tomorrow`)
      .set("Cookie", cookie);
    expect(badTo.status).toBe(400);
  });

  it("filters by an explicit terminal status", async () => {
    const { location, cookie, request, table } = await setup();

    const created = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({ tableId: table.id, partySize: 4, source: "MANUAL", expectedStartAt: at(19) });

    await request
      .post(`/api/floor/${location.id}/assignments/${created.body.assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    const completed = await request
      .get(`/api/floor/${location.id}/assignments?status=COMPLETED`)
      .set("Cookie", cookie);
    expect(completed.body.assignments).toHaveLength(1);

    const reserved = await request
      .get(`/api/floor/${location.id}/assignments?status=RESERVED`)
      .set("Cookie", cookie);
    expect(reserved.body.assignments).toHaveLength(0);
  });
});

describe("assignment creation validation", () => {
  it("rejects malformed identifiers and required fields", async () => {
    const { location, cookie, request, table } = await setup();

    const cases: [string, Record<string, unknown>][] = [
      ["tableId", { tableId: "nope" }],
      ["partySize", { partySize: 0 }],
      ["partySize", { partySize: "four" }],
      ["source", { source: "AUTO" }],
      ["source", {}],
      ["status", { status: "PENDING" }],
      ["expectedStartAt", { expectedStartAt: "soon" }],
      ["queueEntryId", { queueEntryId: "nope" }],
      ["reservationId", { reservationId: "nope" }],
      ["guestProfileId", { guestProfileId: "nope" }],
      ["turnMinutes", { turnMinutes: 0 }],
      ["expectedEndAt", { expectedEndAt: at(18) }],
    ];

    for (const [field, overrides] of cases) {
      const body: Record<string, unknown> = {
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(19),
        ...overrides,
      };
      if (field === "source" && Object.keys(overrides).length === 0) {
        delete body.source;
      }
      const response = await request
        .post(`/api/floor/${location.id}/assignments`)
        .set("Cookie", cookie)
        .send(body);
      expect(response.status, `${field} should be rejected`).toBe(400);
    }

    expect(await db.tableAssignment.count()).toBe(0);
  });

  it("refuses a terminal status on creation", async () => {
    const { location, cookie, request, table } = await setup();

    const response = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "MANUAL",
        status: "COMPLETED",
        expectedStartAt: at(19),
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("RESERVED or SEATED");
  });

  it("returns not found for a table that does not exist", async () => {
    const { location, cookie, request } = await setup();

    const response = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: MISSING_ID,
        partySize: 4,
        source: "SMART",
        expectedStartAt: at(19),
      });

    expect(response.status).toBe(404);
  });

  it("returns not found for references that do not exist", async () => {
    const { location, cookie, request, table } = await setup();

    const queue = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "SMART",
        queueEntryId: MISSING_ID,
        expectedStartAt: at(19),
      });
    expect(queue.status).toBe(404);
    expect(queue.body.error).toContain("Queue entry");

    const guest = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "SMART",
        guestProfileId: MISSING_ID,
        expectedStartAt: at(19),
      });
    expect(guest.status).toBe(404);
    expect(guest.body.error).toContain("Guest");
  });

  it("links a guest profile alongside a queue entry", async () => {
    const { business, location, cookie, request, table } = await setup();
    const queueEntry = await seedQueueEntry({ id: location.id, businessId: business.id });
    const guest = await db.guestProfile.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        locationId: location.id,
        fullName: "Maria Alvarez",
      },
    });

    const response = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "SMART",
        queueEntryId: queueEntry.id,
        guestProfileId: guest.id,
        expectedStartAt: at(19),
      });

    expect(response.status).toBe(201);
    expect(response.body.assignment.guestProfileId).toBe(guest.id);
    expect(response.body.assignment.queueEntryId).toBe(queueEntry.id);
  });
});

describe("assignment update validation", () => {
  async function withAssignment() {
    const context = await setup();
    const created = await context.request
      .post(`/api/floor/${context.location.id}/assignments`)
      .set("Cookie", context.cookie)
      .send({
        tableId: context.table.id,
        partySize: 4,
        source: "MANUAL",
        expectedStartAt: at(19),
        expectedEndAt: at(21),
      });
    return { ...context, assignment: created.body.assignment };
  }

  it("returns not found for a missing or malformed assignment id", async () => {
    const { location, cookie, request } = await setup();

    const missing = await request
      .patch(`/api/floor/${location.id}/assignments/${MISSING_ID}`)
      .set("Cookie", cookie)
      .send({ status: "SEATED" });
    expect(missing.status).toBe(404);

    const malformed = await request
      .patch(`/api/floor/${location.id}/assignments/not-an-id`)
      .set("Cookie", cookie)
      .send({ status: "SEATED" });
    expect(malformed.status).toBe(404);

    const completeMissing = await request
      .post(`/api/floor/${location.id}/assignments/${MISSING_ID}/complete`)
      .set("Cookie", cookie)
      .send({});
    expect(completeMissing.status).toBe(404);

    const completeMalformed = await request
      .post(`/api/floor/${location.id}/assignments/not-an-id/complete`)
      .set("Cookie", cookie)
      .send({});
    expect(completeMalformed.status).toBe(404);
  });

  it("completes an assignment through the update route", async () => {
    const { location, cookie, request, assignment } = await withAssignment();

    const response = await request
      .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({ status: "COMPLETED" });

    expect(response.status).toBe(200);
    expect(response.body.assignment.status).toBe("COMPLETED");
    expect(response.body.assignment.completedAt).not.toBeNull();
  });

  it("rejects an empty update and malformed fields", async () => {
    const { location, cookie, request, assignment } = await withAssignment();

    const empty = await request
      .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error).toContain("No assignment changes");

    const cases: [string, Record<string, unknown>][] = [
      ["status", { status: "PENDING" }],
      ["partySize", { partySize: 0 }],
      ["expectedStartAt", { expectedStartAt: "soon" }],
      ["expectedEndAt", { expectedEndAt: "later" }],
    ];

    for (const [field, body] of cases) {
      const response = await request
        .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
        .set("Cookie", cookie)
        .send(body);
      expect(response.status, `${field} should be rejected`).toBe(400);
    }
  });

  it("rejects an end moved before the start", async () => {
    const { location, cookie, request, assignment } = await withAssignment();

    const response = await request
      .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({ expectedEndAt: at(18) });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("expectedEndAt");
  });

  it("rejects a party size the table can no longer seat", async () => {
    const { location, cookie, request, assignment } = await withAssignment();

    const tooBig = await request
      .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({ partySize: 8 });
    expect(tooBig.status).toBe(409);

    const tooSmall = await request
      .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({ partySize: 1 });
    expect(tooSmall.status).toBe(409);
  });

  it("cancels an assignment and frees the window", async () => {
    const { location, cookie, request, table, assignment } = await withAssignment();

    const cancelled = await request
      .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({ status: "CANCELLED" });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.assignment.status).toBe("CANCELLED");
    expect(cancelled.body.assignment.cancelledAt).not.toBeNull();

    const replacement = await request
      .post(`/api/floor/${location.id}/assignments`)
      .set("Cookie", cookie)
      .send({
        tableId: table.id,
        partySize: 4,
        source: "SMART",
        expectedStartAt: at(19),
        expectedEndAt: at(21),
      });
    expect(replacement.status).toBe(201);
  });

  it("refuses to complete an assignment that was already cancelled", async () => {
    const { location, cookie, request, assignment } = await withAssignment();

    await request
      .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({ status: "CANCELLED" });

    const completed = await request
      .post(`/api/floor/${location.id}/assignments/${assignment.id}/complete`)
      .set("Cookie", cookie)
      .send({});

    expect(completed.status).toBe(409);
  });

  it("moves an assignment to a new window and keeps the seating stamp", async () => {
    const { location, cookie, request, assignment } = await withAssignment();

    const seated = await request
      .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({ status: "SEATED" });
    const firstSeatedAt = seated.body.assignment.seatedAt;
    expect(firstSeatedAt).not.toBeNull();

    const moved = await request
      .patch(`/api/floor/${location.id}/assignments/${assignment.id}`)
      .set("Cookie", cookie)
      .send({ status: "SEATED", expectedStartAt: at(20), expectedEndAt: at(22), partySize: 3 });

    expect(moved.status).toBe(200);
    expect(moved.body.assignment.seatedAt).toBe(firstSeatedAt);
    expect(moved.body.assignment.partySize).toBe(3);
    expect(moved.body.assignment.expectedStartAt).toBe(at(20));
  });
});

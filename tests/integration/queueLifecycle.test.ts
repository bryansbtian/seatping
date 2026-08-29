import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Business, Location } from "@prisma/client";
import { api } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import {
  seedBusinessWithLocation,
  seedQueueEntry,
  seedReservation,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function queuePath(business: Business, key: string, action?: string): string {
  let path = `/auth/business/${business.username}/queue/${key}`;
  if (action) {
    path = `${path}/${action}`;
  }
  return path;
}

function admittedPath(business: Business, key: string, action: string): string {
  return `/auth/business/${business.username}/admitted/${key}/${action}`;
}

async function waiting(location: Location, overrides: Record<string, unknown> = {}) {
  return seedQueueEntry(location, {
    status: "WAITING",
    joinedAt: new Date(),
    ...overrides,
  });
}

describe("admitting a waiting guest", () => {
  it("moves the guest to admitted and reports the hold window", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location);
    const cookie = businessCookie(business.id);

    const admit = await (
      await api()
    )
      .post(queuePath(business, entry.legacyKey, "admit"))
      .set("Cookie", cookie);

    expect(admit.status).toBe(200);
    expect(admit.body.success).toBe(true);

    const status = await (await api()).get(queuePath(business, entry.legacyKey, "status"));
    expect(status.body.admitted).toBe(true);
    expect(status.body.turnExpiresAt).toEqual(expect.any(String));
    expect(status.body.expired).toBe(false);
  });

  it("reports an expired hold once the window has passed", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "ADMITTED",
      admittedAt: new Date(Date.now() - 60 * 60 * 1000),
      finalStatus: "pending",
    });

    const status = await (await api()).get(queuePath(business, entry.legacyKey, "status"));

    expect(status.body.admitted).toBe(true);
    expect(status.body.expired).toBe(true);
    expect(status.body.message).toBe("Hold window has expired");
  });

  it("rejects an admit with a blank customer key", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post(queuePath(business, "%20", "admit"))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(400);
  });

  it("refuses to admit through another business's account", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();
    const entry = await waiting(tenantA.location);

    const res = await (
      await api()
    )
      .post(queuePath(tenantA.business, entry.legacyKey, "admit"))
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBe(404);
  });
});

describe("confirming arrival", () => {
  it("moves an admitted guest to arrived", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "ADMITTED",
      admittedAt: new Date(),
      finalStatus: "pending",
    });

    const res = await (
      await api()
    )
      .post(admittedPath(business, entry.legacyKey, "confirm-arrival"))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("ARRIVED");
    expect(stored?.arrivedAt).toBeInstanceOf(Date);
  });

  it("reports an arrived guest as checked in", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "ARRIVED",
      finalStatus: "arrived",
      arrivedAt: new Date(),
    });

    const res = await (await api()).get(queuePath(business, entry.legacyKey, "status"));

    expect(res.body.checkedIn).toBe(true);
    expect(res.body.status).toBe("arrived");
  });

  it("reports a guest who was never admitted", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location);

    const res = await (
      await api()
    )
      .post(admittedPath(business, entry.legacyKey, "confirm-arrival"))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Admitted customer not found");
  });

  it("rejects a blank customer key", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post(admittedPath(business, "%20", "confirm-arrival"))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(400);
  });
});

describe("marking an admitted guest as a no-show", () => {
  it("records the no-show", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "ADMITTED",
      admittedAt: new Date(),
      finalStatus: "pending",
    });

    const res = await (
      await api()
    )
      .post(admittedPath(business, entry.legacyKey, "mark-no-show"))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("NO_SHOW");
    expect(stored?.noShowAt).toBeInstanceOf(Date);
  });

  it("reports a no-show through the public status endpoint", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "NO_SHOW",
      finalStatus: "no_show",
      noShowAt: new Date(),
    });

    const res = await (await api()).get(queuePath(business, entry.legacyKey, "status"));

    expect(res.body.removed).toBe(true);
    expect(res.body.status).toBe("no_show");
  });

  it("reports a guest who is not admitted", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location);

    const res = await (
      await api()
    )
      .post(admittedPath(business, entry.legacyKey, "mark-no-show"))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(404);
  });

  it("rejects a blank customer key", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post(admittedPath(business, "%20", "mark-no-show"))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(400);
  });
});

describe("removing a guest from the queue", () => {
  it("removes a waiting guest", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location);

    const res = await (
      await api()
    )
      .delete(queuePath(business, entry.legacyKey))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.customer).toBeDefined();
    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("REMOVED");
  });

  it("removes an admitted guest", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "ADMITTED",
      admittedAt: new Date(),
      finalStatus: "pending",
    });

    const res = await (
      await api()
    )
      .delete(queuePath(business, entry.legacyKey))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
  });

  it("reports a guest who is no longer in the queue", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "LEFT",
      leftAt: new Date(),
    });

    const res = await (
      await api()
    )
      .delete(queuePath(business, entry.legacyKey))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(404);
  });

  it("rejects a blank customer key", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .delete(queuePath(business, "%20"))
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(400);
  });
});

describe("a guest leaving the queue", () => {
  it("lets a waiting guest leave without signing in", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location);

    const res = await (await api()).post(queuePath(business, entry.legacyKey, "leave"));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("You have left the queue");
    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("LEFT");
  });

  it("reports a left guest through the status endpoint", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "LEFT",
      leftAt: new Date(),
    });

    const res = await (await api()).get(queuePath(business, entry.legacyKey, "status"));

    expect(res.body.removed).toBe(true);
    expect(res.body.status).toBe("left");
    expect(res.body.message).toBe("Customer has left the queue");
  });

  it("reports a removed guest distinctly from one who left", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "REMOVED",
      removedAt: new Date(),
    });

    const res = await (await api()).get(queuePath(business, entry.legacyKey, "status"));

    expect(res.body.status).toBe("removed");
  });

  it("reports a guest who is not waiting", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "ARRIVED",
      finalStatus: "arrived",
      arrivedAt: new Date(),
    });

    const res = await (await api()).post(queuePath(business, entry.legacyKey, "leave"));

    expect(res.status).toBe(404);
  });

  it("rejects a blank customer key", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api()).post(queuePath(business, "%20", "leave"));

    expect(res.status).toBe(400);
  });

  it("reports an unknown business", async () => {
    const res = await (await api()).post("/auth/business/no-such-business/queue/some-key/leave");

    expect(res.status).toBe(404);
  });
});

describe("public queue status", () => {
  it("reports the position of a waiting guest", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await waiting(location, { joinedAt: new Date(Date.now() - 60_000) });
    const second = await waiting(location, { joinedAt: new Date() });

    const res = await (await api()).get(queuePath(business, second.legacyKey, "status"));

    expect(res.body.position).toBe(2);
    expect(res.body.admitted).toBe(false);
  });

  it("prefers the most active entry when a guest has several", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const key = `shared-${uniqueSuffix()}`;
    await waiting(location, {
      legacyKey: key,
      status: "LEFT",
      leftAt: new Date(),
    });
    await waiting(location, { legacyKey: key, status: "WAITING" });

    const res = await (await api()).get(queuePath(business, key, "status"));

    expect(res.body.position).toBe(1);
  });

  it("reports a guest it has never seen", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api()).get(queuePath(business, "never-queued", "status"));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Customer not found");
  });

  it("rejects a blank customer key", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api()).get(queuePath(business, "%20", "status"));

    expect(res.status).toBe(400);
  });

  it("reports an unknown business", async () => {
    const res = await (await api()).get("/auth/business/no-such-business/queue/some-key/status");

    expect(res.status).toBe(404);
  });
});

describe("queue wait estimates", () => {
  it("estimates the wait for a waiting ticket", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location);

    const res = await (
      await api()
    ).get(`/auth/business/${business.username}/queue/token/${entry.queueToken}/eta`);

    expect(res.status).toBe(200);
    expect(res.body.eta).toBeDefined();
  });

  it("reports no estimate once the ticket is no longer waiting", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, {
      status: "LEFT",
      leftAt: new Date(),
    });

    const res = await (
      await api()
    ).get(`/auth/business/${business.username}/queue/token/${entry.queueToken}/eta`);

    expect(res.status).toBe(404);
  });

  it("reports an unknown token", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    ).get(`/auth/business/${business.username}/queue/token/not-a-real-token/eta`);

    expect(res.status).toBe(404);
  });

  it("rejects a blank token", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api()).get(`/auth/business/${business.username}/queue/token/%20/eta`);

    expect(res.status).toBe(400);
  });

  it("reports an unknown business", async () => {
    const res = await (await api()).get("/auth/business/no-such-business/queue/token/abc/eta");

    expect(res.status).toBe(404);
  });

  it("lists estimates for every waiting guest at a location", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await waiting(location);
    await waiting(location);

    const res = await (
      await api()
    )
      .get(`/auth/business/${business.username}/locations/${location.id}/queue-etas`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.etas).toBeDefined();
  });

  it("refuses estimates for another business's location", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get(
        `/auth/business/${tenantA.business.username}/locations/${tenantA.location.id}/queue-etas`,
      )
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBe(404);
  });
});

describe("business address directory", () => {
  it("lists the addresses of a business", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api()).get(`/auth/business/${business.username}/addresses`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(location.id);
  });

  it("reports an unknown business", async () => {
    const res = await (await api()).get("/auth/business/no-such-business/addresses");

    expect(res.status).toBe(404);
  });
});

describe("provider webhooks and diagnostics", () => {
  it("acknowledges a Telnyx delivery event", async () => {
    const res = await (await api()).post("/auth/telnyx/webhook").send({
      data: {
        event_type: "message.finalized",
        payload: { id: "msg-1", to: [{ status: "delivered" }] },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("acknowledges a webhook with no recognisable payload", async () => {
    const res = await (await api()).post("/auth/telnyx/webhook").send({});

    expect(res.body).toEqual({ received: true });
  });
});

describe("wait estimates against real table inventory", () => {
  async function seedRoom(business: Business, location: Location) {
    return db.floorPlan.create({
      data: {
        businessId: business.id,
        locationId: location.id,
        name: `Room ${uniqueSuffix()}`,
        width: 1200,
        height: 800,
      },
    });
  }

  async function seedTable(
    business: Business,
    location: Location,
    overrides: {
      capacity?: number;
      minimumPartySize?: number;
      name?: string;
      roomId?: string;
    } = {},
  ) {
    let roomId = overrides.roomId;
    if (!roomId) {
      roomId = (await seedRoom(business, location)).id;
    }
    return db.diningTable.create({
      data: {
        floorPlanId: roomId,
        businessId: business.id,
        locationId: location.id,
        name: overrides.name ?? `T${uniqueSuffix()}`,
        capacity: overrides.capacity ?? 4,
        minimumPartySize: overrides.minimumPartySize ?? 1,
      },
    });
  }

  async function etaFor(business: Business, queueToken: string) {
    const res = await (
      await api()
    ).get(`/auth/business/${business.username}/queue/token/${queueToken}/eta`);
    expect(res.status).toBe(200);
    return res.body.eta;
  }

  it("seats the front of the queue straight away when a table is open", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedTable(business, location);
    const entry = await waiting(location, { guestCount: 2 });

    const eta = await etaFor(business, entry.queueToken);

    expect(eta.basis.usedTableInventory).toBe(true);
    expect(eta.basis.tableWaitMinutes).toBe(0);
    expect(eta.displayText).toBe("Less Than 5 Minutes");
  });

  it("waits for the table the seated party is still holding", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const table = await seedTable(business, location);
    const seated = await seedQueueEntry(location, {
      guestCount: 2,
      status: "ARRIVED",
      finalStatus: "arrived",
    });
    await db.tableAssignment.create({
      data: {
        tableId: table.id,
        businessId: business.id,
        locationId: location.id,
        queueEntryId: seated.id,
        partySize: 2,
        source: "MANUAL",
        status: "SEATED",
        expectedStartAt: new Date(Date.now() - 30 * 60 * 1000),
        expectedEndAt: new Date(Date.now() + 42 * 60 * 1000),
        seatedAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    });
    const entry = await waiting(location, { guestCount: 2 });

    const eta = await etaFor(business, entry.queueToken);

    expect(eta.basis.usedTableInventory).toBe(true);
    expect(eta.estimatedWaitMin).toBe(40);
  });

  it("reports no capacity when the party outgrows the whole floor", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedTable(business, location, { capacity: 2 });
    const entry = await waiting(location, { guestCount: 6 });

    const eta = await etaFor(business, entry.queueToken);

    expect(eta.status).toBe("NO_CAPACITY");
    expect(eta.reason).toBe("PARTY_EXCEEDS_SEATING");
    expect(eta.etaMinutes).toBeNull();
    expect(eta.displayText).toBe("No Table Fits This Party");
  });

  it("joins tables in the same room for a party no single table fits", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const room = await seedRoom(business, location);
    await seedTable(business, location, { roomId: room.id, capacity: 4 });
    await seedTable(business, location, { roomId: room.id, capacity: 4 });
    const entry = await waiting(location, { guestCount: 7 });

    const eta = await etaFor(business, entry.queueToken);

    expect(eta.status).toBe("ETA");
    expect(eta.basis.usedTableCombination).toBe(true);
    expect(eta.tableEtaMinutes).toBe(0);
  });

  it("will not join tables that sit in different rooms", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedTable(business, location, { capacity: 4 });
    await seedTable(business, location, { capacity: 4 });
    const entry = await waiting(location, { guestCount: 7 });

    const eta = await etaFor(business, entry.queueToken);

    expect(eta.status).toBe("NO_CAPACITY");
  });

  it("leaves the estimate table-free for a location with no layout", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await waiting(location, { guestCount: 2 });

    const eta = await etaFor(business, entry.queueToken);

    expect(eta.status).toBe("ETA");
    expect(eta.reason).toBe("NO_FLOOR_DATA");
    expect(eta.basis.usedTableInventory).toBe(false);
    expect(eta.basis.hasFloorPlan).toBe(false);
  });

  it("holds inventory for a confirmed booking but not a cancelled one", async () => {
    const { business, location } = await seedBusinessWithLocation({
      restaurantProfile: { openingHours: { timezone: "UTC" } },
    });
    await seedTable(business, location, { capacity: 4 });
    const soon = new Date(Date.now() + 30 * 60 * 1000);
    const wallClock = `${soon.toISOString().slice(0, 10)}T${soon.toISOString().slice(11, 16)}`;
    await seedReservation(location, {
      guestCount: 4,
      status: "CANCELLED",
      reservationDateTime: wallClock,
    });
    const entry = await waiting(location, { guestCount: 2 });

    const cancelledOnly = await etaFor(business, entry.queueToken);

    expect(cancelledOnly.basis.reservationsHeld).toBe(0);
    expect(cancelledOnly.tableEtaMinutes).toBe(0);

    await seedReservation(location, {
      guestCount: 4,
      status: "CONFIRMED",
      reservationDateTime: wallClock,
    });

    const withBooking = await etaFor(business, entry.queueToken);

    expect(withBooking.basis.reservationsHeld).toBe(1);
    expect(withBooking.tableEtaMinutes).toBeGreaterThan(0);
  });

  it("carries the table view into the business queue list", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedTable(business, location);
    await waiting(location, { guestCount: 2 });

    const res = await (
      await api()
    )
      .get(`/auth/business/${business.username}/locations/${location.id}/queue-etas`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.etas).toHaveLength(1);
    expect(res.body.etas[0].status).toBe("ETA");
    expect(res.body.etas[0].basis.usedTableInventory).toBe(true);
  });
});

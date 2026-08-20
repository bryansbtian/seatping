import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { signJwt } from "../../server/lib/auth.js";

const locationFindMany = vi.fn();
const locationFindFirst = vi.fn();
const guestFindMany = vi.fn();
const guestFindFirst = vi.fn();
const guestFindUnique = vi.fn();
const guestFindRaw = vi.fn();
const guestUpdate = vi.fn();
const queueEntryFindMany = vi.fn();
const reservationFindMany = vi.fn();
const recomputeGuestStats = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      location: { findMany: locationFindMany, findFirst: locationFindFirst },
      guestProfile: {
        findMany: guestFindMany,
        findFirst: guestFindFirst,
        findUnique: guestFindUnique,
        findRaw: guestFindRaw,
        update: guestUpdate,
      },
      queueEntry: { findMany: queueEntryFindMany },
      reservation: { findMany: reservationFindMany },
    },
  };
});

vi.mock("../../server/lib/guests.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/guests.js");
  return { ...actual, recomputeGuestStats };
});

const guestsRouter = (await import("../../server/routes/guests.js")).default;

const ORIGINAL_ENV = { ...process.env };

function app() {
  const server = express();
  server.use(cookieParser());
  server.use(express.json());
  server.use("/api/guests", guestsRouter);
  return supertest(server);
}

function cookie(businessId = "biz-1"): string {
  const token = signJwt({ sub: businessId, accountType: "business" });
  return `sp_auth_business=${token}`;
}

function guest(overrides: Record<string, unknown> = {}) {
  return {
    id: "guest-1",
    businessId: "biz-1",
    businessUsername: "bistro",
    locationId: "loc-1",
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    phone: null,
    normalizedPhone: null,
    email: "ada@test.invalid",
    normalizedEmail: "ada@test.invalid",
    tags: [],
    notes: null,
    summary: null,
    totalVisits: 3,
    waitlistVisitCount: 1,
    upcomingReservationCount: 0,
    pastReservationCount: 2,
    noShowCount: 0,
    cancelledCount: 0,
    firstVisitAt: null,
    lastVisitAt: null,
    sourceQueueEntryIds: [],
    sourceReservationIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function futureIso(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T19:00`;
}

beforeEach(() => {
  process.env.JWT_SECRET = "unit-test-jwt-secret";
  locationFindMany.mockReset().mockResolvedValue([]);
  locationFindFirst.mockReset().mockResolvedValue({
    id: "loc-1",
    name: "Bistro Downtown",
    displayName: "Downtown",
    address: "1 Test Street",
    restaurantProfile: {},
  });
  guestFindMany.mockReset().mockResolvedValue([]);
  guestFindFirst.mockReset().mockResolvedValue(guest());
  guestFindUnique.mockReset().mockResolvedValue(guest());
  guestFindRaw.mockReset().mockResolvedValue([]);
  guestUpdate.mockReset().mockImplementation(async ({ data }) => {
    return guest(data);
  });
  queueEntryFindMany.mockReset().mockResolvedValue([]);
  reservationFindMany.mockReset().mockResolvedValue([]);
  recomputeGuestStats.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("guest metadata", () => {
  it("falls back through the location label fields", async () => {
    locationFindMany.mockResolvedValue([
      { id: "l1", displayName: "Downtown", name: "X", address: "A" },
      { id: "l2", displayName: null, name: "Named", address: "A" },
      { id: "l3", displayName: null, name: null, address: "9 Test Street" },
      { id: "l4", displayName: null, name: null, address: null },
    ]);

    const res = await app().get("/api/guests/meta").set("Cookie", cookie());

    expect(res.body.locations.map((l: any) => l.label)).toEqual([
      "Downtown",
      "Named",
      "9 Test Street",
      "Location",
    ]);
  });

  it("reports a server error without leaking the cause", async () => {
    locationFindMany.mockRejectedValue(new Error("db down"));

    const res = await app().get("/api/guests/meta").set("Cookie", cookie());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Server error" });
  });

  it("survives a rejection that carries no message", async () => {
    locationFindMany.mockRejectedValue("db exploded");

    const res = await app().get("/api/guests/meta").set("Cookie", cookie());

    expect((console.error as any).mock.calls[0][1]).toBe("db exploded");
  });
});

describe("guest list", () => {
  it("builds a full name from the parts when none is stored", async () => {
    guestFindMany.mockResolvedValue([
      guest({ fullName: null }),
      guest({ id: "g2", fullName: null, firstName: null, lastName: null }),
    ]);

    const res = await app().get("/api/guests?locationId=loc-1").set("Cookie", cookie());

    expect(res.body.guests[0].fullName).toBe("Ada Lovelace");
    expect(res.body.guests[1].fullName).toBeNull();
  });

  it("reports whether the guest carries notes", async () => {
    guestFindMany.mockResolvedValue([
      guest({ notes: "Allergic to peanuts" }),
      guest({ id: "g2", notes: "   " }),
      guest({ id: "g3", notes: null }),
    ]);

    const res = await app().get("/api/guests?locationId=loc-1").set("Cookie", cookie());

    expect(res.body.guests.map((g: any) => g.hasNotes)).toEqual([true, false, false]);
  });

  it("skips the tag search when nothing matches the term", async () => {
    guestFindRaw.mockResolvedValue([]);

    const res = await app().get("/api/guests?locationId=loc-1&search=vip").set("Cookie", cookie());

    expect(res.status).toBe(200);
    const where = guestFindMany.mock.calls[0][0].where;
    const orClause = where.AND[0].OR;
    expect(orClause.some((c: any) => c.id)).toBe(false);
  });

  it("adds the matching tag ids when the tag search finds some", async () => {
    guestFindRaw.mockResolvedValue([{ _id: { $oid: "guest-9" } }]);

    await app().get("/api/guests?locationId=loc-1&search=vip").set("Cookie", cookie());

    const orClause = guestFindMany.mock.calls[0][0].where.AND[0].OR;
    expect(orClause.some((c: any) => c.id?.in?.includes("guest-9"))).toBe(true);
  });

  it("omits the phone clause for a short search term", async () => {
    await app().get("/api/guests?locationId=loc-1&search=ab").set("Cookie", cookie());

    const orClause = guestFindMany.mock.calls[0][0].where.AND[0].OR;
    expect(orClause.some((c: any) => c.normalizedPhone)).toBe(false);
  });

  it("reports a server error", async () => {
    guestFindMany.mockRejectedValue(new Error("db down"));

    const res = await app().get("/api/guests?locationId=loc-1").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });
});

describe("guest detail", () => {
  it("sorts several upcoming reservations soonest first", async () => {
    guestFindFirst.mockResolvedValue(guest({ sourceReservationIds: ["res-1", "res-2"] }));
    reservationFindMany.mockResolvedValue([
      {
        id: "res-2",
        status: "CONFIRMED",
        guestCount: 2,
        reservationDateTime: futureIso(9),
        notes: null,
      },
      {
        id: "res-1",
        status: "CONFIRMED",
        guestCount: 2,
        reservationDateTime: futureIso(3),
        notes: null,
      },
    ]);

    const res = await app().get("/api/guests/guest-1").set("Cookie", cookie());

    expect(res.body.upcomingReservations.map((r: any) => r.id)).toEqual(["res-1", "res-2"]);
  });

  it("reports a server error", async () => {
    guestFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app().get("/api/guests/guest-1").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });

  it("falls back to an empty summary and notes", async () => {
    guestFindFirst.mockResolvedValue(guest({ notes: null, summary: null }));

    const res = await app().get("/api/guests/guest-1").set("Cookie", cookie());

    expect(res.body.guest.notes).toBe("");
    expect(res.body.guest.summary).toBe("");
  });
});

describe("guest editing failures", () => {
  it("reports a failed patch", async () => {
    guestUpdate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .patch("/api/guests/guest-1")
      .set("Cookie", cookie())
      .send({ notes: "x" });

    expect(res.status).toBe(500);
  });

  it("reports a failed tag add", async () => {
    guestUpdate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/api/guests/guest-1/tags")
      .set("Cookie", cookie())
      .send({ tag: "VIP" });

    expect(res.status).toBe(500);
  });

  it("reports a failed tag removal", async () => {
    guestUpdate.mockRejectedValue(new Error("db down"));

    const res = await app().delete("/api/guests/guest-1/tags/VIP").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });

  it("truncates an over-long tag on add", async () => {
    guestFindFirst.mockResolvedValue({ id: "guest-1", tags: [] });

    await app()
      .post("/api/guests/guest-1/tags")
      .set("Cookie", cookie())
      .send({ tag: "t".repeat(60) });

    expect(guestUpdate.mock.calls[0][0].data.tags[0]).toHaveLength(40);
  });

  it("reports a failed recompute", async () => {
    recomputeGuestStats.mockRejectedValue(new Error("db down"));

    const res = await app().post("/api/guests/guest-1/recompute").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });

  it("returns no guest when the recomputed row has vanished", async () => {
    guestFindFirst.mockResolvedValue({ id: "guest-1" });
    guestFindUnique.mockResolvedValue(null);

    const res = await app().post("/api/guests/guest-1/recompute").set("Cookie", cookie());

    expect(res.status).toBe(200);
    expect(res.body.guest).toBeNull();
  });
});

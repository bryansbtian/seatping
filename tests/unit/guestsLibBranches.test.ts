import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueEntry, Reservation } from "@prisma/client";

const guestFindUnique = vi.fn();
const guestFindFirst = vi.fn();
const guestFindMany = vi.fn();
const guestCreate = vi.fn();
const guestUpdate = vi.fn();
const queueEntryFindMany = vi.fn();
const reservationFindMany = vi.fn();
const locationFindUnique = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      guestProfile: {
        findUnique: guestFindUnique,
        findFirst: guestFindFirst,
        findMany: guestFindMany,
        create: guestCreate,
        update: guestUpdate,
      },
      queueEntry: { findMany: queueEntryFindMany },
      reservation: { findMany: reservationFindMany },
      location: { findUnique: locationFindUnique },
    },
  };
});

const {
  badgeForContact,
  buildSummary,
  computeStats,
  isReturning,
  loadGuestBadgeMap,
  normalizeEmail,
  normalizePhone,
  recomputeGuestStats,
  syncGuestFromQueueEntry,
  syncGuestFromReservation,
  touchGuestByQueueEntryId,
  touchGuestByReservationId,
  upsertGuestForVisit,
} = await import("../../server/lib/guests.js");

function queueRow(overrides: Record<string, unknown> = {}): QueueEntry {
  return {
    id: "qe-1",
    status: "ARRIVED",
    guestCount: 2,
    joinedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    ...overrides,
  } as unknown as QueueEntry;
}

function pastWallClock(daysAgo = 2): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T19:00`;
}

function futureWallClock(daysAhead = 5): string {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T19:00`;
}

function resRow(overrides: Record<string, unknown> = {}): Reservation {
  return {
    id: "res-1",
    status: "COMPLETED",
    guestCount: 4,
    reservationDateTime: pastWallClock(),
    ...overrides,
  } as unknown as Reservation;
}

beforeEach(() => {
  guestFindUnique.mockReset().mockResolvedValue(null);
  guestFindFirst.mockReset().mockResolvedValue(null);
  guestFindMany.mockReset().mockResolvedValue([]);
  guestCreate.mockReset().mockResolvedValue({ id: "guest-new" });
  guestUpdate.mockReset().mockResolvedValue({});
  queueEntryFindMany.mockReset().mockResolvedValue([]);
  reservationFindMany.mockReset().mockResolvedValue([]);
  locationFindUnique.mockReset().mockResolvedValue({ restaurantProfile: {} });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("contact normalisation", () => {
  it("lowercases and trims a usable email", () => {
    expect(normalizeEmail("  Ada@Test.Invalid  ")).toBe("ada@test.invalid");
  });

  it("rejects anything that is not a usable email", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(7)).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("no-at-sign")).toBeNull();
  });

  it("joins the country code onto the number", () => {
    expect(normalizePhone("81234567890", "+62")).toBe("6281234567890");
    expect(normalizePhone("81234567890")).toBe("81234567890");
  });

  it("strips leading zeros from a number given without a country code", () => {
    expect(normalizePhone("081234567890")).toBe("81234567890");
  });

  it("drops the domestic trunk prefix before adding the country code", () => {
    expect(normalizePhone("081234567890", "+62")).toBe("6281234567890");
  });

  it("rejects a number with too few digits or none at all", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("no digits")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(7, 7)).toBeNull();
    expect(normalizePhone("000000")).toBeNull();
  });
});

describe("computeStats", () => {
  it("reports an empty history", () => {
    const stats = computeStats([], []);

    expect(stats).toEqual({
      totalVisits: 0,
      waitlistVisitCount: 0,
      upcomingReservationCount: 0,
      pastReservationCount: 0,
      noShowCount: 0,
      cancelledCount: 0,
      firstVisitAt: null,
      lastVisitAt: null,
      typicalPartySize: null,
    });
  });

  it("counts arrived waitlist visits and queue no-shows", () => {
    const stats = computeStats(
      [
        queueRow({ id: "a", status: "ARRIVED" }),
        queueRow({ id: "b", status: "NO_SHOW" }),
        queueRow({ id: "c", status: "WAITING" }),
      ],
      [],
      "UTC",
    );

    expect(stats.waitlistVisitCount).toBe(1);
    expect(stats.noShowCount).toBe(1);
    expect(stats.totalVisits).toBe(1);
    expect(stats.lastVisitAt).toBeInstanceOf(Date);
  });

  it("ignores a waitlist visit that has not happened yet", () => {
    const stats = computeStats(
      [
        queueRow({
          status: "ARRIVED",
          joinedAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
      ],
      [],
      "UTC",
    );

    expect(stats.waitlistVisitCount).toBe(1);
    expect(stats.lastVisitAt).toBeNull();
  });

  it("ignores a waitlist entry with no join time or party size", () => {
    const stats = computeStats(
      [queueRow({ status: "ARRIVED", joinedAt: null, guestCount: null })],
      [],
      "UTC",
    );

    expect(stats.typicalPartySize).toBeNull();
    expect(stats.firstVisitAt).toBeNull();
  });

  it("counts each reservation status separately", () => {
    const stats = computeStats(
      [],
      [
        resRow({ id: "a", status: "CANCELLED" }),
        resRow({ id: "b", status: "NO_SHOW" }),
        resRow({ id: "c", status: "COMPLETED" }),
        resRow({ id: "d", status: "ARRIVED" }),
        resRow({ id: "e", status: "CONFIRMED", reservationDateTime: futureWallClock() }),
        resRow({ id: "f", status: "CONFIRMED", reservationDateTime: pastWallClock() }),
      ],
      "UTC",
    );

    expect(stats.cancelledCount).toBe(1);
    expect(stats.noShowCount).toBe(1);
    expect(stats.pastReservationCount).toBe(3);
    expect(stats.upcomingReservationCount).toBe(1);
    expect(stats.totalVisits).toBe(3);
  });

  it("ignores a completed reservation that has not happened yet", () => {
    const stats = computeStats(
      [],
      [resRow({ status: "COMPLETED", reservationDateTime: futureWallClock() })],
      "UTC",
    );

    expect(stats.pastReservationCount).toBe(1);
    expect(stats.lastVisitAt).toBeNull();
  });

  it("tolerates a reservation with no date or party size", () => {
    const stats = computeStats(
      [],
      [
        resRow({ reservationDateTime: null, guestCount: null }),
        resRow({ id: "b", reservationDateTime: "not a date" }),
      ],
      "UTC",
    );

    expect(stats.typicalPartySize).toBe(4);
    expect(stats.pastReservationCount).toBe(2);
  });

  it("reports the most common party size", () => {
    const stats = computeStats(
      [
        queueRow({ id: "a", guestCount: 2 }),
        queueRow({ id: "b", guestCount: 4 }),
        queueRow({ id: "c", guestCount: 4 }),
        queueRow({ id: "d", guestCount: 0 }),
      ],
      [],
      "UTC",
    );

    expect(stats.typicalPartySize).toBe(4);
  });

  it("orders the visit dates oldest first", () => {
    const older = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const stats = computeStats(
      [
        queueRow({ id: "a", status: "ARRIVED", joinedAt: newer }),
        queueRow({ id: "b", status: "ARRIVED", joinedAt: older }),
      ],
      [],
      "UTC",
    );

    expect(stats.firstVisitAt?.getTime()).toBe(older.getTime());
    expect(stats.lastVisitAt?.getTime()).toBe(newer.getTime());
  });

  it("falls back to the default timezone", () => {
    expect(() => computeStats([], [resRow()])).not.toThrow();
  });
});

describe("buildSummary", () => {
  function stats(overrides: Record<string, unknown> = {}) {
    return {
      totalVisits: 3,
      waitlistVisitCount: 0,
      upcomingReservationCount: 0,
      pastReservationCount: 0,
      noShowCount: 0,
      cancelledCount: 0,
      firstVisitAt: null,
      lastVisitAt: null,
      typicalPartySize: null,
      ...overrides,
    } as never;
  }

  it("describes a guest with no visits yet", () => {
    expect(buildSummary(stats({ totalVisits: 0 }))).toContain("New guest");
  });

  it("describes a single visit and several visits differently", () => {
    expect(buildSummary(stats({ totalVisits: 1 }))).toContain("1 visit");
    expect(buildSummary(stats({ totalVisits: 4 }))).toContain("Returning guest with 4 visits");
  });

  it("singularises the typical party size", () => {
    expect(buildSummary(stats({ typicalPartySize: 1 }))).toContain("1 person");
    expect(buildSummary(stats({ typicalPartySize: 3 }))).toContain("3 people");
  });

  it("mentions the last visit when there is one", () => {
    const summary = buildSummary(
      stats({ lastVisitAt: new Date("2026-08-12T00:00:00.000Z") }),
      "UTC",
    );

    expect(summary).toContain("Last visited on");
  });

  it("omits the last visit for an unusable timezone", () => {
    const summary = buildSummary(
      stats({ lastVisitAt: new Date("2026-08-12T00:00:00.000Z") }),
      "Not/AZone",
    );

    expect(summary).not.toContain("Last visited");
  });

  it("singularises upcoming reservations and no-shows", () => {
    expect(buildSummary(stats({ upcomingReservationCount: 1 }))).toContain(
      "1 upcoming reservation.",
    );
    expect(buildSummary(stats({ upcomingReservationCount: 2 }))).toContain(
      "2 upcoming reservations.",
    );
    expect(buildSummary(stats({ noShowCount: 1 }))).toContain("1 no-show.");
    expect(buildSummary(stats({ noShowCount: 3 }))).toContain("3 no-shows.");
  });
});

describe("isReturning", () => {
  it("needs at least two visits", () => {
    expect(isReturning(1)).toBe(false);
    expect(isReturning(2)).toBe(true);
  });
});

describe("upsertGuestForVisit", () => {
  function input(overrides: Record<string, unknown> = {}) {
    return {
      businessId: "biz-1",
      businessUsername: "bistro",
      locationId: "loc-1",
      firstName: "  Ada  ",
      lastName: "  Lovelace  ",
      email: "ada@test.invalid",
      queueEntryId: "qe-1",
      ...overrides,
    };
  }

  it("refuses a visit with no usable contact details", async () => {
    await expect(upsertGuestForVisit(input({ email: null, phone: null }))).resolves.toBeNull();
    expect(guestFindFirst).not.toHaveBeenCalled();
  });

  it("creates a guest from an email only", async () => {
    guestFindUnique.mockResolvedValue({
      id: "guest-new",
      locationId: "loc-1",
      sourceQueueEntryIds: [],
      sourceReservationIds: [],
    });

    const id = await upsertGuestForVisit(input());

    expect(id).toBe("guest-new");
    const data = guestCreate.mock.calls[0][0].data;
    expect(data.firstName).toBe("Ada");
    expect(data.fullName).toBe("Ada Lovelace");
    expect(data.normalizedEmail).toBe("ada@test.invalid");
    expect(data.normalizedPhone).toBeNull();
    expect(data.sourceQueueEntryIds).toEqual(["qe-1"]);
    expect(data.sourceReservationIds).toEqual([]);
  });

  it("creates a guest from a phone only and records the reservation", async () => {
    guestFindUnique.mockResolvedValue({
      id: "guest-new",
      locationId: "loc-1",
      sourceQueueEntryIds: [],
      sourceReservationIds: [],
    });

    await upsertGuestForVisit(
      input({
        email: null,
        phone: "81234567890",
        countryCode: "+62",
        queueEntryId: null,
        reservationId: "res-1",
      }),
    );

    const data = guestCreate.mock.calls[0][0].data;
    expect(data.normalizedPhone).toBe("6281234567890");
    expect(data.sourceReservationIds).toEqual(["res-1"]);
    expect(data.sourceQueueEntryIds).toEqual([]);
  });

  it("defaults the names and business username", async () => {
    guestFindUnique.mockResolvedValue({
      id: "guest-new",
      locationId: "loc-1",
      sourceQueueEntryIds: [],
      sourceReservationIds: [],
    });

    await upsertGuestForVisit(
      input({ firstName: "  ", lastName: null, businessUsername: undefined }),
    );

    const data = guestCreate.mock.calls[0][0].data;
    expect(data.firstName).toBeNull();
    expect(data.lastName).toBeNull();
    expect(data.fullName).toBeNull();
    expect(data.businessUsername).toBeNull();
  });

  it("keeps the details already stored on an existing guest", async () => {
    guestFindFirst.mockResolvedValue({
      id: "guest-1",
      firstName: "Existing",
      lastName: "Name",
      fullName: "Existing Name",
      phone: "555",
      email: "existing@test.invalid",
      normalizedPhone: "555000",
      normalizedEmail: "existing@test.invalid",
      businessUsername: "already",
      sourceQueueEntryIds: ["qe-0"],
      sourceReservationIds: [],
    });
    guestFindUnique.mockResolvedValue({
      id: "guest-1",
      locationId: "loc-1",
      sourceQueueEntryIds: ["qe-0", "qe-1"],
      sourceReservationIds: [],
    });

    const id = await upsertGuestForVisit(input());

    expect(id).toBe("guest-1");
    const data = guestUpdate.mock.calls[0][0].data;
    expect(data.firstName).toBe("Existing");
    expect(data.businessUsername).toBe("already");
    expect(data.sourceQueueEntryIds).toEqual(["qe-0", "qe-1"]);
  });

  it("fills the gaps on an existing guest", async () => {
    guestFindFirst.mockResolvedValue({
      id: "guest-1",
      firstName: null,
      lastName: null,
      fullName: null,
      phone: null,
      email: null,
      normalizedPhone: null,
      normalizedEmail: null,
      businessUsername: null,
      sourceQueueEntryIds: [],
      sourceReservationIds: [],
    });
    guestFindUnique.mockResolvedValue({
      id: "guest-1",
      locationId: "loc-1",
      sourceQueueEntryIds: [],
      sourceReservationIds: [],
    });

    await upsertGuestForVisit(input());

    const data = guestUpdate.mock.calls[0][0].data;
    expect(data.firstName).toBe("Ada");
    expect(data.email).toBe("ada@test.invalid");
    expect(data.businessUsername).toBe("bistro");
  });

  it("does not duplicate a visit id it already holds", async () => {
    guestFindFirst.mockResolvedValue({
      id: "guest-1",
      sourceQueueEntryIds: ["qe-1"],
      sourceReservationIds: [],
    });
    guestFindUnique.mockResolvedValue({
      id: "guest-1",
      locationId: "loc-1",
      sourceQueueEntryIds: ["qe-1"],
      sourceReservationIds: [],
    });

    await upsertGuestForVisit(input());

    expect(guestUpdate.mock.calls[0][0].data.sourceQueueEntryIds).toEqual(["qe-1"]);
  });

  it("leaves the id lists alone when no visit id is supplied", async () => {
    guestFindFirst.mockResolvedValue({
      id: "guest-1",
      sourceQueueEntryIds: ["qe-0"],
      sourceReservationIds: ["res-0"],
    });
    guestFindUnique.mockResolvedValue({
      id: "guest-1",
      locationId: "loc-1",
      sourceQueueEntryIds: ["qe-0"],
      sourceReservationIds: ["res-0"],
    });

    await upsertGuestForVisit(input({ queueEntryId: null }));

    expect(guestUpdate.mock.calls[0][0].data.sourceQueueEntryIds).toEqual(["qe-0"]);
  });
});

describe("recomputeGuestStats", () => {
  it("does nothing for an unknown guest", async () => {
    await recomputeGuestStats("guest-missing");

    expect(guestUpdate).not.toHaveBeenCalled();
  });

  it("skips the row lookups when a guest has no linked visits", async () => {
    guestFindUnique.mockResolvedValue({
      id: "guest-1",
      locationId: "loc-1",
      sourceQueueEntryIds: [],
      sourceReservationIds: [],
    });

    await recomputeGuestStats("guest-1");

    expect(queueEntryFindMany).not.toHaveBeenCalled();
    expect(reservationFindMany).not.toHaveBeenCalled();
    expect(guestUpdate.mock.calls[0][0].data.totalVisits).toBe(0);
  });

  it("recomputes from the linked visits", async () => {
    guestFindUnique.mockResolvedValue({
      id: "guest-1",
      locationId: "loc-1",
      sourceQueueEntryIds: ["qe-1"],
      sourceReservationIds: ["res-1"],
    });
    queueEntryFindMany.mockResolvedValue([queueRow()]);
    reservationFindMany.mockResolvedValue([resRow()]);

    await recomputeGuestStats("guest-1");

    const data = guestUpdate.mock.calls[0][0].data;
    expect(data.totalVisits).toBe(2);
    expect(data.summary).toContain("Returning guest");
  });
});

describe("guest sync helpers", () => {
  it("swallows a failure syncing from a queue entry", async () => {
    guestFindFirst.mockRejectedValue(new Error("db down"));

    await expect(
      syncGuestFromQueueEntry(
        {
          businessId: "biz-1",
          locationId: "loc-1",
          firstName: "Ada",
          lastName: "L",
          email: "ada@test.invalid",
          phone: null,
          countryCode: null,
          id: "qe-1",
        } as unknown as QueueEntry,
        { businessUsername: "bistro" },
      ),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("swallows a failure syncing from a reservation", async () => {
    guestFindFirst.mockRejectedValue("db exploded");

    await expect(
      syncGuestFromReservation({
        businessId: "biz-1",
        businessUsername: "from-row",
        locationId: "loc-1",
        firstName: "Ada",
        lastName: "L",
        email: "ada@test.invalid",
        phone: null,
        countryCode: null,
        id: "res-1",
      } as unknown as Reservation),
    ).resolves.toBeUndefined();
    expect((console.error as any).mock.calls[0][1]).toBe("db exploded");
  });

  it("recomputes the guest behind a queue entry", async () => {
    guestFindFirst.mockResolvedValue({ id: "guest-1" });
    guestFindUnique.mockResolvedValue({
      id: "guest-1",
      locationId: "loc-1",
      sourceQueueEntryIds: [],
      sourceReservationIds: [],
    });

    await touchGuestByQueueEntryId("qe-1");

    expect(guestUpdate).toHaveBeenCalled();
  });

  it("does nothing when no guest holds the queue entry", async () => {
    await touchGuestByQueueEntryId("qe-1");

    expect(guestUpdate).not.toHaveBeenCalled();
  });

  it("recomputes the guest behind a reservation", async () => {
    guestFindFirst.mockResolvedValue({ id: "guest-1" });
    guestFindUnique.mockResolvedValue({
      id: "guest-1",
      locationId: "loc-1",
      sourceQueueEntryIds: [],
      sourceReservationIds: [],
    });

    await touchGuestByReservationId("res-1");

    expect(guestUpdate).toHaveBeenCalled();
  });

  it("swallows failures from both touch helpers", async () => {
    guestFindFirst.mockRejectedValue(new Error("db down"));

    await expect(touchGuestByQueueEntryId("qe-1")).resolves.toBeUndefined();
    await expect(touchGuestByReservationId("res-1")).resolves.toBeUndefined();
  });
});

describe("guest badges", () => {
  it("indexes guests by phone and email", async () => {
    guestFindMany.mockResolvedValue([
      {
        normalizedPhone: "6281234567890",
        normalizedEmail: "ada@test.invalid",
        totalVisits: 4,
      },
      { normalizedPhone: null, normalizedEmail: null, totalVisits: 1 },
    ]);

    const map = await loadGuestBadgeMap("biz-1");

    expect(map.get("p:6281234567890")?.returning).toBe(true);
    expect(map.get("e:ada@test.invalid")?.totalVisits).toBe(4);
    expect(map.size).toBe(2);
  });

  it("matches a contact by phone first, then email", async () => {
    const map = new Map([
      ["p:6281234567890", { totalVisits: 5, returning: true }],
      ["e:ada@test.invalid", { totalVisits: 1, returning: false }],
    ]);

    expect(badgeForContact(map, { phone: "81234567890", countryCode: "+62" })?.totalVisits).toBe(5);
    expect(badgeForContact(map, { email: "ada@test.invalid" })?.totalVisits).toBe(1);
  });

  it("reports nothing for a contact it has never seen", () => {
    const map = new Map();

    expect(badgeForContact(map, { phone: "81234567890" })).toBeNull();
    expect(badgeForContact(map, { email: "nobody@test.invalid" })).toBeNull();
    expect(badgeForContact(map, {})).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reservationUpdateMany = vi.fn();
const reservationFindUnique = vi.fn();
const reservationUpdate = vi.fn();
const locationFindUnique = vi.fn();
const businessFindUnique = vi.fn();
const enqueueNotification = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      reservation: {
        updateMany: reservationUpdateMany,
        findUnique: reservationFindUnique,
        update: reservationUpdate,
      },
      location: { findUnique: locationFindUnique },
      business: { findUnique: businessFindUnique },
      floorPlan: { findMany: vi.fn(async () => []) },
      tableAssignment: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({})) },
      diningTable: { findFirst: vi.fn(async () => null) },
    },
  };
});

vi.mock("../../server/lib/notifications.js", () => {
  return { enqueueNotification };
});

const { assignOrFlagReservation, notifyReservationNeedsReview, readableReservationDate } =
  await import("../../server/lib/reservationTables.js");

const RESERVATION = "res-1";
const ORIGINAL_FRONTEND = process.env.FRONTEND_URL;

function reservationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RESERVATION,
    locationId: "loc-1",
    businessId: "biz-1",
    firstName: "Ada",
    lastName: "Lovelace",
    name: "Ada Lovelace",
    guestCount: 4,
    reservationDateTime: "2026-08-27T18:00",
    needsReviewReason: "NO_TABLE",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.FRONTEND_URL = "https://app.test";
  reservationUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  reservationFindUnique.mockReset().mockResolvedValue(reservationRow());
  reservationUpdate.mockReset().mockResolvedValue({});
  locationFindUnique.mockReset().mockResolvedValue({
    id: "loc-1",
    displayName: "The Japanese Restaurant",
    name: "Main",
    restaurantProfile: {},
  });
  businessFindUnique.mockReset().mockResolvedValue({ name: "Bistro", email: "owner@biz.test" });
  enqueueNotification.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  process.env.FRONTEND_URL = ORIGINAL_FRONTEND;
});

describe("readableReservationDate", () => {
  it("writes a readable label", () => {
    expect(readableReservationDate("2026-08-27")).toContain("Aug");
  });

  it("hands back a date it cannot read", () => {
    expect(readableReservationDate("not-a-date")).toBe("not-a-date");
  });
});

describe("notifyReservationNeedsReview", () => {
  it("queues the email with the booking details", async () => {
    expect(await notifyReservationNeedsReview(RESERVATION)).toBe(true);

    const job = enqueueNotification.mock.calls[0][0];
    expect(job.type).toBe("reservation_needs_review");
    expect(job.businessEmail).toBe("owner@biz.test");
    expect(job.locationName).toBe("The Japanese Restaurant");
    expect(job.customerName).toBe("Ada Lovelace");
    expect(job.partySize).toBe(4);
    expect(job.reservationId).toBe(RESERVATION);
    expect(job.reason).toBe("NO_TABLE");
    expect(job.reservationsUrl).toBe("https://app.test/business/reservations");
    expect(job.floorUrl).toBe("https://app.test/business/floor");
  });

  it("claims the booking before sending so it only goes out once", async () => {
    await notifyReservationNeedsReview(RESERVATION);

    const where = reservationUpdateMany.mock.calls[0][0].where;
    expect(where.needsReview).toBe(true);
    expect(where.OR).toEqual([
      { needsReviewNotifiedAt: null },
      { needsReviewNotifiedAt: { isSet: false } },
    ]);
  });

  it("stays quiet when the claim finds nothing to send", async () => {
    reservationUpdateMany.mockResolvedValue({ count: 0 });

    expect(await notifyReservationNeedsReview(RESERVATION)).toBe(false);
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("stays quiet when the reservation has gone", async () => {
    reservationFindUnique.mockResolvedValue(null);

    expect(await notifyReservationNeedsReview(RESERVATION)).toBe(false);
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("stays quiet when the location has gone", async () => {
    locationFindUnique.mockResolvedValue(null);

    expect(await notifyReservationNeedsReview(RESERVATION)).toBe(false);
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("stays quiet when no business email can be reached", async () => {
    businessFindUnique.mockResolvedValue({ name: "Bistro", email: null });

    expect(await notifyReservationNeedsReview(RESERVATION)).toBe(false);
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("builds the guest name from the parts when there is no full name", async () => {
    reservationFindUnique.mockResolvedValue(reservationRow({ name: "" }));

    await notifyReservationNeedsReview(RESERVATION);

    expect(enqueueNotification.mock.calls[0][0].customerName).toBe("Ada Lovelace");
  });

  it("falls back to Guest when no name was given", async () => {
    reservationFindUnique.mockResolvedValue(
      reservationRow({ name: "", firstName: "", lastName: "" }),
    );

    await notifyReservationNeedsReview(RESERVATION);

    expect(enqueueNotification.mock.calls[0][0].customerName).toBe("Guest");
  });

  it("falls back through the location labels", async () => {
    locationFindUnique.mockResolvedValue({
      id: "loc-1",
      displayName: null,
      name: "Main Street",
      restaurantProfile: {},
    });

    await notifyReservationNeedsReview(RESERVATION);

    expect(enqueueNotification.mock.calls[0][0].locationName).toBe("Main Street");
  });

  it("falls back to the business name when the location has no label", async () => {
    locationFindUnique.mockResolvedValue({
      id: "loc-1",
      displayName: null,
      name: null,
      restaurantProfile: {},
    });

    await notifyReservationNeedsReview(RESERVATION);

    expect(enqueueNotification.mock.calls[0][0].locationName).toBe("Bistro");
  });

  it("falls back again when even the business has no name", async () => {
    locationFindUnique.mockResolvedValue({
      id: "loc-1",
      displayName: null,
      name: null,
      restaurantProfile: {},
    });
    businessFindUnique.mockResolvedValue({ name: null, email: "owner@biz.test" });

    await notifyReservationNeedsReview(RESERVATION);

    expect(enqueueNotification.mock.calls[0][0].locationName).toBe("your restaurant");
  });

  it("uses the public site when no frontend url is configured", async () => {
    delete process.env.FRONTEND_URL;

    await notifyReservationNeedsReview(RESERVATION);

    expect(enqueueNotification.mock.calls[0][0].floorUrl).toBe(
      "https://www.seatping.biz/business/floor",
    );
  });

  it("trims a trailing slash from the configured url", async () => {
    process.env.FRONTEND_URL = "https://app.test/";

    await notifyReservationNeedsReview(RESERVATION);

    expect(enqueueNotification.mock.calls[0][0].floorUrl).toBe("https://app.test/business/floor");
  });
});

describe("a notification that blows up", () => {
  function flagInput() {
    return {
      businessId: "biz-1",
      locationId: "loc-1",
      reservationId: RESERVATION,
      partySize: 4,
      window: {
        start: new Date("2026-08-27T18:00:00.000Z"),
        end: new Date("2026-08-27T19:30:00.000Z"),
      },
      inventory: { setups: [], occupancy: [] },
    };
  }

  it("still flags the reservation when the notice throws an error", async () => {
    reservationUpdateMany.mockRejectedValue(new Error("mongo down"));

    expect(await assignOrFlagReservation(flagInput())).toBeNull();
    expect(reservationUpdate).toHaveBeenCalledWith({
      where: { id: RESERVATION },
      data: { needsReview: true, needsReviewReason: "NO_TABLE" },
    });
  });

  it("survives a thrown value that carries no message", async () => {
    reservationUpdateMany.mockRejectedValue("just a string");

    expect(await assignOrFlagReservation(flagInput())).toBeNull();
  });
});

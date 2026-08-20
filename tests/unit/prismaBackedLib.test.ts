import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ticketCount = vi.fn();
const slotCounterUpsert = vi.fn();
const slotCounterUpdateMany = vi.fn();
const slotCounterDeleteMany = vi.fn();
const slotCounterCreate = vi.fn();
const reservationFindMany = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      ticket: { count: ticketCount },
      slotCounter: {
        upsert: slotCounterUpsert,
        updateMany: slotCounterUpdateMany,
        deleteMany: slotCounterDeleteMany,
        create: slotCounterCreate,
      },
      reservation: { findMany: reservationFindMany },
    },
  };
});

const { generateTicketNumber } = await import("../../server/lib/tickets.js");
const {
  addCapacity,
  applyStatusCapacityDelta,
  bucketOf,
  recountSlots,
  releaseCapacity,
  tryReserveCapacity,
} = await import("../../server/lib/reservationCapacity.js");

beforeEach(() => {
  ticketCount.mockReset();
  slotCounterUpsert.mockReset().mockResolvedValue({});
  slotCounterUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  slotCounterDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  slotCounterCreate.mockReset().mockResolvedValue({});
  reservationFindMany.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("generateTicketNumber", () => {
  it("numbers the first ticket of the day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T09:00:00.000Z"));
    ticketCount.mockResolvedValue(0);

    await expect(generateTicketNumber("SALES")).resolves.toBe("SALES-20260812-0001");
  });

  it("continues the daily sequence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T09:00:00.000Z"));
    ticketCount.mockResolvedValue(41);

    await expect(generateTicketNumber("FEEDBACK")).resolves.toBe("FEEDBACK-20260812-0042");
  });

  it("counts only tickets of the same type within the day", async () => {
    ticketCount.mockResolvedValue(0);

    await generateTicketNumber("FEEDBACK");

    const where = ticketCount.mock.calls[0][0].where;
    expect(where.type).toBe("feedback");
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.createdAt.lte.getTime()).toBeGreaterThan(where.createdAt.gte.getTime());
  });
});

describe("bucketOf", () => {
  it("splits a reservation timestamp into a date key and hour", () => {
    expect(bucketOf("2026-08-12T19:30")).toEqual({
      dateKey: "2026-08-12",
      hour: 19,
    });
  });

  it("treats an unparseable time as midnight", () => {
    expect(bucketOf("2026-08-12").hour).toBe(0);
  });
});

describe("tryReserveCapacity", () => {
  it("allows a party of zero without touching the counter", async () => {
    await expect(tryReserveCapacity("loc-1", "2026-08-12", 19, 0, 40)).resolves.toBe(true);
    expect(slotCounterUpsert).not.toHaveBeenCalled();
  });

  it("refuses a party larger than the whole hourly cap", async () => {
    await expect(tryReserveCapacity("loc-1", "2026-08-12", 19, 41, 40)).resolves.toBe(false);
    expect(slotCounterUpdateMany).not.toHaveBeenCalled();
  });

  it("increments the counter only while headroom remains", async () => {
    await expect(tryReserveCapacity("loc-1", "2026-08-12", 19, 4, 40)).resolves.toBe(true);

    const args = slotCounterUpdateMany.mock.calls[0][0];
    expect(args.where.reservedGuests).toEqual({ lte: 36 });
    expect(args.data.reservedGuests).toEqual({ increment: 4 });
  });

  it("reports failure when the guarded update matches nothing", async () => {
    slotCounterUpdateMany.mockResolvedValue({ count: 0 });

    await expect(tryReserveCapacity("loc-1", "2026-08-12", 19, 4, 40)).resolves.toBe(false);
  });
});

describe("addCapacity and releaseCapacity", () => {
  it("ignores a non-positive party size", async () => {
    await addCapacity("loc-1", "2026-08-12", 19, 0);
    await releaseCapacity("loc-1", "2026-08-12", 19, -2);

    expect(slotCounterUpsert).not.toHaveBeenCalled();
    expect(slotCounterUpdateMany).not.toHaveBeenCalled();
  });

  it("creates the counter at the party size on first add", async () => {
    await addCapacity("loc-1", "2026-08-12", 19, 3);

    const args = slotCounterUpsert.mock.calls[0][0];
    expect(args.create.reservedGuests).toBe(3);
    expect(args.update.reservedGuests).toEqual({ increment: 3 });
  });

  it("never decrements below the party size already held", async () => {
    await releaseCapacity("loc-1", "2026-08-12", 19, 3);

    const args = slotCounterUpdateMany.mock.calls[0][0];
    expect(args.where.reservedGuests).toEqual({ gte: 3 });
    expect(args.data.reservedGuests).toEqual({ decrement: 3 });
  });
});

describe("applyStatusCapacityDelta", () => {
  function change(oldStatus: string, newStatus: string) {
    return applyStatusCapacityDelta({
      locationId: "loc-1",
      reservationDateTime: "2026-08-12T19:30",
      guestCount: 2,
      oldStatus,
      newStatus,
    });
  }

  it("does nothing when the reservation stays active", async () => {
    await change("CONFIRMED", "ARRIVED");

    expect(slotCounterUpsert).not.toHaveBeenCalled();
    expect(slotCounterUpdateMany).not.toHaveBeenCalled();
  });

  it("does nothing when the reservation stays inactive", async () => {
    await change("CANCELLED", "NO_SHOW");

    expect(slotCounterUpsert).not.toHaveBeenCalled();
    expect(slotCounterUpdateMany).not.toHaveBeenCalled();
  });

  it("releases the seats when an active reservation ends", async () => {
    await change("CONFIRMED", "CANCELLED");

    expect(slotCounterUpdateMany).toHaveBeenCalledTimes(1);
    expect(slotCounterUpsert).not.toHaveBeenCalled();
  });

  it("takes the seats back when a reservation is reactivated", async () => {
    await change("CANCELLED", "CONFIRMED");

    expect(slotCounterUpsert).toHaveBeenCalledTimes(1);
  });

  it("skips the change when the reservation has no usable date", async () => {
    await applyStatusCapacityDelta({
      locationId: "loc-1",
      reservationDateTime: "",
      guestCount: 2,
      oldStatus: "CONFIRMED",
      newStatus: "CANCELLED",
    });

    expect(slotCounterUpdateMany).not.toHaveBeenCalled();
  });
});

describe("recountSlots", () => {
  it("rebuilds one counter per date and hour bucket", async () => {
    reservationFindMany.mockResolvedValue([
      { reservationDateTime: "2026-08-12T19:30", guestCount: 2 },
      { reservationDateTime: "2026-08-12T19:45", guestCount: 3 },
      { reservationDateTime: "2026-08-12T20:00", guestCount: 4 },
    ]);

    await recountSlots("loc-1");

    expect(slotCounterDeleteMany).toHaveBeenCalledWith({
      where: { locationId: "loc-1" },
    });
    const created = slotCounterCreate.mock.calls.map(([arg]) => arg.data);
    expect(created).toEqual([
      { locationId: "loc-1", dateKey: "2026-08-12", hour: 19, reservedGuests: 5 },
      { locationId: "loc-1", dateKey: "2026-08-12", hour: 20, reservedGuests: 4 },
    ]);
  });

  it("skips reservations with no usable date and non-numeric guest counts", async () => {
    reservationFindMany.mockResolvedValue([
      { reservationDateTime: "", guestCount: 5 },
      { reservationDateTime: "2026-08-12T19:30", guestCount: "not a number" },
    ]);

    await recountSlots("loc-1");

    expect(slotCounterCreate.mock.calls.map(([arg]) => arg.data)).toEqual([
      { locationId: "loc-1", dateKey: "2026-08-12", hour: 19, reservedGuests: 0 },
    ]);
  });

  it("clears every counter when nothing is active", async () => {
    await recountSlots("loc-1");

    expect(slotCounterDeleteMany).toHaveBeenCalledTimes(1);
    expect(slotCounterCreate).not.toHaveBeenCalled();
  });
});

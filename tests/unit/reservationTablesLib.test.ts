import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/lib/prisma.js", () => {
  return { prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } };
});

const {
  DEFAULT_RESERVATION_SETTINGS,
  computeAvailability,
  hasTableForWindow,
  reservationWindow,
  tablesForWindow,
  validateReservationRequest,
  zonedWallTimeToMs,
} = await import("../../server/lib/reservations.js");

type Inventory = Parameters<typeof hasTableForWindow>[0];

const TODAY = "2026-08-12";
const NOW = new Date("2026-08-12T04:00:00.000Z");

const SETTINGS = {
  ...DEFAULT_RESERVATION_SETTINGS,
  reservationStartTime: "11:00",
  reservationEndTime: "22:00",
  maxPartySize: 12,
  maxReservedGuestsPerHour: 0,
  minNoticeMinutes: 0,
  defaultReservationDurationMinutes: 90,
};

function openAllDay() {
  const day = { enabled: true, open: "00:00", close: "23:59" };
  return {
    timezone: "UTC",
    monday: day,
    tuesday: day,
    wednesday: day,
    thursday: day,
    friday: day,
    saturday: day,
    sunday: day,
  };
}

function table(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    name: "T1",
    roomId: "room-main",
    roomName: "Main",
    capacity: 4,
    minimumPartySize: 1,
    isBlocked: false,
    cleaningSince: null,
    ...overrides,
  };
}

function at(time: string): Date {
  return new Date(zonedWallTimeToMs(TODAY, time, "UTC"));
}

function windowAt(time: string, minutes = 90) {
  return reservationWindow(zonedWallTimeToMs(TODAY, time, "UTC"), minutes);
}

function inventory(overrides: Partial<Inventory> = {}): Inventory {
  return { setups: [table()], occupancy: [], ...overrides } as Inventory;
}

describe("reservationWindow", () => {
  it("runs from the reservation time for the configured duration", () => {
    const window = windowAt("19:00", 90);

    expect(window.start.toISOString()).toBe("2026-08-12T19:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-08-12T20:30:00.000Z");
  });
});

describe("tablesForWindow", () => {
  it("offers a free table that fits the party", () => {
    const ordered = tablesForWindow(inventory(), 4, windowAt("19:00"), NOW);

    expect(ordered.map((setup) => setup.id)).toEqual(["t1"]);
  });

  it("prefers the tightest fit when several tables work", () => {
    const stock = inventory({
      setups: [
        table({ id: "big", name: "T9", capacity: 10 }),
        table({ id: "snug", name: "T2", capacity: 4 }),
      ],
    });

    const ordered = tablesForWindow(stock, 4, windowAt("19:00"), NOW);

    expect(ordered[0].id).toBe("snug");
  });

  it("leaves out a table that is too small", () => {
    expect(tablesForWindow(inventory(), 9, windowAt("19:00"), NOW)).toEqual([]);
  });

  it("leaves out a blocked table", () => {
    const stock = inventory({ setups: [table({ isBlocked: true })] });

    expect(tablesForWindow(stock, 2, windowAt("19:00"), NOW)).toEqual([]);
  });

  it("leaves out a table below its minimum party size", () => {
    const stock = inventory({ setups: [table({ minimumPartySize: 4 })] });

    expect(tablesForWindow(stock, 2, windowAt("19:00"), NOW)).toEqual([]);
  });
});

describe("hasTableForWindow", () => {
  it("counts a booking that overlaps the start of the window", () => {
    const stock = inventory({
      occupancy: [{ tableId: "t1", start: at("18:00"), end: at("19:30") }],
    });

    expect(hasTableForWindow(stock, 2, windowAt("19:00"), NOW)).toBe(false);
  });

  it("counts a booking that only overlaps the tail of the window", () => {
    const stock = inventory({
      occupancy: [{ tableId: "t1", start: at("20:00"), end: at("21:30") }],
    });

    expect(hasTableForWindow(stock, 2, windowAt("19:00"), NOW)).toBe(false);
  });

  it("allows a booking that ends exactly when the window opens", () => {
    const stock = inventory({
      occupancy: [{ tableId: "t1", start: at("17:30"), end: at("19:00") }],
    });

    expect(hasTableForWindow(stock, 2, windowAt("19:00"), NOW)).toBe(true);
  });

  it("allows a booking that starts exactly when the window closes", () => {
    const stock = inventory({
      occupancy: [{ tableId: "t1", start: at("20:30"), end: at("22:00") }],
    });

    expect(hasTableForWindow(stock, 2, windowAt("19:00"), NOW)).toBe(true);
  });

  it("ignores a booking on a different table", () => {
    const stock = inventory({
      occupancy: [{ tableId: "somewhere-else", start: at("19:00"), end: at("20:30") }],
    });

    expect(hasTableForWindow(stock, 2, windowAt("19:00"), NOW)).toBe(true);
  });

  it("says no when the location has no tables at all", () => {
    expect(hasTableForWindow({ setups: [], occupancy: [] }, 2, windowAt("19:00"), NOW)).toBe(false);
  });
});

function availability(overrides: Record<string, unknown> = {}) {
  return computeAvailability({
    settings: SETTINGS,
    reservations: [],
    date: TODAY,
    partySize: 2,
    now: NOW,
    timeZone: "UTC",
    openingHours: openAllDay(),
    ...overrides,
  });
}

describe("availability with table inventory", () => {
  it("leaves slots open when no inventory is supplied", () => {
    const { slots } = availability();

    expect(slots.every((slot) => slot.available)).toBe(true);
  });

  it("reports no remaining seats when the guest cap is switched off", () => {
    const { slots } = availability();

    expect(slots[0].remaining).toBeNull();
  });

  it("still reports the headroom when a guest cap is configured", () => {
    const { slots } = availability({
      settings: { ...SETTINGS, maxReservedGuestsPerHour: 20 },
    });

    expect(slots[0].remaining).toBe(20);
  });

  it("closes the slots a booking already covers", () => {
    const { slots } = availability({
      inventory: inventory({
        occupancy: [{ tableId: "t1", start: at("19:00"), end: at("20:30") }],
      }),
    });

    const nineteen = slots.find((slot) => slot.time === "19:00");
    const eighteen = slots.find((slot) => slot.time === "18:00");
    const clear = slots.find((slot) => slot.time === "17:30");

    expect(nineteen?.available).toBe(false);
    expect(nineteen?.reason).toBe("no_table");
    expect(eighteen?.available).toBe(false);
    expect(clear?.available).toBe(true);
  });

  it("closes an earlier slot whose occupancy window runs into a booking", () => {
    const { slots } = availability({
      inventory: inventory({
        occupancy: [{ tableId: "t1", start: at("20:00"), end: at("21:30") }],
      }),
    });

    const nineteen = slots.find((slot) => slot.time === "19:00");

    expect(nineteen?.available).toBe(false);
    expect(nineteen?.reason).toBe("no_table");
  });

  it("closes every slot when the party outgrows the whole floor", () => {
    const { slots } = availability({ partySize: 10, inventory: inventory() });

    expect(slots.every((slot) => slot.reason === "no_table")).toBe(true);
  });

  it("uses the configured duration when measuring conflicts", () => {
    const shortTurn = { ...SETTINGS, defaultReservationDurationMinutes: 30 };
    const stock = inventory({
      occupancy: [{ tableId: "t1", start: at("20:00"), end: at("21:30") }],
    });

    const long = availability({ inventory: stock });
    const short = availability({ settings: shortTurn, inventory: stock });

    expect(long.slots.find((slot) => slot.time === "19:00")?.available).toBe(false);
    expect(short.slots.find((slot) => slot.time === "19:00")?.available).toBe(true);
  });
});

describe("validating a request against table inventory", () => {
  function validate(overrides: Record<string, unknown> = {}) {
    return validateReservationRequest({
      settings: SETTINGS,
      reservations: [],
      date: TODAY,
      time: "19:00",
      partySize: 2,
      now: NOW,
      timeZone: "UTC",
      openingHours: openAllDay(),
      ...overrides,
    });
  }

  it("accepts a booking a free table can hold", () => {
    expect(validate({ inventory: inventory() })).toBeNull();
  });

  it("explains that no table is free for the party", () => {
    const error = validate({
      inventory: inventory({
        occupancy: [{ tableId: "t1", start: at("19:00"), end: at("20:30") }],
      }),
    });

    expect(error).toContain("do not have a table free");
    expect(error).toContain("party of 2");
  });

  it("accepts a booking when the location tracks no tables", () => {
    expect(validate({ inventory: null })).toBeNull();
  });
});

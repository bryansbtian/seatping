import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const userUpdate = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: { user: { findUnique: userFindUnique, update: userUpdate } },
  };
});

const {
  DEFAULT_RESERVATION_SETTINGS,
  computeAvailability,
  normalizeSettings,
  serializeReservation,
  syncCustomerReservation,
  validateReservationRequest,
  zonedDateStr,
  zonedWallTimeToMs,
} = await import("../../server/lib/reservations.js");

const SETTINGS = {
  ...DEFAULT_RESERVATION_SETTINGS,
  reservationStartTime: "11:00",
  reservationEndTime: "22:00",
  maxPartySize: 8,
  maxReservedGuestsPerHour: 20,
  bookingWindowDays: 30,
  minNoticeMinutes: 0,
};

const NOW = new Date("2026-08-12T04:00:00.000Z");
const TODAY = "2026-08-12";

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

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-other",
    status: "confirmed",
    reservationDateTime: `${TODAY}T19:00`,
    partySize: 4,
    ...overrides,
  };
}

beforeEach(() => {
  userFindUnique.mockReset().mockResolvedValue({
    upcomingReservations: [],
    pastReservations: [],
  });
  userUpdate.mockReset().mockResolvedValue({});
});

describe("normalizeSettings", () => {
  it("falls back to the defaults for a non-object", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_RESERVATION_SETTINGS);
    expect(normalizeSettings("nonsense")).toEqual(DEFAULT_RESERVATION_SETTINGS);
  });

  it("keeps the manual confirmation mode", () => {
    expect(normalizeSettings({ confirmationMode: "manual" }).confirmationMode).toBe("manual");
    expect(normalizeSettings({ confirmationMode: "other" }).confirmationMode).toBe("auto");
  });

  it("truncates a very long cancellation policy", () => {
    const long = normalizeSettings({ cancellationPolicy: "x".repeat(1500) });

    expect(long.cancellationPolicy).toHaveLength(1000);
    expect(normalizeSettings({ cancellationPolicy: 7 }).cancellationPolicy).toBe("");
  });

  it("clamps the numeric settings into range", () => {
    const clamped = normalizeSettings({
      maxPartySize: 500,
      maxReservedGuestsPerHour: 0,
      bookingWindowDays: -5,
      minNoticeMinutes: 999999,
    });

    expect(clamped.maxPartySize).toBe(100);
    expect(clamped.maxReservedGuestsPerHour).toBe(1);
    expect(clamped.bookingWindowDays).toBe(0);
    expect(clamped.minNoticeMinutes).toBe(7 * 24 * 60);
  });

  it("falls back for numbers that cannot be read", () => {
    const out = normalizeSettings({ maxPartySize: "eight" });

    expect(out.maxPartySize).toBe(DEFAULT_RESERVATION_SETTINGS.maxPartySize);
  });

  it("rejects a malformed time", () => {
    const out = normalizeSettings({
      reservationStartTime: "9am",
      reservationEndTime: "25:00",
    });

    expect(out.reservationStartTime).toBe(DEFAULT_RESERVATION_SETTINGS.reservationStartTime);
    expect(out.reservationEndTime).toBe(DEFAULT_RESERVATION_SETTINGS.reservationEndTime);
  });
});

describe("zoned time helpers", () => {
  it("reads a wall clock without a timezone as local time", () => {
    const ms = zonedWallTimeToMs("2026-08-12", "19:00");

    expect(ms).toBe(new Date("2026-08-12T19:00:00").getTime());
  });

  it("reads a wall clock in the given timezone", () => {
    expect(zonedWallTimeToMs("2026-08-12", "19:00", "UTC")).toBe(Date.UTC(2026, 7, 12, 19, 0));
    expect(zonedWallTimeToMs("2026-08-12", "19:00", "Asia/Jakarta")).toBe(
      Date.UTC(2026, 7, 12, 12, 0),
    );
  });

  it("falls back to local time for an unusable timezone", () => {
    const ms = zonedWallTimeToMs("2026-08-12", "19:00", "Not/AZone");

    expect(ms).toBe(new Date("2026-08-12T19:00:00").getTime());
  });

  it("formats a date without a timezone using local parts", () => {
    const at = new Date(2026, 7, 12, 12, 0);

    expect(zonedDateStr(at)).toBe("2026-08-12");
  });

  it("formats a date in the given timezone", () => {
    const at = new Date("2026-08-12T20:00:00.000Z");

    expect(zonedDateStr(at, "UTC")).toBe("2026-08-12");
    expect(zonedDateStr(at, "Asia/Jakarta")).toBe("2026-08-13");
  });

  it("falls back to local formatting for an unusable timezone", () => {
    const at = new Date(2026, 7, 12, 12, 0);

    expect(zonedDateStr(at, "Not/AZone")).toBe("2026-08-12");
  });
});

describe("computeAvailability", () => {
  it("returns slots across the reservation window", () => {
    const { slots, partyTooLarge, outsideWindow } = availability();

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].time).toBe("11:00");
    expect(slots[0].label).toEqual(expect.any(String));
    expect(partyTooLarge).toBe(false);
    expect(outsideWindow).toBe(false);
  });

  it("returns no slots for a malformed date", () => {
    const { slots, operatingStatus } = availability({ date: "not-a-date" });

    expect(slots).toEqual([]);
    expect(operatingStatus).toBeDefined();
  });

  it("returns no slots on a closed day", () => {
    const closed = { ...openAllDay(), wednesday: { enabled: false } };

    expect(availability({ openingHours: closed }).slots).toEqual([]);
  });

  it("marks every slot unavailable for an oversized party", () => {
    const { slots, partyTooLarge } = availability({ partySize: 20 });

    expect(partyTooLarge).toBe(true);
    expect(slots.every((s) => s.available === false)).toBe(true);
    expect(slots[0].reason).toBe("party_too_large");
  });

  it("marks slots closed for a date beyond the booking window", () => {
    const { slots, outsideWindow } = availability({ date: "2027-08-12" });

    expect(outsideWindow).toBe(true);
    expect(slots[0].reason).toBe("closed");
  });

  it("marks slots closed for a date in the past", () => {
    const { outsideWindow } = availability({ date: "2026-08-01" });

    expect(outsideWindow).toBe(true);
  });

  it("marks a slot too soon when it falls inside the notice period", () => {
    const { slots } = availability({
      settings: { ...SETTINGS, minNoticeMinutes: 24 * 60 },
    });

    expect(slots[0].reason).toBe("too_soon");
  });

  it("marks an hour full once its capacity is taken", () => {
    const { slots } = availability({
      reservations: [booking({ partySize: 19 }), booking({ id: "res-2", partySize: 1 })],
      partySize: 2,
    });

    const nineteen = slots.find((s) => s.time === "19:00");
    expect(nineteen?.available).toBe(false);
    expect(nineteen?.reason).toBe("full");
    expect(nineteen?.remaining).toBe(0);
  });

  it("excludes the reservation being edited from the capacity count", () => {
    const { slots } = availability({
      reservations: [booking({ id: "res-1", partySize: 20 })],
      excludeId: "res-1",
    });

    expect(slots.find((s) => s.time === "19:00")?.available).toBe(true);
  });

  it("ignores reservations for other dates, hours and statuses", () => {
    const { slots } = availability({
      reservations: [
        booking({ reservationDateTime: "2026-08-13T19:00", partySize: 20 }),
        booking({ id: "b", reservationDateTime: `${TODAY}T12:00`, partySize: 20 }),
        booking({ id: "c", status: "cancelled", partySize: 20 }),
        null,
      ],
    });

    expect(slots.find((s) => s.time === "19:00")?.available).toBe(true);
  });

  it("treats an unreadable party size as zero", () => {
    const { slots } = availability({
      reservations: [booking({ partySize: "many" })],
    });

    expect(slots.find((s) => s.time === "19:00")?.remaining).toBe(20);
  });

  it("skips minutes outside the operating hours", () => {
    const lunchOnly = {
      ...openAllDay(),
      wednesday: { enabled: true, open: "11:00", close: "14:00" },
    };

    const { slots } = availability({ openingHours: lunchOnly });

    expect(slots.every((s) => s.time < "14:00")).toBe(true);
  });
});

describe("validateReservationRequest", () => {
  it("accepts a bookable request", () => {
    expect(validate()).toBeNull();
  });

  it("rejects a malformed date or time", () => {
    expect(validate({ date: "12-08-2026" })).toBe("A valid date is required.");
    expect(validate({ time: "7pm" })).toBe("A valid time is required.");
  });

  it("rejects a party size that is not a whole number of guests", () => {
    expect(validate({ partySize: 0 })).toBe("Number of guests must be at least 1.");
    expect(validate({ partySize: 2.5 })).toBe("Number of guests must be at least 1.");
  });

  it("rejects a party larger than the restaurant accepts", () => {
    expect(validate({ partySize: 20 })).toContain("parties of up to 8");
  });

  it("rejects a date beyond the booking window", () => {
    expect(validate({ date: "2027-08-12" })).toContain("30 days in advance");
  });

  it("rejects a closed day", () => {
    const closed = { ...openAllDay(), wednesday: { enabled: false } };

    expect(validate({ openingHours: closed })).toContain("closed on");
  });

  it("explains a time outside the operating hours", () => {
    const lunchOnly = {
      ...openAllDay(),
      wednesday: { enabled: true, open: "11:00", close: "14:00" },
    };

    expect(validate({ time: "20:00", openingHours: lunchOnly })).toContain("operating hours");
  });

  it("explains a time outside reservation hours when no hours are configured", () => {
    expect(validate({ time: "23:00", openingHours: undefined })).toBe(
      "That time is outside reservation hours.",
    );
  });

  it("explains the notice period", () => {
    const message = validate({
      settings: { ...SETTINGS, minNoticeMinutes: 24 * 60 },
      time: "11:00",
    });

    expect(message).toContain("at least 1440 minutes notice");
  });

  it("explains a fully booked hour", () => {
    const message = validate({
      reservations: [booking({ partySize: 20 })],
    });

    expect(message).toContain("fully booked");
  });
});

describe("serializeReservation", () => {
  it("defaults every optional field", () => {
    const out = serializeReservation({ id: "res-1" });

    expect(out.locationId).toBeNull();
    expect(out.businessUsername).toBeNull();
    expect(out.firstName).toBe("");
    expect(out.lastName).toBe("");
    expect(out.name).toBe("");
    expect(out.contactMethod).toBeNull();
    expect(out.phone).toBe("");
    expect(out.countryCode).toBe("");
    expect(out.email).toBe("");
    expect(out.partySize).toBe(0);
    expect(out.reservationDateTime).toBeNull();
    expect(out.notes).toBe("");
    expect(out.status).toBe("confirmed");
    expect(out.source).toBe("seatping_public");
    expect((out as any).manageToken).toBeUndefined();
  });

  it("builds a name from the parts when there is none stored", () => {
    expect(serializeReservation({ firstName: "Ada", lastName: "Lovelace" }).name).toBe(
      "Ada Lovelace",
    );
  });

  it("keeps the stored values", () => {
    const out = serializeReservation({
      id: "res-1",
      locationId: "loc-1",
      businessUsername: "bistro",
      name: "A. Lovelace",
      contactMethod: "email",
      phone: "5551234567",
      countryCode: "+1",
      email: "ada@test.invalid",
      partySize: 4,
      reservationDateTime: `${TODAY}T19:00`,
      notes: "Window seat",
      status: "arrived",
      source: "walk_in",
    });

    expect(out.name).toBe("A. Lovelace");
    expect(out.partySize).toBe(4);
    expect(out.notes).toBe("Window seat");
    expect(out.status).toBe("arrived");
    expect(out.source).toBe("walk_in");
  });

  it("includes the manage token only when asked", () => {
    const out = serializeReservation({ id: "res-1", manageToken: "mt-1" }, { includeToken: true });

    expect(out.manageToken).toBe("mt-1");
    expect(serializeReservation({ id: "res-1" }, { includeToken: true }).manageToken).toBeNull();
  });
});

describe("syncCustomerReservation", () => {
  function reservation(overrides: Record<string, unknown> = {}) {
    return {
      id: "res-1",
      customerId: "cust-1",
      manageToken: "mt-1",
      locationId: "loc-1",
      businessUsername: "bistro",
      reservationDateTime: `${TODAY}T19:00`,
      partySize: 2,
      status: "confirmed",
      createdAt: "2026-08-01T00:00:00.000Z",
      ...overrides,
    };
  }

  function saved() {
    return userUpdate.mock.calls[0][0].data;
  }

  it("does nothing for a reservation with no customer", async () => {
    await syncCustomerReservation(reservation({ customerId: null }));
    await syncCustomerReservation(null);

    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("does nothing when the customer is gone", async () => {
    userFindUnique.mockResolvedValue(null);

    await syncCustomerReservation(reservation());

    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("files an active reservation under upcoming", async () => {
    await syncCustomerReservation(reservation(), {
      businessName: "Bistro",
      locationName: "Downtown",
    });

    expect(saved().upcomingReservations).toHaveLength(1);
    expect(saved().pastReservations).toEqual([]);
    expect(saved().upcomingReservations[0].businessName).toBe("Bistro");
    expect(saved().upcomingReservations[0].locationName).toBe("Downtown");
    expect(saved().upcomingReservations[0].date).toBe(TODAY);
    expect(saved().upcomingReservations[0].time).toBe("19:00");
    expect(saved().upcomingReservations[0].people).toBe(2);
  });

  it("files a finished reservation under past", async () => {
    await syncCustomerReservation(reservation({ status: "cancelled" }));

    expect(saved().upcomingReservations).toEqual([]);
    expect(saved().pastReservations).toHaveLength(1);
  });

  it("defaults the optional labels", async () => {
    await syncCustomerReservation(
      reservation({ manageToken: null, locationId: null, businessUsername: null, createdAt: null }),
    );

    const entry = saved().upcomingReservations[0];
    expect(entry.manageToken).toBeNull();
    expect(entry.locationId).toBeNull();
    expect(entry.businessUsername).toBeNull();
    expect(entry.businessName).toBeNull();
    expect(entry.locationName).toBeNull();
    expect(entry.createdAt).toBeNull();
  });

  it("treats an unreadable party size as zero", async () => {
    await syncCustomerReservation(reservation({ partySize: "many" }));

    expect(saved().upcomingReservations[0].people).toBe(0);
  });

  it("replaces an earlier copy in both lists", async () => {
    userFindUnique.mockResolvedValue({
      upcomingReservations: [{ id: "res-1" }, { id: "res-keep" }],
      pastReservations: [{ id: "res-1" }, { id: "past-keep" }],
    });

    await syncCustomerReservation(reservation());

    expect(saved().upcomingReservations.map((r: any) => r.id)).toEqual(["res-1", "res-keep"]);
    expect(saved().pastReservations.map((r: any) => r.id)).toEqual(["past-keep"]);
  });

  it("tolerates stored lists of the wrong shape", async () => {
    userFindUnique.mockResolvedValue({
      upcomingReservations: "not a list",
      pastReservations: null,
    });

    await syncCustomerReservation(reservation());

    expect(saved().upcomingReservations).toHaveLength(1);
    expect(saved().pastReservations).toEqual([]);
  });
});

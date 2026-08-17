import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESERVATION_SETTINGS,
  buildReservationDateTime,
  computeAvailability,
  formatTimeLabel,
  normalizeSettings,
  splitDateTime,
  validateReservationRequest,
} from "../../server/lib/reservations.js";

const settings = {
  ...DEFAULT_RESERVATION_SETTINGS,
  reservationStartTime: "09:00",
  reservationEndTime: "22:00",
  maxPartySize: 8,
  maxReservedGuestsPerHour: 10,
  bookingWindowDays: 30,
  minNoticeMinutes: 60,
};

const NOW = new Date("2026-06-08T00:00:00.000Z");

function dateDaysAhead(days: number): string {
  const d = new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

describe("normalizeSettings", () => {
  it("falls back to defaults for an empty object", () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_RESERVATION_SETTINGS);
  });

  it("falls back to defaults for null and non-object input", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_RESERVATION_SETTINGS);
    expect(normalizeSettings("nope")).toEqual(DEFAULT_RESERVATION_SETTINGS);
  });

  it("rejects malformed times and keeps the default", () => {
    const s = normalizeSettings({
      reservationStartTime: "9am",
      reservationEndTime: "25:00",
    });

    expect(s.reservationStartTime).toBe(
      DEFAULT_RESERVATION_SETTINGS.reservationStartTime,
    );
    expect(s.reservationEndTime).toBe(
      DEFAULT_RESERVATION_SETTINGS.reservationEndTime,
    );
  });

  it("accepts well formed times", () => {
    const s = normalizeSettings({
      reservationStartTime: "08:30",
      reservationEndTime: "23:59",
    });

    expect(s.reservationStartTime).toBe("08:30");
    expect(s.reservationEndTime).toBe("23:59");
  });

  it("clamps numeric settings into their supported range", () => {
    const tooSmall = normalizeSettings({
      maxPartySize: -10,
      maxReservedGuestsPerHour: -1,
      bookingWindowDays: 0,
    });
    const tooLarge = normalizeSettings({
      maxPartySize: 100000,
      maxReservedGuestsPerHour: 100000,
      bookingWindowDays: 100000,
    });

    expect(tooSmall.maxPartySize).toBeGreaterThanOrEqual(1);
    expect(tooLarge.maxPartySize).toBeLessThan(100000);
    expect(tooSmall.bookingWindowDays).toBe(0);
    expect(tooLarge.bookingWindowDays).toBe(365);
  });

  it("only accepts the known confirmation modes", () => {
    expect(normalizeSettings({ confirmationMode: "manual" }).confirmationMode).toBe(
      "manual",
    );
    expect(
      normalizeSettings({ confirmationMode: "whatever" }).confirmationMode,
    ).toBe("auto");
  });
});

describe("date and time helpers", () => {
  it("round-trips a reservation date time", () => {
    const dt = buildReservationDateTime("2026-06-10", "18:30");

    expect(dt).toBe("2026-06-10T18:30");
    expect(splitDateTime(dt)).toEqual({ date: "2026-06-10", time: "18:30" });
  });

  it("returns empty parts for unusable input", () => {
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
  });

  it("formats 24 hour times for display", () => {
    expect(formatTimeLabel("13:05")).toBe("1:05 PM");
    expect(formatTimeLabel("00:30")).toBe("12:30 AM");
    expect(formatTimeLabel("12:00")).toBe("12:00 PM");
  });

  it("formats the midnight and noon boundaries", () => {
    expect(formatTimeLabel("00:00")).toBe("12:00 AM");
    expect(formatTimeLabel("23:59")).toBe("11:59 PM");
  });
});

describe("computeAvailability", () => {
  it("produces slots inside the configured reservation window", () => {
    const { slots } = computeAvailability({
      settings,
      reservations: [],
      date: dateDaysAhead(3),
      partySize: 2,
      now: NOW,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].time >= settings.reservationStartTime).toBe(true);
    expect(slots[slots.length - 1].time <= settings.reservationEndTime).toBe(true);
  });

  it("flags a date beyond the booking window", () => {
    const { outsideWindow } = computeAvailability({
      settings,
      reservations: [],
      date: dateDaysAhead(settings.bookingWindowDays + 5),
      partySize: 2,
      now: NOW,
    });

    expect(outsideWindow).toBe(true);
  });

  it("marks an hour unavailable once its capacity is consumed", () => {
    const date = dateDaysAhead(3);
    const reservations = [
      {
        status: "confirmed",
        reservationDateTime: `${date}T19:00`,
        partySize: settings.maxReservedGuestsPerHour,
      },
    ];

    const { slots } = computeAvailability({
      settings,
      reservations,
      date,
      partySize: 2,
      now: NOW,
    });

    const nineteen = slots.find((s) => s.time === "19:00");
    expect(nineteen).toBeDefined();
    expect(nineteen?.available).toBe(false);
    expect(nineteen?.reason).toBe("full");
  });

  it("ignores cancelled reservations when counting capacity", () => {
    const date = dateDaysAhead(3);
    const reservations = [
      {
        status: "cancelled",
        reservationDateTime: `${date}T19:00`,
        partySize: settings.maxReservedGuestsPerHour,
      },
    ];

    const { slots } = computeAvailability({
      settings,
      reservations,
      date,
      partySize: 2,
      now: NOW,
    });

    expect(slots.find((s) => s.time === "19:00")?.available).toBe(true);
  });

  it("excludes a reservation being edited from its own capacity check", () => {
    const date = dateDaysAhead(3);
    const reservations = [
      {
        id: "res-1",
        status: "confirmed",
        reservationDateTime: `${date}T19:00`,
        partySize: settings.maxReservedGuestsPerHour,
      },
    ];

    const { slots } = computeAvailability({
      settings,
      reservations,
      date,
      partySize: 2,
      now: NOW,
      excludeId: "res-1",
    });

    expect(slots.find((s) => s.time === "19:00")?.available).toBe(true);
  });
});

describe("validateReservationRequest", () => {
  const validDate = dateDaysAhead(3);

  it("accepts a well formed request", () => {
    const error = validateReservationRequest({
      settings,
      reservations: [],
      date: validDate,
      time: "19:00",
      partySize: 2,
      now: NOW,
    });

    expect(error).toBeNull();
  });

  it("rejects a malformed date", () => {
    const error = validateReservationRequest({
      settings,
      reservations: [],
      date: "10-06-2026",
      time: "19:00",
      partySize: 2,
      now: NOW,
    });

    expect(error).toMatch(/valid date/i);
  });

  it("rejects a malformed time", () => {
    const error = validateReservationRequest({
      settings,
      reservations: [],
      date: validDate,
      time: "7pm",
      partySize: 2,
      now: NOW,
    });

    expect(error).toMatch(/valid time/i);
  });

  it("rejects a non-positive party size", () => {
    expect(
      validateReservationRequest({
        settings,
        reservations: [],
        date: validDate,
        time: "19:00",
        partySize: 0,
        now: NOW,
      }),
    ).toMatch(/at least 1/i);
  });

  it("rejects a party larger than the configured maximum", () => {
    const error = validateReservationRequest({
      settings,
      reservations: [],
      date: validDate,
      time: "19:00",
      partySize: settings.maxPartySize + 1,
      now: NOW,
    });

    expect(error).toMatch(new RegExp(String(settings.maxPartySize)));
  });

  it("rejects a date beyond the booking window", () => {
    const error = validateReservationRequest({
      settings,
      reservations: [],
      date: dateDaysAhead(settings.bookingWindowDays + 2),
      time: "19:00",
      partySize: 2,
      now: NOW,
    });

    expect(error).toMatch(/in advance/i);
  });

  it("rejects a time outside reservation hours", () => {
    const error = validateReservationRequest({
      settings,
      reservations: [],
      date: validDate,
      time: "03:00",
      partySize: 2,
      now: NOW,
    });

    expect(error).toMatch(/hours/i);
  });

  it("rejects a fully booked hour", () => {
    const error = validateReservationRequest({
      settings,
      reservations: [
        {
          status: "confirmed",
          reservationDateTime: `${validDate}T19:00`,
          partySize: settings.maxReservedGuestsPerHour,
        },
      ],
      date: validDate,
      time: "19:00",
      partySize: 2,
      now: NOW,
    });

    expect(error).toMatch(/fully booked/i);
  });
});

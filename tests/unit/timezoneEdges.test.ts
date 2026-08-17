import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_OPTIONS,
  formatDateLabelInTimezone,
  getHourInTimezone,
  getNowWallClockInTimezone,
} from "../../src/lib/timezones.js";

describe("getHourInTimezone", () => {
  it("accepts a timestamp or a parseable string", () => {
    const instant = new Date("2026-06-08T05:00:00.000Z");

    expect(getHourInTimezone(instant.getTime(), "UTC")).toBe(5);
    expect(getHourInTimezone("2026-06-08T05:00:00.000Z", "UTC")).toBe(5);
  });

  it("reports NaN for an unparseable date", () => {
    expect(getHourInTimezone("not a date", "UTC")).toBeNaN();
  });

  it("falls back to the local hour for an invalid timezone", () => {
    const instant = new Date("2026-06-08T05:00:00.000Z");

    expect(getHourInTimezone(instant, "Not/AZone")).toBe(instant.getHours());
  });

  it("defaults to the SeatPing timezone", () => {
    const instant = new Date("2026-06-08T05:00:00.000Z");

    expect(getHourInTimezone(instant)).toBe(
      getHourInTimezone(instant, DEFAULT_TIMEZONE),
    );
  });
});

describe("getNowWallClockInTimezone", () => {
  it("falls back to the local wall clock for an invalid timezone", () => {
    expect(getNowWallClockInTimezone("Not/AZone")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it("defaults to the SeatPing timezone", () => {
    expect(getNowWallClockInTimezone()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });
});

describe("formatDateLabelInTimezone", () => {
  it("reads a plain date key without shifting it", () => {
    expect(formatDateLabelInTimezone("2026-06-08", "Pacific/Auckland")).toBe(
      "Jun 8",
    );
  });

  it("formats a Date in the requested zone", () => {
    const label = formatDateLabelInTimezone(
      new Date("2026-06-08T20:00:00.000Z"),
      "UTC",
    );

    expect(label).toBe("Jun 8");
  });

  it("formats a timestamp", () => {
    const label = formatDateLabelInTimezone(
      new Date("2026-06-08T20:00:00.000Z").getTime(),
      "UTC",
    );

    expect(label).toBe("Jun 8");
  });

  it("returns an empty label for an unparseable date", () => {
    expect(formatDateLabelInTimezone("definitely not a date", "UTC")).toBe("");
  });

  it("falls back to the local zone for an invalid timezone", () => {
    const label = formatDateLabelInTimezone(
      new Date("2026-06-08T12:00:00.000Z"),
      "Not/AZone",
    );

    expect(label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it("defaults to the SeatPing timezone", () => {
    const instant = new Date("2026-06-08T20:00:00.000Z");

    expect(formatDateLabelInTimezone(instant)).toBe(
      formatDateLabelInTimezone(instant, DEFAULT_TIMEZONE),
    );
  });
});

describe("TIMEZONE_OPTIONS", () => {
  it("labels every zone with its UTC offset", () => {
    for (const option of TIMEZONE_OPTIONS.slice(0, 20)) {
      expect(option.label).toMatch(/^\(UTC[+-]\d{2}:\d{2}\) /);
      expect(option.label).not.toContain("_");
    }
  });

  it("sorts the zones from the westmost offset eastwards", () => {
    const offsets = TIMEZONE_OPTIONS.map((o) => {
      const [, sign, h, m] = o.label.match(/^\(UTC([+-])(\d{2}):(\d{2})\)/) as
        RegExpMatchArray;
      const minutes = Number(h) * 60 + Number(m);
      if (sign === "-") {
        return -minutes;
      }
      return minutes;
    });

    expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(20);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
    }
  });
});

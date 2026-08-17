import { describe, expect, it } from "vitest";
import { formatPhone } from "../../src/lib/phone.js";
import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY_ISO,
  splitPhone,
} from "../../src/lib/countryCodes.js";
import { statusBadgeClass, statusLabel } from "../../src/lib/statusStyles.js";
import { cn } from "../../src/lib/utils.js";
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_OPTIONS,
  addDaysToDateKey,
  formatDateLabelInTimezone,
  getDateKeyInTimezone,
  getHourInTimezone,
  getNowWallClockInTimezone,
  getTodayKeyInTimezone,
  startOfWeekDateKey,
} from "../../src/lib/timezones.js";

describe("formatPhone", () => {
  it("groups an Indonesian number using its country pattern", () => {
    expect(formatPhone("6281234567890")).toBe("+62 812-3456-7890");
  });

  it("groups a US number using its country pattern", () => {
    expect(formatPhone("15551234567")).toBe("+1 555-123-4567");
  });

  it("keeps only the dial code when there is no national part", () => {
    expect(formatPhone("62")).toBe("+62");
  });

  it("strips leading zeros from the national portion", () => {
    expect(formatPhone("62081234567")).toBe("+62 812-3456-7");
  });

  it("falls back to generic grouping for an unknown country code", () => {
    expect(formatPhone("99912345")).toBe("+999-1234-5");
  });

  it("uses the raw fallback when there is no normalized value", () => {
    expect(formatPhone(null, "0812 3456")).toBe("812-3456");
  });

  it("returns null when neither value carries digits", () => {
    expect(formatPhone(null, null)).toBeNull();
    expect(formatPhone("", "")).toBeNull();
    expect(formatPhone(undefined, "no digits here")).toBeNull();
  });

  it("ignores punctuation in the input", () => {
    expect(formatPhone("+1 (555) 123-4567")).toBe("+1 555-123-4567");
  });
});

describe("splitPhone", () => {
  it("returns the default dial for an empty value", () => {
    const defaultDial = COUNTRY_CODES.find((c) => {
      return c.iso === DEFAULT_COUNTRY_ISO;
    })?.dial;

    expect(splitPhone()).toEqual({ dial: defaultDial, number: "" });
    expect(splitPhone("")).toEqual({ dial: defaultDial, number: "" });
  });

  it("splits a known dial code from the national number", () => {
    expect(splitPhone("+6281234567")).toEqual({
      dial: "+62",
      number: "81234567",
    });
  });

  it("prefers the longest matching dial code", () => {
    const result = splitPhone("+8521234567");

    expect(result.dial).toBe("+852");
    expect(result.number).toBe("1234567");
  });

  it("falls back to the default dial when nothing matches", () => {
    const result = splitPhone("+9995551234");

    expect(result.dial).toBeDefined();
    expect(result.number.startsWith("+")).toBe(false);
  });

  it("exposes a non-empty country list with the expected shape", () => {
    expect(COUNTRY_CODES.length).toBeGreaterThan(0);
    for (const entry of COUNTRY_CODES.slice(0, 5)) {
      expect(entry.iso).toEqual(expect.any(String));
      expect(entry.dial.startsWith("+")).toBe(true);
    }
  });
});

describe("status styling", () => {
  it("maps a known status to a friendly label", () => {
    expect(statusLabel("WAITING")).toEqual(expect.any(String));
    expect(statusLabel("waiting").length).toBeGreaterThan(0);
  });

  it("title cases an unknown underscored status", () => {
    expect(statusLabel("some_unknown_state")).toBe("Some Unknown State");
  });

  it("returns a fallback class for an unknown status", () => {
    expect(statusBadgeClass("not_a_real_status")).toContain("slate");
  });

  it("returns a class string for known statuses", () => {
    expect(statusBadgeClass("WAITING")).toEqual(expect.any(String));
    expect(statusBadgeClass("no_show").length).toBeGreaterThan(0);
  });

  it("treats casing consistently", () => {
    expect(statusLabel("ADMITTED")).toBe(statusLabel("admitted"));
    expect(statusBadgeClass("ADMITTED")).toBe(statusBadgeClass("admitted"));
  });
});

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("lets a later tailwind class win over an earlier conflicting one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("timezone helpers", () => {
  const instant = new Date("2026-06-08T05:00:00.000Z");

  it("formats a date key in the requested zone", () => {
    expect(getDateKeyInTimezone(instant, "UTC")).toBe("2026-06-08");
  });

  it("shifts the date key across a zone boundary", () => {
    expect(getDateKeyInTimezone(instant, DEFAULT_TIMEZONE)).toBe("2026-06-08");
    expect(getDateKeyInTimezone(new Date("2026-06-08T20:00:00.000Z"), DEFAULT_TIMEZONE)).toBe(
      "2026-06-09",
    );
  });

  it("accepts a timestamp or a parseable string", () => {
    expect(getDateKeyInTimezone(instant.getTime(), "UTC")).toBe("2026-06-08");
    expect(getDateKeyInTimezone("2026-06-08T05:00:00.000Z", "UTC")).toBe(
      "2026-06-08",
    );
  });

  it("returns an empty key for an unparseable date", () => {
    expect(getDateKeyInTimezone("not a date", "UTC")).toBe("");
  });

  it("falls back to the local zone for an invalid timezone", () => {
    expect(getDateKeyInTimezone(instant, "Not/AZone")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reports the hour in the requested zone", () => {
    expect(getHourInTimezone(instant, "UTC")).toBe(5);
    expect(getHourInTimezone(instant, DEFAULT_TIMEZONE)).toBe(12);
  });

  it("produces a today key and a wall clock string", () => {
    expect(getTodayKeyInTimezone("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(getNowWallClockInTimezone("UTC")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it("adds and subtracts whole days from a date key", () => {
    expect(addDaysToDateKey("2026-06-08", 1)).toBe("2026-06-09");
    expect(addDaysToDateKey("2026-06-08", -1)).toBe("2026-06-07");
    expect(addDaysToDateKey("2026-06-30", 1)).toBe("2026-07-01");
  });

  it("snaps a date key back to the start of its week", () => {
    const start = startOfWeekDateKey("2026-06-10");

    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(start <= "2026-06-10").toBe(true);
  });

  it("formats a human readable label", () => {
    expect(formatDateLabelInTimezone("2026-06-08", "UTC")).toEqual(
      expect.any(String),
    );
    expect(formatDateLabelInTimezone("2026-06-08", "UTC").length).toBeGreaterThan(0);
  });

  it("offers a non-empty timezone option list containing the default", () => {
    expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(0);
    const values = TIMEZONE_OPTIONS.map((o) => {
      return o.value;
    });
    expect(values).toContain(DEFAULT_TIMEZONE);
  });
});

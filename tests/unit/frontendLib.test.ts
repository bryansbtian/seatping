import { describe, expect, it } from "vitest";
import {
  formatEnteredPhone,
  formatNationalPhone,
  formatPhone,
  formatPhoneInput,
  formatPhoneParts,
  phonePlaceholder,
} from "../../shared/phone.js";
import { COUNTRY_CODES, DEFAULT_COUNTRY_ISO, splitPhone } from "../../shared/countryCodes.js";
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

  it("groups a US number using the North American pattern", () => {
    expect(formatPhone("15551234567")).toBe("+1 (555) 123-4567");
  });

  it("groups a Canadian number using the North American pattern", () => {
    expect(formatPhone("12069313369")).toBe("+1 (206) 931-3369");
  });

  it("keeps the mobile grouping for an Indonesian mobile", () => {
    expect(formatPhone("6281197300491")).toBe("+62 811-9730-0491");
  });

  it("formats an Indonesian landline without brackets around the area code", () => {
    expect(formatPhone("622129921234")).toBe("+62 21 29921234");
  });

  it("keeps a leading zero that belongs to the national number", () => {
    expect(formatPhone("390612345678")).toBe("+39 06 1234 5678");
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
    expect(formatPhone("+1 (555) 123-4567")).toBe("+1 (555) 123-4567");
  });

  it("falls back to a generic national pattern for a dial without its own format", () => {
    expect(formatPhone("5051234567")).toBe("+505 123-456-7");
  });
});

describe("formatPhoneParts", () => {
  it("formats a dial code and national number together", () => {
    expect(formatPhoneParts("+1", "2069313369")).toBe("+1 (206) 931-3369");
    expect(formatPhoneParts("+62", "08111998669")).toBe("+62 811-1998-669");
  });

  it("drops the trunk prefix from an Indonesian landline", () => {
    expect(formatPhoneParts("+62", "02129921234")).toBe("+62 21 29921234");
  });

  it("groups the national number when there is no dial code", () => {
    expect(formatPhoneParts(null, "0812 3456")).toBe("812-3456");
  });

  it("returns null when there is no national number", () => {
    expect(formatPhoneParts("+1", "")).toBeNull();
    expect(formatPhoneParts(null, null)).toBeNull();
  });
});

describe("phonePlaceholder", () => {
  it("matches the display format of the selected country", () => {
    expect(phonePlaceholder("+1")).toBe("(555) 123-4567");
    expect(phonePlaceholder("+62")).toBe("812-3456-7890");
  });

  it("falls back to a generic example for an unlisted dial code", () => {
    expect(phonePlaceholder("+505")).toBe("555-123-4567");
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
    expect(getDateKeyInTimezone("2026-06-08T05:00:00.000Z", "UTC")).toBe("2026-06-08");
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
    expect(getNowWallClockInTimezone("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
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
    expect(formatDateLabelInTimezone("2026-06-08", "UTC")).toEqual(expect.any(String));
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

describe("formatEnteredPhone", () => {
  it("reformats a value that carries its own country code", () => {
    expect(formatEnteredPhone("+12069313369")).toBe("+1 (206) 931-3369");
    expect(formatEnteredPhone("+62 811 1998 669")).toBe("+62 811-1998-669");
  });

  it("leaves a national number untouched because its country is unknown", () => {
    expect(formatEnteredPhone("(555) 123-4567")).toBe("(555) 123-4567");
    expect(formatEnteredPhone("021 1234 5678")).toBe("021 1234 5678");
  });

  it("groups a landline by its area code rather than the mobile pattern", () => {
    expect(formatEnteredPhone("+622112345678")).toBe("+62 21 12345678");
    expect(formatEnteredPhone("+442071234567")).toBe("+44 20 7123 4567");
    expect(formatEnteredPhone("+4930123456")).toBe("+49 30 123456");
    expect(formatEnteredPhone("+390612345678")).toBe("+39 06 1234 5678");
  });

  it("leaves a vanity number alone rather than truncating it at the letters", () => {
    expect(formatEnteredPhone("+1-800-FLOWERS")).toBe("+1-800-FLOWERS");
  });

  it("keeps an extension that the numbering plan recognises", () => {
    expect(formatEnteredPhone("+1 206 931 3369 ext 12")).toBe("+1 (206) 931-3369 ext. 12");
  });

  it("returns null for an empty value", () => {
    expect(formatEnteredPhone("")).toBeNull();
    expect(formatEnteredPhone("   ")).toBeNull();
    expect(formatEnteredPhone(null)).toBeNull();
  });
});

describe("formatNationalPhone", () => {
  it("formats the national part without the dial code", () => {
    expect(formatNationalPhone("+1", "2069313369")).toBe("(206) 931-3369");
    expect(formatNationalPhone("+62", "8111998669")).toBe("811-1998-669");
  });

  it("drops the trunk prefix when the country dial code is already selected", () => {
    expect(formatNationalPhone("+62", "08111998669")).toBe("811-1998-669");
    expect(formatNationalPhone("+62", "02129921234")).toBe("21 29921234");
  });

  it("keeps a leading zero that is part of the national number", () => {
    expect(formatNationalPhone("+39", "0612345678")).toBe("06 1234 5678");
  });

  it("caps the number of digits it will format", () => {
    expect(formatNationalPhone("+1", "12345678901234567890")).toBe("(123) 456-7890-1234-5");
  });

  it("returns an empty string when there are no digits", () => {
    expect(formatNationalPhone("+1", "")).toBe("");
    expect(formatNationalPhone("+1", "abc")).toBe("");
  });
});

describe("formatPhoneInput", () => {
  it("formats as digits are typed and keeps the caret after them", () => {
    expect(formatPhoneInput({ countryCode: "+1", raw: "2", caret: 1, previous: "" })).toEqual({
      value: "(2",
      caret: 2,
    });
    expect(
      formatPhoneInput({
        countryCode: "+1",
        raw: "(206) 931-336",
        caret: 13,
        previous: "(206) 931-33",
      }),
    ).toEqual({ value: "(206) 931-336", caret: 13 });
  });

  it("deletes the preceding digit when only a separator was removed", () => {
    expect(
      formatPhoneInput({ countryCode: "+1", raw: "(206 931", caret: 4, previous: "(206) 931" }),
    ).toEqual({ value: "(209) 31", caret: 3 });
  });

  it("keeps the caret in place when editing mid-number", () => {
    const result = formatPhoneInput({
      countryCode: "+62",
      raw: "8115-1998-669",
      caret: 4,
      previous: "811-1998-669",
    });
    expect(result.value).toBe("811-5199-8669");
    expect(result.caret).toBe(5);
  });

  it("drops the dial code when a full international number is pasted in", () => {
    expect(
      formatPhoneInput({ countryCode: "+1", raw: "+1 206 931 3369", caret: 15, previous: "" }),
    ).toEqual({ value: "(206) 931-3369", caret: 14 });
    expect(
      formatPhoneInput({ countryCode: "+62", raw: "+6281197300491", caret: 14, previous: "" }),
    ).toEqual({ value: "811-9730-0491", caret: 13 });
  });

  it("drops the trunk prefix from a pasted national number", () => {
    expect(
      formatPhoneInput({ countryCode: "+62", raw: "08123456789", caret: 11, previous: "" }),
    ).toEqual({ value: "812-3456-789", caret: 12 });
    expect(
      formatPhoneInput({ countryCode: "+62", raw: "08111998669", caret: 11, previous: "" }),
    ).toEqual({ value: "811-1998-669", caret: 12 });
  });

  it("does not strip a leading digit that was merely typed", () => {
    expect(
      formatPhoneInput({ countryCode: "+1", raw: "123456", caret: 6, previous: "12345" }),
    ).toEqual({ value: "(123) 456", caret: 9 });
  });

  it("clears the value when every digit is removed", () => {
    expect(formatPhoneInput({ countryCode: "+1", raw: "", caret: 0, previous: "(2" })).toEqual({
      value: "",
      caret: 0,
    });
  });
});

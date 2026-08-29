import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TIMEZONE, getLocationTimezone } from "../../src/lib/timezones.js";

const RealDateTimeFormat = Intl.DateTimeFormat;
const RealSupportedValuesOf = (Intl as unknown as Record<string, unknown>).supportedValuesOf;

function restoreIntl() {
  (Intl as unknown as Record<string, unknown>).DateTimeFormat = RealDateTimeFormat;
  if (RealSupportedValuesOf === undefined) {
    delete (Intl as unknown as Record<string, unknown>).supportedValuesOf;
  } else {
    (Intl as unknown as Record<string, unknown>).supportedValuesOf = RealSupportedValuesOf;
  }
}

function setSupportedValuesOf(value: unknown) {
  (Intl as unknown as Record<string, unknown>).supportedValuesOf = value;
}

async function reloadTimezones() {
  vi.resetModules();
  return import("../../src/lib/timezones.js");
}

afterEach(() => {
  restoreIntl();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("getLocationTimezone", () => {
  it("reads the timezone off the opening hours", () => {
    const location = { restaurantProfile: { openingHours: { timezone: "Europe/Paris" } } };

    expect(getLocationTimezone(location)).toBe("Europe/Paris");
  });

  it("falls back to the SeatPing default when nothing is set", () => {
    expect(getLocationTimezone(null)).toBe(DEFAULT_TIMEZONE);
    expect(getLocationTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
    expect(getLocationTimezone({})).toBe(DEFAULT_TIMEZONE);
    expect(getLocationTimezone({ restaurantProfile: {} })).toBe(DEFAULT_TIMEZONE);
    expect(getLocationTimezone({ restaurantProfile: { openingHours: {} } })).toBe(DEFAULT_TIMEZONE);
  });

  it("ignores a timezone that is not a usable string", () => {
    expect(getLocationTimezone({ restaurantProfile: { openingHours: { timezone: "" } } })).toBe(
      DEFAULT_TIMEZONE,
    );
    expect(getLocationTimezone({ restaurantProfile: { openingHours: { timezone: 42 } } })).toBe(
      DEFAULT_TIMEZONE,
    );
  });
});

describe("the timezone option list", () => {
  it("uses the bundled list where the runtime cannot enumerate zones", async () => {
    setSupportedValuesOf(undefined);

    const { TIMEZONE_OPTIONS } = await reloadTimezones();

    expect(TIMEZONE_OPTIONS.some((option) => option.value === "Asia/Jakarta")).toBe(true);
    expect(TIMEZONE_OPTIONS.some((option) => option.value === "UTC")).toBe(true);
  });

  it("uses the bundled list where enumeration throws", async () => {
    setSupportedValuesOf(() => {
      throw new Error("unsupported");
    });

    const { TIMEZONE_OPTIONS } = await reloadTimezones();

    expect(TIMEZONE_OPTIONS.some((option) => option.value === "Asia/Jakarta")).toBe(true);
  });

  it("uses the bundled list where enumeration comes back empty", async () => {
    setSupportedValuesOf(() => []);

    const { TIMEZONE_OPTIONS } = await reloadTimezones();

    expect(TIMEZONE_OPTIONS.some((option) => option.value === "Asia/Jakarta")).toBe(true);
  });

  it("keeps a zone the runtime cannot measure and treats it as UTC", async () => {
    setSupportedValuesOf(() => ["Not/AZone", "UTC"]);

    const { TIMEZONE_OPTIONS } = await reloadTimezones();
    const broken = TIMEZONE_OPTIONS.find((option) => option.value === "Not/AZone");

    expect(broken).toBeTruthy();
    expect(broken?.label).toContain("UTC+00:00");
  });

  it("replaces underscores in the label", async () => {
    setSupportedValuesOf(() => ["America/Sao_Paulo"]);

    const { TIMEZONE_OPTIONS } = await reloadTimezones();

    expect(TIMEZONE_OPTIONS[0].label).toContain("America/Sao Paulo");
  });
});

describe("a runtime that reports midnight as hour 24", () => {
  function stubHour24() {
    class Stub {
      format() {
        return "24";
      }
      formatToParts() {
        return [
          { type: "hour", value: "24" },
          { type: "literal", value: ":" },
          { type: "minute", value: "30" },
        ];
      }
    }
    (Intl as unknown as Record<string, unknown>).DateTimeFormat = Stub;
  }

  it("reads hour 24 as the top of the day", async () => {
    const { getHourInTimezone } = await reloadTimezones();
    stubHour24();

    expect(getHourInTimezone(new Date("2026-06-08T00:00:00.000Z"), "UTC")).toBe(0);
  });

  it("writes hour 24 as 00 on the wall clock", async () => {
    const { getNowWallClockInTimezone } = await reloadTimezones();
    stubHour24();

    expect(getNowWallClockInTimezone("UTC")).toContain("T00:30");
  });

  it("reads hour 24 as the top of the day when measuring an offset", async () => {
    setSupportedValuesOf(() => ["UTC"]);
    const previous = Intl.DateTimeFormat;
    class Stub {
      formatToParts() {
        return [
          { type: "year", value: "2026" },
          { type: "literal", value: "-" },
          { type: "month", value: "06" },
          { type: "day", value: "08" },
          { type: "hour", value: "24" },
          { type: "minute", value: "00" },
          { type: "second", value: "00" },
        ];
      }
      format() {
        return "2026-06-08";
      }
    }
    (Intl as unknown as Record<string, unknown>).DateTimeFormat = Stub;

    const { TIMEZONE_OPTIONS } = await reloadTimezones();

    (Intl as unknown as Record<string, unknown>).DateTimeFormat = previous;
    expect(TIMEZONE_OPTIONS).toHaveLength(1);
    expect(TIMEZONE_OPTIONS[0].value).toBe("UTC");
  });
});

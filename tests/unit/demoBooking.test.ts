import { describe, expect, it } from "vitest";
import {
  calculateDemoSlots,
  dateInTimezone,
  isDemoSlot,
  isTimezone,
  monthRange,
} from "../../shared/demoBooking.js";

describe("demo scheduling", () => {
  const now = new Date("2026-10-01T00:00:00Z");

  it("offers 32 quarter-hour meetings on a free weekday within New York hours", () => {
    const slots = calculateDemoSlots("2026-10", "America/New_York", [], now).filter((slot) =>
      slot.startsWith("2026-10-02"),
    );
    expect(slots).toHaveLength(32);
    expect(slots[0]).toBe("2026-10-02T13:00:00.000Z");
    expect(slots.at(-1)).toBe("2026-10-02T20:45:00.000Z");
    expect(
      calculateDemoSlots("2026-10", "America/New_York", [], now).some((slot) =>
        slot.startsWith("2026-10-03"),
      ),
    ).toBe(false);
  });

  it("uses daylight saving offsets on both sides of each clock change", () => {
    const spring = calculateDemoSlots(
      "2026-03",
      "America/New_York",
      [],
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(spring).toContain("2026-03-06T14:00:00.000Z");
    expect(spring).toContain("2026-03-09T13:00:00.000Z");
    const fall = calculateDemoSlots("2026-11", "America/New_York", [], now);
    expect(fall).toContain("2026-11-02T14:00:00.000Z");
    expect(fall).not.toContain("2026-11-02T13:00:00.000Z");
  });

  it("removes partial overlaps but allows meetings exactly touching a busy boundary", () => {
    const busy = [{ start: "2026-10-02T13:10:00Z", end: "2026-10-02T13:30:00Z" }];
    const slots = calculateDemoSlots("2026-10", "UTC", busy, now);
    expect(slots).not.toContain("2026-10-02T13:00:00.000Z");
    expect(slots).not.toContain("2026-10-02T13:15:00.000Z");
    expect(slots).toContain("2026-10-02T13:30:00.000Z");
  });

  it("blocks all-day events and dates with no available slots", () => {
    const slots = calculateDemoSlots(
      "2026-10",
      "UTC",
      [{ start: "2026-10-02T00:00:00Z", end: "2026-10-03T00:00:00Z" }],
      now,
    );
    expect(slots.some((slot) => slot.startsWith("2026-10-02"))).toBe(false);
  });

  it("never offers past slots or slots beyond the booking horizon", () => {
    const current = new Date("2026-10-02T13:00:00Z");
    const slots = calculateDemoSlots("2026-10", "UTC", [], current);
    expect(slots).not.toContain("2026-10-02T13:00:00.000Z");
    expect(slots[0]).toBe("2026-10-02T13:15:00.000Z");
    expect(calculateDemoSlots("2027-02", "UTC", [], current)).toEqual([]);
  });

  it("groups dates by visitor timezone and hides visitor weekends", () => {
    const slots = calculateDemoSlots("2026-10", "Asia/Jakarta", [], now);
    expect(dateInTimezone("2026-10-02T20:00:00Z", "Asia/Jakarta")).toBe("2026-10-03");
    expect(slots).not.toContain("2026-10-02T20:00:00.000Z");
    expect(slots).toContain("2026-10-02T13:00:00.000Z");
    expect(isTimezone("Mars/Olympus")).toBe(false);
    expect(isTimezone("America/New_York")).toBe(true);
    expect(monthRange("2026-12").end.toISOString()).toBe("2027-01-02T00:00:00.000Z");
  });

  it.each([
    "invalid",
    "2026-10-02T12:45:00Z",
    "2026-10-02T21:00:00Z",
    "2026-10-03T13:00:00Z",
    "2026-10-02T13:01:00Z",
    "2026-09-30T13:00:00Z",
    "2027-10-01T13:00:00Z",
  ])("rejects invalid or out-of-policy booking time %s", (start) => {
    expect(isDemoSlot(new Date(start), now)).toBe(false);
  });

  it("accepts the final full meeting of a workday", () => {
    expect(isDemoSlot(new Date("2026-10-02T20:45:00Z"), now)).toBe(true);
  });
});

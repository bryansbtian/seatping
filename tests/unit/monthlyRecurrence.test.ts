import { describe, expect, it } from "vitest";
import {
  advanceRecurrence,
  zonedDayOfMonth,
} from "../../server/lib/campaigns.js";

function utcDay(date: string, time = "T09:00:00.000Z"): Date {
  return new Date(`${date}${time}`);
}

function dayOf(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

function monthlySequence(
  start: string,
  steps: number,
  timeZone = "UTC",
): string[] {
  const anchorDay = zonedDayOfMonth(utcDay(start), timeZone);
  const out: string[] = [];
  let current = utcDay(start);
  for (let i = 0; i < steps; i++) {
    current = advanceRecurrence(current, "MONTHLY", timeZone, anchorDay);
    out.push(dayOf(current));
  }
  return out;
}

describe("monthly recurrence anchor day", () => {
  const cases: Array<{ start: string; expected: string[] }> = [
    { start: "2027-01-29", expected: ["2027-02-28", "2027-03-29"] },
    { start: "2027-01-30", expected: ["2027-02-28", "2027-03-30"] },
    { start: "2027-01-31", expected: ["2027-02-28", "2027-03-31"] },
    { start: "2028-01-29", expected: ["2028-02-29", "2028-03-29"] },
    { start: "2028-01-30", expected: ["2028-02-29", "2028-03-30"] },
    { start: "2028-01-31", expected: ["2028-02-29", "2028-03-31"] },
    { start: "2027-03-31", expected: ["2027-04-30", "2027-05-31"] },
    { start: "2027-01-10", expected: ["2027-02-10", "2027-03-10"] },
  ];

  for (const { start, expected } of cases) {
    it(`advances ${start} to ${expected.join(" then ")}`, () => {
      expect(monthlySequence(start, expected.length)).toEqual(expected);
    });
  }

  it("restores the anchor for a full year from the 31st", () => {
    expect(monthlySequence("2027-01-31", 12)).toEqual([
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
      "2027-06-30",
      "2027-07-31",
      "2027-08-31",
      "2027-09-30",
      "2027-10-31",
      "2027-11-30",
      "2027-12-31",
      "2028-01-31",
    ]);
  });

  it("never drifts away from the anchor once a short month clamps it", () => {
    const days = monthlySequence("2027-01-31", 24);
    const longMonths = days.filter((d) => {
      return d.endsWith("-31");
    });

    expect(longMonths.length).toBe(14);
  });

  it("rolls a December run into the next year", () => {
    expect(monthlySequence("2027-12-31", 1)).toEqual(["2028-01-31"]);
  });

  it("clamps to the last day when no anchor is supplied", () => {
    const next = advanceRecurrence(
      utcDay("2027-01-31"),
      "MONTHLY",
      "UTC",
    );

    expect(dayOf(next)).toBe("2027-02-28");
  });
});

describe("monthly recurrence time and timezone semantics", () => {
  it("keeps the wall clock time of day", () => {
    const next = advanceRecurrence(
      new Date("2027-01-31T14:37:00.000Z"),
      "MONTHLY",
      "UTC",
      31,
    );

    expect(next.toISOString()).toBe("2027-02-28T14:37:00.000Z");
  });

  it("keeps the local wall clock in a non-UTC zone", () => {
    const start = new Date("2027-01-31T12:00:00.000Z");
    const next = advanceRecurrence(start, "MONTHLY", "Asia/Jakarta", 31);

    expect(next.toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });

  it("anchors on the day in the campaign timezone, not in UTC", () => {
    const lateUtc = new Date("2027-01-30T20:00:00.000Z");

    expect(zonedDayOfMonth(lateUtc, "UTC")).toBe(30);
    expect(zonedDayOfMonth(lateUtc, "Asia/Jakarta")).toBe(31);
  });
});

describe("daily and weekly recurrence", () => {
  it("crosses a month boundary by day", () => {
    expect(
      dayOf(advanceRecurrence(utcDay("2027-01-31"), "DAILY", "UTC")),
    ).toBe("2027-02-01");
  });

  it("crosses a month boundary by week", () => {
    expect(
      dayOf(advanceRecurrence(utcDay("2027-01-28"), "WEEKLY", "UTC")),
    ).toBe("2027-02-04");
  });

  it("ignores the monthly anchor for other frequencies", () => {
    expect(
      dayOf(advanceRecurrence(utcDay("2027-01-10"), "DAILY", "UTC", 31)),
    ).toBe("2027-01-11");
    expect(
      dayOf(advanceRecurrence(utcDay("2027-01-10"), "WEEKLY", "UTC", 31)),
    ).toBe("2027-01-17");
  });

  it("crosses a leap day by week", () => {
    expect(
      dayOf(advanceRecurrence(utcDay("2028-02-26"), "WEEKLY", "UTC")),
    ).toBe("2028-03-04");
  });
});

describe("zonedDayOfMonth", () => {
  it("reports nothing without an instant", () => {
    expect(zonedDayOfMonth(null, "UTC")).toBeNull();
    expect(zonedDayOfMonth(undefined, "UTC")).toBeNull();
  });

  it("reports nothing for a timezone the runtime rejects", () => {
    expect(zonedDayOfMonth(utcDay("2027-01-31"), "Not/AZone")).toBeNull();
  });

  it("reads the day in the requested zone", () => {
    expect(zonedDayOfMonth(utcDay("2027-01-31"), "UTC")).toBe(31);
  });
});

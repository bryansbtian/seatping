import { describe, expect, it } from "vitest";
import {
  queueFullName,
  queueLegacyKey,
  queueSummary,
  waitedMinutes,
  type QueueRow,
} from "../../src/lib/queueStats.js";

const NOW = new Date("2026-08-26T18:00:00.000Z");

function row(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    firstName: "Ada",
    lastName: "Lovelace",
    numGuests: 2,
    joinedAt: "2026-08-26T17:30:00.000Z",
    ...overrides,
  };
}

describe("waitedMinutes", () => {
  it("floors the elapsed minutes since the guest joined", () => {
    expect(waitedMinutes("2026-08-26T17:30:00.000Z", NOW)).toBe(30);
    expect(waitedMinutes("2026-08-26T17:30:40.000Z", NOW)).toBe(29);
  });

  it("reads a join time in the future as no wait at all", () => {
    expect(waitedMinutes("2026-08-26T18:30:00.000Z", NOW)).toBe(0);
  });

  it("returns null for a join time it cannot parse", () => {
    expect(waitedMinutes("not a date", NOW)).toBeNull();
    expect(waitedMinutes("", NOW)).toBeNull();
  });
});

describe("queueSummary", () => {
  it("reports an empty queue with no averages", () => {
    expect(queueSummary([], NOW)).toEqual({
      waiting: 0,
      averageWait: null,
      longestWait: null,
    });
  });

  it("averages and takes the longest wait across the queue", () => {
    const rows = [
      row({ joinedAt: "2026-08-26T17:30:00.000Z" }),
      row({ joinedAt: "2026-08-26T17:40:00.000Z" }),
      row({ joinedAt: "2026-08-26T17:50:00.000Z" }),
    ];

    expect(queueSummary(rows, NOW)).toEqual({
      waiting: 3,
      averageWait: 20,
      longestWait: 30,
    });
  });

  it("rounds the average to the nearest minute", () => {
    const rows = [
      row({ joinedAt: "2026-08-26T17:59:00.000Z" }),
      row({ joinedAt: "2026-08-26T17:58:00.000Z" }),
      row({ joinedAt: "2026-08-26T17:58:00.000Z" }),
    ];

    expect(queueSummary(rows, NOW).averageWait).toBe(2);
  });

  it("still counts a row whose join time cannot be parsed", () => {
    const rows = [row({ joinedAt: "2026-08-26T17:30:00.000Z" }), row({ joinedAt: "nonsense" })];

    expect(queueSummary(rows, NOW)).toEqual({
      waiting: 2,
      averageWait: 30,
      longestWait: 30,
    });
  });

  it("leaves the averages empty when no row has a usable join time", () => {
    expect(queueSummary([row({ joinedAt: "nonsense" })], NOW)).toEqual({
      waiting: 1,
      averageWait: null,
      longestWait: null,
    });
  });
});

describe("queueLegacyKey", () => {
  it("joins the name halves and the join time", () => {
    expect(queueLegacyKey(row())).toBe("AdaLovelace2026-08-26T17:30:00.000Z");
  });
});

describe("queueFullName", () => {
  it("joins both name halves", () => {
    expect(queueFullName(row())).toBe("Ada Lovelace");
  });

  it("trims a missing last name", () => {
    expect(queueFullName(row({ lastName: "" }))).toBe("Ada");
  });

  it("trims a missing first name", () => {
    expect(queueFullName(row({ firstName: "" }))).toBe("Lovelace");
  });
});

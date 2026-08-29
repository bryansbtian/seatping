import { describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => {
  return { api: apiMock };
});

import {
  MIN_BAR_SLOT,
  bucketAxisLabel,
  bucketGroupSize,
  bucketRangeLabel,
  bucketRangeTooltip,
  bucketTooltip,
  fetchPerformance,
  formatCount,
  formatDelta,
  formatDuration,
  formatMinutes,
  formatPercent,
  formatRangeLabel,
  groupBuckets,
  performanceQueryString,
  quarterOf,
  type CoverBucket,
} from "../../src/lib/performanceApi.js";

function bucket(start: string, end: string, covers = 0): CoverBucket {
  return { start, end, covers };
}

describe("performanceQueryString", () => {
  it("carries only the preset for a named range", () => {
    expect(performanceQueryString({ preset: "last_7_days" })).toBe("preset=last_7_days");
  });

  it("carries both ends of a custom range", () => {
    expect(performanceQueryString({ preset: "custom", from: "2026-08-01", to: "2026-08-31" })).toBe(
      "preset=custom&from=2026-08-01&to=2026-08-31",
    );
  });

  it("drops a half filled custom range", () => {
    expect(performanceQueryString({ preset: "custom", from: "2026-08-01" })).toBe("preset=custom");
    expect(performanceQueryString({ preset: "custom", to: "2026-08-31" })).toBe("preset=custom");
    expect(performanceQueryString({ preset: "custom" })).toBe("preset=custom");
  });
});

describe("fetchPerformance", () => {
  it("asks for the location and range it was given", async () => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ range: {}, metrics: {} });

    await fetchPerformance("loc-1", { preset: "last_30_days" });

    expect(apiMock).toHaveBeenCalledWith("/api/performance/loc-1?preset=last_30_days");
  });
});

describe("the metric formatters", () => {
  it("rounds minutes and marks a missing value", () => {
    expect(formatMinutes(12.4)).toBe("12m");
    expect(formatMinutes(12.6)).toBe("13m");
    expect(formatMinutes(null)).toBe("--");
  });

  it("turns a ratio into a percentage", () => {
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.333)).toBe("33%");
    expect(formatPercent(null)).toBe("--");
  });

  it("prints a count as it stands", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(42)).toBe("42");
    expect(formatCount(null)).toBe("--");
  });

  it("splits a long duration into hours and minutes", () => {
    expect(formatDuration(null)).toBe("--");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(59.4)).toBe("59m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(95)).toBe("1h 35m");
  });

  it("signs a delta only when it grew", () => {
    expect(formatDelta(5)).toBe("+5");
    expect(formatDelta(0)).toBe("0");
    expect(formatDelta(-5)).toBe("-5");
  });
});

describe("quarterOf", () => {
  it("maps each month onto its quarter", () => {
    expect(quarterOf(new Date("2026-01-15T00:00:00"))).toBe(1);
    expect(quarterOf(new Date("2026-04-15T00:00:00"))).toBe(2);
    expect(quarterOf(new Date("2026-08-15T00:00:00"))).toBe(3);
    expect(quarterOf(new Date("2026-11-15T00:00:00"))).toBe(4);
  });
});

describe("bucketGroupSize", () => {
  it("keeps every bucket when there is room", () => {
    expect(bucketGroupSize(5, 1000)).toBe(1);
    expect(bucketGroupSize(10, 10 * MIN_BAR_SLOT)).toBe(1);
  });

  it("groups buckets once the bars would be too thin", () => {
    expect(bucketGroupSize(20, 10 * MIN_BAR_SLOT)).toBe(2);
    expect(bucketGroupSize(90, 10 * MIN_BAR_SLOT)).toBe(9);
  });

  it("honours a caller supplied slot width", () => {
    expect(bucketGroupSize(20, 200, 10)).toBe(1);
    expect(bucketGroupSize(60, 200, 10)).toBe(3);
  });

  it("stays at one while the width or count is unusable", () => {
    expect(bucketGroupSize(20, null)).toBe(1);
    expect(bucketGroupSize(20, 0)).toBe(1);
    expect(bucketGroupSize(20, -10)).toBe(1);
    expect(bucketGroupSize(0, 500)).toBe(1);
  });

  it("always leaves room for at least one bar", () => {
    expect(bucketGroupSize(10, 5)).toBe(10);
  });
});

describe("groupBuckets", () => {
  it("returns the buckets untouched when nothing needs grouping", () => {
    const buckets = [bucket("2026-08-01", "2026-08-01", 3)];

    expect(groupBuckets(buckets, 1)).toBe(buckets);
    expect(groupBuckets(buckets, 0)).toBe(buckets);
  });

  it("sums covers and spans the group from first start to last end", () => {
    const buckets = [
      bucket("2026-08-01", "2026-08-01", 3),
      bucket("2026-08-02", "2026-08-02", 4),
      bucket("2026-08-03", "2026-08-03", 5),
    ];

    expect(groupBuckets(buckets, 2)).toEqual([
      { start: "2026-08-01", end: "2026-08-02", covers: 7 },
      { start: "2026-08-03", end: "2026-08-03", covers: 5 },
    ]);
  });
});

describe("bucketRangeLabel", () => {
  it("names the day the bucket starts", () => {
    expect(bucketRangeLabel(bucket("2026-08-26", "2026-08-26"))).toBe("Aug 26");
  });

  it("hands back the raw key it cannot read", () => {
    expect(bucketRangeLabel(bucket("nonsense", "nonsense"))).toBe("nonsense");
  });
});

describe("bucketRangeTooltip", () => {
  it("names a single day in full", () => {
    expect(bucketRangeTooltip(bucket("2026-08-26", "2026-08-26"))).toBe("August 26, 2026");
  });

  it("spans a range across two days", () => {
    expect(bucketRangeTooltip(bucket("2026-08-24", "2026-08-30"))).toBe("August 24 to August 30");
  });

  it("hands back the raw key when either end is unreadable", () => {
    expect(bucketRangeTooltip(bucket("nonsense", "2026-08-30"))).toBe("nonsense");
    expect(bucketRangeTooltip(bucket("2026-08-24", "nonsense"))).toBe("2026-08-24");
  });
});

describe("bucketAxisLabel", () => {
  it("labels a daily bucket by weekday", () => {
    expect(bucketAxisLabel(bucket("2026-08-26", "2026-08-26"), "daily")).toBe("Wed");
  });

  it("labels a weekly bucket by month and day", () => {
    expect(bucketAxisLabel(bucket("2026-08-24", "2026-08-30"), "weekly")).toBe("Aug 24");
  });

  it("labels a monthly bucket by month", () => {
    expect(bucketAxisLabel(bucket("2026-08-01", "2026-08-31"), "monthly")).toBe("Aug");
  });

  it("labels anything longer by quarter", () => {
    expect(bucketAxisLabel(bucket("2026-07-01", "2026-09-30"), "quarterly")).toBe("Q3");
  });

  it("hands back the raw key it cannot read", () => {
    expect(bucketAxisLabel(bucket("nonsense", "nonsense"), "daily")).toBe("nonsense");
  });
});

describe("bucketTooltip", () => {
  it("names a daily bucket in full", () => {
    expect(bucketTooltip(bucket("2026-08-26", "2026-08-26"), "daily")).toBe("August 26, 2026");
  });

  it("spans a weekly bucket end to end", () => {
    expect(bucketTooltip(bucket("2026-08-24", "2026-08-30"), "weekly")).toBe(
      "August 24 to August 30",
    );
  });

  it("names a monthly bucket by month and year", () => {
    expect(bucketTooltip(bucket("2026-08-01", "2026-08-31"), "monthly")).toBe("August 2026");
  });

  it("names a quarterly bucket by quarter and year", () => {
    expect(bucketTooltip(bucket("2026-07-01", "2026-09-30"), "quarterly")).toBe("Q3 2026");
  });

  it("hands back the raw key when either end is unreadable", () => {
    expect(bucketTooltip(bucket("nonsense", "2026-08-30"), "daily")).toBe("nonsense");
    expect(bucketTooltip(bucket("2026-08-24", "nonsense"), "daily")).toBe("2026-08-24");
  });
});

describe("formatRangeLabel", () => {
  it("names a single day once for a one day range", () => {
    expect(formatRangeLabel("2026-08-26T00:00:00.000Z", "2026-08-27T00:00:00.000Z")).toContain(
      "2026",
    );
  });

  it("spans both ends of a longer range", () => {
    const label = formatRangeLabel("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");

    expect(label).toContain(" to ");
  });

  it("gives back nothing for a range it cannot read", () => {
    expect(formatRangeLabel("nonsense", "2026-09-01T00:00:00.000Z")).toBe("");
    expect(formatRangeLabel("2026-08-01T00:00:00.000Z", "nonsense")).toBe("");
  });
});

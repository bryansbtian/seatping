import { describe, expect, it } from "vitest";
import {
  bucketGroupSize,
  bucketRangeLabel,
  bucketRangeTooltip,
  groupBuckets,
  MIN_BAR_SLOT,
  type CoverBucket,
} from "../../src/lib/performanceApi.js";

function daily(count: number, covers = 1): CoverBucket[] {
  const out: CoverBucket[] = [];
  for (let index = 0; index < count; index += 1) {
    const day = String(index + 1).padStart(2, "0");
    out.push({ start: `2026-08-${day}`, end: `2026-08-${day}`, covers });
  }
  return out;
}

describe("bucketGroupSize", () => {
  it("keeps every bucket when there is room", () => {
    expect(bucketGroupSize(7, 700)).toBe(1);
  });

  it("groups buckets when the chart is narrow", () => {
    expect(bucketGroupSize(30, 300)).toBeGreaterThan(1);
  });

  it("never groups when the width is unknown", () => {
    expect(bucketGroupSize(30, null)).toBe(1);
  });

  it("leaves each bar at least the minimum slot", () => {
    const width = 320;
    const count = 30;
    const size = bucketGroupSize(count, width);
    const bars = Math.ceil(count / size);

    expect(width / bars).toBeGreaterThanOrEqual(MIN_BAR_SLOT);
  });

  it("keeps a week readable on a narrow chart", () => {
    expect(bucketGroupSize(7, 300)).toBe(1);
  });
});

describe("groupBuckets", () => {
  it("returns the buckets untouched at size one", () => {
    const buckets = daily(3);

    expect(groupBuckets(buckets, 1)).toEqual(buckets);
  });

  it("adds the covers of every bucket it merges", () => {
    const grouped = groupBuckets(daily(6, 2), 3);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].covers).toBe(6);
    expect(grouped[1].covers).toBe(6);
  });

  it("preserves the overall total", () => {
    const buckets = daily(30, 4);
    const total = buckets.reduce((sum, bucket) => sum + bucket.covers, 0);
    const grouped = groupBuckets(buckets, 7);
    const groupedTotal = grouped.reduce((sum, bucket) => sum + bucket.covers, 0);

    expect(groupedTotal).toBe(total);
  });

  it("spans a merged bucket from its first day to its last", () => {
    const grouped = groupBuckets(daily(6), 3);

    expect(grouped[0].start).toBe("2026-08-01");
    expect(grouped[0].end).toBe("2026-08-03");
  });

  it("lets the final group run short", () => {
    const grouped = groupBuckets(daily(10), 4);

    expect(grouped).toHaveLength(3);
    expect(grouped[2].start).toBe("2026-08-09");
    expect(grouped[2].end).toBe("2026-08-10");
  });
});

describe("labels for merged buckets", () => {
  it("labels the axis with the first day of the group", () => {
    expect(bucketRangeLabel({ start: "2026-08-12", end: "2026-08-18", covers: 3 })).toBe("Aug 12");
  });

  it("names both ends in the tooltip", () => {
    expect(bucketRangeTooltip({ start: "2026-08-12", end: "2026-08-18", covers: 3 })).toBe(
      "August 12 to August 18",
    );
  });

  it("names a single day plainly", () => {
    expect(bucketRangeTooltip({ start: "2026-08-12", end: "2026-08-12", covers: 3 })).toBe(
      "August 12, 2026",
    );
  });
});

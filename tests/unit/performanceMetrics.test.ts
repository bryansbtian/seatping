import { describe, expect, it } from "vitest";
import {
  assignmentTurnMinutes,
  computePerformance,
  queueWaitMinutes,
  buildBuckets,
  resolveGranularity,
  serviceMinutesInRange,
  resolveRange,
  type PerformanceAssignment,
  type PerformanceQueueEntry,
  type PerformanceRange,
  type PerformanceReservation,
} from "../../server/lib/performance.js";

const NOW = new Date("2026-08-27T15:00:00.000Z");

function todayRange(): PerformanceRange {
  const range = resolveRange("today", undefined, undefined, NOW);
  if (!range) {
    throw new Error("range");
  }
  return range;
}

function at(offsetMinutes: number): Date {
  return new Date(NOW.getTime() + offsetMinutes * 60000);
}

function queueEntry(overrides: Partial<PerformanceQueueEntry> = {}): PerformanceQueueEntry {
  return {
    guestCount: 2,
    status: "ARRIVED",
    joinedAt: at(-60),
    admittedAt: at(-40),
    arrivedAt: at(-35),
    noShowAt: null,
    removedAt: null,
    leftAt: null,
    ...overrides,
  };
}

function reservation(overrides: Partial<PerformanceReservation> = {}): PerformanceReservation {
  return {
    guestCount: 4,
    status: "COMPLETED",
    reservationDateTime: "2026-08-27T18:00",
    arrivedAt: at(-90),
    completedAt: at(-10),
    cancelledAt: null,
    noShowAt: null,
    ...overrides,
  };
}

function assignment(overrides: Partial<PerformanceAssignment> = {}): PerformanceAssignment {
  return {
    tableId: "t1",
    tableIds: ["t1"],
    partySize: 2,
    source: "SMART",
    status: "COMPLETED",
    seatedAt: at(-120),
    completedAt: at(-60),
    queueEntryId: "q1",
    reservationId: null,
    ...overrides,
  };
}

function run(input: {
  queueEntries?: PerformanceQueueEntry[];
  reservations?: PerformanceReservation[];
  assignments?: PerformanceAssignment[];
  tables?: { id: string; name: string }[];
}) {
  return computePerformance({
    range: todayRange(),
    queueEntries: input.queueEntries ?? [],
    reservations: input.reservations ?? [],
    assignments: input.assignments ?? [],
    tables: input.tables ?? [],
    now: NOW,
  });
}

describe("resolveRange", () => {
  it("covers the whole of today", () => {
    const range = resolveRange("today", undefined, undefined, NOW);

    expect(range?.preset).toBe("today");
    expect(range?.to.getTime()).toBeGreaterThan(range!.from.getTime());
  });

  it("covers seven days including today", () => {
    const range = resolveRange("7d", undefined, undefined, NOW);
    const days = (range!.to.getTime() - range!.from.getTime()) / (24 * 60 * 60000);

    expect(Math.round(days)).toBe(7);
  });

  it("covers thirty days including today", () => {
    const range = resolveRange("30d", undefined, undefined, NOW);
    const days = (range!.to.getTime() - range!.from.getTime()) / (24 * 60 * 60000);

    expect(Math.round(days)).toBe(30);
  });

  it("accepts a custom range", () => {
    const range = resolveRange("custom", "2026-08-01", "2026-08-03", NOW);

    expect(range?.preset).toBe("custom");
    const days = (range!.to.getTime() - range!.from.getTime()) / (24 * 60 * 60000);
    expect(Math.round(days)).toBe(3);
  });

  it("refuses a custom range without both ends", () => {
    expect(resolveRange("custom", "2026-08-01", "", NOW)).toBeNull();
    expect(resolveRange("custom", "", "2026-08-03", NOW)).toBeNull();
  });

  it("refuses a backwards custom range", () => {
    expect(resolveRange("custom", "2026-08-05", "2026-08-01", NOW)).toBeNull();
  });

  it("refuses an unreadable custom range", () => {
    expect(resolveRange("custom", "nonsense", "2026-08-01", NOW)).toBeNull();
  });

  it("refuses an unknown preset", () => {
    expect(resolveRange("forever", undefined, undefined, NOW)).toBeNull();
  });
});

describe("queueWaitMinutes", () => {
  it("measures from joining to arriving", () => {
    expect(queueWaitMinutes(queueEntry())).toBe(25);
  });

  it("falls back to the notified time", () => {
    expect(queueWaitMinutes(queueEntry({ arrivedAt: null }))).toBe(20);
  });

  it("has nothing to report for a guest still waiting", () => {
    expect(queueWaitMinutes(queueEntry({ arrivedAt: null, admittedAt: null }))).toBeNull();
  });
});

describe("assignmentTurnMinutes", () => {
  it("measures seated to completed", () => {
    expect(assignmentTurnMinutes(assignment())).toBe(60);
  });

  it("has nothing to report for an open visit", () => {
    expect(assignmentTurnMinutes(assignment({ completedAt: null }))).toBeNull();
  });
});

describe("computePerformance", () => {
  it("returns an empty shape when nothing happened", () => {
    const metrics = run({});

    expect(metrics.covers).toBe(0);
    expect(metrics.guestsServed).toBe(0);
    expect(metrics.averageQueueWaitMinutes).toBeNull();
    expect(metrics.averageTableTurnMinutes).toBeNull();
    expect(metrics.queueAbandonmentRate).toBeNull();
    expect(metrics.reservationNoShowRate).toBeNull();
    expect(metrics.tableUtilization).toBeNull();
    expect(metrics.perTableUtilization).toEqual([]);
    expect(metrics.peakServiceTimes).toEqual([]);
  });

  it("counts covers from parties actually seated", () => {
    const metrics = run({
      assignments: [assignment({ partySize: 2 }), assignment({ partySize: 5 })],
    });

    expect(metrics.covers).toBe(7);
    expect(metrics.partiesSeated).toBe(2);
    expect(metrics.averagePartySize).toBe(3.5);
  });

  it("splits covers between reservations and walk ins", () => {
    const metrics = run({
      assignments: [
        assignment({ partySize: 2, reservationId: null, queueEntryId: "q1" }),
        assignment({ partySize: 4, reservationId: "r1", queueEntryId: null }),
      ],
    });

    expect(metrics.walkInCovers).toBe(2);
    expect(metrics.reservationCovers).toBe(4);
  });

  it("counts guests served from both queue and reservations", () => {
    const metrics = run({
      queueEntries: [queueEntry({ guestCount: 3 })],
      reservations: [reservation({ guestCount: 4 })],
    });

    expect(metrics.guestsServed).toBe(7);
  });

  it("averages the queue wait", () => {
    const metrics = run({
      queueEntries: [
        queueEntry({ joinedAt: at(-60), arrivedAt: at(-40) }),
        queueEntry({ joinedAt: at(-60), arrivedAt: at(-20) }),
      ],
    });

    expect(metrics.averageQueueWaitMinutes).toBe(30);
  });

  it("averages the table turn", () => {
    const metrics = run({
      assignments: [
        assignment({ seatedAt: at(-120), completedAt: at(-60) }),
        assignment({ seatedAt: at(-100), completedAt: at(-70) }),
      ],
    });

    expect(metrics.averageTableTurnMinutes).toBe(45);
  });

  it("measures queue abandonment against everyone who joined", () => {
    const metrics = run({
      queueEntries: [
        queueEntry({ status: "ARRIVED" }),
        queueEntry({ status: "LEFT", arrivedAt: null, admittedAt: null, leftAt: at(-5) }),
        queueEntry({ status: "REMOVED", arrivedAt: null, admittedAt: null, removedAt: at(-5) }),
        queueEntry({ status: "WAITING", arrivedAt: null, admittedAt: null }),
      ],
    });

    expect(metrics.queueAbandonmentRate).toBe(0.5);
  });

  it("measures no shows against settled reservations only", () => {
    const metrics = run({
      reservations: [
        reservation({ status: "COMPLETED" }),
        reservation({ status: "ARRIVED", completedAt: null }),
        reservation({
          status: "NO_SHOW",
          arrivedAt: null,
          completedAt: null,
          noShowAt: at(-15),
        }),
        reservation({
          status: "CANCELLED",
          arrivedAt: null,
          completedAt: null,
          cancelledAt: at(-15),
        }),
      ],
    });

    expect(metrics.reservationNoShowRate).toBe(0.333);
  });

  it("reports utilization for every table", () => {
    const metrics = run({
      assignments: [assignment({ tableId: "t1", tableIds: ["t1"] })],
      tables: [
        { id: "t1", name: "T1" },
        { id: "t2", name: "T2" },
      ],
    });

    const byName = new Map(metrics.perTableUtilization.map((row) => [row.tableName, row]));
    expect(byName.get("T1")?.seatedMinutes).toBe(60);
    expect(byName.get("T2")?.seatedMinutes).toBe(0);
    expect(metrics.tableUtilization).toBeGreaterThan(0);
  });

  it("credits every table a joined party used", () => {
    const metrics = run({
      assignments: [assignment({ tableId: "t1", tableIds: ["t1", "t2"], partySize: 7 })],
      tables: [
        { id: "t1", name: "T1" },
        { id: "t2", name: "T2" },
      ],
    });

    const byName = new Map(metrics.perTableUtilization.map((row) => [row.tableName, row]));
    expect(byName.get("T1")?.seatedMinutes).toBe(60);
    expect(byName.get("T2")?.seatedMinutes).toBe(60);
  });

  it("groups covers into the hour a party was seated", () => {
    const seatedAt = at(-120);
    const metrics = run({ assignments: [assignment({ seatedAt, partySize: 3 })] });

    expect(metrics.peakServiceTimes).toEqual([{ hour: seatedAt.getHours(), covers: 3 }]);
  });

  it("leaves out work that falls outside the range", () => {
    const metrics = run({
      assignments: [assignment({ seatedAt: at(-60 * 48), completedAt: at(-60 * 47) })],
      queueEntries: [queueEntry({ joinedAt: at(-60 * 48), arrivedAt: at(-60 * 47) })],
    });

    expect(metrics.covers).toBe(0);
    expect(metrics.averageQueueWaitMinutes).toBeNull();
  });

  it("ignores an assignment that was never seated", () => {
    const metrics = run({
      assignments: [assignment({ seatedAt: null, completedAt: null, status: "CANCELLED" })],
    });

    expect(metrics.covers).toBe(0);
    expect(metrics.partiesSeated).toBe(0);
  });
});

function customRange(fromKey: string, toKey: string) {
  const range = resolveRange("custom", fromKey, toKey, NOW);
  if (!range) {
    throw new Error("range");
  }
  return range;
}

describe("resolveGranularity", () => {
  it("uses daily for a single day", () => {
    expect(resolveGranularity(customRange("2026-08-01", "2026-08-01"))).toBe("daily");
  });

  it("uses daily up to 31 days", () => {
    expect(resolveGranularity(customRange("2026-08-01", "2026-08-31"))).toBe("daily");
  });

  it("switches to weekly at 32 days", () => {
    expect(resolveGranularity(customRange("2026-08-01", "2026-09-01"))).toBe("weekly");
  });

  it("stays weekly at 120 days", () => {
    expect(resolveGranularity(customRange("2026-01-01", "2026-04-30"))).toBe("weekly");
  });

  it("switches to monthly past 120 days", () => {
    expect(resolveGranularity(customRange("2026-01-01", "2026-05-01"))).toBe("monthly");
  });

  it("stays monthly at 730 days", () => {
    expect(resolveGranularity(customRange("2025-01-01", "2026-12-31"))).toBe("monthly");
  });

  it("switches to quarterly beyond 730 days", () => {
    expect(resolveGranularity(customRange("2024-01-01", "2026-12-31"))).toBe("quarterly");
  });
});

describe("buildBuckets", () => {
  it("makes one bucket per day", () => {
    const range = customRange("2026-08-01", "2026-08-03");

    expect(buildBuckets(range, "daily")).toHaveLength(3);
  });

  it("makes sequential seven day buckets from the start date", () => {
    const range = customRange("2026-08-01", "2026-08-14");
    const buckets = buildBuckets(range, "weekly");

    expect(buckets).toHaveLength(2);
    expect(buckets[0].start.getDate()).toBe(1);
    expect(buckets[1].start.getDate()).toBe(8);
  });

  it("lets the final weekly bucket run short", () => {
    const range = customRange("2026-08-01", "2026-08-10");
    const buckets = buildBuckets(range, "weekly");

    expect(buckets).toHaveLength(2);
    const lastDays =
      (buckets[1].end.getTime() - buckets[1].start.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(lastDays)).toBe(3);
  });

  it("never runs a bucket past the end of the range", () => {
    const range = customRange("2026-08-01", "2026-08-10");
    const buckets = buildBuckets(range, "weekly");

    expect(buckets[buckets.length - 1].end.getTime()).toBe(range.to.getTime());
  });

  it("groups monthly buckets on calendar boundaries", () => {
    const range = customRange("2026-01-15", "2026-03-20");
    const buckets = buildBuckets(range, "monthly");

    expect(buckets).toHaveLength(3);
    expect(buckets[1].start.getMonth()).toBe(1);
    expect(buckets[1].start.getDate()).toBe(1);
  });

  it("groups quarterly buckets on calendar boundaries", () => {
    const range = customRange("2026-02-10", "2026-08-20");
    const buckets = buildBuckets(range, "quarterly");

    expect(buckets).toHaveLength(3);
    expect(buckets[1].start.getMonth()).toBe(3);
    expect(buckets[2].start.getMonth()).toBe(6);
  });
});

describe("service activity detection", () => {
  it("reports no activity for a silent range", () => {
    expect(run({}).hasActivity).toBe(false);
  });

  it("counts queue activity", () => {
    expect(run({ queueEntries: [queueEntry()] }).hasActivity).toBe(true);
  });

  it("counts reservation activity", () => {
    expect(run({ reservations: [reservation()] }).hasActivity).toBe(true);
  });

  it("counts seated assignments", () => {
    expect(run({ assignments: [assignment()] }).hasActivity).toBe(true);
  });

  it("treats a measured zero as real activity", () => {
    const metrics = run({
      queueEntries: [queueEntry({ status: "LEFT", arrivedAt: null, admittedAt: null })],
    });

    expect(metrics.hasActivity).toBe(true);
    expect(metrics.covers).toBe(0);
    expect(metrics.queueAbandonmentRate).toBe(1);
  });
});

describe("metrics with no denominator", () => {
  it("leaves table utilization unavailable when nothing was seated", () => {
    const metrics = run({ tables: [{ id: "t1", name: "T1" }] });

    expect(metrics.tableUtilization).toBeNull();
  });

  it("reports utilization once something was seated", () => {
    const metrics = run({
      assignments: [assignment()],
      tables: [{ id: "t1", name: "T1" }],
    });

    expect(metrics.tableUtilization).not.toBeNull();
  });

  it("leaves the queue wait unavailable when nobody waited", () => {
    expect(run({}).averageQueueWaitMinutes).toBeNull();
  });

  it("leaves the turn time unavailable when nothing completed", () => {
    const metrics = run({ assignments: [assignment({ completedAt: null, status: "SEATED" })] });

    expect(metrics.averageTableTurnMinutes).toBeNull();
  });

  it("leaves the no show rate unavailable without settled reservations", () => {
    expect(run({}).reservationNoShowRate).toBeNull();
  });
});

describe("cover buckets", () => {
  it("sums to the headline covers", () => {
    const metrics = run({
      assignments: [assignment({ partySize: 3 }), assignment({ partySize: 4 })],
    });
    const total = metrics.coverBuckets.reduce((sum, bucket) => sum + bucket.covers, 0);

    expect(total).toBe(metrics.covers);
  });

  it("keeps the headline as the range total, not a bucket average", () => {
    const metrics = run({
      assignments: [assignment({ partySize: 3 }), assignment({ partySize: 4 })],
    });

    expect(metrics.covers).toBe(7);
  });

  it("reports the granularity it used", () => {
    expect(run({}).granularity).toBe("daily");
  });
});

describe("utilization against service hours", () => {
  function runWithHours(openMinutes: number | null, assignments: PerformanceAssignment[]) {
    return computePerformance({
      range: todayRange(),
      queueEntries: [],
      reservations: [],
      assignments,
      tables: [
        { id: "t1", name: "T1" },
        { id: "t2", name: "T2" },
      ],
      openMinutesForDate: () => openMinutes,
      now: NOW,
    });
  }

  it("counts only the minutes a location is open", () => {
    const range = todayRange();

    expect(serviceMinutesInRange(range, () => 480, NOW)).toBe(480);
  });

  it("counts nothing on a closed day", () => {
    const range = todayRange();

    expect(serviceMinutesInRange(range, () => 0, NOW)).toBe(0);
  });

  it("never counts more service than has already elapsed", () => {
    const range = resolveRange("today", undefined, undefined, NOW);
    if (!range) {
      throw new Error("range");
    }
    const earlyMorning = new Date("2026-08-27T02:00:00.000Z");
    const elapsed = serviceMinutesInRange(range, () => 1440, earlyMorning);

    expect(elapsed).toBeLessThan(1440);
  });

  it("adds up the open minutes of every day in the range", () => {
    const range = resolveRange("custom", "2026-08-24", "2026-08-26", NOW);
    if (!range) {
      throw new Error("range");
    }

    expect(serviceMinutesInRange(range, () => 600, NOW)).toBe(1800);
  });

  it("reports a believable utilization against open hours", () => {
    const metrics = runWithHours(480, [assignment({ seatedAt: at(-120), completedAt: at(-60) })]);

    expect(metrics.tableUtilization).toBe(0.063);
  });

  it("falls back to the whole range when hours are not configured", () => {
    const metrics = runWithHours(null, [assignment({ seatedAt: at(-120), completedAt: at(-60) })]);

    expect(metrics.tableUtilization).toBeLessThan(0.063);
  });
});

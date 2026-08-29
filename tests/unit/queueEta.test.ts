import { describe, expect, it } from "vitest";
import {
  blendMinutesPerParty,
  computeQueueEta,
  estimateTurnMinutes,
  historicalMinutesPerParty,
  median,
  partyWeight,
  recentMinutesPerParty,
  robustCenter,
  toDisplay,
  trimmedMean,
} from "../../server/lib/queueEta.js";

const NOW = new Date("2026-06-08T12:00:00.000Z");

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    queue: [],
    admittedCustomers: [],
    reservations: [],
    reservationSettings: {},
    reservationsEnabled: false,
    ticketIndex: 0,
    now: NOW,
    ...overrides,
  };
}

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function admittedRun(offsetsAgo: number[], overrides: Record<string, unknown> = {}) {
  return offsetsAgo.map((offset) => ({
    partySize: 2,
    admittedAt: minutesAgo(offset),
    joinedAt: minutesAgo(offset + 10),
    finalStatus: "arrived",
    ...overrides,
  }));
}

describe("partyWeight", () => {
  it("treats a party of two as the baseline weight", () => {
    expect(partyWeight(2)).toBe(1);
  });

  it("scales up for larger parties", () => {
    expect(partyWeight(4)).toBeCloseTo(1.3, 5);
    expect(partyWeight(6)).toBeCloseTo(1.6, 5);
  });

  it("never weights a small party below the baseline", () => {
    expect(partyWeight(1)).toBe(1);
  });

  it("falls back to the default party size for unusable input", () => {
    expect(partyWeight("not-a-number")).toBe(1);
    expect(partyWeight(null)).toBe(1);
    expect(partyWeight(0)).toBe(1);
    expect(partyWeight(-5)).toBe(1);
  });
});

describe("robust statistics", () => {
  it("takes the middle value of an odd sample", () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it("averages the two middle values of an even sample", () => {
    expect(median([60, 80])).toBe(70);
  });

  it("drops the extremes before averaging", () => {
    expect(trimmedMean([1, 5, 6, 7, 500], 0.2)).toBe(6);
  });

  it("keeps every value when the trim would empty the sample", () => {
    expect(trimmedMean([4, 8], 0.5)).toBe(6);
  });

  it("uses the median below the trimmed mean sample floor", () => {
    expect(robustCenter([1, 2, 100])).toBe(2);
  });

  it("uses the trimmed mean once there are enough samples", () => {
    expect(robustCenter([1, 5, 6, 7, 500])).toBe(6);
  });
});

describe("estimateTurnMinutes", () => {
  function visit(fromMinutes: number, toMinutes: number) {
    return {
      seatedAt: new Date(NOW.getTime() + fromMinutes * 60_000),
      completedAt: new Date(NOW.getTime() + toMinutes * 60_000),
    };
  }

  it("falls back to the default turn when nothing has been completed", () => {
    const turn = estimateTurnMinutes([]);

    expect(turn.minutes).toBe(90);
    expect(turn.sampleCount).toBe(0);
    expect(turn.usedDefault).toBe(true);
  });

  it("falls back to the default until the minimum sample count is reached", () => {
    const turn = estimateTurnMinutes([visit(0, 60), visit(0, 70)]);

    expect(turn.minutes).toBe(90);
    expect(turn.usedDefault).toBe(true);
  });

  it("takes a robust centre of valid completed visits", () => {
    const turn = estimateTurnMinutes([visit(0, 60), visit(0, 70), visit(0, 80)]);

    expect(turn.minutes).toBe(70);
    expect(turn.sampleCount).toBe(3);
    expect(turn.usedDefault).toBe(false);
  });

  it("ignores an outlier rather than letting it drag the estimate", () => {
    const turn = estimateTurnMinutes([
      visit(0, 60),
      visit(0, 65),
      visit(0, 70),
      visit(0, 75),
      visit(0, 470),
    ]);

    expect(turn.minutes).toBe(70);
  });

  it("rejects visits with a missing or corrupted duration", () => {
    const turn = estimateTurnMinutes([
      { seatedAt: null, completedAt: new Date(NOW) },
      { seatedAt: new Date(NOW), completedAt: null },
      visit(0, -30),
      visit(0, 2),
      visit(0, 600),
      visit(0, 60),
      visit(0, 70),
      visit(0, 80),
    ]);

    expect(turn.sampleCount).toBe(3);
    expect(turn.minutes).toBe(70);
  });

  it("clamps an implausible centre into the supported band", () => {
    const short = estimateTurnMinutes([visit(0, 6), visit(0, 7), visit(0, 8)]);
    const long = estimateTurnMinutes([visit(0, 400), visit(0, 420), visit(0, 440)]);

    expect(short.minutes).toBe(30);
    expect(long.minutes).toBe(180);
  });
});

describe("recentMinutesPerParty", () => {
  it("measures the cadence between admissions rather than a queue wait", () => {
    const estimate = recentMinutesPerParty(admittedRun([30, 20, 10]), NOW);

    expect(estimate.sampleCount).toBe(3);
    expect(estimate.value).toBe(10);
  });

  it("reports nothing when a single admission gives no usable cadence", () => {
    const estimate = recentMinutesPerParty(admittedRun([10]), NOW);

    expect(estimate.value).toBeNull();
    expect(estimate.sampleCount).toBe(0);
  });

  it("widens to the two hour window when the last hour is too thin", () => {
    const estimate = recentMinutesPerParty(admittedRun([100, 90, 80]), NOW);

    expect(estimate.value).toBe(10);
  });

  it("counts the open interval since the last admission as evidence of pace", () => {
    const estimate = recentMinutesPerParty(admittedRun([40, 30]), NOW);

    expect(estimate.sampleCount).toBe(2);
    expect(estimate.value).toBe(20);
  });

  it("treats a long silence as a break in service rather than a slow party", () => {
    const estimate = recentMinutesPerParty(admittedRun([59, 1]), NOW);

    expect(estimate.value).toBeNull();
  });

  it("is not dragged away by a single burst of admissions", () => {
    const estimate = recentMinutesPerParty(admittedRun([50, 40, 30, 20, 20, 20, 10]), NOW);

    expect(estimate.value).toBeLessThanOrEqual(10);
    expect(estimate.value).toBeGreaterThan(0);
  });

  it("ignores admissions recorded in the future", () => {
    const future = [
      { admittedAt: new Date(NOW.getTime() + 10 * 60_000) },
      { admittedAt: new Date(NOW.getTime() + 20 * 60_000) },
      { admittedAt: new Date(NOW.getTime() + 30 * 60_000) },
    ];

    expect(recentMinutesPerParty(future, NOW).value).toBeNull();
  });

  it("ignores an unusable timestamp", () => {
    const broken = [{ admittedAt: "not a date" }, { admittedAt: null }];

    expect(recentMinutesPerParty(broken, NOW).value).toBeNull();
  });

  it("leaves no-shows out of the seating cadence", () => {
    const estimate = recentMinutesPerParty(
      admittedRun([30, 20, 10], { finalStatus: "no_show" }),
      NOW,
    );

    expect(estimate.value).toBeNull();
  });
});

describe("historicalMinutesPerParty", () => {
  function admittedAtAbsolute(times: Date[]) {
    return times.map((at) => ({ admittedAt: at, partySize: 2 }));
  }

  function daysAgoAtSameHour(days: number, minuteOffsets: number[]): Date[] {
    return minuteOffsets.map(
      (offset) => new Date(NOW.getTime() - days * 24 * 60 * 60_000 + offset * 60_000),
    );
  }

  it("reports nothing when there are no consecutive admissions", () => {
    const estimate = historicalMinutesPerParty(admittedAtAbsolute([NOW]), NOW);

    expect(estimate.value).toBeNull();
    expect(estimate.cohort).toBe("NONE");
  });

  it("prefers the same weekday and hour cohort", () => {
    const samples = admittedAtAbsolute([
      ...daysAgoAtSameHour(7, [0, 8, 16, 24]),
      ...daysAgoAtSameHour(3, [0, 40]),
    ]);

    const estimate = historicalMinutesPerParty(samples, NOW, "UTC");

    expect(estimate.cohort).toBe("DOW_HOUR");
    expect(estimate.value).toBe(8);
    expect(estimate.sampleCount).toBe(3);
  });

  it("falls back to the same hour on other weekdays", () => {
    const samples = admittedAtAbsolute(daysAgoAtSameHour(3, [0, 12, 24, 36]));

    const estimate = historicalMinutesPerParty(samples, NOW, "UTC");

    expect(estimate.cohort).toBe("HOUR");
    expect(estimate.value).toBe(12);
  });

  it("falls back to recent samples when the hour cohort is thin", () => {
    const samples = admittedAtAbsolute(
      [0, 6, 12, 18].map((offset) => new Date(NOW.getTime() - 5 * 60 * 60_000 + offset * 60_000)),
    );

    const estimate = historicalMinutesPerParty(samples, NOW, "UTC");

    expect(estimate.cohort).toBe("RECENT");
    expect(estimate.value).toBe(6);
  });

  it("falls back to every valid sample when nothing recent exists", () => {
    const long = new Date(NOW.getTime() - 40 * 24 * 60 * 60_000);
    const samples = admittedAtAbsolute([long, new Date(long.getTime() + 9 * 60_000)]);

    const estimate = historicalMinutesPerParty(samples, NOW, "UTC");

    expect(estimate.cohort).toBe("ALL");
    expect(estimate.value).toBe(9);
  });

  it("throws out a service break instead of treating it as one slow party", () => {
    const start = new Date(NOW.getTime() - 30 * 24 * 60 * 60_000);
    const samples = admittedAtAbsolute([
      start,
      new Date(start.getTime() + 10 * 60_000),
      new Date(start.getTime() + 24 * 60 * 60_000),
      new Date(start.getTime() + 24 * 60 * 60_000 + 20 * 60_000),
    ]);

    const estimate = historicalMinutesPerParty(samples, NOW, "UTC");

    expect(estimate.cohort).toBe("ALL");
    expect(estimate.value).toBe(15);
  });

  it("is not dragged upward by one extreme interval", () => {
    const start = new Date(NOW.getTime() - 20 * 24 * 60 * 60_000);
    const offsets = [0, 5, 10, 15, 20, 64];
    const samples = admittedAtAbsolute(
      offsets.map((offset) => new Date(start.getTime() + offset * 60_000)),
    );

    const estimate = historicalMinutesPerParty(samples, NOW, "UTC");

    expect(estimate.value).toBe(5);
  });
});

describe("blendMinutesPerParty", () => {
  it("uses the fallback constant when there is no evidence at all", () => {
    const blended = blendMinutesPerParty(
      { value: null, sampleCount: 0 },
      { value: null, sampleCount: 0 },
    );

    expect(blended.value).toBe(5);
    expect(blended.weight).toBe(0);
  });

  it("uses history alone when there is no recent cadence", () => {
    const blended = blendMinutesPerParty(
      { value: null, sampleCount: 0 },
      { value: 12, sampleCount: 9 },
    );

    expect(blended.value).toBe(12);
    expect(blended.weight).toBe(0);
  });

  it("uses the recent cadence alone when there is no history", () => {
    const blended = blendMinutesPerParty(
      { value: 8, sampleCount: 3 },
      { value: null, sampleCount: 0 },
    );

    expect(blended.value).toBe(8);
    expect(blended.weight).toBe(1);
  });

  it("weights the recent cadence by how many samples back it", () => {
    const thin = blendMinutesPerParty({ value: 20, sampleCount: 2 }, { value: 10, sampleCount: 9 });
    const rich = blendMinutesPerParty({ value: 20, sampleCount: 8 }, { value: 10, sampleCount: 9 });

    expect(thin.weight).toBe(0.5);
    expect(thin.value).toBe(15);
    expect(rich.weight).toBe(0.75);
    expect(rich.value).toBe(17.5);
  });

  it("clamps the blended rate into the supported band", () => {
    const fast = blendMinutesPerParty({ value: 1, sampleCount: 8 }, { value: 1, sampleCount: 8 });
    const slow = blendMinutesPerParty({ value: 90, sampleCount: 8 }, { value: 90, sampleCount: 8 });

    expect(fast.value).toBe(3);
    expect(slow.value).toBe(30);
  });
});

describe("toDisplay", () => {
  it("reports a very short wait plainly", () => {
    expect(toDisplay(0)).toEqual({ min: 0, max: 5, text: "Less Than 5 Minutes" });
    expect(toDisplay(4.99)).toEqual({ min: 0, max: 5, text: "Less Than 5 Minutes" });
  });

  it("opens a new band exactly on the boundary", () => {
    expect(toDisplay(5)).toEqual({ min: 5, max: 10, text: "5-10 Minutes" });
    expect(toDisplay(9.99)).toEqual({ min: 5, max: 10, text: "5-10 Minutes" });
    expect(toDisplay(10)).toEqual({ min: 10, max: 15, text: "10-15 Minutes" });
  });

  it("caps the top band at an hour", () => {
    expect(toDisplay(59.9)).toEqual({ min: 55, max: 60, text: "55-60 Minutes" });
    expect(toDisplay(60)).toEqual({ min: 60, max: 60, text: "60+ Minutes" });
    expect(toDisplay(240)).toEqual({ min: 60, max: 60, text: "60+ Minutes" });
  });

  it("snaps floating point dust onto the band boundary", () => {
    expect(toDisplay(39.999999999)).toEqual({ min: 40, max: 45, text: "40-45 Minutes" });
  });
});

describe("computeQueueEta", () => {
  it("reports the front of the queue as position 1 with nobody ahead", () => {
    const eta = computeQueueEta(baseInput());

    expect(eta.status).toBe("ETA");
    expect(eta.position).toBe(1);
    expect(eta.peopleAhead).toBe(0);
    expect(eta.estimatedWaitMin).toBe(0);
    expect(eta.basis.weightedQueueAhead).toBe(0);
  });

  it("derives position and people ahead from the ticket index", () => {
    const eta = computeQueueEta(
      baseInput({
        ticketIndex: 3,
        queue: [{ partySize: 2 }, { partySize: 2 }, { partySize: 2 }, { partySize: 2 }],
      }),
    );

    expect(eta.position).toBe(4);
    expect(eta.peopleAhead).toBe(3);
  });

  it("clamps a negative ticket index to the front of the queue", () => {
    const eta = computeQueueEta(baseInput({ ticketIndex: -4 }));

    expect(eta.position).toBe(1);
    expect(eta.peopleAhead).toBe(0);
  });

  it("waits longer when the parties ahead are larger", () => {
    const smallParties = computeQueueEta(
      baseInput({
        ticketIndex: 3,
        queue: [{ partySize: 2 }, { partySize: 2 }, { partySize: 2 }],
      }),
    );
    const largeParties = computeQueueEta(
      baseInput({
        ticketIndex: 3,
        queue: [{ partySize: 8 }, { partySize: 8 }, { partySize: 8 }],
      }),
    );

    expect(largeParties.basis.weightedQueueAhead).toBeGreaterThan(
      smallParties.basis.weightedQueueAhead,
    );
    expect(largeParties.throughputEtaMinutes).toBeGreaterThan(smallParties.throughputEtaMinutes);
  });

  it("produces a min estimate no greater than the max estimate", () => {
    const eta = computeQueueEta(
      baseInput({ ticketIndex: 5, queue: new Array(6).fill({ partySize: 3 }) }),
    );

    expect(eta.estimatedWaitMin).toBeLessThanOrEqual(eta.estimatedWaitMax as number);
  });

  it("tolerates non-array inputs without throwing", () => {
    const eta = computeQueueEta(
      baseInput({
        queue: null,
        admittedCustomers: undefined,
        reservations: "nope",
        diningTables: "nope",
      }),
    );

    expect(eta.position).toBe(1);
    expect(eta.basis.weightedQueueAhead).toBe(0);
  });

  it("carries the recent cadence into the blended rate", () => {
    const eta = computeQueueEta(
      baseInput({
        ticketIndex: 2,
        queue: [{ partySize: 2 }, { partySize: 2 }, { partySize: 2 }],
        admittedCustomers: admittedRun([24, 16, 8]),
      }),
    );

    expect(eta.basis.usedRecentServiceRate).toBe(true);
    expect(eta.basis.recentMinutesPerParty).toBe(8);
    expect(eta.basis.recentSampleCount).toBe(3);
  });

  it("reports no service rate at all for an empty history", () => {
    const eta = computeQueueEta(baseInput({ ticketIndex: 2, queue: [{}, {}, {}] }));

    expect(eta.basis.usedRecentServiceRate).toBe(false);
    expect(eta.basis.usedHistoricalCadence).toBe(false);
    expect(eta.basis.blendedMinutesPerParty).toBe(5);
    expect(eta.confidence).toBe("low");
  });

  it("always returns a human readable display string", () => {
    const eta = computeQueueEta(baseInput({ ticketIndex: 12 }));

    expect(typeof eta.displayText).toBe("string");
    expect(eta.displayText.length).toBeGreaterThan(0);
  });

  it("keeps the blended service rate inside the configured bounds", () => {
    const eta = computeQueueEta(
      baseInput({
        ticketIndex: 4,
        queue: new Array(5).fill({ partySize: 10 }),
      }),
    );

    expect(eta.basis.blendedMinutesPerParty).toBeGreaterThanOrEqual(3);
    expect(eta.basis.blendedMinutesPerParty).toBeLessThanOrEqual(30);
  });
});

function at(offsetMinutes: number): string {
  return new Date(NOW.getTime() + offsetMinutes * 60 * 1000).toISOString();
}

function etaTable(overrides: Record<string, unknown> = {}) {
  return {
    id: "table-1",
    roomId: "room-1",
    capacity: 4,
    minimumPartySize: 1,
    isBlocked: false,
    ...overrides,
  };
}

function tableInput(overrides: Record<string, unknown> = {}) {
  return baseInput({
    queue: [{ partySize: 2 }],
    diningTables: [etaTable()],
    tableOccupancy: [],
    ...overrides,
  });
}

describe("computeQueueEta with table inventory", () => {
  it("seats the front of the queue right away when a table is open", () => {
    const eta = computeQueueEta(tableInput());

    expect(eta.basis.usedTableInventory).toBe(true);
    expect(eta.tableEtaMinutes).toBe(0);
    expect(eta.displayText).toBe("Less Than 5 Minutes");
  });

  it("waits until the party sitting at the only table is expected to leave", () => {
    const eta = computeQueueEta(
      tableInput({
        tableOccupancy: [{ tableIds: ["table-1"], start: at(-30), end: at(40) }],
      }),
    );

    expect(eta.tableEtaMinutes).toBe(40);
    expect(eta.reason).toBe("TABLE_CONSTRAINED");
    expect(eta.estimatedWaitMin).toBe(40);
    expect(eta.estimatedWaitMax).toBe(45);
  });

  it("puts the party behind everyone ahead of them in the queue", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 2 }, { partySize: 2 }],
        ticketIndex: 1,
        turnMinutes: 45,
        turnSampleCount: 20,
      }),
    );

    expect(eta.basis.partiesAheadOfTable).toBe(1);
    expect(eta.tableEtaMinutes).toBe(45);
  });

  it("only counts tables the party actually fits", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 5 }],
        diningTables: [
          etaTable({ id: "small", capacity: 2 }),
          etaTable({ id: "large", capacity: 6 }),
        ],
        tableOccupancy: [{ tableIds: ["large"], start: at(-10), end: at(30) }],
      }),
    );

    expect(eta.tableEtaMinutes).toBe(30);
  });

  it("respects a table minimum party size", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 2 }],
        diningTables: [
          etaTable({ id: "big-only", capacity: 8, minimumPartySize: 5 }),
          etaTable({ id: "regular", capacity: 4 }),
        ],
        tableOccupancy: [{ tableIds: ["regular"], start: at(-10), end: at(25) }],
      }),
    );

    expect(eta.tableEtaMinutes).toBe(25);
  });

  it("waits out the rest of a cleaning turnaround", () => {
    const eta = computeQueueEta(
      tableInput({ diningTables: [etaTable({ cleaningSince: at(-2) })] }),
    );

    expect(eta.tableEtaMinutes).toBe(3);
  });

  it("finds a gap that opens between two bookings", () => {
    const eta = computeQueueEta(
      tableInput({
        turnMinutes: 30,
        turnSampleCount: 20,
        tableOccupancy: [
          { tableIds: ["table-1"], start: at(-30), end: at(20) },
          { tableIds: ["table-1"], start: at(60), end: at(150) },
        ],
      }),
    );

    expect(eta.tableEtaMinutes).toBe(20);
  });

  it("skips a gap that is too narrow for a full turn", () => {
    const eta = computeQueueEta(
      tableInput({
        turnMinutes: 60,
        turnSampleCount: 20,
        tableOccupancy: [
          { tableIds: ["table-1"], start: at(-30), end: at(20) },
          { tableIds: ["table-1"], start: at(60), end: at(150) },
        ],
      }),
    );

    expect(eta.tableEtaMinutes).toBe(150);
  });

  it("cannot schedule a blocked table and says so", () => {
    const eta = computeQueueEta(tableInput({ diningTables: [etaTable({ isBlocked: true })] }));

    expect(eta.status).toBe("ETA");
    expect(eta.reason).toBe("TABLES_UNAVAILABLE");
    expect(eta.basis.usedTableInventory).toBe(false);
    expect(eta.basis.hasFloorPlan).toBe(true);
    expect(eta.tableEtaMinutes).toBeNull();
  });

  it("falls back to throughput when the location has no floor plan", () => {
    const eta = computeQueueEta(baseInput({ queue: [{ partySize: 2 }], ticketIndex: 0 }));

    expect(eta.status).toBe("ETA");
    expect(eta.reason).toBe("NO_FLOOR_DATA");
    expect(eta.basis.hasFloorPlan).toBe(false);
    expect(eta.tableEtaMinutes).toBeNull();
  });

  it("holds the table for a booking the walk-in would run into", () => {
    const eta = computeQueueEta(
      tableInput({
        reservationsEnabled: true,
        reservations: [{ id: "res-1", status: "confirmed", reservationDateTime: at(30) }],
        turnMinutes: 90,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(120);
    expect(eta.basis.reservationsHeld).toBe(1);
  });

  it("seats the walk-in before a booking when the turn still fits", () => {
    const eta = computeQueueEta(
      tableInput({
        reservationsEnabled: true,
        reservations: [{ id: "res-1", status: "confirmed", reservationDateTime: at(30) }],
        turnMinutes: 30,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(0);
  });

  it("leaves bookings out when reservations are switched off", () => {
    const eta = computeQueueEta(
      tableInput({
        reservationsEnabled: false,
        reservations: [{ id: "res-1", status: "confirmed", reservationDateTime: at(30) }],
        turnMinutes: 90,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(0);
    expect(eta.basis.reservationsHeld).toBe(0);
  });

  it("ignores a cancelled or no-show booking", () => {
    const eta = computeQueueEta(
      tableInput({
        reservationsEnabled: true,
        reservations: [
          { id: "res-1", status: "cancelled", reservationDateTime: at(30) },
          { id: "res-2", status: "no_show", reservationDateTime: at(30) },
        ],
        turnMinutes: 90,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(0);
    expect(eta.basis.reservationsHeld).toBe(0);
  });

  it("still holds inventory for a booking inside its hold window", () => {
    const eta = computeQueueEta(
      tableInput({
        reservationsEnabled: true,
        reservationSettings: { reservationHoldMinutes: 15, defaultReservationDurationMinutes: 90 },
        reservations: [{ id: "res-1", status: "confirmed", reservationDateTime: at(-10) }],
        turnMinutes: 90,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(90);
  });

  it("releases inventory once the hold window has lapsed", () => {
    const eta = computeQueueEta(
      tableInput({
        reservationsEnabled: true,
        reservationSettings: { reservationHoldMinutes: 15, defaultReservationDurationMinutes: 90 },
        reservations: [{ id: "res-1", status: "confirmed", reservationDateTime: at(-40) }],
        turnMinutes: 90,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(0);
  });

  it("does not hold a second table for a booking that already has one", () => {
    const eta = computeQueueEta(
      tableInput({
        reservationsEnabled: true,
        reservations: [{ id: "res-1", status: "confirmed", reservationDateTime: at(30) }],
        tableOccupancy: [
          { tableIds: ["table-1"], start: at(-5), end: at(20), reservationId: "res-1" },
        ],
        turnMinutes: 90,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(20);
    expect(eta.basis.reservationsHeld).toBe(0);
  });

  it("counts an admitted guest who has not taken a table yet", () => {
    const eta = computeQueueEta(
      tableInput({
        admittedCustomers: [
          { id: "queue-1", finalStatus: "pending", partySize: 2, admittedAt: at(-1) },
        ],
        turnMinutes: 60,
        turnSampleCount: 20,
      }),
    );

    expect(eta.basis.partiesAheadOfTable).toBe(1);
    expect(eta.tableEtaMinutes).toBe(60);
  });

  it("stops counting an admitted guest once they hold a table", () => {
    const eta = computeQueueEta(
      tableInput({
        admittedCustomers: [
          { id: "queue-1", finalStatus: "pending", partySize: 2, admittedAt: at(-1) },
        ],
        tableOccupancy: [
          { tableIds: ["table-1"], start: at(-1), end: at(15), queueEntryId: "queue-1" },
        ],
      }),
    );

    expect(eta.basis.partiesAheadOfTable).toBe(0);
    expect(eta.tableEtaMinutes).toBe(15);
  });

  it("never promises a seat sooner than the queue can be worked through", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 2 }, { partySize: 2 }, { partySize: 2 }, { partySize: 2 }],
        ticketIndex: 3,
        diningTables: [
          etaTable({ id: "t1" }),
          etaTable({ id: "t2" }),
          etaTable({ id: "t3" }),
          etaTable({ id: "t4" }),
        ],
      }),
    );

    expect(eta.tableEtaMinutes).toBe(0);
    expect(eta.reason).toBe("THROUGHPUT_CONSTRAINED");
    expect(eta.estimatedWaitMin).toBe(15);
  });

  it("frees a joined table setup only when every seat in it comes back", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 2 }],
        diningTables: [etaTable({ id: "t1", capacity: 2 }), etaTable({ id: "t2", capacity: 2 })],
        tableOccupancy: [{ tableIds: ["t1", "t2"], start: at(-20), end: at(35) }],
      }),
    );

    expect(eta.tableEtaMinutes).toBe(35);
  });

  it("keeps the turn time it was given inside sane bounds", () => {
    const eta = computeQueueEta(tableInput({ turnMinutes: 600 }));

    expect(eta.basis.turnMinutes).toBe(180);
  });
});

describe("computeQueueEta capacity states", () => {
  it("returns no capacity when the party outgrows every seating setup", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 9 }],
        diningTables: [etaTable({ id: "t1", capacity: 4 }), etaTable({ id: "t2", capacity: 4 })],
      }),
    );

    expect(eta.status).toBe("NO_CAPACITY");
    expect(eta.reason).toBe("PARTY_EXCEEDS_SEATING");
    expect(eta.confidence).toBe("high");
    expect(eta.etaMinutes).toBeNull();
    expect(eta.estimatedWaitMin).toBeNull();
    expect(eta.estimatedWaitMax).toBeNull();
    expect(eta.displayText).toBe("No Table Fits This Party");
  });

  it("does not fall back to a throughput estimate when there is no capacity", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 2 }, { partySize: 2 }, { partySize: 12 }],
        ticketIndex: 2,
        diningTables: [etaTable({ id: "t1", capacity: 4 })],
      }),
    );

    expect(eta.status).toBe("NO_CAPACITY");
    expect(eta.throughputEtaMinutes).toBeGreaterThan(0);
    expect(eta.etaMinutes).toBeNull();
  });

  it("does not call a missing floor plan a capacity problem", () => {
    const eta = computeQueueEta(baseInput({ queue: [{ partySize: 40 }] }));

    expect(eta.status).toBe("ETA");
    expect(eta.reason).toBe("NO_FLOOR_DATA");
  });

  it("counts a blocked table toward physical capacity", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 6 }],
        diningTables: [etaTable({ id: "t1", capacity: 8, isBlocked: true })],
      }),
    );

    expect(eta.status).toBe("ETA");
    expect(eta.reason).toBe("TABLES_UNAVAILABLE");
  });

  it("rejects a party below every table minimum as no capacity", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 1 }],
        diningTables: [etaTable({ id: "t1", capacity: 10, minimumPartySize: 6 })],
      }),
    );

    expect(eta.status).toBe("NO_CAPACITY");
  });
});

describe("computeQueueEta with table combinations", () => {
  function pairRoom(overrides: Record<string, unknown> = {}) {
    return tableInput({
      queue: [{ partySize: 7 }],
      diningTables: [
        etaTable({ id: "t1", capacity: 4 }),
        etaTable({ id: "t2", capacity: 4 }),
        etaTable({ id: "t3", capacity: 2 }),
      ],
      turnMinutes: 60,
      turnSampleCount: 20,
      ...overrides,
    });
  }

  it("joins two tables when no single table fits the party", () => {
    const eta = computeQueueEta(pairRoom());

    expect(eta.status).toBe("ETA");
    expect(eta.basis.usedTableCombination).toBe(true);
    expect(eta.tableEtaMinutes).toBe(0);
  });

  it("waits for the slowest table in the combination", () => {
    const eta = computeQueueEta(
      pairRoom({
        tableOccupancy: [{ tableIds: ["t2"], start: at(-10), end: at(25) }],
      }),
    );

    expect(eta.tableEtaMinutes).toBe(25);
  });

  it("will not join tables from different rooms", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 7 }],
        diningTables: [
          etaTable({ id: "t1", roomId: "room-1", capacity: 4 }),
          etaTable({ id: "t2", roomId: "room-2", capacity: 4 }),
        ],
      }),
    );

    expect(eta.status).toBe("NO_CAPACITY");
  });

  it("respects the highest minimum party size across the joined tables", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 7 }],
        diningTables: [
          etaTable({ id: "t1", capacity: 4 }),
          etaTable({ id: "t2", capacity: 4, minimumPartySize: 8 }),
        ],
      }),
    );

    expect(eta.status).toBe("NO_CAPACITY");
  });

  it("prefers a configured combination over an inferred join", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 7 }],
        diningTables: [
          etaTable({ id: "t1", capacity: 4 }),
          etaTable({ id: "t2", capacity: 4 }),
          etaTable({ id: "t3", capacity: 4 }),
        ],
        tableCombinations: [{ id: "combo", tableIds: ["t1", "t3"] }],
        tableOccupancy: [{ tableIds: ["t1"], start: at(-5), end: at(35) }],
        turnMinutes: 60,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(35);
  });

  it("ignores a configured combination that names a table the floor no longer has", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 7 }],
        diningTables: [etaTable({ id: "t1", capacity: 4 }), etaTable({ id: "t2", capacity: 4 })],
        tableCombinations: [{ id: "combo", tableIds: ["t1", "gone"] }],
        turnMinutes: 60,
        turnSampleCount: 20,
      }),
    );

    expect(eta.status).toBe("ETA");
    expect(eta.tableEtaMinutes).toBe(0);
  });

  it("honours a configured minimum party size on the combination", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 7 }],
        diningTables: [etaTable({ id: "t1", capacity: 4 }), etaTable({ id: "t2", capacity: 4 })],
        tableCombinations: [{ id: "combo", tableIds: ["t1", "t2"], minimumPartySize: 8 }],
        turnMinutes: 60,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(0);
    expect(eta.basis.usedTableCombination).toBe(true);
  });

  it("cannot reuse a table that another simulated combination already holds", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 7 }, { partySize: 7 }],
        ticketIndex: 1,
        diningTables: [
          etaTable({ id: "t1", capacity: 4 }),
          etaTable({ id: "t2", capacity: 4 }),
          etaTable({ id: "t3", capacity: 4 }),
        ],
        turnMinutes: 60,
        turnSampleCount: 20,
      }),
    );

    expect(eta.tableEtaMinutes).toBe(60);
  });

  it("cannot join a blocked table into a combination", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 7 }],
        diningTables: [
          etaTable({ id: "t1", capacity: 4 }),
          etaTable({ id: "t2", capacity: 4, isBlocked: true }),
        ],
        turnMinutes: 60,
        turnSampleCount: 20,
      }),
    );

    expect(eta.status).toBe("ETA");
    expect(eta.reason).toBe("TABLES_UNAVAILABLE");
    expect(eta.tableEtaMinutes).toBeNull();
  });
});

describe("computeQueueEta reservation pressure", () => {
  const reservations = [
    { id: "r1", status: "confirmed", reservationDateTime: at(10), partySize: 4 },
    { id: "r2", status: "confirmed", reservationDateTime: at(20), partySize: 4 },
  ];

  it("adds reserved parties to the work ahead when there is no floor plan", () => {
    const eta = computeQueueEta(
      baseInput({
        queue: new Array(8).fill({ partySize: 2 }),
        ticketIndex: 7,
        reservations,
        reservationsEnabled: true,
      }),
    );

    expect(eta.basis.usedReservationPressure).toBe(true);
    expect(eta.basis.reservationWeightAhead).toBeCloseTo(2.6, 5);
    expect(eta.throughputEtaMinutes).toBeCloseTo((7 + 2.6) * 5, 5);
  });

  it("does not double count reservations once the floor schedules them", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: new Array(8).fill({ partySize: 2 }),
        ticketIndex: 7,
        diningTables: [etaTable({ id: "t1" }), etaTable({ id: "t2" })],
        reservations,
        reservationsEnabled: true,
        turnMinutes: 60,
        turnSampleCount: 20,
      }),
    );

    expect(eta.basis.usedTableInventory).toBe(true);
    expect(eta.basis.usedReservationPressure).toBe(false);
    expect(eta.basis.reservationWeightAhead).toBe(0);
    expect(eta.throughputEtaMinutes).toBeCloseTo(7 * 5, 5);
  });

  it("ignores reservation pressure when reservations are switched off", () => {
    const eta = computeQueueEta(
      baseInput({
        queue: new Array(8).fill({ partySize: 2 }),
        ticketIndex: 7,
        reservations,
        reservationsEnabled: false,
      }),
    );

    expect(eta.basis.usedReservationPressure).toBe(false);
  });

  it("does not charge the front of the queue for later bookings", () => {
    const eta = computeQueueEta(
      baseInput({
        queue: [{ partySize: 2 }],
        ticketIndex: 0,
        reservations,
        reservationsEnabled: true,
      }),
    );

    expect(eta.basis.usedReservationPressure).toBe(false);
    expect(eta.throughputEtaMinutes).toBe(0);
  });

  it("ignores the reservation guest cap as if it were table capacity", () => {
    const capped = computeQueueEta(
      baseInput({
        queue: new Array(8).fill({ partySize: 2 }),
        ticketIndex: 7,
        reservations,
        reservationsEnabled: true,
        reservationSettings: { maxReservedGuestsPerHour: 4 },
      }),
    );
    const uncapped = computeQueueEta(
      baseInput({
        queue: new Array(8).fill({ partySize: 2 }),
        ticketIndex: 7,
        reservations,
        reservationsEnabled: true,
        reservationSettings: { maxReservedGuestsPerHour: 0 },
      }),
    );

    expect(capped.throughputEtaMinutes).toBe(uncapped.throughputEtaMinutes);
  });
});

describe("computeQueueEta confidence", () => {
  function richHistory() {
    const offsets: number[] = [];
    for (let index = 0; index < 24; index += 1) {
      offsets.push(120 - index * 5);
    }
    return admittedRun(offsets);
  }

  it("rates a fallback-only estimate as low", () => {
    const eta = computeQueueEta(baseInput({ queue: [{ partySize: 2 }, {}], ticketIndex: 1 }));

    expect(eta.confidence).toBe("low");
  });

  it("rates a floor-backed estimate with deep history as high", () => {
    const eta = computeQueueEta(
      tableInput({
        queue: [{ partySize: 2 }, { partySize: 2 }],
        ticketIndex: 1,
        admittedCustomers: richHistory(),
        diningTables: [etaTable({ id: "t1" }), etaTable({ id: "t2" })],
        turnMinutes: 75,
        turnSampleCount: 24,
        timezone: "UTC",
      }),
    );

    expect(eta.confidence).toBe("high");
  });

  it("never rates an estimate with no floor plan as high", () => {
    const eta = computeQueueEta(
      baseInput({
        queue: [{ partySize: 2 }, { partySize: 2 }],
        ticketIndex: 1,
        admittedCustomers: richHistory(),
        timezone: "UTC",
      }),
    );

    expect(eta.basis.hasFloorPlan).toBe(false);
    expect(eta.confidence).toBe("medium");
  });

  it("drops confidence when the table forecast rests on a default turn time", () => {
    const withSamples = computeQueueEta(
      tableInput({
        queue: [{ partySize: 2 }, { partySize: 2 }],
        ticketIndex: 1,
        admittedCustomers: richHistory(),
        turnMinutes: 75,
        turnSampleCount: 24,
        timezone: "UTC",
      }),
    );
    const withoutSamples = computeQueueEta(
      tableInput({
        queue: [{ partySize: 2 }, { partySize: 2 }],
        ticketIndex: 1,
        admittedCustomers: richHistory(),
        timezone: "UTC",
      }),
    );

    expect(withSamples.basis.usedDefaultTurnMinutes).toBe(false);
    expect(withoutSamples.basis.usedDefaultTurnMinutes).toBe(true);
    expect(withoutSamples.confidence).not.toBe("high");
  });
});

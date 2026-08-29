import { describe, expect, it } from "vitest";
import {
  buildSimulatedTables,
  canEverSeat,
  computeQueueEta,
  deriveCombinationSetups,
  earliestSetupStart,
  etaForAllQueueCustomers,
  etaForToken,
  MAX_COMBINATION_CANDIDATES,
  resolveReservationStartMs,
  scoreConfidence,
  setupsForParty,
  simulateSeating,
  turnSampleMinutes,
} from "../../server/lib/queueEta.js";
import { normalizeSettings } from "../../server/lib/reservations.js";

const NOW = new Date("2026-08-12T19:00:00.000Z");

function at(offsetMinutes: number): string {
  return new Date(NOW.getTime() + offsetMinutes * 60_000).toISOString();
}

function ticket(overrides: Record<string, unknown> = {}) {
  return { queueToken: `qt-${Math.random()}`, partySize: 2, ...overrides };
}

function table(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    roomId: "room-1",
    capacity: 4,
    minimumPartySize: 1,
    isBlocked: false,
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    queue: [ticket(), ticket(), ticket()],
    admittedCustomers: [],
    reservations: [],
    reservationSettings: {},
    reservationsEnabled: true,
    ticketIndex: 2,
    now: NOW,
    ...overrides,
  };
}

describe("resolveReservationStartMs", () => {
  it("reads a bare wall clock string in the location timezone", () => {
    const jakarta = resolveReservationStartMs("2026-08-12T19:00", "Asia/Jakarta");
    const utc = resolveReservationStartMs("2026-08-12T19:00", "UTC");

    expect(utc).toBe(Date.UTC(2026, 7, 12, 19, 0));
    expect(jakarta).toBe(Date.UTC(2026, 7, 12, 12, 0));
  });

  it("treats an absolute timestamp as absolute regardless of timezone", () => {
    const value = "2026-08-12T19:00:00.000Z";

    expect(resolveReservationStartMs(value, "Asia/Jakarta")).toBe(NOW.getTime());
    expect(resolveReservationStartMs(new Date(value), "Asia/Jakarta")).toBe(NOW.getTime());
  });

  it("reports nothing for an unusable value", () => {
    expect(resolveReservationStartMs("not a date")).toBeNull();
    expect(resolveReservationStartMs(null)).toBeNull();
    expect(resolveReservationStartMs(undefined)).toBeNull();
  });
});

describe("turnSampleMinutes", () => {
  it("keeps only durations inside the plausible band", () => {
    const seatedAt = new Date(NOW);
    const durations = turnSampleMinutes([
      { seatedAt, completedAt: new Date(NOW.getTime() + 90 * 60_000) },
      { seatedAt, completedAt: new Date(NOW.getTime() + 2 * 60_000) },
      { seatedAt, completedAt: new Date(NOW.getTime() + 600 * 60_000) },
      { seatedAt, completedAt: new Date(NOW.getTime() - 60 * 60_000) },
      { seatedAt: null, completedAt: null },
      { seatedAt, completedAt: new Date("not a date") },
    ]);

    expect(durations).toEqual([90]);
  });
});

describe("buildSimulatedTables", () => {
  it("skips rows with no id or an unusable capacity", () => {
    const built = buildSimulatedTables(
      [
        table({ id: "" }),
        table({ id: "bad-capacity", capacity: 0 }),
        table({ id: "not-a-number", capacity: "many" }),
        table({ id: "ok" }),
      ] as never,
      [],
      NOW,
    );

    expect(built.map((row) => row.id)).toEqual(["ok"]);
  });

  it("keeps blocked tables in the model so capacity can still be judged", () => {
    const built = buildSimulatedTables([table({ isBlocked: true })], [], NOW);

    expect(built).toHaveLength(1);
    expect(built[0].isBlocked).toBe(true);
  });

  it("normalises a missing or invalid minimum party size to one", () => {
    const built = buildSimulatedTables(
      [table({ id: "a", minimumPartySize: undefined }), table({ id: "b", minimumPartySize: 0 })],
      [],
      NOW,
    );

    expect(built.map((row) => row.minimumPartySize)).toEqual([1, 1]);
  });

  it("drops occupancy that has already ended or names an unknown table", () => {
    const built = buildSimulatedTables(
      [table()],
      [
        { tableIds: ["t1"], start: at(-60), end: at(-10) },
        { tableIds: ["ghost"], start: at(-5), end: at(30) },
        { tableIds: ["t1"], start: null, end: null },
        { tableIds: [], start: at(-5), end: at(30) },
      ],
      NOW,
    );

    expect(built[0].busy).toHaveLength(0);
  });

  it("clamps an occupancy that started in the past to the present", () => {
    const built = buildSimulatedTables(
      [table()],
      [{ tableIds: ["t1"], start: at(-60), end: at(30) }],
      NOW,
    );

    expect(built[0].busy[0].start).toBe(NOW.getTime());
  });
});

describe("earliestSetupStart", () => {
  function setupOf(tables: ReturnType<typeof buildSimulatedTables>) {
    return setupsForParty(tables, [], 2).setups[0];
  }

  it("reports the present when nothing is in the way", () => {
    const setup = setupOf(buildSimulatedTables([table()], [], NOW));

    expect(earliestSetupStart(setup, 60 * 60_000, NOW.getTime())).toBe(NOW.getTime());
  });

  it("never schedules a blocked table", () => {
    const tables = buildSimulatedTables([table({ isBlocked: true })], [], NOW);
    const setup = setupsForParty(tables, [], 2).setups[0];

    expect(earliestSetupStart(setup, 60 * 60_000, NOW.getTime())).toBe(Number.POSITIVE_INFINITY);
  });

  it("steps past overlapping busy windows in one pass", () => {
    const tables = buildSimulatedTables(
      [table()],
      [
        { tableIds: ["t1"], start: at(-5), end: at(30) },
        { tableIds: ["t1"], start: at(10), end: at(50) },
        { tableIds: ["t1"], start: at(45), end: at(70) },
      ],
      NOW,
    );
    const setup = setupOf(tables);

    expect(earliestSetupStart(setup, 30 * 60_000, NOW.getTime())).toBe(NOW.getTime() + 70 * 60_000);
  });
});

describe("deriveCombinationSetups", () => {
  it("returns only minimal joins that reach the party size", () => {
    const tables = buildSimulatedTables(
      [
        table({ id: "a", capacity: 4 }),
        table({ id: "b", capacity: 4 }),
        table({ id: "c", capacity: 4 }),
      ],
      [],
      NOW,
    );

    const setups = deriveCombinationSetups(tables, 7);

    expect(setups.map((setup) => setup.id).sort()).toEqual(["a+b", "a+c", "b+c"]);
  });

  it("grows the join until the capacity is reached", () => {
    const tables = buildSimulatedTables(
      [
        table({ id: "a", capacity: 2 }),
        table({ id: "b", capacity: 2 }),
        table({ id: "c", capacity: 2 }),
      ],
      [],
      NOW,
    );

    const setups = deriveCombinationSetups(tables, 6);

    expect(setups.map((setup) => setup.id)).toEqual(["a+b+c"]);
  });

  it("leaves out tables whose minimum party size excludes the party", () => {
    const tables = buildSimulatedTables(
      [
        table({ id: "a", capacity: 4 }),
        table({ id: "b", capacity: 4, minimumPartySize: 9 }),
        table({ id: "c", capacity: 4 }),
      ],
      [],
      NOW,
    );

    expect(deriveCombinationSetups(tables, 7).map((setup) => setup.id)).toEqual(["a+c"]);
  });

  it("never joins tables that sit in different rooms", () => {
    const tables = buildSimulatedTables(
      [
        table({ id: "a", roomId: "one", capacity: 4 }),
        table({ id: "b", roomId: "two", capacity: 4 }),
      ],
      [],
      NOW,
    );

    expect(deriveCombinationSetups(tables, 7)).toEqual([]);
  });

  it("stops generating once the candidate cap is reached", () => {
    const many = Array.from({ length: 30 }, (_value, index) =>
      table({ id: `t${String(index).padStart(2, "0")}`, capacity: 4 }),
    );
    const tables = buildSimulatedTables(many, [], NOW);

    const setups = deriveCombinationSetups(tables, 7);

    expect(setups.length).toBeLessThanOrEqual(MAX_COMBINATION_CANDIDATES);
    expect(setups.length).toBeGreaterThan(0);
  });
});

describe("canEverSeat", () => {
  it("accepts a party that fits one table", () => {
    const tables = buildSimulatedTables([table({ capacity: 6 })], [], NOW);

    expect(canEverSeat(tables, [], 6)).toBe(true);
  });

  it("accepts a party that only a join can hold", () => {
    const tables = buildSimulatedTables(
      [table({ id: "a", capacity: 4 }), table({ id: "b", capacity: 4 })],
      [],
      NOW,
    );

    expect(canEverSeat(tables, [], 8)).toBe(true);
  });

  it("accepts a party that only a configured combination can hold", () => {
    const tables = buildSimulatedTables(
      [
        table({ id: "a", roomId: "one", capacity: 4 }),
        table({ id: "b", roomId: "two", capacity: 4 }),
      ],
      [],
      NOW,
    );

    expect(canEverSeat(tables, [], 8)).toBe(false);
    expect(canEverSeat(tables, [{ id: "combo", tableIds: ["a", "b"] }], 8)).toBe(true);
  });

  it("rejects a party larger than the biggest possible join", () => {
    const tables = buildSimulatedTables(
      [table({ id: "a", capacity: 2 }), table({ id: "b", capacity: 2 })],
      [],
      NOW,
    );

    expect(canEverSeat(tables, [], 9)).toBe(false);
  });

  it("rejects a party below every table minimum", () => {
    const tables = buildSimulatedTables([table({ capacity: 10, minimumPartySize: 6 })], [], NOW);

    expect(canEverSeat(tables, [], 2)).toBe(false);
  });
});

describe("setupsForParty", () => {
  it("prefers single tables and never joins when one already fits", () => {
    const tables = buildSimulatedTables(
      [table({ id: "a", capacity: 4 }), table({ id: "b", capacity: 4 })],
      [],
      NOW,
    );

    const result = setupsForParty(tables, [], 3);

    expect(result.combined).toBe(false);
    expect(result.setups.map((setup) => setup.id)).toEqual(["a", "b"]);
  });

  it("skips a configured combination that is too small or too restrictive", () => {
    const tables = buildSimulatedTables(
      [
        table({ id: "a", capacity: 2 }),
        table({ id: "b", capacity: 2 }),
        table({ id: "c", capacity: 2 }),
      ],
      [],
      NOW,
    );

    const result = setupsForParty(
      tables,
      [
        { id: "too-small", tableIds: ["a", "b"] },
        { id: "single", tableIds: ["a"] },
        { id: "good", tableIds: ["a", "b", "c"] },
      ],
      5,
    );

    expect(result.combined).toBe(true);
    expect(result.setups.map((setup) => setup.id)).toEqual(["a+b+c"]);
  });
});

describe("simulateSeating", () => {
  function input(overrides: Record<string, unknown> = {}) {
    return {
      tables: [table()],
      occupancy: [],
      combinations: [],
      reservations: [],
      reservationsEnabled: true,
      reservationSettings: normalizeSettings({}),
      partySizesAhead: [],
      partySize: 2,
      turnMinutes: 90,
      now: NOW,
      ...overrides,
    } as Parameters<typeof simulateSeating>[0];
  }

  it("reports missing floor data rather than guessing", () => {
    expect(simulateSeating(input({ tables: [] })).status).toBe("NO_FLOOR_DATA");
  });

  it("reports no capacity for a party nothing can hold", () => {
    expect(simulateSeating(input({ partySize: 20 })).status).toBe("NO_CAPACITY");
  });

  it("reports unavailability when every fitting table is blocked", () => {
    const forecast = simulateSeating(input({ tables: [table({ isBlocked: true })] }));

    expect(forecast.status).toBe("UNAVAILABLE");
    expect(forecast.waitMinutes).toBeNull();
  });

  it("seats bigger bookings first when two land at the same minute", () => {
    const forecast = simulateSeating(
      input({
        tables: [table({ id: "a", capacity: 4 }), table({ id: "b", capacity: 2 })],
        partySize: 4,
        reservations: [
          { id: "small", status: "confirmed", reservationDateTime: at(0), partySize: 2 },
          { id: "big", status: "confirmed", reservationDateTime: at(0), partySize: 4 },
        ],
      }),
    );

    expect(forecast.reservationsHeld).toBe(2);
    expect(forecast.waitMinutes).toBe(90);
  });

  it("ignores a booking beyond the scheduling horizon", () => {
    const forecast = simulateSeating(
      input({
        reservations: [{ id: "far", status: "confirmed", reservationDateTime: at(300) }],
      }),
    );

    expect(forecast.reservationsHeld).toBe(0);
    expect(forecast.waitMinutes).toBe(0);
  });

  it("ignores a booking with an unusable time", () => {
    const forecast = simulateSeating(
      input({
        reservations: [{ id: "broken", status: "confirmed", reservationDateTime: "nope" }],
      }),
    );

    expect(forecast.reservationsHeld).toBe(0);
  });

  it("skips a booking that no table can hold instead of stalling", () => {
    const forecast = simulateSeating(
      input({
        reservations: [
          { id: "huge", status: "confirmed", reservationDateTime: at(10), partySize: 30 },
        ],
      }),
    );

    expect(forecast.reservationsHeld).toBe(0);
    expect(forecast.waitMinutes).toBe(0);
  });

  it("uses the configured reservation duration to hold inventory", () => {
    const forecast = simulateSeating(
      input({
        reservationSettings: normalizeSettings({ defaultReservationDurationMinutes: 120 }),
        reservations: [{ id: "r", status: "confirmed", reservationDateTime: at(0) }],
      }),
    );

    expect(forecast.waitMinutes).toBe(120);
  });
});

describe("scoreConfidence", () => {
  function evidence(overrides: Record<string, unknown> = {}) {
    return {
      recentSampleCount: 6,
      historicalCohort: "DOW_HOUR" as const,
      turnSampleCount: 20,
      hasFloorPlan: true,
      tableEtaMinutes: 20,
      throughputEtaMinutes: 20,
      recentMinutesPerParty: 6,
      historicalMinutesPerParty: 7,
      reservationsRepresented: true,
      usedDefaultTurnMinutes: false,
      ...overrides,
    };
  }

  it("rates deep, agreeing evidence as high", () => {
    expect(scoreConfidence(evidence())).toBe("high");
  });

  it("drops to medium when the two forecasts strongly disagree", () => {
    expect(
      scoreConfidence(
        evidence({
          tableEtaMinutes: 90,
          throughputEtaMinutes: 10,
          historicalCohort: "RECENT",
          recentSampleCount: 2,
        }),
      ),
    ).toBe("medium");
  });

  it("rates an estimate built only on fallback constants as low", () => {
    expect(
      scoreConfidence(
        evidence({
          recentSampleCount: 0,
          historicalCohort: "NONE",
          recentMinutesPerParty: null,
          historicalMinutesPerParty: null,
        }),
      ),
    ).toBe("low");
  });

  it("lowers confidence when table evidence is sparse", () => {
    const rich = scoreConfidence(evidence());
    const sparse = scoreConfidence(
      evidence({ turnSampleCount: 0, usedDefaultTurnMinutes: true, tableEtaMinutes: null }),
    );

    expect(rich).toBe("high");
    expect(sparse).toBe("medium");
  });

  it("caps a floorless estimate at medium", () => {
    expect(scoreConfidence(evidence({ hasFloorPlan: false, tableEtaMinutes: null }))).toBe(
      "medium",
    );
  });
});

describe("queue simulation order", () => {
  it("seats admitted guests before anyone still waiting", () => {
    const eta = computeQueueEta(
      baseInput({
        queue: [ticket({ partySize: 2 }), ticket({ partySize: 2 })],
        ticketIndex: 1,
        reservationsEnabled: false,
        diningTables: [table({ id: "only", capacity: 4 })],
        admittedCustomers: [
          { id: "admitted", finalStatus: "pending", partySize: 2, admittedAt: at(-20) },
        ],
        turnMinutes: 60,
        turnSampleCount: 20,
      }),
    );

    expect(eta.basis.partiesAheadOfTable).toBe(2);
    expect(eta.tableEtaMinutes).toBe(120);
  });

  it("leaves arrived and no-show guests out of the parties ahead", () => {
    const eta = computeQueueEta(
      baseInput({
        queue: [ticket({ partySize: 2 })],
        ticketIndex: 0,
        reservationsEnabled: false,
        diningTables: [table()],
        admittedCustomers: [
          { id: "a", finalStatus: "arrived", partySize: 2, admittedAt: at(-20) },
          { id: "b", finalStatus: "no_show", partySize: 2, admittedAt: at(-10) },
        ],
      }),
    );

    expect(eta.basis.partiesAheadOfTable).toBe(0);
    expect(eta.tableEtaMinutes).toBe(0);
  });
});

describe("display bands", () => {
  it("reports a very short wait plainly", () => {
    const eta = computeQueueEta(baseInput({ ticketIndex: 0 }));

    expect(eta.displayText).toBe("Less Than 5 Minutes");
    expect(eta.estimatedWaitMin).toBe(0);
    expect(eta.estimatedWaitMax).toBe(5);
  });

  it("rounds a mid-range wait into a five minute band", () => {
    const eta = computeQueueEta(baseInput({ ticketIndex: 2 }));

    expect(eta.displayText).toMatch(/^\d+-\d+ Minutes$/);
    expect((eta.estimatedWaitMax as number) - (eta.estimatedWaitMin as number)).toBe(5);
  });

  it("caps a very long wait at an hour", () => {
    const queue = Array.from({ length: 40 }, () => ticket({ partySize: 8 }));
    const eta = computeQueueEta(baseInput({ queue, ticketIndex: 39 }));

    expect(eta.displayText).toBe("60+ Minutes");
    expect(eta.estimatedWaitMin).toBe(60);
    expect(eta.estimatedWaitMax).toBe(60);
  });

  it("does not dress no capacity up as a time band", () => {
    const eta = computeQueueEta(
      baseInput({
        queue: [ticket({ partySize: 12 })],
        ticketIndex: 0,
        diningTables: [table({ capacity: 4 })],
      }),
    );

    expect(eta.status).toBe("NO_CAPACITY");
    expect(eta.displayText).toBe("No Table Fits This Party");
    expect(eta.estimatedWaitMin).toBeNull();
  });
});

describe("etaForToken", () => {
  it("estimates the wait for a ticket in the queue", () => {
    const queue = [ticket({ queueToken: "a" }), ticket({ queueToken: "b" })];

    const eta = etaForToken({ queue }, "b", NOW);

    expect(eta?.position).toBe(2);
    expect(eta?.peopleAhead).toBe(1);
  });

  it("reports nothing for a token that is not queued", () => {
    expect(etaForToken({ queue: [ticket()] }, "missing", NOW)).toBeNull();
  });

  it("tolerates a location with no queue at all", () => {
    expect(etaForToken({}, "anything", NOW)).toBeNull();
    expect(etaForToken(null, "anything", NOW)).toBeNull();
  });

  it("reads the floor and reservation settings from the location", () => {
    const location = {
      queue: [ticket({ queueToken: "a" }), ticket({ queueToken: "b" })],
      admittedCustomers: [],
      reservations: [{ id: "r1", status: "confirmed", reservationDateTime: at(15), partySize: 4 }],
      reservationSettings: { defaultReservationDurationMinutes: 90 },
      reservationsEnabled: true,
      diningTables: [table({ id: "only", capacity: 4 })],
      tableOccupancy: [],
      turnMinutes: 60,
      turnSampleCount: 20,
    };

    const eta = etaForToken(location, "b", NOW);

    expect(eta?.basis.usedTableInventory).toBe(true);
    expect(eta?.basis.reservationsHeld).toBe(1);
    expect(eta?.basis.usedReservationPressure).toBe(false);
  });

  it("reads reservation times in the location timezone", () => {
    const location = {
      queue: [ticket({ queueToken: "a" })],
      restaurantProfile: { openingHours: { timezone: "UTC" } },
      reservations: [
        { id: "r1", status: "confirmed", reservationDateTime: "2026-08-12T19:30", partySize: 4 },
      ],
      reservationsEnabled: true,
      diningTables: [table({ id: "only", capacity: 4 })],
      turnMinutes: 60,
      turnSampleCount: 20,
    };

    const eta = etaForToken(location, "a", NOW);

    expect(eta?.basis.reservationsHeld).toBe(1);
    expect(eta?.tableEtaMinutes).toBe(120);
  });
});

describe("etaForAllQueueCustomers", () => {
  it("returns one estimate per queued ticket", () => {
    const location = {
      queue: [ticket({ queueToken: "a" }), ticket({ queueToken: "b" })],
    };

    const etas = etaForAllQueueCustomers(location, NOW);

    expect(etas).toHaveLength(2);
    expect(etas[0].queueToken).toBe("a");
    expect(etas[0].position).toBe(1);
    expect(etas[1].position).toBe(2);
  });

  it("reports a null token for a ticket that has none", () => {
    const etas = etaForAllQueueCustomers({ queue: [{ partySize: 2 }] }, NOW);

    expect(etas[0].queueToken).toBeNull();
  });

  it("returns nothing for a location with no queue", () => {
    expect(etaForAllQueueCustomers({}, NOW)).toEqual([]);
    expect(etaForAllQueueCustomers(null, NOW)).toEqual([]);
  });

  it("gives each ticket a later table forecast than the one before it", () => {
    const location = {
      queue: [
        ticket({ queueToken: "a", partySize: 2 }),
        ticket({ queueToken: "b", partySize: 2 }),
        ticket({ queueToken: "c", partySize: 2 }),
      ],
      reservationsEnabled: false,
      diningTables: [table({ id: "only", capacity: 4 })],
      turnMinutes: 60,
      turnSampleCount: 20,
    };

    const etas = etaForAllQueueCustomers(location, NOW);

    expect(etas.map((eta) => eta.tableEtaMinutes)).toEqual([0, 60, 120]);
  });
});

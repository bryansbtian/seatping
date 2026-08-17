import { describe, expect, it } from "vitest";
import {
  computeQueueEta,
  etaForAllQueueCustomers,
  etaForToken,
} from "../../server/lib/queueEta.js";

const NOW = new Date("2026-08-12T19:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function ticket(overrides: Record<string, unknown> = {}) {
  return { queueToken: `qt-${Math.random()}`, partySize: 2, ...overrides };
}

function admittedAt(minutes: number, waitMinutes = 10) {
  const admitted = minutesAgo(minutes);
  return {
    admittedAt: admitted,
    joinedAt: new Date(admitted.getTime() - waitMinutes * 60_000),
    partySize: 2,
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

describe("service rate windows", () => {
  it("uses the last thirty minutes when two admissions land inside it", () => {
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [admittedAt(5), admittedAt(20)],
      }),
    );

    expect(eta.basis.usedRecentServiceRate).toBe(true);
    expect(eta.basis.blendedMinutesPerParty).toBeGreaterThan(0);
  });

  it("falls back to the last hour when the half-hour window is thin", () => {
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [admittedAt(40), admittedAt(55)],
      }),
    );

    expect(eta.basis.usedRecentServiceRate).toBe(true);
  });

  it("reports no recent rate when only one admission is in the window", () => {
    const eta = computeQueueEta(
      baseInput({ admittedCustomers: [admittedAt(10)] }),
    );

    expect(eta.basis.usedRecentServiceRate).toBe(false);
    expect(eta.basis.usedHistoricalWaitTime).toBe(true);
    expect(eta.confidence).toBe("medium");
  });

  it("ignores admissions that are older than an hour", () => {
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [admittedAt(120), admittedAt(180)],
      }),
    );

    expect(eta.basis.usedRecentServiceRate).toBe(false);
  });

  it("ignores an admission with an unusable timestamp", () => {
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [
          { admittedAt: "not a date", joinedAt: minutesAgo(30) },
          { admittedAt: null, joinedAt: minutesAgo(30) },
        ],
      }),
    );

    expect(eta.basis.usedRecentServiceRate).toBe(false);
    expect(eta.basis.usedHistoricalWaitTime).toBe(false);
    expect(eta.confidence).toBe("low");
  });

  it("ignores an admission recorded in the future", () => {
    const future = new Date(NOW.getTime() + 30 * 60_000);
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [
          { admittedAt: future, joinedAt: NOW },
          { admittedAt: future, joinedAt: NOW },
        ],
      }),
    );

    expect(eta.basis.usedRecentServiceRate).toBe(false);
  });
});

describe("historical wait sampling", () => {
  it("prefers samples from the same weekday and hour", () => {
    const sameHour = new Date(NOW.getTime() - 5 * 60_000);
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [
          {
            admittedAt: sameHour,
            joinedAt: new Date(sameHour.getTime() - 20 * 60_000),
          },
        ],
      }),
    );

    expect(eta.basis.usedHistoricalWaitTime).toBe(true);
    expect(eta.basis.blendedMinutesPerParty).toBe(20);
  });

  it("falls back to samples from the same hour on another day", () => {
    const lastWeekSameHour = new Date(NOW.getTime() - 7 * 24 * 60 * 60_000);
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [
          {
            admittedAt: new Date(lastWeekSameHour.getTime() + 60 * 60_000),
            joinedAt: lastWeekSameHour,
          },
        ],
      }),
    );

    expect(eta.basis.usedHistoricalWaitTime).toBe(true);
  });

  it("falls back to every sample when neither hour nor weekday matches", () => {
    const otherHour = new Date(NOW.getTime() - 5 * 60 * 60_000);
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [
          {
            admittedAt: otherHour,
            joinedAt: new Date(otherHour.getTime() - 15 * 60_000),
          },
        ],
      }),
    );

    expect(eta.basis.usedHistoricalWaitTime).toBe(true);
    expect(eta.basis.blendedMinutesPerParty).toBe(15);
  });

  it("skips a no-show when sampling historical waits", () => {
    const recent = new Date(NOW.getTime() - 5 * 60_000);
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [
          {
            admittedAt: recent,
            joinedAt: new Date(recent.getTime() - 20 * 60_000),
            finalStatus: "no_show",
          },
        ],
      }),
    );

    expect(eta.basis.usedHistoricalWaitTime).toBe(false);
  });

  it("never records a negative historical wait", () => {
    const admitted = new Date(NOW.getTime() - 5 * 60_000);
    const eta = computeQueueEta(
      baseInput({
        admittedCustomers: [
          {
            admittedAt: admitted,
            joinedAt: new Date(admitted.getTime() + 60 * 60_000),
          },
        ],
      }),
    );

    expect(eta.basis.blendedMinutesPerParty).toBeGreaterThanOrEqual(3);
  });
});

describe("reservation pressure", () => {
  function withReservations(reservations: unknown[], enabled = true) {
    return computeQueueEta(
      baseInput({
        reservations,
        reservationsEnabled: enabled,
        reservationSettings: { maxReservedGuestsPerHour: 20 },
      }),
    );
  }

  it("raises the estimate for bookings in the next hour", () => {
    const eta = withReservations([
      {
        status: "confirmed",
        reservationDateTime: new Date(NOW.getTime() + 30 * 60_000),
        partySize: 10,
      },
    ]);

    expect(eta.basis.usedReservationPressure).toBe(true);
    expect(eta.basis.reservationPressureMultiplier).toBeGreaterThan(1);
  });

  it("caps the multiplier when bookings exceed the hourly capacity", () => {
    const eta = withReservations([
      {
        status: "arrived",
        reservationDateTime: new Date(NOW.getTime() + 10 * 60_000),
        partySize: 100,
      },
    ]);

    expect(eta.basis.reservationPressureMultiplier).toBe(1.5);
  });

  it("ignores bookings outside the next hour", () => {
    const eta = withReservations([
      {
        status: "confirmed",
        reservationDateTime: new Date(NOW.getTime() + 3 * 60 * 60_000),
        partySize: 10,
      },
      {
        status: "confirmed",
        reservationDateTime: new Date(NOW.getTime() - 60 * 60_000),
        partySize: 10,
      },
    ]);

    expect(eta.basis.usedReservationPressure).toBe(false);
  });

  it("ignores cancelled bookings and unusable dates", () => {
    const eta = withReservations([
      {
        status: "cancelled",
        reservationDateTime: new Date(NOW.getTime() + 10 * 60_000),
        partySize: 10,
      },
      { status: "confirmed", reservationDateTime: "not a date", partySize: 10 },
    ]);

    expect(eta.basis.usedReservationPressure).toBe(false);
  });

  it("ignores pressure when reservations are switched off", () => {
    const eta = withReservations(
      [
        {
          status: "confirmed",
          reservationDateTime: new Date(NOW.getTime() + 10 * 60_000),
          partySize: 10,
        },
      ],
      false,
    );

    expect(eta.basis.reservationPressureMultiplier).toBe(1);
  });

  it("ignores pressure when no hourly capacity is configured", () => {
    const eta = computeQueueEta(
      baseInput({
        reservationsEnabled: true,
        reservationSettings: { maxReservedGuestsPerHour: 0 },
        reservations: [
          {
            status: "confirmed",
            reservationDateTime: new Date(NOW.getTime() + 10 * 60_000),
            partySize: 10,
          },
        ],
      }),
    );

    expect(eta.basis.usedReservationPressure).toBe(false);
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
    expect(eta.estimatedWaitMax - eta.estimatedWaitMin).toBe(5);
  });

  it("caps a very long wait at an hour", () => {
    const queue = Array.from({ length: 40 }, () => {
      return ticket({ partySize: 8 });
    });
    const eta = computeQueueEta(
      baseInput({ queue, ticketIndex: 39 }),
    );

    expect(eta.displayText).toBe("60+ Minutes");
    expect(eta.estimatedWaitMin).toBe(60);
    expect(eta.estimatedWaitMax).toBe(60);
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

  it("reads the reservation settings from the location", () => {
    const location = {
      queue: [ticket({ queueToken: "a" }), ticket({ queueToken: "b" })],
      admittedCustomers: [],
      reservations: [
        {
          status: "confirmed",
          reservationDateTime: new Date(NOW.getTime() + 10 * 60_000),
          partySize: 20,
        },
      ],
      reservationSettings: { maxReservedGuestsPerHour: 20 },
      reservationsEnabled: true,
    };

    const eta = etaForToken(location, "b", NOW);

    expect(eta?.basis.usedReservationPressure).toBe(true);
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
});

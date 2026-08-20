import { describe, expect, it } from "vitest";
import { computeQueueEta, partyWeight } from "../../server/lib/queueEta.js";

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

describe("computeQueueEta", () => {
  it("reports the front of the queue as position 1 with nobody ahead", () => {
    const eta = computeQueueEta(baseInput());

    expect(eta.position).toBe(1);
    expect(eta.peopleAhead).toBe(0);
    expect(eta.estimatedWaitMin).toBeGreaterThanOrEqual(0);
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
    expect(largeParties.estimatedWaitMax).toBeGreaterThan(smallParties.estimatedWaitMax);
  });

  it("produces a min estimate no greater than the max estimate", () => {
    const eta = computeQueueEta(
      baseInput({ ticketIndex: 5, queue: new Array(6).fill({ partySize: 3 }) }),
    );

    expect(eta.estimatedWaitMin).toBeLessThanOrEqual(eta.estimatedWaitMax);
  });

  it("tolerates non-array inputs without throwing", () => {
    const eta = computeQueueEta(
      baseInput({
        queue: null,
        admittedCustomers: undefined,
        reservations: "nope",
      }),
    );

    expect(eta.position).toBe(1);
    expect(eta.basis.weightedQueueAhead).toBe(0);
  });

  it("raises confidence once recent service history exists", () => {
    const admitted = [];
    for (let i = 0; i < 6; i++) {
      admitted.push({
        partySize: 2,
        admittedAt: new Date(NOW.getTime() - (i + 1) * 4 * 60 * 1000),
        finalStatus: "arrived",
      });
    }

    const withHistory = computeQueueEta(
      baseInput({ ticketIndex: 2, queue: [{}, {}], admittedCustomers: admitted }),
    );
    const withoutHistory = computeQueueEta(baseInput({ ticketIndex: 2, queue: [{}, {}] }));

    expect(withHistory.basis.usedRecentServiceRate).toBe(true);
    expect(withoutHistory.basis.usedRecentServiceRate).toBe(false);
  });

  it("ignores no-show admissions when measuring the service rate", () => {
    const noShows = new Array(8).fill(null).map((_v, i) => {
      return {
        partySize: 2,
        admittedAt: new Date(NOW.getTime() - (i + 1) * 60 * 1000),
        finalStatus: "no_show",
      };
    });

    const eta = computeQueueEta(
      baseInput({ ticketIndex: 1, queue: [{}], admittedCustomers: noShows }),
    );

    expect(eta.basis.usedRecentServiceRate).toBe(false);
  });

  it("applies reservation pressure only when reservations are enabled", () => {
    const reservations = new Array(6).fill(null).map(() => {
      return {
        status: "confirmed",
        reservationDateTime: "2026-06-08T13:00",
        guestCount: 4,
      };
    });

    const enabled = computeQueueEta(
      baseInput({
        ticketIndex: 2,
        queue: [{}, {}],
        reservations,
        reservationsEnabled: true,
        reservationSettings: { maxReservedGuestsPerHour: 10 },
      }),
    );
    const disabled = computeQueueEta(
      baseInput({
        ticketIndex: 2,
        queue: [{}, {}],
        reservations,
        reservationsEnabled: false,
        reservationSettings: { maxReservedGuestsPerHour: 10 },
      }),
    );

    expect(disabled.basis.usedReservationPressure).toBe(false);
    expect(disabled.basis.reservationPressureMultiplier).toBe(1);
    expect(enabled.basis.reservationPressureMultiplier).toBeGreaterThanOrEqual(1);
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

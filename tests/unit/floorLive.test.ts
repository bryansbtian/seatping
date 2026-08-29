import { describe, expect, it } from "vitest";
import {
  RESERVATION_LOOKAHEAD_MINUTES,
  LIVE_STATUSES,
  displayName,
  minutesBetween,
  pickCurrentAssignment,
  pickUpcomingAssignment,
  reservationWindow,
  resolveTableStatus,
  serializeLiveAssignment,
  type LiveAssignmentLike,
  type LiveTableLike,
} from "../../server/lib/floorLive.js";
import { estimateTurnMinutes } from "../../server/lib/queueEta.js";

const NOW = new Date("2026-08-26T18:00:00.000Z");

function minutes(offset: number): Date {
  return new Date(NOW.getTime() + offset * 60 * 1000);
}

function table(overrides: Partial<LiveTableLike> = {}): LiveTableLike {
  return {
    id: "table-1",
    capacity: 4,
    minimumPartySize: 1,
    isBlocked: false,
    cleaningSince: null,
    ...overrides,
  };
}

function assignment(overrides: Partial<LiveAssignmentLike> = {}): LiveAssignmentLike {
  return {
    id: "assignment-1",
    tableId: "table-1",
    status: "RESERVED",
    partySize: 2,
    source: "MANUAL",
    queueEntryId: null,
    reservationId: null,
    expectedStartAt: minutes(0),
    expectedEndAt: minutes(90),
    seatedAt: null,
    ...overrides,
  };
}

describe("resolveTableStatus", () => {
  it("reports every status the live floor supports", () => {
    expect([...LIVE_STATUSES].sort()).toEqual(
      ["AVAILABLE", "BLOCKED", "CLEANING", "OCCUPIED", "RESERVED"].sort(),
    );
  });

  it("returns AVAILABLE for an idle table", () => {
    expect(resolveTableStatus(table(), [], NOW)).toBe("AVAILABLE");
  });

  it("returns BLOCKED before anything else", () => {
    const blocked = table({ isBlocked: true, cleaningSince: minutes(-10) });
    const seated = assignment({ status: "SEATED", seatedAt: minutes(-30) });
    expect(resolveTableStatus(blocked, [seated], NOW)).toBe("BLOCKED");
  });

  it("returns OCCUPIED when a seated assignment exists, even while cleaning is flagged", () => {
    const dirty = table({ cleaningSince: minutes(-5) });
    const seated = assignment({ status: "SEATED", seatedAt: minutes(-20) });
    expect(resolveTableStatus(dirty, [seated], NOW)).toBe("OCCUPIED");
  });

  it("returns OCCUPIED for a seated party whose window already elapsed", () => {
    const overstaying = assignment({
      status: "SEATED",
      seatedAt: minutes(-200),
      expectedStartAt: minutes(-200),
      expectedEndAt: minutes(-60),
    });
    expect(resolveTableStatus(table(), [overstaying], NOW)).toBe("OCCUPIED");
  });

  it("returns CLEANING ahead of an upcoming reservation", () => {
    const dirty = table({ cleaningSince: minutes(-3) });
    const soon = assignment({ expectedStartAt: minutes(20), expectedEndAt: minutes(110) });
    expect(resolveTableStatus(dirty, [soon], NOW)).toBe("CLEANING");
  });

  it("returns RESERVED when a booking is coming up soon", () => {
    const soon = assignment({ expectedStartAt: minutes(30), expectedEndAt: minutes(120) });
    expect(resolveTableStatus(table(), [soon], NOW)).toBe("RESERVED");
  });

  it("returns RESERVED exactly at the lookahead boundary", () => {
    const boundary = assignment({
      expectedStartAt: minutes(RESERVATION_LOOKAHEAD_MINUTES),
      expectedEndAt: minutes(RESERVATION_LOOKAHEAD_MINUTES + 90),
    });
    expect(resolveTableStatus(table(), [boundary], NOW)).toBe("RESERVED");
  });

  it("stays AVAILABLE one minute before the lookahead opens", () => {
    const justOutside = assignment({
      expectedStartAt: minutes(RESERVATION_LOOKAHEAD_MINUTES + 1),
      expectedEndAt: minutes(RESERVATION_LOOKAHEAD_MINUTES + 91),
    });
    expect(resolveTableStatus(table(), [justOutside], NOW)).toBe("AVAILABLE");
  });

  it("stays AVAILABLE for a booking later tonight", () => {
    const tonight = assignment({ expectedStartAt: minutes(480), expectedEndAt: minutes(570) });
    expect(resolveTableStatus(table(), [tonight], NOW)).toBe("AVAILABLE");
  });

  it("honours a caller supplied lookahead", () => {
    const soon = assignment({ expectedStartAt: minutes(30), expectedEndAt: minutes(120) });
    expect(resolveTableStatus(table(), [soon], NOW, 10)).toBe("AVAILABLE");
  });

  it("keeps BLOCKED ahead of a booking inside the lookahead", () => {
    const soon = assignment({ expectedStartAt: minutes(30), expectedEndAt: minutes(120) });
    expect(resolveTableStatus(table({ isBlocked: true }), [soon], NOW)).toBe("BLOCKED");
  });

  it("keeps OCCUPIED ahead of a booking inside the lookahead", () => {
    const soon = assignment({ expectedStartAt: minutes(30), expectedEndAt: minutes(120) });
    const seated = assignment({ id: "seated", status: "SEATED", seatedAt: minutes(-10) });
    expect(resolveTableStatus(table(), [seated, soon], NOW)).toBe("OCCUPIED");
  });

  it("keeps CLEANING ahead of a booking inside the lookahead", () => {
    const soon = assignment({ expectedStartAt: minutes(30), expectedEndAt: minutes(120) });
    expect(resolveTableStatus(table({ cleaningSince: minutes(-5) }), [soon], NOW)).toBe("CLEANING");
  });

  it("ignores a reservation whose window already ended", () => {
    const stale = assignment({ expectedStartAt: minutes(-180), expectedEndAt: minutes(-90) });
    expect(resolveTableStatus(table(), [stale], NOW)).toBe("AVAILABLE");
  });
});

describe("pickCurrentAssignment and pickUpcomingAssignment", () => {
  it("finds the seated assignment", () => {
    const seated = assignment({ id: "seated", status: "SEATED", seatedAt: minutes(-10) });
    const reserved = assignment({ id: "reserved" });
    expect(pickCurrentAssignment([reserved, seated])?.id).toBe("seated");
  });

  it("returns null when nothing is seated", () => {
    expect(pickCurrentAssignment([assignment()])).toBeNull();
  });

  it("returns the earliest future reservation", () => {
    const later = assignment({ id: "later", expectedStartAt: minutes(90) });
    const sooner = assignment({ id: "sooner", expectedStartAt: minutes(30) });
    expect(pickUpcomingAssignment([later, sooner], NOW)?.id).toBe("sooner");
  });

  it("keeps the first reservation when the later ones start after it", () => {
    const sooner = assignment({ id: "sooner", expectedStartAt: minutes(30) });
    const later = assignment({ id: "later", expectedStartAt: minutes(90) });
    expect(pickUpcomingAssignment([sooner, later], NOW)?.id).toBe("sooner");
  });

  it("skips seated assignments when looking for the next reservation", () => {
    const seated = assignment({ id: "seated", status: "SEATED", expectedStartAt: minutes(-30) });
    expect(pickUpcomingAssignment([seated], NOW)).toBeNull();
  });

  it("returns null when every reservation has ended", () => {
    const ended = assignment({ expectedStartAt: minutes(-200), expectedEndAt: minutes(-10) });
    expect(pickUpcomingAssignment([ended], NOW)).toBeNull();
  });
});

describe("minutesBetween", () => {
  it("returns whole minutes elapsed", () => {
    expect(minutesBetween(minutes(-90), NOW)).toBe(90);
  });

  it("floors a partial minute", () => {
    expect(minutesBetween(new Date(NOW.getTime() - 119000), NOW)).toBe(1);
  });

  it("clamps a future timestamp to zero", () => {
    expect(minutesBetween(minutes(30), NOW)).toBe(0);
  });

  it("returns null without a timestamp", () => {
    expect(minutesBetween(null, NOW)).toBeNull();
  });
});

describe("displayName", () => {
  it("joins first and last name", () => {
    expect(displayName("Ada", "Lovelace")).toBe("Ada Lovelace");
  });

  it("trims a missing half", () => {
    expect(displayName("Ada", null)).toBe("Ada");
  });

  it("falls back when both halves are empty", () => {
    expect(displayName("", "  ")).toBe("Guest");
  });
});

describe("serializeLiveAssignment", () => {
  it("emits ISO timestamps and derived seating minutes", () => {
    const seated = assignment({
      status: "SEATED",
      seatedAt: minutes(-45),
      queueEntryId: "queue-1",
    });
    const payload = serializeLiveAssignment(seated, "Ada Lovelace", NOW);

    expect(payload.status).toBe("SEATED");
    expect(payload.partyName).toBe("Ada Lovelace");
    expect(payload.queueEntryId).toBe("queue-1");
    expect(payload.seatedMinutes).toBe(45);
    expect(payload.expectedStartAt).toBe(minutes(0).toISOString());
    expect(payload.seatedAt).toBe(minutes(-45).toISOString());
  });

  it("leaves seating fields null for a reservation that has not arrived", () => {
    const payload = serializeLiveAssignment(assignment(), null, NOW);
    expect(payload.seatedAt).toBeNull();
    expect(payload.seatedMinutes).toBeNull();
    expect(payload.partyName).toBeNull();
  });
});

describe("reservationWindow", () => {
  it("starts a grace period before now and ends at the close of the local day", () => {
    expect(reservationWindow("2026-08-26T18:30")).toEqual({
      from: "2026-08-26T18:00",
      to: "2026-08-26T23:59",
    });
  });

  it("keeps a booking that started a few minutes ago inside the window", () => {
    const window = reservationWindow("2026-08-26T18:45");
    expect(window.from <= "2026-08-26T18:30").toBe(true);
  });

  it("clamps to the start of the day rather than rolling into yesterday", () => {
    expect(reservationWindow("2026-08-26T00:10")).toEqual({
      from: "2026-08-26T00:00",
      to: "2026-08-26T23:59",
    });
  });

  it("honours a caller supplied grace period", () => {
    expect(reservationWindow("2026-08-26T18:30", 90).from).toBe("2026-08-26T17:00");
  });

  it("pads single digit hours and minutes", () => {
    expect(reservationWindow("2026-08-26T09:35", 30).from).toBe("2026-08-26T09:05");
  });

  it("falls back to the start of the day for an unparseable clock", () => {
    expect(reservationWindow("2026-08-26Tbad").from).toBe("2026-08-26T00:00");
  });

  it("sorts lexicographically the same way the stored strings do", () => {
    const window = reservationWindow("2026-08-26T18:30");
    expect("2026-08-26T19:00" >= window.from).toBe(true);
    expect("2026-08-26T19:00" <= window.to).toBe(true);
    expect("2026-08-26T17:00" >= window.from).toBe(false);
  });
});

describe("loadEtaCapacity turn samples", () => {
  it("hands the queue estimator only visits it can trust", () => {
    const samples = [
      { seatedAt: minutes(0), completedAt: minutes(60) },
      { seatedAt: minutes(0), completedAt: minutes(80) },
      { seatedAt: null, completedAt: minutes(60) },
      { seatedAt: minutes(0), completedAt: null },
    ];

    expect(estimateTurnMinutes(samples).sampleCount).toBe(2);
    expect(estimateTurnMinutes(samples).usedDefault).toBe(true);
  });
});

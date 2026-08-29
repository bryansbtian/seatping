import { describe, expect, it } from "vitest";
import {
  HIGH_PRIORITY_THRESHOLD,
  MAX_WAIT_SCORE_MINUTES,
  REASON_EFFICIENT_FIT,
  REASON_EXACT_FIT,
  REASON_FREE_ALL_WINDOW,
  REASON_HIGH_PRIORITY,
  REASON_LONGEST_WAIT,
  REASON_NEEDS_CLEANING,
  REASON_OVERSIZED,
  REASON_PREFERRED_ROOM,
  REASON_RESERVATION_SOON,
  REJECT_BELOW_MINIMUM,
  REJECT_BLOCKED,
  REJECT_OCCUPANCY_CONFLICT,
  REJECT_TOO_SMALL,
  SCORE_EXACT_FIT,
  SCORE_PREFERRED_ROOM,
  SCORE_WAIT_MINUTE,
  SCORE_WASTED_SEAT,
  TIGHT_TURNAROUND_MINUTES,
  bestPartyForTable,
  bestTableForParty,
  matchPartiesToTables,
  minutesUntilNextOccupancy,
  rankPartiesForTable,
  rankTablesForParty,
  rejectTable,
  scorePartyForTable,
  scoreTableForParty,
  setupTableIds,
  windowsOverlap,
  type SmartContext,
  type SmartParty,
  type SmartTable,
} from "../../server/lib/smartAssign.js";

const NOW = new Date("2026-08-27T18:00:00.000Z");

function at(offsetMinutes: number): Date {
  return new Date(NOW.getTime() + offsetMinutes * 60 * 1000);
}

function table(overrides: Partial<SmartTable> = {}): SmartTable {
  return {
    id: "t1",
    name: "T1",
    roomId: "room-main",
    roomName: "Main Dining Room",
    capacity: 4,
    minimumPartySize: 1,
    isBlocked: false,
    cleaningSince: null,
    ...overrides,
  };
}

function party(overrides: Partial<SmartParty> = {}): SmartParty {
  return {
    id: "p1",
    partySize: 4,
    joinedAt: at(-30),
    priority: 0,
    preferredRoomIds: [],
    ...overrides,
  };
}

function context(overrides: Partial<SmartContext> = {}): SmartContext {
  return {
    now: NOW,
    window: { start: NOW, end: at(90) },
    occupancy: [],
    preferredRoomIds: [],
    ...overrides,
  };
}

describe("windowsOverlap", () => {
  it("treats windows as half open so a back to back turn does not clash", () => {
    expect(windowsOverlap(NOW, at(90), at(90), at(180))).toBe(false);
    expect(windowsOverlap(at(90), at(180), NOW, at(90))).toBe(false);
  });

  it("detects a genuine overlap from either side", () => {
    expect(windowsOverlap(NOW, at(90), at(60), at(150))).toBe(true);
    expect(windowsOverlap(at(60), at(150), NOW, at(90))).toBe(true);
  });

  it("detects a window fully inside another", () => {
    expect(windowsOverlap(NOW, at(180), at(30), at(60))).toBe(true);
  });
});

describe("rejectTable", () => {
  it("accepts a table that fits and is free", () => {
    expect(rejectTable(table(), 4, context())).toBeNull();
  });

  it("rejects a blocked table before anything else", () => {
    expect(rejectTable(table({ isBlocked: true, capacity: 1 }), 8, context())).toBe(REJECT_BLOCKED);
  });

  it("rejects a table that is too small", () => {
    expect(rejectTable(table({ capacity: 2 }), 4, context())).toBe(REJECT_TOO_SMALL);
  });

  it("rejects a party below the table minimum", () => {
    expect(rejectTable(table({ minimumPartySize: 4 }), 2, context())).toBe(REJECT_BELOW_MINIMUM);
  });

  it("rejects a table already busy during the window", () => {
    const busy = context({
      occupancy: [{ tableId: "t1", start: at(30), end: at(120) }],
    });
    expect(rejectTable(table(), 4, busy)).toBe(REJECT_OCCUPANCY_CONFLICT);
  });

  it("ignores occupancy that belongs to a different table", () => {
    const busy = context({
      occupancy: [{ tableId: "other", start: at(30), end: at(120) }],
    });
    expect(rejectTable(table(), 4, busy)).toBeNull();
  });

  it("accepts a table whose booking starts exactly when the window ends", () => {
    const busy = context({
      occupancy: [{ tableId: "t1", start: at(90), end: at(180) }],
    });
    expect(rejectTable(table(), 4, busy)).toBeNull();
  });
});

describe("scoreTableForParty", () => {
  it("rewards an exact capacity match", () => {
    const result = scoreTableForParty(table({ capacity: 4 }), party({ partySize: 4 }), context());
    expect(result.score).toBe(SCORE_EXACT_FIT);
    expect(result.reasons).toContain(REASON_EXACT_FIT);
  });

  it("penalises every wasted seat", () => {
    const result = scoreTableForParty(table({ capacity: 8 }), party({ partySize: 4 }), context());
    expect(result.score).toBe(-4 * SCORE_WASTED_SEAT);
    expect(result.reasons).toContain(REASON_OVERSIZED);
  });

  it("calls a one seat overshoot an efficient fit", () => {
    const result = scoreTableForParty(table({ capacity: 5 }), party({ partySize: 4 }), context());
    expect(result.reasons).toContain(REASON_EFFICIENT_FIT);
    expect(result.reasons).not.toContain(REASON_OVERSIZED);
  });

  it("rewards a room the guest prefers", () => {
    const result = scoreTableForParty(
      table({ capacity: 4 }),
      party({ partySize: 4, preferredRoomIds: ["room-main"] }),
      context(),
    );
    expect(result.score).toBe(SCORE_EXACT_FIT + SCORE_PREFERRED_ROOM);
    expect(result.reasons).toContain(REASON_PREFERRED_ROOM);
  });

  it("rewards a room the location prefers", () => {
    const result = scoreTableForParty(
      table({ capacity: 4 }),
      party({ partySize: 4 }),
      context({ preferredRoomIds: ["room-main"] }),
    );
    expect(result.reasons).toContain(REASON_PREFERRED_ROOM);
  });

  it("penalises a table still waiting to be cleaned", () => {
    const dirty = scoreTableForParty(
      table({ capacity: 4, cleaningSince: at(-5) }),
      party({ partySize: 4 }),
      context(),
    );
    const clean = scoreTableForParty(table({ capacity: 4 }), party({ partySize: 4 }), context());
    expect(dirty.score).toBeLessThan(clean.score);
    expect(dirty.reasons).toContain(REASON_NEEDS_CLEANING);
  });

  it("notes a table that is free for the whole window", () => {
    const result = scoreTableForParty(table(), party(), context());
    expect(result.reasons).toContain(REASON_FREE_ALL_WINDOW);
  });

  it("penalises a table with a booking soon after the window", () => {
    const tight = context({
      occupancy: [{ tableId: "t1", start: at(90 + TIGHT_TURNAROUND_MINUTES - 5), end: at(240) }],
    });
    const result = scoreTableForParty(table(), party(), tight);
    expect(result.reasons).toContain(REASON_RESERVATION_SOON);
    expect(result.score).toBeLessThan(scoreTableForParty(table(), party(), context()).score);
  });

  it("leaves a comfortable turnaround unpenalised", () => {
    const roomy = context({
      occupancy: [{ tableId: "t1", start: at(90 + TIGHT_TURNAROUND_MINUTES + 5), end: at(300) }],
    });
    const result = scoreTableForParty(table(), party(), roomy);
    expect(result.reasons).not.toContain(REASON_RESERVATION_SOON);
  });

  it("is deterministic for equivalent inputs", () => {
    const a = scoreTableForParty(table(), party(), context());
    const b = scoreTableForParty(table(), party(), context());
    expect(a).toEqual(b);
  });
});

describe("minutesUntilNextOccupancy", () => {
  it("returns the nearest booking after the window", () => {
    const ctx = context({
      occupancy: [
        { tableId: "t1", start: at(300), end: at(360) },
        { tableId: "t1", start: at(150), end: at(200) },
      ],
    });
    expect(minutesUntilNextOccupancy(table(), ctx)).toBe(60);
  });

  it("returns null when nothing follows", () => {
    expect(minutesUntilNextOccupancy(table(), context())).toBeNull();
  });

  it("ignores bookings that start before the window ends", () => {
    const ctx = context({ occupancy: [{ tableId: "t1", start: at(10), end: at(20) }] });
    expect(minutesUntilNextOccupancy(table(), ctx)).toBeNull();
  });
});

describe("rankTablesForParty", () => {
  const tables = [
    table({ id: "big", name: "T9", capacity: 10 }),
    table({ id: "exact", name: "T2", capacity: 4 }),
    table({ id: "small", name: "T1", capacity: 2 }),
    table({ id: "blocked", name: "T3", capacity: 4, isBlocked: true }),
    table({ id: "roomy", name: "T4", capacity: 6 }),
  ];

  it("puts the exact fit first", () => {
    const result = rankTablesForParty(tables, party({ partySize: 4 }), context());
    expect(result.ranked[0].tableId).toBe("exact");
  });

  it("orders the rest by capacity efficiency", () => {
    const result = rankTablesForParty(tables, party({ partySize: 4 }), context());
    expect(result.ranked.map((r) => r.tableId)).toEqual(["exact", "roomy", "big"]);
  });

  it("reports why each table was rejected", () => {
    const result = rankTablesForParty(tables, party({ partySize: 4 }), context());
    const reasons = Object.fromEntries(result.rejected.map((r) => [r.id, r.reason]));
    expect(reasons.blocked).toBe(REJECT_BLOCKED);
    expect(reasons.small).toBe(REJECT_TOO_SMALL);
  });

  it("returns nothing rankable when no table fits", () => {
    const result = rankTablesForParty(tables, party({ partySize: 40 }), context());
    expect(result.ranked).toEqual([]);
    expect(result.rejected).toHaveLength(tables.length);
  });

  it("breaks a score tie by capacity then table name", () => {
    const tied = [
      table({ id: "b", name: "T20", capacity: 6 }),
      table({ id: "a", name: "T3", capacity: 6 }),
    ];
    const result = rankTablesForParty(tied, party({ partySize: 4 }), context());
    expect(result.ranked.map((r) => r.tableId)).toEqual(["a", "b"]);
  });

  it("lets a preferred room outrank a tighter table elsewhere", () => {
    const options = [
      table({ id: "tight", name: "T1", capacity: 5, roomId: "room-main" }),
      table({ id: "patio", name: "T2", capacity: 6, roomId: "room-patio" }),
    ];
    const result = rankTablesForParty(
      options,
      party({ partySize: 4, preferredRoomIds: ["room-patio"] }),
      context(),
    );
    expect(result.ranked[0].tableId).toBe("patio");
  });

  it("produces the same ranking whatever order the tables arrive in", () => {
    const forward = rankTablesForParty(tables, party({ partySize: 4 }), context());
    const backward = rankTablesForParty([...tables].reverse(), party({ partySize: 4 }), context());
    expect(forward.ranked).toEqual(backward.ranked);
  });
});

describe("rankPartiesForTable", () => {
  const parties = [
    party({ id: "recent", partySize: 4, joinedAt: at(-5) }),
    party({ id: "waiting", partySize: 4, joinedAt: at(-60) }),
    party({ id: "toobig", partySize: 12, joinedAt: at(-90) }),
  ];

  it("puts the longest waiting party that fits first", () => {
    const result = rankPartiesForTable(parties, table({ capacity: 4 }), context());
    expect(result.ranked[0].partyId).toBe("waiting");
    expect(result.ranked[0].reasons).toContain(REASON_LONGEST_WAIT);
  });

  it("rejects a party that cannot fit", () => {
    const result = rankPartiesForTable(parties, table({ capacity: 4 }), context());
    expect(result.rejected).toEqual([{ id: "toobig", reason: REJECT_TOO_SMALL }]);
  });

  it("rejects everyone when the table is blocked", () => {
    const result = rankPartiesForTable(parties, table({ isBlocked: true }), context());
    expect(result.ranked).toEqual([]);
    expect(result.rejected.every((r) => r.reason === REJECT_BLOCKED)).toBe(true);
  });

  it("rejects everyone when the table is busy in the window", () => {
    const busy = context({ occupancy: [{ tableId: "t1", start: at(10), end: at(60) }] });
    const result = rankPartiesForTable(parties, table(), busy);
    expect(result.ranked).toEqual([]);
    expect(result.rejected.every((r) => r.reason === REJECT_OCCUPANCY_CONFLICT)).toBe(true);
  });

  it("lets an explicit priority beat a longer wait", () => {
    const list = [
      party({ id: "patient", partySize: 4, joinedAt: at(-90) }),
      party({ id: "vip", partySize: 4, joinedAt: at(-5), priority: HIGH_PRIORITY_THRESHOLD }),
    ];
    const result = rankPartiesForTable(list, table({ capacity: 4 }), context());
    expect(result.ranked[0].partyId).toBe("vip");
    expect(result.ranked[0].reasons).toContain(REASON_HIGH_PRIORITY);
  });

  it("breaks a tie by who joined first", () => {
    const list = [
      party({ id: "second", partySize: 4, joinedAt: at(-10) }),
      party({ id: "first", partySize: 4, joinedAt: at(-10) }),
    ];
    const result = rankPartiesForTable(list, table({ capacity: 4 }), context());
    expect(result.ranked.map((r) => r.partyId)).toEqual(["first", "second"]);
  });

  it("rejects a party below the table minimum", () => {
    const result = rankPartiesForTable(
      [party({ id: "solo", partySize: 1 })],
      table({ capacity: 8, minimumPartySize: 4 }),
      context(),
    );
    expect(result.rejected).toEqual([{ id: "solo", reason: REJECT_BELOW_MINIMUM }]);
  });
});

describe("scorePartyForTable", () => {
  it("scores a longer wait higher", () => {
    const long = scorePartyForTable(party({ joinedAt: at(-60) }), table(), context());
    const short = scorePartyForTable(party({ joinedAt: at(-10) }), table(), context());
    expect(long.score).toBeGreaterThan(short.score);
  });

  it("caps the wait bonus so one party cannot dominate forever", () => {
    const capped = scorePartyForTable(party({ joinedAt: at(-10000) }), table(), context());
    const atCap = scorePartyForTable(
      party({ joinedAt: at(-MAX_WAIT_SCORE_MINUTES) }),
      table(),
      context(),
    );
    expect(capped.score).toBe(atCap.score);
  });

  it("treats a future join time as no wait", () => {
    const result = scorePartyForTable(
      party({ joinedAt: at(30), partySize: 4 }),
      table(),
      context(),
    );
    expect(result.score).toBe(SCORE_EXACT_FIT);
  });

  it("adds the wait bonus at the expected rate", () => {
    const result = scorePartyForTable(
      party({ joinedAt: at(-10), partySize: 4 }),
      table(),
      context(),
    );
    expect(result.score).toBe(SCORE_EXACT_FIT + 10 * SCORE_WAIT_MINUTE);
  });
});

describe("best helpers", () => {
  it("returns the top table or null", () => {
    expect(bestTableForParty([table()], party({ partySize: 4 }), context())?.tableId).toBe("t1");
    expect(bestTableForParty([], party(), context())).toBeNull();
  });

  it("returns the top party or null", () => {
    expect(bestPartyForTable([party()], table(), context())?.partyId).toBe("p1");
    expect(bestPartyForTable([], table(), context())).toBeNull();
  });
});

describe("matchPartiesToTables", () => {
  const tables = [
    table({ id: "two", name: "T1", capacity: 2 }),
    table({ id: "four", name: "T2", capacity: 4 }),
    table({ id: "six", name: "T3", capacity: 6 }),
  ];

  it("gives each party its own table", () => {
    const parties = [
      party({ id: "a", partySize: 2, joinedAt: at(-60) }),
      party({ id: "b", partySize: 4, joinedAt: at(-30) }),
    ];
    expect(matchPartiesToTables(tables, parties, context())).toEqual({
      two: { partyId: "a", reasons: [REASON_EXACT_FIT, REASON_FREE_ALL_WINDOW] },
      four: { partyId: "b", reasons: [REASON_EXACT_FIT, REASON_FREE_ALL_WINDOW] },
    });
  });

  it("never gives one table to two parties", () => {
    const parties = [
      party({ id: "a", partySize: 2, joinedAt: at(-60) }),
      party({ id: "b", partySize: 2, joinedAt: at(-30) }),
    ];
    const matches = matchPartiesToTables(tables, parties, context());
    const claimed = Object.values(matches).map((m) => m.partyId);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it("serves the longest waiting party first", () => {
    const parties = [
      party({ id: "recent", partySize: 2, joinedAt: at(-5) }),
      party({ id: "patient", partySize: 2, joinedAt: at(-90) }),
    ];
    expect(matchPartiesToTables(tables, parties, context()).two.partyId).toBe("patient");
  });

  it("serves a priority party before a longer waiting one", () => {
    const parties = [
      party({ id: "patient", partySize: 2, joinedAt: at(-90) }),
      party({ id: "vip", partySize: 2, joinedAt: at(-5), priority: 2 }),
    ];
    expect(matchPartiesToTables(tables, parties, context()).two.partyId).toBe("vip");
  });

  it("skips a party that fits nowhere and keeps serving the rest", () => {
    const parties = [
      party({ id: "huge", partySize: 30, joinedAt: at(-90) }),
      party({ id: "pair", partySize: 2, joinedAt: at(-30) }),
    ];
    const matches = matchPartiesToTables(tables, parties, context());
    expect(Object.values(matches).map((m) => m.partyId)).toEqual(["pair"]);
  });

  it("returns nothing when no table is free", () => {
    const busy = context({
      occupancy: tables.map((t) => ({ tableId: t.id, start: at(-10), end: at(120) })),
    });
    expect(matchPartiesToTables(tables, [party({ partySize: 2 })], busy)).toEqual({});
  });

  it("produces the same matches whatever order the parties arrive in", () => {
    const parties = [
      party({ id: "a", partySize: 2, joinedAt: at(-60) }),
      party({ id: "b", partySize: 4, joinedAt: at(-30) }),
      party({ id: "c", partySize: 6, joinedAt: at(-15) }),
    ];
    const forward = matchPartiesToTables(tables, parties, context());
    const backward = matchPartiesToTables(tables, [...parties].reverse(), context());
    expect(forward).toEqual(backward);
  });

  it("does not mutate the inputs it was given", () => {
    const parties = [party({ id: "a", partySize: 2 }), party({ id: "b", partySize: 4 })];
    const snapshot = JSON.stringify(parties);
    matchPartiesToTables(tables, parties, context());
    expect(JSON.stringify(parties)).toBe(snapshot);
  });
});

describe("reservation windows", () => {
  it("picks a table free during the reservation window even if busy now", () => {
    const later = context({
      window: { start: at(180), end: at(270) },
      occupancy: [{ tableId: "busy", start: NOW, end: at(90) }],
    });
    const options = [
      table({ id: "busy", name: "T1", capacity: 4 }),
      table({ id: "free", name: "T2", capacity: 6 }),
    ];
    const result = rankTablesForParty(options, party({ partySize: 4 }), later);
    expect(result.ranked[0].tableId).toBe("busy");
  });

  it("excludes a table booked during the reservation window", () => {
    const later = context({
      window: { start: at(180), end: at(270) },
      occupancy: [{ tableId: "taken", start: at(200), end: at(300) }],
    });
    const options = [
      table({ id: "taken", name: "T1", capacity: 4 }),
      table({ id: "open", name: "T2", capacity: 4 }),
    ];
    const result = rankTablesForParty(options, party({ partySize: 4 }), later);
    expect(result.ranked.map((r) => r.tableId)).toEqual(["open"]);
    expect(result.rejected).toEqual([{ id: "taken", reason: REJECT_OCCUPANCY_CONFLICT }]);
  });
});

describe("tie breaking and setup members", () => {
  it("breaks a table score tie on capacity when the scores match", () => {
    const options = [
      table({ id: "roomy", name: "T1", capacity: 6, roomId: "room-patio" }),
      table({ id: "tight", name: "T2", capacity: 4 }),
    ];
    const result = rankTablesForParty(
      options,
      party({ partySize: 4, preferredRoomIds: ["room-patio"] }),
      context(),
    );
    expect(result.ranked[0].score).not.toBe(result.ranked[1].score);
    expect(result.ranked.map((r) => r.tableId)).toEqual(["tight", "roomy"]);
  });

  it("falls back to the table id when score, capacity and name all tie", () => {
    const options = [
      table({ id: "zzz", name: "T1", capacity: 4 }),
      table({ id: "aaa", name: "T1", capacity: 4 }),
    ];
    const result = rankTablesForParty(options, party({ partySize: 4 }), context());
    expect(result.ranked.map((r) => r.tableId)).toEqual(["aaa", "zzz"]);
  });

  it("seats the longer wait first once both parties are past the wait cap", () => {
    const list = [
      party({ id: "recent", partySize: 4, joinedAt: at(-(MAX_WAIT_SCORE_MINUTES + 30)) }),
      party({ id: "oldest", partySize: 4, joinedAt: at(-(MAX_WAIT_SCORE_MINUTES + 90)) }),
    ];
    const result = rankPartiesForTable(list, table({ capacity: 4 }), context());
    expect(result.ranked[0].score).toBe(result.ranked[1].score);
    expect(result.ranked.map((r) => r.partyId)).toEqual(["oldest", "recent"]);
  });

  it("falls back to the party id when everything else ties", () => {
    const joinedAt = at(-20);
    const list = [
      party({ id: "zzz", partySize: 4, joinedAt }),
      party({ id: "aaa", partySize: 4, joinedAt }),
    ];
    const result = rankPartiesForTable(list, table({ capacity: 4 }), context());
    expect(result.ranked.map((r) => r.partyId)).toEqual(["aaa", "zzz"]);
  });
});

describe("scoring a party against a table", () => {
  it("calls a one seat overshoot efficient for the party side too", () => {
    const result = scorePartyForTable(
      party({ partySize: 3, joinedAt: at(0) }),
      table({ capacity: 4 }),
      context(),
    );
    expect(result.reasons).toContain(REASON_EFFICIENT_FIT);
    expect(result.score).toBe(-SCORE_WASTED_SEAT);
  });

  it("penalises a badly oversized table on the party side", () => {
    const result = scorePartyForTable(
      party({ partySize: 2, joinedAt: at(0) }),
      table({ capacity: 8 }),
      context(),
    );
    expect(result.reasons).not.toContain(REASON_EFFICIENT_FIT);
    expect(result.score).toBe(-6 * SCORE_WASTED_SEAT);
  });

  it("rewards a room the guest prefers on the party side", () => {
    const result = scorePartyForTable(
      party({ partySize: 4, joinedAt: at(0), preferredRoomIds: ["room-main"] }),
      table({ capacity: 4 }),
      context(),
    );
    expect(result.reasons).toContain(REASON_PREFERRED_ROOM);
    expect(result.score).toBe(SCORE_EXACT_FIT + SCORE_PREFERRED_ROOM);
  });

  it("rewards a room the location prefers on the party side", () => {
    const result = scorePartyForTable(
      party({ partySize: 4, joinedAt: at(0) }),
      table({ capacity: 4 }),
      context({ preferredRoomIds: ["room-main"] }),
    );
    expect(result.reasons).toContain(REASON_PREFERRED_ROOM);
  });
});

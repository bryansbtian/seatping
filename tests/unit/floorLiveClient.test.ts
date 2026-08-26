import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => {
  return { api: apiMock };
});

import {
  FLOOR_MODE_KEY,
  LIVE_STATUSES,
  allTables,
  countByStatus,
  elapsedMinutes,
  findTable,
  formatClock,
  moveTargets,
  partyFitsTable,
  persistFloorMode,
  readFloorMode,
  roomOfTable,
  seatableParties,
  statusStyle,
  type LiveRoom,
  type LiveStatus,
  type LiveTable,
  type WaitingParty,
} from "../../src/lib/floorLive.js";
import { statusIcon } from "../../src/lib/floorLiveIcons.js";
import {
  completeVisit,
  fetchLiveFloor,
  markTableAvailable,
  markTableCleaning,
  movePartyToTable,
  seatParty,
  seatReservedAssignment,
} from "../../src/lib/floorLiveApi.js";

const LOCATION = "loc-1";

function makeTable(id: string, overrides: Partial<LiveTable> = {}): LiveTable {
  return {
    id,
    name: id.toUpperCase(),
    capacity: 4,
    minimumPartySize: 1,
    shape: "RECTANGLE",
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    rotation: 0,
    isBlocked: false,
    cleaningSince: null,
    status: "AVAILABLE",
    currentAssignment: null,
    upcomingAssignment: null,
    recommendedPartyId: null,
    ...overrides,
  };
}

function makeRoom(id: string, tables: LiveTable[]): LiveRoom {
  return { id, name: id, width: 1200, height: 800, sortOrder: 0, zones: [], tables };
}

function makeParty(id: string, partySize: number): WaitingParty {
  return { id, name: id, partySize, joinedAt: "2026-08-26T17:00:00.000Z", waitingMinutes: 20 };
}

describe("countByStatus", () => {
  it("counts each status and leaves the rest at zero", () => {
    const counts = countByStatus([
      makeTable("a", { status: "AVAILABLE" }),
      makeTable("b", { status: "OCCUPIED" }),
      makeTable("c", { status: "OCCUPIED" }),
    ]);

    expect(counts.AVAILABLE).toBe(1);
    expect(counts.OCCUPIED).toBe(2);
    expect(counts.RESERVED).toBe(0);
    expect(counts.CLEANING).toBe(0);
    expect(counts.BLOCKED).toBe(0);
  });

  it("ignores a status the client does not know about", () => {
    const counts = countByStatus([makeTable("a", { status: "MYSTERY" as LiveStatus })]);
    expect(counts.AVAILABLE).toBe(0);
  });

  it("returns all zeros for an empty floor", () => {
    const counts = countByStatus([]);
    expect(Object.values(counts).every((value) => value === 0)).toBe(true);
  });
});

describe("statusStyle", () => {
  it("returns a style for every supported status", () => {
    for (const status of LIVE_STATUSES) {
      expect(statusStyle(status).node).toBeTruthy();
      expect(statusStyle(status).swatch).toBeTruthy();
      expect(statusStyle(status).badge).toBeTruthy();
    }
  });

  it("falls back to the available style for an unknown status", () => {
    expect(statusStyle("MYSTERY" as LiveStatus)).toEqual(statusStyle("AVAILABLE"));
  });

  it("returns an icon for every supported status", () => {
    for (const status of LIVE_STATUSES) {
      expect(statusIcon(status)).toBeTruthy();
    }
  });

  it("falls back to the available icon for an unknown status", () => {
    expect(statusIcon("MYSTERY" as LiveStatus)).toBe(statusIcon("AVAILABLE"));
  });
});

describe("table lookups", () => {
  const rooms = [
    makeRoom("main", [makeTable("t1"), makeTable("t2")]),
    makeRoom("patio", [makeTable("t3")]),
  ];

  it("flattens tables across rooms", () => {
    expect(allTables(rooms).map((table) => table.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("finds a table in any room", () => {
    expect(findTable(rooms, "t3")?.id).toBe("t3");
  });

  it("returns null for an unknown table", () => {
    expect(findTable(rooms, "nope")).toBeNull();
  });

  it("returns null without a table id", () => {
    expect(findTable(rooms, null)).toBeNull();
  });

  it("finds the room that owns a table", () => {
    expect(roomOfTable(rooms, "t3")?.id).toBe("patio");
  });

  it("returns null when no room owns the table", () => {
    expect(roomOfTable(rooms, "nope")).toBeNull();
    expect(roomOfTable(rooms, null)).toBeNull();
  });
});

describe("partyFitsTable and seatableParties", () => {
  it("keeps only parties inside the table range", () => {
    const table = makeTable("t1", { capacity: 4, minimumPartySize: 2 });
    const parties = [makeParty("solo", 1), makeParty("pair", 2), makeParty("crowd", 9)];
    expect(seatableParties(table, parties).map((party) => party.id)).toEqual(["pair"]);
  });

  it("rejects a party above capacity and below the minimum", () => {
    expect(partyFitsTable(9, { capacity: 4, minimumPartySize: 1 })).toBe(false);
    expect(partyFitsTable(1, { capacity: 8, minimumPartySize: 4 })).toBe(false);
  });
});

describe("moveTargets", () => {
  const source = makeTable("source", { status: "OCCUPIED" });
  const rooms = [
    makeRoom("main", [
      source,
      makeTable("free", { status: "AVAILABLE" }),
      makeTable("reserved", { status: "RESERVED" }),
      makeTable("cleaning", { status: "CLEANING" }),
      makeTable("busy", { status: "OCCUPIED" }),
      makeTable("blocked", { status: "BLOCKED" }),
      makeTable("tiny", { status: "AVAILABLE", capacity: 1 }),
    ]),
  ];

  it("offers tables that can take the party and excludes the current one", () => {
    expect(moveTargets(rooms, source, 2).map((table) => table.id)).toEqual([
      "free",
      "reserved",
      "cleaning",
    ]);
  });

  it("drops tables that are too small for the party", () => {
    expect(moveTargets(rooms, source, 4).map((table) => table.id)).not.toContain("tiny");
  });
});

describe("formatClock and elapsedMinutes", () => {
  const now = new Date("2026-08-26T18:00:00.000Z");

  it("returns an empty string for missing or invalid input", () => {
    expect(formatClock(null)).toBe("");
    expect(formatClock("not-a-date")).toBe("");
  });

  it("formats a real timestamp", () => {
    expect(formatClock("2026-08-26T18:00:00.000Z")).not.toBe("");
  });

  it("returns whole elapsed minutes", () => {
    expect(elapsedMinutes("2026-08-26T17:15:00.000Z", now)).toBe(45);
  });

  it("clamps a future timestamp to zero", () => {
    expect(elapsedMinutes("2026-08-26T18:30:00.000Z", now)).toBe(0);
  });

  it("returns null for missing or invalid input", () => {
    expect(elapsedMinutes(null, now)).toBeNull();
    expect(elapsedMinutes("not-a-date", now)).toBeNull();
  });
});

describe("live floor requests", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({});
  });

  function lastCall(): [string, { method?: string; body?: string }] {
    const call = apiMock.mock.calls[apiMock.mock.calls.length - 1];
    return [call[0], call[1] ?? {}];
  }

  it("reads the live floor", async () => {
    apiMock.mockResolvedValue({ now: "2026-08-26T18:00:00.000Z", rooms: [], waitingParties: [] });
    const live = await fetchLiveFloor(LOCATION);
    expect(lastCall()[0]).toBe("/api/floor/loc-1/live");
    expect(live.rooms).toEqual([]);
  });

  it("seats a queue party at a table", async () => {
    await seatParty(LOCATION, "table-1", { queueEntryId: "queue-1", partySize: 3 });
    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/tables/table-1/seat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body ?? "{}")).toEqual({ queueEntryId: "queue-1", partySize: 3 });
  });

  it("seats a party that already holds a reservation", async () => {
    await seatReservedAssignment(LOCATION, "assign-1");
    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/assignments/assign-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body ?? "{}")).toEqual({ status: "SEATED" });
  });

  it("completes a visit", async () => {
    await completeVisit(LOCATION, "assign-1");
    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/assignments/assign-1/complete");
    expect(init.method).toBe("POST");
  });

  it("moves a party to another table", async () => {
    await movePartyToTable(LOCATION, "assign-1", "table-2");
    const [url, init] = lastCall();
    expect(url).toBe("/api/floor/loc-1/assignments/assign-1/move");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body ?? "{}")).toEqual({ tableId: "table-2" });
  });

  it("marks a table for cleaning and back to available", async () => {
    await markTableCleaning(LOCATION, "table-1");
    expect(lastCall()[0]).toBe("/api/floor/loc-1/tables/table-1/cleaning");

    await markTableAvailable(LOCATION, "table-1");
    expect(lastCall()[0]).toBe("/api/floor/loc-1/tables/table-1/available");
  });

  it("lets a failed request reject so the caller can report it", async () => {
    apiMock.mockRejectedValue(new Error("Table is blocked and cannot accept an assignment"));
    await expect(seatParty(LOCATION, "table-1", { partySize: 2 })).rejects.toThrow(
      "Table is blocked and cannot accept an assignment",
    );
  });
});

describe("floor mode persistence", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens on the live floor when nothing is stored", () => {
    expect(readFloorMode()).toBe("live");
  });

  it("remembers that the operator was editing the layout", () => {
    persistFloorMode("edit");
    expect(store.get(FLOOR_MODE_KEY)).toBe("edit");
    expect(readFloorMode()).toBe("edit");

    persistFloorMode("live");
    expect(readFloorMode()).toBe("live");
  });

  it("treats any other stored value as the live floor", () => {
    store.set(FLOOR_MODE_KEY, "something-else");
    expect(readFloorMode()).toBe("live");
  });

  it("falls back to the live floor when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readFloorMode()).toBe("live");
    expect(() => persistFloorMode("edit")).not.toThrow();
  });

  it("uses a key separate from the other business preferences", () => {
    expect(FLOOR_MODE_KEY).toBe("seatping.business.floorMode");
  });
});

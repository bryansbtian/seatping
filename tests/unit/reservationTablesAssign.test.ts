import { beforeEach, describe, expect, it, vi } from "vitest";

const createAssignment = vi.fn();
const floorPlanFindMany = vi.fn();
const assignmentFindMany = vi.fn();
const assignmentUpdateMany = vi.fn();
const diningTableFindFirst = vi.fn();
const reservationUpdate = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      floorPlan: { findMany: floorPlanFindMany },
      tableAssignment: { findMany: assignmentFindMany, updateMany: assignmentUpdateMany },
      diningTable: { findFirst: diningTableFindFirst },
      reservation: { update: reservationUpdate },
      user: { findUnique: vi.fn(), update: vi.fn() },
    },
  };
});

vi.mock("../../server/lib/floor.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/floor.js");
  return { ...actual, createAssignment };
});

const {
  NEEDS_REVIEW_NO_TABLE,
  assignOrFlagReservation,
  assignTableForReservation,
  loadReservationInventory,
  locationHasFloorInventory,
  releaseReservationTables,
  windowForReservation,
} = await import("../../server/lib/reservationTables.js");

const BUSINESS = "b1";
const LOCATION = "loc-1";
const RESERVATION = "res-1";

const WINDOW = {
  start: new Date("2026-08-12T19:00:00.000Z"),
  end: new Date("2026-08-12T20:30:00.000Z"),
};

function room(tables: any[]) {
  return { id: "room-main", name: "Main", tables };
}

function dbTable(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    name: "T1",
    capacity: 4,
    minimumPartySize: 1,
    isBlocked: false,
    ...overrides,
  };
}

beforeEach(() => {
  createAssignment.mockReset();
  floorPlanFindMany.mockReset().mockResolvedValue([room([dbTable()])]);
  assignmentFindMany.mockReset().mockResolvedValue([]);
  assignmentUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  diningTableFindFirst.mockReset().mockResolvedValue(null);
  reservationUpdate.mockReset().mockResolvedValue({});
});

function assign(overrides: Record<string, unknown> = {}) {
  return assignTableForReservation({
    businessId: BUSINESS,
    locationId: LOCATION,
    reservationId: RESERVATION,
    partySize: 2,
    window: WINDOW,
    ...overrides,
  });
}

describe("locationHasFloorInventory", () => {
  it("is false when the location has no tables", async () => {
    expect(await locationHasFloorInventory(LOCATION)).toBe(false);
  });

  it("is true once a table exists", async () => {
    diningTableFindFirst.mockResolvedValue({ id: "t1" });

    expect(await locationHasFloorInventory(LOCATION)).toBe(true);
  });
});

describe("loadReservationInventory", () => {
  it("reads occupancy from every member of a combined assignment", async () => {
    assignmentFindMany.mockResolvedValue([
      {
        tableId: "t1",
        tableIds: ["t1", "t2"],
        reservationId: null,
        expectedStartAt: WINDOW.start,
        expectedEndAt: WINDOW.end,
      },
    ]);

    const inventory = await loadReservationInventory(LOCATION);

    expect(inventory.occupancy.map((entry) => entry.tableId)).toEqual(["t1", "t2"]);
  });

  it("falls back to the anchor table when an assignment lists no members", async () => {
    assignmentFindMany.mockResolvedValue([
      {
        tableId: "t1",
        tableIds: [],
        reservationId: null,
        expectedStartAt: WINDOW.start,
        expectedEndAt: WINDOW.end,
      },
    ]);

    const inventory = await loadReservationInventory(LOCATION);

    expect(inventory.occupancy.map((entry) => entry.tableId)).toEqual(["t1"]);
  });

  it("leaves out the reservation's own hold when asked to", async () => {
    assignmentFindMany.mockResolvedValue([
      {
        tableId: "t1",
        tableIds: ["t1"],
        reservationId: RESERVATION,
        expectedStartAt: WINDOW.start,
        expectedEndAt: WINDOW.end,
      },
    ]);

    const inventory = await loadReservationInventory(LOCATION, {
      excludeReservationId: RESERVATION,
    });

    expect(inventory.occupancy).toEqual([]);
  });
});

describe("assignTableForReservation", () => {
  it("returns the assignment it managed to create", async () => {
    createAssignment.mockResolvedValue({ ok: true, value: { id: "a1" } });

    const result = await assign();

    expect(result).toEqual({ assignment: { id: "a1" }, tableName: "T1" });
  });

  it("does nothing when the location tracks no tables", async () => {
    floorPlanFindMany.mockResolvedValue([]);

    expect(await assign()).toBeNull();
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it("does nothing when a null inventory is passed in", async () => {
    expect(await assign({ inventory: null })).toBeNull();
    expect(floorPlanFindMany).not.toHaveBeenCalled();
  });

  it("uses the inventory it was handed instead of reloading", async () => {
    createAssignment.mockResolvedValue({ ok: true, value: { id: "a1" } });

    await assign({
      inventory: {
        setups: [
          {
            id: "given",
            name: "Given",
            roomId: "room-main",
            roomName: "Main",
            capacity: 4,
            minimumPartySize: 1,
            isBlocked: false,
            cleaningSince: null,
          },
        ],
        occupancy: [],
      },
    });

    expect(floorPlanFindMany).not.toHaveBeenCalled();
    expect(createAssignment.mock.calls[0][0].tableId).toBe("given");
  });

  it("tries the next table when the first is taken in the meantime", async () => {
    floorPlanFindMany.mockResolvedValue([
      room([dbTable(), dbTable({ id: "t2", name: "T2", capacity: 6 })]),
    ]);
    createAssignment
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        error: "Table already has an assignment during that time",
      })
      .mockResolvedValueOnce({ ok: true, value: { id: "a2" } });

    const result = await assign();

    expect(createAssignment).toHaveBeenCalledTimes(2);
    expect(result?.tableName).toBe("T2");
  });

  it("gives up when every candidate is taken", async () => {
    createAssignment.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Table already has an assignment during that time",
    });

    expect(await assign()).toBeNull();
  });

  it("stops immediately when the reservation already holds a table", async () => {
    floorPlanFindMany.mockResolvedValue([
      room([dbTable(), dbTable({ id: "t2", name: "T2", capacity: 6 })]),
    ]);
    createAssignment.mockResolvedValue({
      ok: false,
      status: 409,
      error: "That reservation already has a table",
    });

    expect(await assign()).toBeNull();
    expect(createAssignment).toHaveBeenCalledTimes(1);
  });

  it("stops immediately on a failure that is not a conflict", async () => {
    floorPlanFindMany.mockResolvedValue([
      room([dbTable(), dbTable({ id: "t2", name: "T2", capacity: 6 })]),
    ]);
    createAssignment.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Table not found or access denied",
    });

    expect(await assign()).toBeNull();
    expect(createAssignment).toHaveBeenCalledTimes(1);
  });
});

describe("releaseReservationTables", () => {
  it("cancels the live holds and reports how many", async () => {
    assignmentUpdateMany.mockResolvedValue({ count: 2 });

    expect(await releaseReservationTables(RESERVATION)).toBe(2);
    expect(assignmentUpdateMany.mock.calls[0][0].data.status).toBe("CANCELLED");
  });
});

describe("windowForReservation", () => {
  it("uses the location's stored duration", () => {
    const window = windowForReservation(
      { reservationSettings: { defaultReservationDurationMinutes: 120 }, timezone: "UTC" },
      "2026-08-12T19:00",
    );

    const minutes = (window.end.getTime() - window.start.getTime()) / 60000;
    expect(minutes).toBe(120);
  });

  it("prefers settings it is handed over the stored ones", () => {
    const window = windowForReservation(
      { reservationSettings: { defaultReservationDurationMinutes: 120 }, timezone: "UTC" },
      "2026-08-12T19:00",
      { defaultReservationDurationMinutes: 45 } as any,
    );

    const minutes = (window.end.getTime() - window.start.getTime()) / 60000;
    expect(minutes).toBe(45);
  });
});

describe("assignOrFlagReservation", () => {
  function run(overrides: Record<string, unknown> = {}) {
    return assignOrFlagReservation({
      businessId: BUSINESS,
      locationId: LOCATION,
      reservationId: RESERVATION,
      partySize: 2,
      window: WINDOW,
      ...overrides,
    });
  }

  it("clears the review flag once a table is found", async () => {
    createAssignment.mockResolvedValue({ ok: true, value: { id: "a1" } });

    const result = await run();

    expect(result?.tableName).toBe("T1");
    expect(reservationUpdate).toHaveBeenCalledWith({
      where: { id: RESERVATION },
      data: { needsReview: false, needsReviewReason: null, needsReviewNotifiedAt: null },
    });
  });

  it("flags the booking when no table can take it", async () => {
    createAssignment.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Table already has an assignment during that time",
    });

    const result = await run();

    expect(result).toBeNull();
    expect(reservationUpdate).toHaveBeenCalledWith({
      where: { id: RESERVATION },
      data: { needsReview: true, needsReviewReason: NEEDS_REVIEW_NO_TABLE },
    });
  });

  it("flags the booking when the location tracks no tables", async () => {
    floorPlanFindMany.mockResolvedValue([]);

    expect(await run()).toBeNull();
    expect(reservationUpdate.mock.calls[0][0].data.needsReview).toBe(true);
  });

  it("does not write an assignment when it flags", async () => {
    floorPlanFindMany.mockResolvedValue([]);

    await run();

    expect(createAssignment).not.toHaveBeenCalled();
  });
});

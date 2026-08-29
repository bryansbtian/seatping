import { describe, expect, it } from "vitest";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  ASSIGNMENT_SOURCES,
  ASSIGNMENT_STATUSES,
  DEFAULT_TURN_MINUTES,
  MAX_TURN_MINUTES,
  TABLE_SHAPES,
  normalizeRotation,
  parseDate,
  parseInteger,
  parseName,
  parseObjectId,
  parseOptionalObjectId,
  parseOptionalText,
  parseShape,
  parseSource,
  parseStatus,
  partyFitsTable,
  resolveOccupancyWindow,
  serializeAssignment,
  serializeFloorPlan,
  serializeTable,
  windowsOverlap,
} from "../../server/lib/floor.js";

function at(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 7, 30, hour, minute, 0));
}

describe("windowsOverlap", () => {
  it("detects a partial overlap from either direction", () => {
    expect(windowsOverlap(at(18), at(20), at(19), at(21))).toBe(true);
    expect(windowsOverlap(at(19), at(21), at(18), at(20))).toBe(true);
  });

  it("detects a fully contained window", () => {
    expect(windowsOverlap(at(18), at(22), at(19), at(20))).toBe(true);
    expect(windowsOverlap(at(19), at(20), at(18), at(22))).toBe(true);
  });

  it("treats touching edges as free, so a table can turn back to back", () => {
    expect(windowsOverlap(at(18), at(20), at(20), at(22))).toBe(false);
    expect(windowsOverlap(at(20), at(22), at(18), at(20))).toBe(false);
  });

  it("returns false for windows that do not touch", () => {
    expect(windowsOverlap(at(18), at(19), at(20), at(21))).toBe(false);
  });
});

describe("normalizeRotation", () => {
  it("keeps values already inside a single turn", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(359)).toBe(359);
  });

  it("wraps values at or beyond a full turn", () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });

  it("wraps negative values into a positive angle", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-360)).toBe(0);
    expect(normalizeRotation(-450)).toBe(270);
  });

  it("rounds fractional angles", () => {
    expect(normalizeRotation(90.4)).toBe(90);
    expect(normalizeRotation(90.6)).toBe(91);
  });
});

describe("parseInteger", () => {
  it("accepts numbers and numeric strings inside the range", () => {
    expect(parseInteger(4, "capacity", 1, 40)).toEqual({ ok: true, value: 4 });
    expect(parseInteger("4", "capacity", 1, 40)).toEqual({ ok: true, value: 4 });
  });

  it("rounds to the nearest integer", () => {
    expect(parseInteger(4.4, "capacity", 1, 40)).toEqual({ ok: true, value: 4 });
  });

  it("rejects values outside the range with a descriptive message", () => {
    const result = parseInteger(99, "capacity", 1, 40);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toBe("capacity must be between 1 and 40");
    }
  });

  it("rejects values that are not numbers", () => {
    expect(parseInteger("abc", "capacity", 1, 40).ok).toBe(false);
    expect(parseInteger(null, "capacity", 1, 40).ok).toBe(false);
    expect(parseInteger(undefined, "capacity", 1, 40).ok).toBe(false);
    expect(parseInteger(Number.NaN, "capacity", 1, 40).ok).toBe(false);
    expect(parseInteger(Number.POSITIVE_INFINITY, "capacity", 1, 40).ok).toBe(false);
  });
});

describe("parseName", () => {
  it("trims surrounding whitespace", () => {
    expect(parseName("  Table 12  ", "name", 60)).toEqual({ ok: true, value: "Table 12" });
  });

  it("rejects blank and non string values", () => {
    expect(parseName("   ", "name", 60).ok).toBe(false);
    expect(parseName(undefined, "name", 60).ok).toBe(false);
    expect(parseName(12, "name", 60).ok).toBe(false);
  });

  it("rejects names longer than the limit", () => {
    expect(parseName("a".repeat(61), "name", 60).ok).toBe(false);
    expect(parseName("a".repeat(60), "name", 60).ok).toBe(true);
  });
});

describe("parseOptionalText", () => {
  it("maps missing and blank values to null", () => {
    expect(parseOptionalText(undefined, "reason", 60)).toEqual({ ok: true, value: null });
    expect(parseOptionalText(null, "reason", 60)).toEqual({ ok: true, value: null });
    expect(parseOptionalText("   ", "reason", 60)).toEqual({ ok: true, value: null });
  });

  it("trims provided text", () => {
    expect(parseOptionalText(" Patio ", "reason", 60)).toEqual({ ok: true, value: "Patio" });
  });

  it("rejects overlong and non string values", () => {
    expect(parseOptionalText("a".repeat(61), "reason", 60).ok).toBe(false);
    expect(parseOptionalText(5, "reason", 60).ok).toBe(false);
  });
});

describe("enum parsing", () => {
  it("accepts every supported shape and is case insensitive", () => {
    for (const shape of TABLE_SHAPES) {
      expect(parseShape(shape)).toEqual({ ok: true, value: shape });
      expect(parseShape(shape.toLowerCase())).toEqual({ ok: true, value: shape });
    }
  });

  it("rejects an unsupported shape", () => {
    const result = parseShape("HEXAGON");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("ROUND");
    }
  });

  it("accepts only Smart and Manual assignment sources", () => {
    expect(ASSIGNMENT_SOURCES).toEqual(["SMART", "MANUAL"]);
    expect(parseSource("smart")).toEqual({ ok: true, value: "SMART" });
    expect(parseSource("manual")).toEqual({ ok: true, value: "MANUAL" });
    expect(parseSource("AUTO").ok).toBe(false);
    expect(parseSource(undefined).ok).toBe(false);
  });

  it("accepts every assignment status", () => {
    for (const status of ASSIGNMENT_STATUSES) {
      expect(parseStatus(status)).toEqual({ ok: true, value: status });
    }
    expect(parseStatus("PENDING").ok).toBe(false);
  });

  it("treats only Reserved and Seated as active", () => {
    expect(ACTIVE_ASSIGNMENT_STATUSES).toEqual(["RESERVED", "SEATED"]);
  });
});

describe("parseDate", () => {
  it("accepts ISO strings and Date instances", () => {
    const iso = parseDate("2026-08-30T19:00:00.000Z", "expectedStartAt");
    expect(iso.ok).toBe(true);
    if (iso.ok) {
      expect(iso.value.toISOString()).toBe("2026-08-30T19:00:00.000Z");
    }
    expect(parseDate(at(19), "expectedStartAt").ok).toBe(true);
  });

  it("rejects unparseable and non date values", () => {
    expect(parseDate("not-a-date", "expectedStartAt").ok).toBe(false);
    expect(parseDate(12345, "expectedStartAt").ok).toBe(false);
    expect(parseDate(undefined, "expectedStartAt").ok).toBe(false);
  });
});

describe("object id parsing", () => {
  const valid = "6a8ddc538ed226e915cd591d";

  it("accepts a 24 character hex id", () => {
    expect(parseObjectId(valid, "tableId")).toEqual({ ok: true, value: valid });
  });

  it("rejects ids of the wrong shape", () => {
    expect(parseObjectId("abc", "tableId").ok).toBe(false);
    expect(parseObjectId(`${valid}ff`, "tableId").ok).toBe(false);
    expect(parseObjectId("zzzzzzzzzzzzzzzzzzzzzzzz", "tableId").ok).toBe(false);
  });

  it("treats missing optional ids as null but still validates provided ones", () => {
    expect(parseOptionalObjectId(undefined, "queueEntryId")).toEqual({ ok: true, value: null });
    expect(parseOptionalObjectId(null, "queueEntryId")).toEqual({ ok: true, value: null });
    expect(parseOptionalObjectId("", "queueEntryId")).toEqual({ ok: true, value: null });
    expect(parseOptionalObjectId(valid, "queueEntryId")).toEqual({ ok: true, value: valid });
    expect(parseOptionalObjectId("nope", "queueEntryId").ok).toBe(false);
  });
});

describe("resolveOccupancyWindow", () => {
  it("derives the end from the default turn time when none is given", () => {
    const result = resolveOccupancyWindow({ expectedStartAt: at(19).toISOString() });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const minutes = (result.value.end.getTime() - result.value.start.getTime()) / 60000;
      expect(minutes).toBe(DEFAULT_TURN_MINUTES);
    }
  });

  it("honours an explicit turn length", () => {
    const result = resolveOccupancyWindow({
      expectedStartAt: at(19).toISOString(),
      turnMinutes: 45,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.end.toISOString()).toBe(at(19, 45).toISOString());
    }
  });

  it("prefers an explicit end over a turn length", () => {
    const result = resolveOccupancyWindow({
      expectedStartAt: at(19).toISOString(),
      expectedEndAt: at(21).toISOString(),
      turnMinutes: 30,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.end.toISOString()).toBe(at(21).toISOString());
    }
  });

  it("rejects an end that is not after the start", () => {
    const equal = resolveOccupancyWindow({
      expectedStartAt: at(19).toISOString(),
      expectedEndAt: at(19).toISOString(),
    });
    expect(equal.ok).toBe(false);

    const backwards = resolveOccupancyWindow({
      expectedStartAt: at(21).toISOString(),
      expectedEndAt: at(19).toISOString(),
    });
    expect(backwards.ok).toBe(false);
  });

  it("rejects a window longer than the maximum turn", () => {
    const start = at(0);
    const end = new Date(start.getTime() + (MAX_TURN_MINUTES + 1) * 60 * 1000);
    const result = resolveOccupancyWindow({
      expectedStartAt: start.toISOString(),
      expectedEndAt: end.toISOString(),
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unparseable end", () => {
    const result = resolveOccupancyWindow({
      expectedStartAt: at(19).toISOString(),
      expectedEndAt: "closing time",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("expectedEndAt");
    }
  });

  it("rejects an invalid turn length and a missing start", () => {
    expect(
      resolveOccupancyWindow({ expectedStartAt: at(19).toISOString(), turnMinutes: 0 }).ok,
    ).toBe(false);
    expect(resolveOccupancyWindow({}).ok).toBe(false);
  });
});

describe("partyFitsTable", () => {
  const table = { capacity: 4, minimumPartySize: 2 };

  it("accepts a party inside the table range", () => {
    expect(partyFitsTable(2, table)).toBe(true);
    expect(partyFitsTable(3, table)).toBe(true);
    expect(partyFitsTable(4, table)).toBe(true);
  });

  it("rejects a party larger than capacity", () => {
    expect(partyFitsTable(5, table)).toBe(false);
  });

  it("rejects a party smaller than the minimum party size", () => {
    expect(partyFitsTable(1, table)).toBe(false);
  });
});

describe("serializers", () => {
  it("exposes table fields without leaking internal concurrency state", () => {
    const serialized = serializeTable({
      id: "t1",
      floorPlanId: "p1",
      locationId: "l1",
      name: "Table 12",
      capacity: 4,
      minimumPartySize: 2,
      shape: "RECTANGLE",
      x: 10,
      y: 20,
      width: 120,
      height: 80,
      rotation: 90,
      isBlocked: false,
      blockedReason: null,
      assignmentVersion: 7,
      businessId: "b1",
      createdAt: at(19),
      updatedAt: at(19),
    });

    expect(serialized).not.toHaveProperty("assignmentVersion");
    expect(serialized).not.toHaveProperty("businessId");
    expect(serialized.name).toBe("Table 12");
  });

  it("serializes a floor plan with an empty table list when none are loaded", () => {
    const serialized = serializeFloorPlan({
      id: "p1",
      locationId: "l1",
      name: "Main Floor",
      width: 1200,
      height: 800,
      createdAt: at(19),
      updatedAt: at(19),
    });
    expect(serialized.tables).toEqual([]);
  });

  it("serializes nested tables when they are loaded", () => {
    const serialized = serializeFloorPlan({
      id: "p1",
      locationId: "l1",
      name: "Main Floor",
      width: 1200,
      height: 800,
      tables: [{ id: "t1", name: "Table 1", capacity: 2, minimumPartySize: 1 }],
      createdAt: at(19),
      updatedAt: at(19),
    });
    expect(serialized.tables).toHaveLength(1);
    expect(serialized.tables[0].name).toBe("Table 1");
  });

  it("exposes assignment references without duplicating guest data", () => {
    const serialized = serializeAssignment({
      id: "a1",
      tableId: "t1",
      locationId: "l1",
      businessId: "b1",
      queueEntryId: null,
      reservationId: "r1",
      guestProfileId: "g1",
      partySize: 4,
      source: "SMART",
      status: "RESERVED",
      assignedAt: at(18),
      expectedStartAt: at(19),
      expectedEndAt: at(20),
      seatedAt: null,
      completedAt: null,
      cancelledAt: null,
    });

    expect(serialized).not.toHaveProperty("businessId");
    expect(serialized.reservationId).toBe("r1");
    expect(serialized.queueEntryId).toBeNull();
    expect(serialized.source).toBe("SMART");
  });
});

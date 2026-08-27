import { describe, expect, it } from "vitest";
import {
  COMBINATION_NAME_MAX_LENGTH,
  MAX_COMBINATION_TABLES,
  MIN_COMBINATION_TABLES,
  combinationCapacity,
  defaultCombinationName,
  parseTableIds,
  serializeCombination,
} from "../../server/lib/tableCombinations.js";
import { isFailure } from "../../server/lib/floor.js";

const ID_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const ID_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const ID_C = "cccccccccccccccccccccccc";

describe("parseTableIds", () => {
  it("accepts a pair of table ids", () => {
    const result = parseTableIds([ID_A, ID_B]);
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.value).toEqual([ID_A, ID_B]);
    }
  });

  it("rejects a value that is not a list", () => {
    const result = parseTableIds("not-a-list");
    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("list of table ids");
    }
  });

  it("rejects an id that is not a table id", () => {
    const result = parseTableIds([ID_A, "nope"]);
    expect(isFailure(result)).toBe(true);
  });

  it("rejects a null entry", () => {
    const result = parseTableIds([ID_A, null]);
    expect(isFailure(result)).toBe(true);
  });

  it("rejects the same table listed twice", () => {
    const result = parseTableIds([ID_A, ID_A]);
    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error).toContain("same table twice");
    }
  });

  it("rejects a combination of a single table", () => {
    const result = parseTableIds([ID_A]);
    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error).toContain(String(MIN_COMBINATION_TABLES));
    }
  });

  it("rejects an empty list", () => {
    expect(isFailure(parseTableIds([]))).toBe(true);
  });

  it("rejects more tables than a combination may hold", () => {
    const many = Array.from({ length: MAX_COMBINATION_TABLES + 1 }, (_, index) => {
      return String(index).padStart(24, "0");
    });
    const result = parseTableIds(many);
    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.error).toContain(String(MAX_COMBINATION_TABLES));
    }
  });

  it("accepts exactly the maximum number of tables", () => {
    const many = Array.from({ length: MAX_COMBINATION_TABLES }, (_, index) => {
      return String(index).padStart(24, "0");
    });
    expect(isFailure(parseTableIds(many))).toBe(false);
  });

  it("trims surrounding whitespace from an id", () => {
    const result = parseTableIds([` ${ID_A} `, ID_B]);
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.value).toEqual([ID_A, ID_B]);
    }
  });
});

describe("combinationCapacity", () => {
  it("sums the seats of every member", () => {
    expect(combinationCapacity([{ capacity: 4 }, { capacity: 4 }, { capacity: 2 }])).toBe(10);
  });

  it("returns zero for no members", () => {
    expect(combinationCapacity([])).toBe(0);
  });
});

describe("defaultCombinationName", () => {
  it("joins the member table names", () => {
    expect(defaultCombinationName([{ name: "T4" }, { name: "T5" }])).toBe("T4 + T5");
  });

  it("keeps the order it was given", () => {
    expect(defaultCombinationName([{ name: "T5" }, { name: "T4" }])).toBe("T5 + T4");
  });

  it("stays within the name limit for a normal setup", () => {
    const name = defaultCombinationName([{ name: "T10" }, { name: "T11" }, { name: "T12" }]);
    expect(name.length).toBeLessThanOrEqual(COMBINATION_NAME_MAX_LENGTH);
  });
});

describe("serializeCombination", () => {
  it("exposes the stored fields alongside the computed capacity", () => {
    const payload = serializeCombination(
      {
        id: "combo-1",
        locationId: "loc-1",
        name: "T1 + T2",
        tableIds: [ID_A, ID_B],
        minimumPartySize: 5,
        isActive: true,
      },
      8,
    );

    expect(payload).toEqual({
      id: "combo-1",
      locationId: "loc-1",
      name: "T1 + T2",
      tableIds: [ID_A, ID_B],
      minimumPartySize: 5,
      isActive: true,
      capacity: 8,
    });
  });

  it("keeps an inactive combination marked inactive", () => {
    const payload = serializeCombination(
      {
        id: "combo-2",
        locationId: "loc-1",
        name: "T1 + T3",
        tableIds: [ID_A, ID_C],
        minimumPartySize: 1,
        isActive: false,
      },
      6,
    );
    expect(payload.isActive).toBe(false);
  });
});

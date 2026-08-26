import { describe, expect, it } from "vitest";
import {
  CORNER_BADGE_MAX_SIZE,
  CORNER_BADGE_MIN_SIZE,
  SQUARE_CORNER_BADGE_INSET,
  TABLE_LABEL_MIN_HEIGHT,
  TABLE_LABEL_MIN_WIDTH,
  cornerBadgeOffset,
  cornerBadgeSize,
  fitsTableName,
  GRID_SIZE,
  TABLE_SHAPES,
  clampNumber,
  clampRectToFloor,
  defaultSizeForShape,
  findFreeSlot,
  isInvalid,
  moveRect,
  nextTableName,
  normalizeRotation,
  rectsAreEqual,
  rectsOverlap,
  resizeRect,
  scaleForViewport,
  scaleToFit,
  screenDeltaToFloor,
  snapToGrid,
  stepRotation,
  toNumberOrBlank,
  validateCapacity,
  validateFloorSize,
} from "../../src/lib/floorGeometry.js";

const BOUNDS = { width: 1200, height: 800 };

function rect(x: number, y: number, width = 100, height = 80) {
  return { x, y, width, height };
}

describe("snapToGrid", () => {
  it("snaps to the nearest grid multiple", () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(4)).toBe(0);
    expect(snapToGrid(5)).toBe(10);
    expect(snapToGrid(14)).toBe(10);
    expect(snapToGrid(96)).toBe(100);
  });

  it("falls back to rounding when the grid is not positive", () => {
    expect(snapToGrid(12.4, 0)).toBe(12);
    expect(snapToGrid(12.6, -5)).toBe(13);
  });
});

describe("clampNumber", () => {
  it("keeps values inside the range and clamps outside ones", () => {
    expect(clampNumber(5, 1, 10)).toBe(5);
    expect(clampNumber(-3, 1, 10)).toBe(1);
    expect(clampNumber(99, 1, 10)).toBe(10);
  });
});

describe("normalizeRotation and stepRotation", () => {
  it("wraps rotation into a single positive turn", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
  });

  it("steps forward and backward without leaving the turn", () => {
    expect(stepRotation(0, 15)).toBe(15);
    expect(stepRotation(350, 15)).toBe(5);
    expect(stepRotation(0, -15)).toBe(345);
  });
});

describe("scaleForViewport", () => {
  it("never scales a small floor up", () => {
    expect(scaleForViewport(2000, 1200)).toBe(1);
  });

  it("shrinks a floor that is wider than the viewport", () => {
    expect(scaleForViewport(600, 1200)).toBe(0.5);
  });

  it("stays safe for zero and negative inputs", () => {
    expect(scaleForViewport(0, 1200)).toBe(1);
    expect(scaleForViewport(600, 0)).toBe(1);
  });
});

describe("scaleToFit", () => {
  it("keeps a floor at full size when the viewport is larger in both directions", () => {
    expect(scaleToFit(2000, 1000, 1200, 800)).toBe(1);
  });

  it("shrinks to the tighter of the two dimensions", () => {
    expect(scaleToFit(600, 1000, 1200, 800)).toBe(0.5);
    expect(scaleToFit(2000, 400, 1200, 800)).toBe(0.5);
  });

  it("uses the smaller ratio when both dimensions are tight", () => {
    expect(scaleToFit(600, 200, 1200, 800)).toBe(0.25);
  });

  it("stays safe for unusable measurements", () => {
    expect(scaleToFit(0, 0, 1200, 800)).toBe(1);
  });
});

describe("screenDeltaToFloor", () => {
  it("converts pixel movement into floor units", () => {
    expect(screenDeltaToFloor(50, 0.5)).toBe(100);
    expect(screenDeltaToFloor(50, 1)).toBe(50);
  });

  it("passes the delta through when the scale is unusable", () => {
    expect(screenDeltaToFloor(50, 0)).toBe(50);
  });
});

describe("clampRectToFloor", () => {
  it("keeps a table fully inside the floor", () => {
    expect(clampRectToFloor(rect(-40, -40), BOUNDS)).toEqual(rect(0, 0));
    expect(clampRectToFloor(rect(5000, 5000), BOUNDS)).toEqual(rect(1100, 720));
  });

  it("clamps a table smaller than the minimum size", () => {
    const clamped = clampRectToFloor({ x: 0, y: 0, width: 5, height: 5 }, BOUNDS);
    expect(clamped.width).toBe(20);
    expect(clamped.height).toBe(20);
  });

  it("never lets a table exceed the floor itself", () => {
    const clamped = clampRectToFloor({ x: 0, y: 0, width: 9000, height: 9000 }, BOUNDS);
    expect(clamped.width).toBe(1200);
    expect(clamped.height).toBe(800);
  });
});

describe("moveRect", () => {
  it("moves a table and snaps it to the grid", () => {
    expect(moveRect(rect(100, 100), 34, 27, BOUNDS)).toEqual(rect(130, 130));
  });

  it("stops a table at the floor edge instead of letting it escape", () => {
    expect(moveRect(rect(0, 0), -500, -500, BOUNDS)).toEqual(rect(0, 0));

    const pushed = moveRect(rect(1100, 720), 500, 500, BOUNDS);
    expect(pushed.x).toBe(1100);
    expect(pushed.y).toBe(720);
  });

  it("leaves the table size untouched", () => {
    const moved = moveRect(rect(100, 100, 130, 90), 50, 50, BOUNDS);
    expect(moved.width).toBe(130);
    expect(moved.height).toBe(90);
  });
});

describe("resizeRect", () => {
  it("grows a table from its anchored corner", () => {
    const resized = resizeRect(rect(100, 100), 50, 20, BOUNDS);
    expect(resized.x).toBe(100);
    expect(resized.y).toBe(100);
    expect(resized.width).toBe(150);
    expect(resized.height).toBe(100);
  });

  it("refuses to shrink below the minimum table size", () => {
    const resized = resizeRect(rect(100, 100), -500, -500, BOUNDS);
    expect(resized.width).toBe(20);
    expect(resized.height).toBe(20);
  });

  it("refuses to grow past the floor bounds", () => {
    const resized = resizeRect(rect(0, 0), 9000, 9000, BOUNDS);
    expect(resized.width).toBe(1200);
    expect(resized.height).toBe(800);
  });
});

describe("rectsAreEqual", () => {
  it("detects an unchanged drag so no request is sent", () => {
    expect(rectsAreEqual(rect(10, 10), rect(10, 10))).toBe(true);
    expect(rectsAreEqual(rect(10, 10), rect(20, 10))).toBe(false);
    expect(rectsAreEqual(rect(10, 10, 100, 80), rect(10, 10, 100, 90))).toBe(false);
  });
});

describe("rectsOverlap", () => {
  it("detects overlapping tables", () => {
    expect(rectsOverlap(rect(0, 0), rect(50, 40))).toBe(true);
  });

  it("treats touching edges as clear", () => {
    expect(rectsOverlap(rect(0, 0, 100, 80), rect(100, 0, 100, 80))).toBe(false);
    expect(rectsOverlap(rect(0, 0, 100, 80), rect(0, 80, 100, 80))).toBe(false);
  });

  it("returns false for separated tables", () => {
    expect(rectsOverlap(rect(0, 0), rect(400, 400))).toBe(false);
  });

  it("detects separation from either side on both axes", () => {
    expect(rectsOverlap(rect(400, 0), rect(0, 0))).toBe(false);
    expect(rectsOverlap(rect(0, 400), rect(0, 0))).toBe(false);
    expect(rectsOverlap(rect(0, 0, 100, 80), rect(0, 200, 100, 80))).toBe(false);
    expect(rectsOverlap(rect(0, 200, 100, 80), rect(0, 0, 100, 80))).toBe(false);
  });
});

describe("defaultSizeForShape", () => {
  it("gives every shape a usable default footprint", () => {
    for (const shape of TABLE_SHAPES) {
      const size = defaultSizeForShape(shape);
      expect(size.width).toBeGreaterThanOrEqual(20);
      expect(size.height).toBeGreaterThanOrEqual(20);
    }
  });

  it("makes round and square tables even sided and rectangles wider than deep", () => {
    expect(defaultSizeForShape("ROUND").width).toBe(defaultSizeForShape("ROUND").height);
    expect(defaultSizeForShape("SQUARE").width).toBe(defaultSizeForShape("SQUARE").height);
    const rectangle = defaultSizeForShape("RECTANGLE");
    expect(rectangle.width).toBeGreaterThan(rectangle.height);
  });
});

describe("nextTableName", () => {
  it("starts at T1 on an empty floor", () => {
    expect(nextTableName([])).toBe("T1");
  });

  it("fills the first gap in the numbering", () => {
    expect(nextTableName(["T1", "T3"])).toBe("T2");
    expect(nextTableName(["T1", "T2"])).toBe("T3");
  });

  it("ignores names that are not numbered tables", () => {
    expect(nextTableName(["Patio A", "Bar Seat"])).toBe("T1");
  });

  it("matches case insensitively and tolerates padding", () => {
    expect(nextTableName(["  t1  ", "T2"])).toBe("T3");
  });

  it("still recognises legacy Table N names when filling gaps", () => {
    expect(nextTableName(["Table 1", "Table 2"])).toBe("T3");
    expect(nextTableName(["Table 1", "T2"])).toBe("T3");
  });
});

describe("findFreeSlot", () => {
  it("places the first table near the top left", () => {
    expect(findFreeSlot([], { width: 130, height: 80 }, BOUNDS)).toEqual({
      x: GRID_SIZE,
      y: GRID_SIZE,
    });
  });

  it("avoids landing a new table on top of an existing one", () => {
    const occupied = [{ x: 10, y: 10, width: 130, height: 80 }];
    const slot = findFreeSlot(occupied, { width: 130, height: 80 }, BOUNDS);
    const candidate = { ...slot, width: 130, height: 80 };
    expect(occupied.some((existing) => rectsOverlap(existing, candidate))).toBe(false);
  });

  it("falls back to the origin when the floor is full", () => {
    const tiny = { width: 200, height: 200 };
    const occupied = [{ x: 0, y: 0, width: 200, height: 200 }];
    const slot = findFreeSlot(occupied, { width: 190, height: 190 }, tiny);
    expect(slot).toEqual({ x: GRID_SIZE, y: GRID_SIZE });
  });
});

describe("validateCapacity", () => {
  it("accepts a sensible capacity and minimum", () => {
    expect(validateCapacity(4, 2)).toEqual({ valid: true });
    expect(validateCapacity(4, "")).toEqual({ valid: true });
  });

  it("requires a capacity", () => {
    const result = validateCapacity("", 2);
    expect(isInvalid(result)).toBe(true);
    if (isInvalid(result)) {
      expect(result.reason).toBe("capacityRequired");
    }
  });

  it("rejects capacities outside the supported range", () => {
    const small = validateCapacity(0, "");
    const large = validateCapacity(41, "");
    const fractional = validateCapacity(2.5, "");
    expect(isInvalid(small) && small.reason).toBe("capacityTooSmall");
    expect(isInvalid(large) && large.reason).toBe("capacityTooLarge");
    expect(isInvalid(fractional) && fractional.reason).toBe("capacityTooSmall");
  });

  it("rejects a minimum party size above the capacity", () => {
    const result = validateCapacity(4, 6);
    expect(isInvalid(result) && result.reason).toBe("minimumAboveCapacity");
  });

  it("rejects a minimum party size below one", () => {
    const result = validateCapacity(4, 0);
    expect(isInvalid(result) && result.reason).toBe("minimumTooSmall");
  });

  it("allows a minimum party size equal to the capacity", () => {
    expect(validateCapacity(4, 4)).toEqual({ valid: true });
  });
});

describe("validateFloorSize", () => {
  it("accepts dimensions inside the supported range", () => {
    expect(validateFloorSize(1200, 800)).toEqual({ valid: true });
    expect(validateFloorSize(200, 200)).toEqual({ valid: true });
    expect(validateFloorSize(6000, 6000)).toEqual({ valid: true });
  });

  it("requires both dimensions", () => {
    const noWidth = validateFloorSize("", 800);
    const noHeight = validateFloorSize(1200, "");
    expect(isInvalid(noWidth) && noWidth.reason).toBe("widthRequired");
    expect(isInvalid(noHeight) && noHeight.reason).toBe("heightRequired");
  });

  it("rejects dimensions outside the supported range", () => {
    const tooNarrow = validateFloorSize(10, 800);
    const tooTall = validateFloorSize(1200, 99999);
    expect(isInvalid(tooNarrow) && tooNarrow.reason).toBe("widthOutOfRange");
    expect(isInvalid(tooTall) && tooTall.reason).toBe("heightOutOfRange");
  });
});

describe("toNumberOrBlank", () => {
  it("keeps an empty field blank instead of coercing it to zero", () => {
    expect(toNumberOrBlank("")).toBe("");
  });

  it("parses numeric text", () => {
    expect(toNumberOrBlank("4")).toBe(4);
    expect(toNumberOrBlank("0")).toBe(0);
  });

  it("treats unparseable text as blank", () => {
    expect(toNumberOrBlank("abc")).toBe("");
  });
});

describe("fitsTableName", () => {
  it("shows the name on a table rendered at full scale", () => {
    expect(fitsTableName(130, 80)).toBe(true);
  });

  it("hides the name once the node is too narrow to read", () => {
    expect(fitsTableName(37, 80)).toBe(false);
  });

  it("hides the name once the node is too short for two lines", () => {
    expect(fitsTableName(130, 24)).toBe(false);
  });

  it("shows the name exactly at the threshold", () => {
    expect(fitsTableName(TABLE_LABEL_MIN_WIDTH, TABLE_LABEL_MIN_HEIGHT)).toBe(true);
  });

  it("hides the name one pixel under either threshold", () => {
    expect(fitsTableName(TABLE_LABEL_MIN_WIDTH - 1, TABLE_LABEL_MIN_HEIGHT)).toBe(false);
    expect(fitsTableName(TABLE_LABEL_MIN_WIDTH, TABLE_LABEL_MIN_HEIGHT - 1)).toBe(false);
  });

  it("hides the name for a zero sized node", () => {
    expect(fitsTableName(0, 0)).toBe(false);
  });

  it("hides the name when a measurement is not a finite number", () => {
    expect(fitsTableName(Number.NaN, 80)).toBe(false);
    expect(fitsTableName(130, Number.NaN)).toBe(false);
    expect(fitsTableName(130, Number.POSITIVE_INFINITY)).toBe(false);
    expect(fitsTableName(Number.POSITIVE_INFINITY, Number.NaN)).toBe(false);
  });

  it("flips every default shape at the same scale so one room never shows a mix", () => {
    const shapes = [
      defaultSizeForShape("ROUND"),
      defaultSizeForShape("SQUARE"),
      defaultSizeForShape("RECTANGLE"),
    ];
    for (let step = 1; step <= 40; step += 1) {
      const scale = step / 40;
      const decisions = shapes.map((shape) =>
        fitsTableName(shape.width * scale, shape.height * scale),
      );
      expect(new Set(decisions).size).toBe(1);
    }
  });

  it("honours caller supplied thresholds", () => {
    expect(fitsTableName(50, 30, 40, 20)).toBe(true);
    expect(fitsTableName(50, 30, 60, 20)).toBe(false);
  });

  it("reflects the scale a small floor plan renders at", () => {
    const cramped = 0.285;
    expect(fitsTableName(130 * cramped, 80 * cramped)).toBe(false);
    expect(fitsTableName(130 * 0.63, 80 * 0.63)).toBe(true);
  });
});

describe("cornerBadgeOffset", () => {
  it("insets a round table badge onto the circle edge", () => {
    const offset = cornerBadgeOffset("ROUND", 100, 100);
    expect(offset.x).toBeCloseTo(14.64, 1);
    expect(offset.y).toBeCloseTo(14.64, 1);
  });

  it("keeps the badge on the same relative spot as the table scales", () => {
    const small = cornerBadgeOffset("ROUND", 80, 80);
    const large = cornerBadgeOffset("ROUND", 160, 160);
    expect(small.x / 80).toBeCloseTo(large.x / 160, 5);
    expect(small.y / 80).toBeCloseTo(large.y / 160, 5);
  });

  it("follows a non square round table on each axis", () => {
    const offset = cornerBadgeOffset("ROUND", 200, 100);
    expect(offset.x).toBeCloseTo(29.29, 1);
    expect(offset.y).toBeCloseTo(14.64, 1);
  });

  it("uses a small fixed inset for square and rectangle tables", () => {
    expect(cornerBadgeOffset("SQUARE", 120, 120)).toEqual({
      x: SQUARE_CORNER_BADGE_INSET,
      y: SQUARE_CORNER_BADGE_INSET,
    });
    expect(cornerBadgeOffset("RECTANGLE", 130, 80)).toEqual({
      x: SQUARE_CORNER_BADGE_INSET,
      y: SQUARE_CORNER_BADGE_INSET,
    });
  });

  it("falls back to the fixed inset when a measurement is not finite", () => {
    expect(cornerBadgeOffset("ROUND", Number.NaN, 100)).toEqual({
      x: SQUARE_CORNER_BADGE_INSET,
      y: SQUARE_CORNER_BADGE_INSET,
    });
  });
});

describe("cornerBadgeSize", () => {
  it("shrinks the badge with the table so it stays proportional", () => {
    expect(cornerBadgeSize(39, 39)).toBe(12);
    expect(cornerBadgeSize(55, 55)).toBe(17);
  });

  it("caps the badge on a large table", () => {
    expect(cornerBadgeSize(400, 400)).toBe(CORNER_BADGE_MAX_SIZE);
  });

  it("keeps the badge legible on a very small table", () => {
    expect(cornerBadgeSize(10, 10)).toBe(CORNER_BADGE_MIN_SIZE);
  });

  it("uses the smaller dimension of a rectangle", () => {
    expect(cornerBadgeSize(300, 40)).toBe(cornerBadgeSize(40, 40));
  });

  it("falls back to the cap when a measurement is not finite", () => {
    expect(cornerBadgeSize(Number.NaN, 100)).toBe(CORNER_BADGE_MAX_SIZE);
  });

  it("never returns a badge wider than the table it sits on", () => {
    for (let size = 12; size <= 300; size += 4) {
      expect(cornerBadgeSize(size, size)).toBeLessThanOrEqual(size);
    }
  });
});

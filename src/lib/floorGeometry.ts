export const GRID_SIZE = 10;

export const DEFAULT_FLOOR_WIDTH = 1200;
export const DEFAULT_FLOOR_HEIGHT = 800;

export const FLOOR_MIN_DIMENSION = 200;
export const FLOOR_MAX_DIMENSION = 6000;
export const TABLE_MIN_CAPACITY = 1;
export const TABLE_MAX_CAPACITY = 40;
export const TABLE_MIN_SIZE = 20;
export const TABLE_MAX_SIZE = 2000;
export const TABLE_NAME_MAX_LENGTH = 60;
export const ZONE_NAME_MAX_LENGTH = 60;

export const TABLE_SHAPES = ["ROUND", "SQUARE", "RECTANGLE"] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

export const ROTATION_STEP = 15;

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FloorBounds = {
  width: number;
  height: number;
};

export function clampNumber(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function snapToGrid(value: number, grid: number = GRID_SIZE): number {
  if (grid <= 0) {
    return Math.round(value);
  }
  return Math.round(value / grid) * grid;
}

export function normalizeRotation(value: number): number {
  const wrapped = Math.round(value) % 360;
  if (wrapped < 0) {
    return wrapped + 360;
  }
  if (wrapped === 0) {
    return 0;
  }
  return wrapped;
}

export function stepRotation(current: number, step: number = ROTATION_STEP): number {
  return normalizeRotation(current + step);
}

export function scaleForViewport(available: number, floorSize: number): number {
  if (floorSize <= 0) {
    return 1;
  }
  if (available <= 0) {
    return 1;
  }
  const ratio = available / floorSize;
  if (ratio >= 1) {
    return 1;
  }
  return ratio;
}

export function scaleToFit(
  availableWidth: number,
  availableHeight: number,
  floorWidth: number,
  floorHeight: number,
): number {
  const byWidth = scaleForViewport(availableWidth, floorWidth);
  const byHeight = scaleForViewport(availableHeight, floorHeight);
  return Math.min(byWidth, byHeight);
}

export const TABLE_LABEL_MIN_WIDTH = 45;
export const TABLE_LABEL_MIN_HEIGHT = 40;

export function fitsTableName(
  renderedWidth: number,
  renderedHeight: number,
  minWidth: number = TABLE_LABEL_MIN_WIDTH,
  minHeight: number = TABLE_LABEL_MIN_HEIGHT,
): boolean {
  if (!Number.isFinite(renderedWidth) || !Number.isFinite(renderedHeight)) {
    return false;
  }
  if (renderedWidth < minWidth) {
    return false;
  }
  if (renderedHeight < minHeight) {
    return false;
  }
  return true;
}

export const CORNER_BADGE_INSET_RATIO = (1 - Math.SQRT1_2) / 2;
export const SQUARE_CORNER_BADGE_INSET = 3;

export const CORNER_BADGE_MIN_SIZE = 10;
export const CORNER_BADGE_MAX_SIZE = 20;
export const CORNER_BADGE_SIZE_RATIO = 0.3;

export function cornerBadgeSize(renderedWidth: number, renderedHeight: number): number {
  const smaller = Math.min(renderedWidth, renderedHeight);
  if (!Number.isFinite(smaller)) {
    return CORNER_BADGE_MAX_SIZE;
  }
  return clampNumber(
    Math.round(smaller * CORNER_BADGE_SIZE_RATIO),
    CORNER_BADGE_MIN_SIZE,
    CORNER_BADGE_MAX_SIZE,
  );
}

export function cornerBadgeOffset(
  shape: TableShape,
  renderedWidth: number,
  renderedHeight: number,
): { x: number; y: number } {
  if (shape !== "ROUND") {
    return { x: SQUARE_CORNER_BADGE_INSET, y: SQUARE_CORNER_BADGE_INSET };
  }
  if (!Number.isFinite(renderedWidth) || !Number.isFinite(renderedHeight)) {
    return { x: SQUARE_CORNER_BADGE_INSET, y: SQUARE_CORNER_BADGE_INSET };
  }
  return {
    x: renderedWidth * CORNER_BADGE_INSET_RATIO,
    y: renderedHeight * CORNER_BADGE_INSET_RATIO,
  };
}

export function screenDeltaToFloor(deltaPixels: number, scale: number): number {
  if (scale <= 0) {
    return deltaPixels;
  }
  return deltaPixels / scale;
}

export function clampRectToFloor(rect: Rect, bounds: FloorBounds): Rect {
  const width = clampNumber(rect.width, TABLE_MIN_SIZE, Math.min(TABLE_MAX_SIZE, bounds.width));
  const height = clampNumber(rect.height, TABLE_MIN_SIZE, Math.min(TABLE_MAX_SIZE, bounds.height));
  return {
    x: clampNumber(rect.x, 0, Math.max(0, bounds.width - width)),
    y: clampNumber(rect.y, 0, Math.max(0, bounds.height - height)),
    width,
    height,
  };
}

export function moveRect(
  origin: Rect,
  deltaX: number,
  deltaY: number,
  bounds: FloorBounds,
  grid: number = GRID_SIZE,
): Rect {
  const moved = {
    x: snapToGrid(origin.x + deltaX, grid),
    y: snapToGrid(origin.y + deltaY, grid),
    width: origin.width,
    height: origin.height,
  };
  return clampRectToFloor(moved, bounds);
}

export function resizeRect(
  origin: Rect,
  deltaX: number,
  deltaY: number,
  bounds: FloorBounds,
  grid: number = GRID_SIZE,
): Rect {
  const resized = {
    x: origin.x,
    y: origin.y,
    width: snapToGrid(origin.width + deltaX, grid),
    height: snapToGrid(origin.height + deltaY, grid),
  };
  return clampRectToFloor(resized, bounds);
}

export function rectsAreEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function defaultSizeForShape(shape: TableShape): { width: number; height: number } {
  if (shape === "ROUND") {
    return { width: 90, height: 90 };
  }
  if (shape === "SQUARE") {
    return { width: 90, height: 90 };
  }
  return { width: 130, height: 80 };
}

export function nextTableName(existingNames: string[]): string {
  const used = new Set<number>();
  for (const name of existingNames) {
    const match = /^(?:table\s*|t\s*)(\d+)$/i.exec(name.trim());
    if (match) {
      used.add(Number(match[1]));
    }
  }
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return `T${candidate}`;
}

export function findFreeSlot(
  occupied: Rect[],
  size: { width: number; height: number },
  bounds: FloorBounds,
  grid: number = GRID_SIZE,
): { x: number; y: number } {
  const stepX = Math.max(grid, size.width + grid);
  const stepY = Math.max(grid, size.height + grid);

  for (let y = grid; y + size.height <= bounds.height; y += stepY) {
    for (let x = grid; x + size.width <= bounds.width; x += stepX) {
      const candidate = { x, y, width: size.width, height: size.height };
      const clash = occupied.some((rect) => rectsOverlap(rect, candidate));
      if (!clash) {
        return { x, y };
      }
    }
  }

  return { x: grid, y: grid };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  if (a.x + a.width <= b.x) {
    return false;
  }
  if (b.x + b.width <= a.x) {
    return false;
  }
  if (a.y + a.height <= b.y) {
    return false;
  }
  if (b.y + b.height <= a.y) {
    return false;
  }
  return true;
}

export type ValidationFailure = { valid: false; reason: string };
export type CapacityValidation = { valid: true } | ValidationFailure;

export function isInvalid(result: CapacityValidation): result is ValidationFailure {
  return result.valid === false;
}

export function validateCapacity(
  capacity: number | "",
  minimumPartySize: number | "",
): CapacityValidation {
  if (capacity === "") {
    return { valid: false, reason: "capacityRequired" };
  }
  if (!Number.isInteger(capacity) || capacity < TABLE_MIN_CAPACITY) {
    return { valid: false, reason: "capacityTooSmall" };
  }
  if (capacity > TABLE_MAX_CAPACITY) {
    return { valid: false, reason: "capacityTooLarge" };
  }
  if (minimumPartySize === "") {
    return { valid: true };
  }
  if (!Number.isInteger(minimumPartySize) || minimumPartySize < TABLE_MIN_CAPACITY) {
    return { valid: false, reason: "minimumTooSmall" };
  }
  if (minimumPartySize > capacity) {
    return { valid: false, reason: "minimumAboveCapacity" };
  }
  return { valid: true };
}

export function validateFloorSize(width: number | "", height: number | ""): CapacityValidation {
  const sides: [number | "", string][] = [
    [width, "width"],
    [height, "height"],
  ];
  for (const [value, label] of sides) {
    if (value === "") {
      return { valid: false, reason: `${label}Required` };
    }
    if (!Number.isFinite(value) || value < FLOOR_MIN_DIMENSION || value > FLOOR_MAX_DIMENSION) {
      return { valid: false, reason: `${label}OutOfRange` };
    }
  }
  return { valid: true };
}

export function toNumberOrBlank(raw: string): number | "" {
  if (raw === "") {
    return "";
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    return "";
  }
  return parsed;
}

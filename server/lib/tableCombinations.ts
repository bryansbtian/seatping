import { prisma } from "./prisma.js";
import { withWriteRetry } from "./dbRetry.js";
import {
  OBJECT_ID_RE,
  TABLE_MAX_CAPACITY,
  TABLE_MIN_CAPACITY,
  fail,
  ok,
  parseInteger,
  parseName,
  type Outcome,
} from "./floor.js";

export const COMBINATION_NAME_MAX_LENGTH = 60;
export const MIN_COMBINATION_TABLES = 2;
export const MAX_COMBINATION_TABLES = 6;
export const MAX_COMBINATIONS_PER_LOCATION = 40;

export type CombinationInput = {
  name: unknown;
  tableIds: unknown;
  minimumPartySize: unknown;
};

export function serializeCombination(combination: any, capacity: number) {
  return {
    id: combination.id,
    locationId: combination.locationId,
    name: combination.name,
    tableIds: combination.tableIds,
    minimumPartySize: combination.minimumPartySize,
    isActive: combination.isActive,
    capacity,
  };
}

export function parseTableIds(value: unknown): Outcome<string[]> {
  if (!Array.isArray(value)) {
    return fail(400, "tableIds must be a list of table ids");
  }
  const ids: string[] = [];
  for (const raw of value) {
    const id = String(raw ?? "").trim();
    if (!OBJECT_ID_RE.test(id)) {
      return fail(400, "tableIds must be a list of table ids");
    }
    if (ids.includes(id)) {
      return fail(400, "A combination cannot list the same table twice");
    }
    ids.push(id);
  }
  if (ids.length < MIN_COMBINATION_TABLES) {
    return fail(400, `A combination needs at least ${MIN_COMBINATION_TABLES} tables`);
  }
  if (ids.length > MAX_COMBINATION_TABLES) {
    return fail(400, `A combination can hold at most ${MAX_COMBINATION_TABLES} tables`);
  }
  return ok(ids);
}

export async function loadOwnedTables(locationId: string, tableIds: string[]) {
  return prisma.diningTable.findMany({
    where: { id: { in: tableIds }, locationId },
  });
}

export function combinationCapacity(tables: { capacity: number }[]): number {
  return tables.reduce((total, table) => total + table.capacity, 0);
}

export function defaultCombinationName(tables: { name: string }[]): string {
  return tables.map((table) => table.name).join(" + ");
}

export async function listCombinations(locationId: string) {
  const combinations = await prisma.tableCombination.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });

  const tableIds = new Set<string>();
  for (const combination of combinations) {
    for (const id of combination.tableIds) {
      tableIds.add(id);
    }
  }

  const tables = await prisma.diningTable.findMany({
    where: { id: { in: [...tableIds] }, locationId },
    select: { id: true, name: true, capacity: true, minimumPartySize: true, floorPlanId: true },
  });
  const byId = new Map(tables.map((table) => [table.id, table]));

  return combinations.map((combination) => {
    const members = combination.tableIds
      .map((id) => byId.get(id))
      .filter((table): table is NonNullable<typeof table> => Boolean(table));
    return { combination, members, capacity: combinationCapacity(members) };
  });
}

export async function createCombination(
  businessId: string,
  locationId: string,
  input: CombinationInput,
): Promise<Outcome<any>> {
  const tableIds = parseTableIds(input.tableIds);
  if (tableIds.ok === false) {
    return tableIds;
  }

  const tables = await loadOwnedTables(locationId, tableIds.value);
  if (tables.length !== tableIds.value.length) {
    return fail(404, "Table not found or access denied");
  }

  const ordered = tableIds.value
    .map((id) => tables.find((table) => table.id === id))
    .filter((table): table is (typeof tables)[number] => Boolean(table));

  let name = defaultCombinationName(ordered);
  if (input.name !== undefined && input.name !== null && String(input.name).trim() !== "") {
    const parsed = parseName(input.name, "name", COMBINATION_NAME_MAX_LENGTH);
    if (parsed.ok === false) {
      return parsed;
    }
    name = parsed.value;
  }

  let minimumPartySize = 1;
  if (input.minimumPartySize !== undefined && input.minimumPartySize !== null) {
    const parsed = parseInteger(
      input.minimumPartySize,
      "minimumPartySize",
      TABLE_MIN_CAPACITY,
      TABLE_MAX_CAPACITY,
    );
    if (parsed.ok === false) {
      return parsed;
    }
    minimumPartySize = parsed.value;
  }

  const capacity = combinationCapacity(ordered);
  if (minimumPartySize > capacity) {
    return fail(400, "minimumPartySize cannot exceed the combined capacity");
  }

  const existing = await prisma.tableCombination.count({ where: { locationId } });
  if (existing >= MAX_COMBINATIONS_PER_LOCATION) {
    return fail(409, `A location can hold at most ${MAX_COMBINATIONS_PER_LOCATION} combinations`);
  }

  const duplicate = await prisma.tableCombination.findFirst({
    where: { locationId, name },
    select: { id: true },
  });
  if (duplicate) {
    return fail(409, "A combination with that name already exists");
  }

  const created = await withWriteRetry(() =>
    prisma.tableCombination.create({
      data: {
        businessId,
        locationId,
        name,
        tableIds: tableIds.value,
        minimumPartySize,
      },
    }),
  );

  return ok(serializeCombination(created, capacity));
}

export async function deleteCombination(
  locationId: string,
  combinationId: string,
): Promise<Outcome<null>> {
  if (!OBJECT_ID_RE.test(combinationId)) {
    return fail(404, "Combination not found or access denied");
  }
  const existing = await prisma.tableCombination.findFirst({
    where: { id: combinationId, locationId },
    select: { id: true },
  });
  if (!existing) {
    return fail(404, "Combination not found or access denied");
  }

  const active = await prisma.tableAssignment.findFirst({
    where: { combinationId: existing.id, status: { in: ["RESERVED", "SEATED"] } },
    select: { id: true },
  });
  if (active) {
    return fail(409, "Finish the current visit before deleting this combination");
  }

  await withWriteRetry(() => prisma.tableCombination.delete({ where: { id: existing.id } }));
  return ok(null);
}

export async function findOwnedCombination(locationId: string, combinationId: string) {
  if (!OBJECT_ID_RE.test(combinationId)) {
    return null;
  }
  return prisma.tableCombination.findFirst({ where: { id: combinationId, locationId } });
}

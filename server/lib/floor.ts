import { prisma } from "./prisma.js";
import { withWriteRetry } from "./dbRetry.js";

export const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

export const TABLE_SHAPES = ["ROUND", "SQUARE", "RECTANGLE"] as const;
export const ASSIGNMENT_SOURCES = ["SMART", "MANUAL"] as const;
export const ASSIGNMENT_STATUSES = ["RESERVED", "SEATED", "COMPLETED", "CANCELLED"] as const;
export const ACTIVE_ASSIGNMENT_STATUSES = ["RESERVED", "SEATED"] as const;

export type TableShapeValue = (typeof TABLE_SHAPES)[number];
export type AssignmentSourceValue = (typeof ASSIGNMENT_SOURCES)[number];
export type AssignmentStatusValue = (typeof ASSIGNMENT_STATUSES)[number];

export const FLOOR_MIN_DIMENSION = 200;
export const FLOOR_MAX_DIMENSION = 6000;
export const FLOOR_NAME_MAX_LENGTH = 60;
export const TABLE_MIN_CAPACITY = 1;
export const TABLE_MAX_CAPACITY = 40;
export const TABLE_MIN_SIZE = 20;
export const TABLE_MAX_SIZE = 2000;
export const TABLE_MAX_POSITION = 20000;
export const TABLE_NAME_MAX_LENGTH = 60;
export const ROOM_NAME_MAX_LENGTH = 60;
export const ZONE_NAME_MAX_LENGTH = 60;
export const ZONE_MIN_SIZE = 40;
export const MAX_ROOMS_PER_LOCATION = 20;
export const MAX_ZONES_PER_ROOM = 20;
export const DEFAULT_TURN_MINUTES = 90;
export const MAX_TURN_MINUTES = 12 * 60;

export type Failure = { ok: false; status: number; error: string };
export type Success<T> = { ok: true; value: T };
export type Outcome<T> = Success<T> | Failure;

export function fail(status: number, error: string): Failure {
  return { ok: false, status, error };
}

export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function isFailure<T>(outcome: Outcome<T>): outcome is Failure {
  return outcome.ok === false;
}

export function windowsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
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

export function parseInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): Outcome<number> {
  if (typeof value !== "number" && typeof value !== "string") {
    return fail(400, `${field} must be a number`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fail(400, `${field} must be a number`);
  }
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) {
    return fail(400, `${field} must be between ${min} and ${max}`);
  }
  return ok(rounded);
}

export function parseName(value: unknown, field: string, maxLength: number): Outcome<string> {
  if (typeof value !== "string") {
    return fail(400, `${field} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fail(400, `${field} is required`);
  }
  if (trimmed.length > maxLength) {
    return fail(400, `${field} must be ${maxLength} characters or fewer`);
  }
  return ok(trimmed);
}

export function parseOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
): Outcome<string | null> {
  if (value === null || value === undefined) {
    return ok(null);
  }
  if (typeof value !== "string") {
    return fail(400, `${field} must be text`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return ok(null);
  }
  if (trimmed.length > maxLength) {
    return fail(400, `${field} must be ${maxLength} characters or fewer`);
  }
  return ok(trimmed);
}

export function parseShape(value: unknown): Outcome<TableShapeValue> {
  const raw = String(value ?? "").toUpperCase();
  const match = TABLE_SHAPES.find((shape) => shape === raw);
  if (!match) {
    return fail(400, `shape must be one of ${TABLE_SHAPES.join(", ")}`);
  }
  return ok(match);
}

export const MAX_ASSIGNMENT_TABLES = 6;

export function parseAssignmentTableIds(value: unknown): Outcome<string[]> {
  if (!Array.isArray(value)) {
    return fail(400, "tableIds must be a list of table ids");
  }
  if (value.length === 0) {
    return fail(400, "Choose at least one table");
  }
  if (value.length > MAX_ASSIGNMENT_TABLES) {
    return fail(400, `A party can use at most ${MAX_ASSIGNMENT_TABLES} tables`);
  }

  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return fail(400, "tableIds must be a list of table ids");
    }
    const trimmed = entry.trim();
    if (!OBJECT_ID_RE.test(trimmed)) {
      return fail(400, "tableIds must be a list of table ids");
    }
    if (ids.includes(trimmed)) {
      return fail(400, "Do not choose the same table twice");
    }
    ids.push(trimmed);
  }

  return ok(ids);
}

export function parseSource(value: unknown): Outcome<AssignmentSourceValue> {
  const raw = String(value ?? "").toUpperCase();
  const match = ASSIGNMENT_SOURCES.find((source) => source === raw);
  if (!match) {
    return fail(400, `source must be one of ${ASSIGNMENT_SOURCES.join(", ")}`);
  }
  return ok(match);
}

export function parseStatus(value: unknown): Outcome<AssignmentStatusValue> {
  const raw = String(value ?? "").toUpperCase();
  const match = ASSIGNMENT_STATUSES.find((status) => status === raw);
  if (!match) {
    return fail(400, `status must be one of ${ASSIGNMENT_STATUSES.join(", ")}`);
  }
  return ok(match);
}

export function parseDate(value: unknown, field: string): Outcome<Date> {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return fail(400, `${field} must be a date`);
  }
  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) {
    return fail(400, `${field} must be a valid date`);
  }
  return ok(parsed);
}

export function parseObjectId(value: unknown, field: string): Outcome<string> {
  const raw = String(value ?? "").trim();
  if (!OBJECT_ID_RE.test(raw)) {
    return fail(400, `${field} must be a valid id`);
  }
  return ok(raw);
}

export function parseOptionalObjectId(value: unknown, field: string): Outcome<string | null> {
  if (value === null || value === undefined || value === "") {
    return ok(null);
  }
  return parseObjectId(value, field);
}

export function resolveOccupancyWindow(body: any): Outcome<{ start: Date; end: Date }> {
  const start = parseDate(body?.expectedStartAt, "expectedStartAt");
  if (isFailure(start)) {
    return start;
  }

  if (body?.expectedEndAt === undefined || body?.expectedEndAt === null) {
    let turnMinutes = DEFAULT_TURN_MINUTES;
    if (body?.turnMinutes !== undefined && body?.turnMinutes !== null) {
      const parsed = parseInteger(body.turnMinutes, "turnMinutes", 1, MAX_TURN_MINUTES);
      if (isFailure(parsed)) {
        return parsed;
      }
      turnMinutes = parsed.value;
    }
    const end = new Date(start.value.getTime() + turnMinutes * 60 * 1000);
    return ok({ start: start.value, end });
  }

  const end = parseDate(body.expectedEndAt, "expectedEndAt");
  if (isFailure(end)) {
    return end;
  }
  if (end.value.getTime() <= start.value.getTime()) {
    return fail(400, "expectedEndAt must be after expectedStartAt");
  }
  if (end.value.getTime() - start.value.getTime() > MAX_TURN_MINUTES * 60 * 1000) {
    return fail(400, `Occupancy window must be ${MAX_TURN_MINUTES} minutes or shorter`);
  }
  return ok({ start: start.value, end: end.value });
}

export function occupiedByAny(tableIds: string[]) {
  return {
    OR: [{ tableId: { in: tableIds } }, { tableIds: { hasSome: tableIds } }],
  };
}

export function partyFitsTable(
  partySize: number,
  table: { capacity: number; minimumPartySize: number },
): boolean {
  if (partySize > table.capacity) {
    return false;
  }
  if (partySize < table.minimumPartySize) {
    return false;
  }
  return true;
}

export function serializeTable(table: any) {
  return {
    id: table.id,
    floorPlanId: table.floorPlanId,
    locationId: table.locationId,
    name: table.name,
    capacity: table.capacity,
    minimumPartySize: table.minimumPartySize,
    shape: table.shape,
    x: table.x,
    y: table.y,
    width: table.width,
    height: table.height,
    rotation: table.rotation,
    isBlocked: table.isBlocked,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  };
}

export function serializeZone(zone: any) {
  return {
    id: zone.id,
    floorPlanId: zone.floorPlanId,
    locationId: zone.locationId,
    name: zone.name,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
  };
}

export function serializeFloorPlan(plan: any) {
  let tables: any[] = [];
  if (Array.isArray(plan?.tables)) {
    tables = plan.tables.map(serializeTable);
  }
  let zones: any[] = [];
  if (Array.isArray(plan?.zones)) {
    zones = plan.zones.map(serializeZone);
  }
  return {
    id: plan.id,
    locationId: plan.locationId,
    name: plan.name,
    width: plan.width,
    height: plan.height,
    sortOrder: plan.sortOrder,
    tables,
    zones,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export function serializeAssignment(assignment: any) {
  return {
    id: assignment.id,
    tableId: assignment.tableId,
    tableIds: assignment.tableIds ?? [],
    locationId: assignment.locationId,
    queueEntryId: assignment.queueEntryId,
    reservationId: assignment.reservationId,
    guestProfileId: assignment.guestProfileId,
    partySize: assignment.partySize,
    source: assignment.source,
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    expectedStartAt: assignment.expectedStartAt,
    expectedEndAt: assignment.expectedEndAt,
    seatedAt: assignment.seatedAt,
    completedAt: assignment.completedAt,
    cancelledAt: assignment.cancelledAt,
  };
}

export async function listRooms(locationId: string) {
  return prisma.floorPlan.findMany({
    where: { locationId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      tables: { orderBy: { name: "asc" } },
      zones: { orderBy: { name: "asc" } },
    },
  });
}

export async function findRoom(locationId: string, roomId: string) {
  if (!OBJECT_ID_RE.test(roomId)) {
    return null;
  }
  return prisma.floorPlan.findFirst({
    where: { id: roomId, locationId },
    include: {
      tables: { orderBy: { name: "asc" } },
      zones: { orderBy: { name: "asc" } },
    },
  });
}

export async function findOwnedZone(locationId: string, zoneId: string) {
  if (!OBJECT_ID_RE.test(zoneId)) {
    return null;
  }
  return prisma.floorZone.findFirst({ where: { id: zoneId, locationId } });
}

export function clampZoneToRoom(
  zone: { x: number; y: number; width: number; height: number },
  room: { width: number; height: number },
) {
  const width = Math.min(Math.max(zone.width, ZONE_MIN_SIZE), room.width);
  const height = Math.min(Math.max(zone.height, ZONE_MIN_SIZE), room.height);
  const x = Math.min(Math.max(zone.x, 0), Math.max(0, room.width - width));
  const y = Math.min(Math.max(zone.y, 0), Math.max(0, room.height - height));
  return { x, y, width, height };
}

export async function findOwnedTable(locationId: string, tableId: string) {
  if (!OBJECT_ID_RE.test(tableId)) {
    return null;
  }
  return prisma.diningTable.findFirst({ where: { id: tableId, locationId } });
}

export async function findOwnedAssignment(locationId: string, assignmentId: string) {
  if (!OBJECT_ID_RE.test(assignmentId)) {
    return null;
  }
  return prisma.tableAssignment.findFirst({ where: { id: assignmentId, locationId } });
}

export async function assertReferencesOwned(params: {
  locationId: string;
  queueEntryId: string | null;
  reservationId: string | null;
  guestProfileId: string | null;
}): Promise<Failure | null> {
  if (params.queueEntryId) {
    const queueEntry = await prisma.queueEntry.findFirst({
      where: { id: params.queueEntryId, locationId: params.locationId },
      select: { id: true },
    });
    if (!queueEntry) {
      return fail(404, "Queue entry not found or access denied");
    }
  }
  if (params.reservationId) {
    const reservation = await prisma.reservation.findFirst({
      where: { id: params.reservationId, locationId: params.locationId },
      select: { id: true },
    });
    if (!reservation) {
      return fail(404, "Reservation not found or access denied");
    }
  }
  if (params.guestProfileId) {
    const guest = await prisma.guestProfile.findFirst({
      where: { id: params.guestProfileId, locationId: params.locationId },
      select: { id: true },
    });
    if (!guest) {
      return fail(404, "Guest not found or access denied");
    }
  }
  return null;
}

export type CreateAssignmentInput = {
  businessId: string;
  locationId: string;
  tableId: string;
  tableIds?: string[];
  partySize: number;
  source: AssignmentSourceValue;
  status: AssignmentStatusValue;
  expectedStartAt: Date;
  expectedEndAt: Date;
  queueEntryId: string | null;
  reservationId: string | null;
  guestProfileId: string | null;
};

export async function createAssignment(input: CreateAssignmentInput): Promise<Outcome<any>> {
  if (!OBJECT_ID_RE.test(input.tableId)) {
    return fail(404, "Table not found or access denied");
  }

  return withWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      const memberIds = input.tableIds ?? [input.tableId];
      const members = await tx.diningTable.findMany({
        where: { id: { in: memberIds }, locationId: input.locationId },
      });
      if (members.length !== memberIds.length) {
        return fail(404, "Table not found or access denied");
      }

      const table = members.find((candidate) => candidate.id === input.tableId);
      if (!table) {
        return fail(404, "Table not found or access denied");
      }

      const blocked = members.find((candidate) => candidate.isBlocked);
      if (blocked) {
        return fail(409, "Table is blocked and cannot accept an assignment");
      }

      const roomId = members[0].floorPlanId;
      if (members.some((candidate) => candidate.floorPlanId !== roomId)) {
        return fail(400, "Joined tables must be in the same room");
      }

      const capacity = members.reduce((total, candidate) => total + candidate.capacity, 0);
      const minimum = members.reduce(
        (highest, candidate) => Math.max(highest, candidate.minimumPartySize),
        1,
      );
      if (!partyFitsTable(input.partySize, { capacity, minimumPartySize: minimum })) {
        return fail(409, `Table seats ${minimum} to ${capacity} guests`);
      }

      const conflict = await tx.tableAssignment.findFirst({
        where: {
          ...occupiedByAny(memberIds),
          status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          expectedStartAt: { lt: input.expectedEndAt },
          expectedEndAt: { gt: input.expectedStartAt },
        },
        select: { id: true },
      });
      if (conflict) {
        return fail(409, "Table already has an assignment during that time");
      }

      if (input.queueEntryId) {
        const held = await tx.tableAssignment.findFirst({
          where: {
            queueEntryId: input.queueEntryId,
            status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          },
          select: { id: true },
        });
        if (held) {
          return fail(409, "That guest already has a table");
        }
        await tx.queueEntry.update({
          where: { id: input.queueEntryId },
          data: { updatedAt: new Date() },
        });
      }

      if (input.reservationId) {
        const held = await tx.tableAssignment.findFirst({
          where: {
            reservationId: input.reservationId,
            status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          },
          select: { id: true },
        });
        if (held) {
          return fail(409, "That reservation already has a table");
        }
        await tx.reservation.update({
          where: { id: input.reservationId },
          data: { updatedAt: new Date() },
        });
      }

      let seatedAt: Date | null = null;
      const tableData: Record<string, unknown> = { assignmentVersion: { increment: 1 } };
      if (input.status === "SEATED") {
        seatedAt = new Date();
        tableData.cleaningSince = null;
      }

      for (const member of members) {
        await tx.diningTable.update({
          where: { id: member.id },
          data: tableData,
        });
      }

      const assignment = await tx.tableAssignment.create({
        data: {
          tableId: table.id,
          tableIds: memberIds,
          businessId: input.businessId,
          locationId: input.locationId,
          queueEntryId: input.queueEntryId,
          reservationId: input.reservationId,
          guestProfileId: input.guestProfileId,
          partySize: input.partySize,
          source: input.source,
          status: input.status,
          expectedStartAt: input.expectedStartAt,
          expectedEndAt: input.expectedEndAt,
          seatedAt,
        },
      });

      return ok(assignment);
    }),
  );
}

export type UpdateAssignmentInput = {
  locationId: string;
  assignmentId: string;
  status: AssignmentStatusValue | null;
  partySize: number | null;
  expectedStartAt: Date | null;
  expectedEndAt: Date | null;
};

export async function updateAssignment(input: UpdateAssignmentInput): Promise<Outcome<any>> {
  if (!OBJECT_ID_RE.test(input.assignmentId)) {
    return fail(404, "Assignment not found or access denied");
  }

  return withWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.tableAssignment.findFirst({
        where: { id: input.assignmentId, locationId: input.locationId },
      });
      if (!existing) {
        return fail(404, "Assignment not found or access denied");
      }
      if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
        return fail(409, "Assignment is already closed");
      }

      const table = await tx.diningTable.findFirst({
        where: { id: existing.tableId, locationId: input.locationId },
      });
      if (!table) {
        return fail(404, "Table not found or access denied");
      }

      let partySize = existing.partySize;
      if (input.partySize !== null) {
        partySize = input.partySize;
      }
      if (!partyFitsTable(partySize, table)) {
        return fail(409, `Table seats ${table.minimumPartySize} to ${table.capacity} guests`);
      }

      let expectedStartAt = existing.expectedStartAt;
      if (input.expectedStartAt) {
        expectedStartAt = input.expectedStartAt;
      }
      let expectedEndAt = existing.expectedEndAt;
      if (input.expectedEndAt) {
        expectedEndAt = input.expectedEndAt;
      }
      if (expectedEndAt.getTime() <= expectedStartAt.getTime()) {
        return fail(400, "expectedEndAt must be after expectedStartAt");
      }

      let status: AssignmentStatusValue = existing.status;
      if (input.status) {
        status = input.status;
      }

      const staysActive = ACTIVE_ASSIGNMENT_STATUSES.some((value) => value === status);
      if (staysActive) {
        const conflict = await tx.tableAssignment.findFirst({
          where: {
            tableId: existing.tableId,
            id: { not: existing.id },
            status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
            expectedStartAt: { lt: expectedEndAt },
            expectedEndAt: { gt: expectedStartAt },
          },
          select: { id: true },
        });
        if (conflict) {
          return fail(409, "Table already has an assignment during that time");
        }
      }

      await tx.diningTable.update({
        where: { id: table.id },
        data: { assignmentVersion: { increment: 1 } },
      });

      const data: Record<string, unknown> = {
        partySize,
        expectedStartAt,
        expectedEndAt,
        status,
      };
      if (status === "SEATED" && !existing.seatedAt) {
        data.seatedAt = new Date();
      }
      if (status === "COMPLETED" && !existing.completedAt) {
        data.completedAt = new Date();
      }
      if (status === "CANCELLED" && !existing.cancelledAt) {
        data.cancelledAt = new Date();
      }

      const updated = await tx.tableAssignment.update({
        where: { id: existing.id },
        data,
      });

      return ok(updated);
    }),
  );
}

export async function completeAssignment(
  locationId: string,
  assignmentId: string,
): Promise<Outcome<any>> {
  const existing = await findOwnedAssignment(locationId, assignmentId);
  if (!existing) {
    return fail(404, "Assignment not found or access denied");
  }

  const outcome = await withWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      const claimed = await tx.tableAssignment.updateMany({
        where: { id: existing.id, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      if (claimed.count !== 1) {
        return fail(409, "Assignment is already closed");
      }

      if (existing.status === "SEATED") {
        let memberIds = [existing.tableId];
        if (existing.tableIds && existing.tableIds.length > 0) {
          memberIds = existing.tableIds;
        }
        await tx.diningTable.updateMany({
          where: { id: { in: memberIds }, locationId },
          data: { cleaningSince: new Date() },
        });
      }

      return ok(await tx.tableAssignment.findUnique({ where: { id: existing.id } }));
    }),
  );

  return outcome;
}

export type MoveAssignmentInput = {
  locationId: string;
  assignmentId: string;
  tableId: string;
};

export async function moveAssignment(input: MoveAssignmentInput): Promise<Outcome<any>> {
  if (!OBJECT_ID_RE.test(input.assignmentId)) {
    return fail(404, "Assignment not found or access denied");
  }
  if (!OBJECT_ID_RE.test(input.tableId)) {
    return fail(404, "Table not found or access denied");
  }

  return withWriteRetry(() =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.tableAssignment.findFirst({
        where: { id: input.assignmentId, locationId: input.locationId },
      });
      if (!existing) {
        return fail(404, "Assignment not found or access denied");
      }
      if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
        return fail(409, "Assignment is already closed");
      }
      if (existing.tableId === input.tableId) {
        return fail(409, "The party is already at that table");
      }

      const target = await tx.diningTable.findFirst({
        where: { id: input.tableId, locationId: input.locationId },
      });
      if (!target) {
        return fail(404, "Table not found or access denied");
      }
      if (target.isBlocked) {
        return fail(409, "Table is blocked and cannot accept an assignment");
      }
      if (!partyFitsTable(existing.partySize, target)) {
        return fail(409, `Table seats ${target.minimumPartySize} to ${target.capacity} guests`);
      }

      const conflict = await tx.tableAssignment.findFirst({
        where: {
          ...occupiedByAny([target.id]),
          id: { not: existing.id },
          status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          expectedStartAt: { lt: existing.expectedEndAt },
          expectedEndAt: { gt: existing.expectedStartAt },
        },
        select: { id: true },
      });
      if (conflict) {
        return fail(409, "Table already has an assignment during that time");
      }

      let previousIds = [existing.tableId];
      if (existing.tableIds.length > 0) {
        previousIds = existing.tableIds;
      }
      for (const previousId of previousIds) {
        await tx.diningTable.update({
          where: { id: previousId },
          data: { assignmentVersion: { increment: 1 } },
        });
      }
      await tx.diningTable.update({
        where: { id: target.id },
        data: { assignmentVersion: { increment: 1 }, cleaningSince: null },
      });

      const moved = await tx.tableAssignment.update({
        where: { id: existing.id },
        data: { tableId: target.id, tableIds: [target.id] },
      });

      return ok(moved);
    }),
  );
}

export async function setTableCleaning(
  locationId: string,
  tableId: string,
  cleaning: boolean,
): Promise<Outcome<any>> {
  const table = await findOwnedTable(locationId, tableId);
  if (!table) {
    return fail(404, "Table not found or access denied");
  }

  if (cleaning) {
    const seated = await prisma.tableAssignment.findFirst({
      where: { ...occupiedByAny([table.id]), status: "SEATED" },
      select: { id: true },
    });
    if (seated) {
      return fail(409, "Complete the current visit before marking the table for cleaning");
    }
  }

  let cleaningSince: Date | null = null;
  if (cleaning) {
    cleaningSince = new Date();
  }

  const updated = await withWriteRetry(() =>
    prisma.diningTable.update({
      where: { id: table.id },
      data: { cleaningSince },
    }),
  );

  return ok(updated);
}

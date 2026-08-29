import { prisma } from "./prisma.js";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  DEFAULT_TURN_MINUTES,
  listRooms,
  serializeZone,
} from "./floor.js";
import { getLocationTimezone, getNowWallClockInTimezone } from "./operatingHours.js";
import {
  matchPartiesToTables,
  rankTablesForParty,
  type SmartOccupancy,
  type SmartParty,
  type SmartTable,
} from "./smartAssign.js";
import { formatTimeLabel, splitDateTime } from "./reservations.js";
import { estimateTurnMinutes, type EtaOccupancy, type EtaTable } from "./queueEta.js";

export const LIVE_STATUSES = ["BLOCKED", "OCCUPIED", "CLEANING", "RESERVED", "AVAILABLE"] as const;

export type LiveStatus = (typeof LIVE_STATUSES)[number];

export const RESERVATION_LOOKAHEAD_MINUTES = 120;
export const MAX_WAITING_PARTIES = 50;
export const MAX_UPCOMING_RESERVATIONS = 50;
export const RESERVATION_GRACE_MINUTES = 30;
export const UPCOMING_RESERVATION_STATUSES = ["CONFIRMED", "ARRIVED"] as const;
export const TURN_SAMPLE_LIMIT = 50;
export const TURN_SAMPLE_DAYS = 14;

export type LiveAssignmentLike = {
  id: string;
  tableId: string;
  tableIds?: string[];
  status: string;
  partySize: number;
  source: string;
  queueEntryId: string | null;
  reservationId: string | null;
  expectedStartAt: Date;
  expectedEndAt: Date;
  seatedAt: Date | null;
};

export type LiveTableLike = {
  id: string;
  capacity: number;
  minimumPartySize: number;
  isBlocked: boolean;
  cleaningSince: Date | null;
};

export type UpcomingReservation = {
  id: string;
  name: string;
  partySize: number;
  time: string;
  timeLabel: string;
  status: string;
  tableId: string | null;
  tableName: string | null;
  needsReview: boolean;
};

export const MATCH_STATES = ["MATCHED", "QUEUED", "NO_AVAILABILITY", "NO_CAPACITY"] as const;

export type MatchState = (typeof MATCH_STATES)[number];

export type WaitingParty = {
  id: string;
  name: string;
  partySize: number;
  joinedAt: string;
  waitingMinutes: number;
  admittedAt: string | null;
  admittedMinutes: number | null;
  assignmentId: string | null;
  tableId: string | null;
  tableName: string | null;
  recommendedTableId: string | null;
  recommendedTableName: string | null;
  recommendedReasons: string[];
  matchState: MatchState;
};

export function reservationWindow(
  nowLocal: string,
  graceMinutes: number = RESERVATION_GRACE_MINUTES,
): { from: string; to: string } {
  const dayKey = nowLocal.slice(0, 10);
  const hours = Number(nowLocal.slice(11, 13));
  const minutes = Number(nowLocal.slice(14, 16));

  let minuteOfDay = 0;
  if (Number.isFinite(hours) && Number.isFinite(minutes)) {
    minuteOfDay = hours * 60 + minutes - graceMinutes;
  }
  if (minuteOfDay < 0) {
    minuteOfDay = 0;
  }

  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return { from: `${dayKey}T${hh}:${mm}`, to: `${dayKey}T23:59` };
}

export function pickCurrentAssignment<T extends { status: string }>(assignments: T[]): T | null {
  return assignments.find((assignment) => assignment.status === "SEATED") ?? null;
}

export function pickUpcomingAssignment<T extends LiveAssignmentLike>(
  assignments: T[],
  now: Date,
): T | null {
  const upcoming = assignments.filter((assignment) => {
    if (assignment.status !== "RESERVED") {
      return false;
    }
    return assignment.expectedEndAt.getTime() > now.getTime();
  });
  if (upcoming.length === 0) {
    return null;
  }
  return upcoming.reduce((earliest, candidate) => {
    if (candidate.expectedStartAt.getTime() < earliest.expectedStartAt.getTime()) {
      return candidate;
    }
    return earliest;
  });
}

export function resolveTableStatus(
  table: LiveTableLike,
  assignments: LiveAssignmentLike[],
  now: Date,
  lookaheadMinutes: number = RESERVATION_LOOKAHEAD_MINUTES,
): LiveStatus {
  if (table.isBlocked) {
    return "BLOCKED";
  }
  if (pickCurrentAssignment(assignments)) {
    return "OCCUPIED";
  }
  if (table.cleaningSince) {
    return "CLEANING";
  }
  const upcoming = pickUpcomingAssignment(assignments, now);
  if (upcoming) {
    const cutoff = now.getTime() + lookaheadMinutes * 60 * 1000;
    if (upcoming.expectedStartAt.getTime() <= cutoff) {
      return "RESERVED";
    }
  }
  return "AVAILABLE";
}

export function minutesBetween(from: Date | null, to: Date): number | null {
  if (!from) {
    return null;
  }
  const elapsed = to.getTime() - from.getTime();
  if (elapsed < 0) {
    return 0;
  }
  return Math.floor(elapsed / 60000);
}

export function displayName(first: unknown, last: unknown): string {
  const joined = `${String(first ?? "")} ${String(last ?? "")}`.trim();
  if (!joined) {
    return "Guest";
  }
  return joined;
}

export function serializeLiveAssignment(
  assignment: LiveAssignmentLike,
  partyName: string | null,
  now: Date,
) {
  return {
    id: assignment.id,
    status: assignment.status,
    source: assignment.source,
    partySize: assignment.partySize,
    partyName,
    queueEntryId: assignment.queueEntryId,
    reservationId: assignment.reservationId,
    expectedStartAt: assignment.expectedStartAt.toISOString(),
    expectedEndAt: assignment.expectedEndAt.toISOString(),
    seatedAt: assignment.seatedAt?.toISOString() ?? null,
    seatedMinutes: minutesBetween(assignment.seatedAt, now),
  };
}

async function loadPartyNames(assignments: LiveAssignmentLike[]) {
  const queueIds = assignments
    .map((assignment) => assignment.queueEntryId)
    .filter((id): id is string => Boolean(id));
  const reservationIds = assignments
    .map((assignment) => assignment.reservationId)
    .filter((id): id is string => Boolean(id));

  const names = new Map<string, string>();

  if (queueIds.length > 0) {
    const rows = await prisma.queueEntry.findMany({
      where: { id: { in: queueIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const row of rows) {
      names.set(`queue:${row.id}`, displayName(row.firstName, row.lastName));
    }
  }

  if (reservationIds.length > 0) {
    const rows = await prisma.reservation.findMany({
      where: { id: { in: reservationIds } },
      select: { id: true, firstName: true, lastName: true, name: true },
    });
    for (const row of rows) {
      let label = displayName(row.firstName, row.lastName);
      if (label === "Guest" && row.name) {
        label = row.name;
      }
      names.set(`reservation:${row.id}`, label);
    }
  }

  return names;
}

function partyNameFor(assignment: LiveAssignmentLike, names: Map<string, string>): string | null {
  if (assignment.queueEntryId) {
    return names.get(`queue:${assignment.queueEntryId}`) ?? null;
  }
  if (assignment.reservationId) {
    return names.get(`reservation:${assignment.reservationId}`) ?? null;
  }
  return null;
}

async function loadUpcomingReservations(
  locationId: string,
  assignments: LiveAssignmentLike[],
  tableNames: Map<string, string>,
): Promise<UpcomingReservation[]> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { restaurantProfile: true },
  });
  const timezone = getLocationTimezone(location);
  const window = reservationWindow(getNowWallClockInTimezone(timezone));

  const rows = await prisma.reservation.findMany({
    where: {
      locationId,
      status: { in: [...UPCOMING_RESERVATION_STATUSES] },
      reservationDateTime: { gte: window.from, lte: window.to },
    },
    orderBy: { reservationDateTime: "asc" },
    take: MAX_UPCOMING_RESERVATIONS,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      guestCount: true,
      reservationDateTime: true,
      status: true,
      needsReview: true,
    },
  });

  const seatedAt = new Map<string, { id: string; name: string }>();
  for (const assignment of assignments) {
    if (!assignment.reservationId) {
      continue;
    }
    const tableName = tableNames.get(assignment.tableId);
    if (tableName) {
      seatedAt.set(assignment.reservationId, { id: assignment.tableId, name: tableName });
    }
  }

  return rows.map((row) => {
    let label = displayName(row.firstName, row.lastName);
    if (label === "Guest" && row.name) {
      label = row.name;
    }
    const { time } = splitDateTime(row.reservationDateTime);
    return {
      id: row.id,
      name: label,
      partySize: row.guestCount,
      time,
      timeLabel: formatTimeLabel(time),
      status: row.status,
      tableId: seatedAt.get(row.id)?.id ?? null,
      tableName: seatedAt.get(row.id)?.name ?? null,
      needsReview: Boolean(row.needsReview),
    };
  });
}

export async function buildLiveFloor(locationId: string, now: Date = new Date()) {
  const [rooms, assignments] = await Promise.all([
    listRooms(locationId),
    prisma.tableAssignment.findMany({
      where: { locationId, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
      orderBy: { expectedStartAt: "asc" },
    }),
  ]);

  const active = assignments as unknown as LiveAssignmentLike[];
  const names = await loadPartyNames(active);

  const byTable = new Map<string, LiveAssignmentLike[]>();
  for (const assignment of active) {
    let memberIds = [assignment.tableId];
    if (assignment.tableIds && assignment.tableIds.length > 0) {
      memberIds = assignment.tableIds;
    }
    for (const memberId of memberIds) {
      const bucket = byTable.get(memberId) ?? [];
      bucket.push(assignment);
      byTable.set(memberId, bucket);
    }
  }

  const tableNames = new Map<string, string>();
  for (const room of rooms) {
    for (const table of room.tables) {
      tableNames.set(table.id, table.name);
    }
  }

  const assignedTables = new Map<string, { assignmentId: string; id: string; name: string }>();
  for (const assignment of active) {
    if (!assignment.queueEntryId) {
      continue;
    }
    let memberIds = [assignment.tableId];
    if (assignment.tableIds && assignment.tableIds.length > 0) {
      memberIds = assignment.tableIds;
    }
    const label = memberIds
      .map((memberId) => tableNames.get(memberId))
      .filter((name): name is string => Boolean(name))
      .join(" + ");
    assignedTables.set(assignment.queueEntryId, {
      assignmentId: assignment.id,
      id: assignment.tableId,
      name: label,
    });
  }

  const [waitingRows, admittedRows] = await Promise.all([
    prisma.queueEntry.findMany({
      where: { locationId, status: "WAITING" },
      orderBy: { joinedAt: "asc" },
      take: MAX_WAITING_PARTIES,
      select: { id: true, firstName: true, lastName: true, guestCount: true, joinedAt: true },
    }),
    prisma.queueEntry.findMany({
      where: { locationId, status: "ADMITTED" },
      orderBy: { admittedAt: "asc" },
      take: MAX_WAITING_PARTIES,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guestCount: true,
        joinedAt: true,
        admittedAt: true,
      },
    }),
  ]);

  const waitingParties: WaitingParty[] = waitingRows
    .filter((row) => !assignedTables.has(row.id))
    .map((row) => ({
      id: row.id,
      name: displayName(row.firstName, row.lastName),
      partySize: row.guestCount,
      joinedAt: row.joinedAt.toISOString(),
      waitingMinutes: minutesBetween(row.joinedAt, now) ?? 0,
      admittedAt: null,
      admittedMinutes: null,
      assignmentId: null,
      tableId: null,
      tableName: null,
      recommendedTableId: null,
      recommendedTableName: null,
      recommendedReasons: [],
      matchState: "QUEUED" as MatchState,
    }));

  const admittedParties: WaitingParty[] = admittedRows.map((row) => {
    const held = assignedTables.get(row.id) ?? null;
    let matchState: MatchState = "QUEUED";
    if (held) {
      matchState = "MATCHED";
    }
    return {
      id: row.id,
      name: displayName(row.firstName, row.lastName),
      partySize: row.guestCount,
      joinedAt: row.joinedAt.toISOString(),
      waitingMinutes: minutesBetween(row.joinedAt, now) ?? 0,
      admittedAt: row.admittedAt?.toISOString() ?? null,
      admittedMinutes: minutesBetween(row.admittedAt, now),
      assignmentId: held?.assignmentId ?? null,
      tableId: held?.id ?? null,
      tableName: held?.name ?? null,
      recommendedTableId: null,
      recommendedTableName: null,
      recommendedReasons: [],
      matchState,
    };
  });

  const unseatedParties = admittedParties.filter((party) => !party.tableId);

  const statuses = new Map<string, LiveStatus>();

  for (const room of rooms) {
    for (const table of room.tables) {
      const tableAssignments = byTable.get(table.id) ?? [];
      const status = resolveTableStatus(table as LiveTableLike, tableAssignments, now);
      statuses.set(table.id, status);
    }
  }

  const smartTables: SmartTable[] = [];
  for (const room of rooms) {
    for (const table of room.tables) {
      const status = statuses.get(table.id);
      if (status === "BLOCKED" || status === "OCCUPIED") {
        continue;
      }
      smartTables.push({
        id: table.id,
        name: table.name,
        roomId: room.id,
        roomName: room.name,
        capacity: table.capacity,
        minimumPartySize: table.minimumPartySize,
        isBlocked: table.isBlocked,
        cleaningSince: table.cleaningSince,
      });
    }
  }

  const smartParties: SmartParty[] = [
    ...unseatedParties.map((party) => ({
      id: party.id,
      partySize: party.partySize,
      joinedAt: new Date(party.joinedAt),
      priority: 1,
      preferredRoomIds: [],
    })),
    ...waitingParties.map((party) => ({
      id: party.id,
      partySize: party.partySize,
      joinedAt: new Date(party.joinedAt),
      priority: 0,
      preferredRoomIds: [],
    })),
  ];

  const occupancy: SmartOccupancy[] = [];
  for (const assignment of active) {
    let memberIds = [assignment.tableId];
    if (assignment.tableIds && assignment.tableIds.length > 0) {
      memberIds = assignment.tableIds;
    }
    for (const memberId of memberIds) {
      occupancy.push({
        tableId: memberId,
        start: assignment.expectedStartAt,
        end: assignment.expectedEndAt,
      });
    }
  }

  const smartContext = {
    now,
    window: { start: now, end: new Date(now.getTime() + DEFAULT_TURN_MINUTES * 60 * 1000) },
    occupancy,
    preferredRoomIds: [],
  };

  const matches = matchPartiesToTables(smartTables, smartParties, smartContext);

  const setupNames = new Map(smartTables.map((setup) => [setup.id, setup.name]));
  const partyMatches = new Map<string, { tableId: string; tableName: string; reasons: string[] }>();
  for (const [setupId, match] of Object.entries(matches)) {
    partyMatches.set(match.partyId, {
      tableId: setupId,
      tableName: setupNames.get(setupId) ?? "",
      reasons: match.reasons,
    });
  }

  const everySetupCapacity: { capacity: number; minimum: number }[] = [];
  for (const room of rooms) {
    for (const table of room.tables) {
      everySetupCapacity.push({ capacity: table.capacity, minimum: table.minimumPartySize });
    }
  }

  for (const party of [...unseatedParties, ...waitingParties]) {
    const match = partyMatches.get(party.id);
    if (match) {
      party.recommendedTableId = match.tableId;
      party.recommendedTableName = match.tableName;
      party.recommendedReasons = match.reasons;
      party.matchState = "MATCHED";
      continue;
    }

    const fitsSomewhere = everySetupCapacity.some((setup) => {
      return party.partySize <= setup.capacity && party.partySize >= setup.minimum;
    });
    if (!fitsSomewhere) {
      party.matchState = "NO_CAPACITY";
      continue;
    }

    const smartParty = smartParties.find((candidate) => candidate.id === party.id);
    if (!smartParty) {
      continue;
    }
    const eligible = rankTablesForParty(smartTables, smartParty, smartContext);
    if (eligible.ranked.length === 0) {
      party.matchState = "NO_AVAILABILITY";
      continue;
    }
    party.matchState = "QUEUED";
  }

  const serializedRooms = rooms.map((room) => ({
    id: room.id,
    name: room.name,
    width: room.width,
    height: room.height,
    sortOrder: room.sortOrder,
    zones: room.zones.map(serializeZone),
    tables: room.tables.map((table) => {
      const tableAssignments = byTable.get(table.id) ?? [];
      const current = pickCurrentAssignment(tableAssignments);
      const upcoming = pickUpcomingAssignment(tableAssignments, now);

      let currentPayload = null;
      if (current) {
        currentPayload = serializeLiveAssignment(current, partyNameFor(current, names), now);
      }
      let upcomingPayload = null;
      if (upcoming) {
        upcomingPayload = serializeLiveAssignment(upcoming, partyNameFor(upcoming, names), now);
      }

      return {
        id: table.id,
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
        cleaningSince: table.cleaningSince?.toISOString() ?? null,
        status: statuses.get(table.id) ?? "AVAILABLE",
        currentAssignment: currentPayload,
        upcomingAssignment: upcomingPayload,
        recommendedPartyId: matches[table.id]?.partyId ?? null,
        recommendedReasons: matches[table.id]?.reasons ?? [],
      };
    }),
  }));

  const upcomingReservations = await loadUpcomingReservations(locationId, active, tableNames);

  return {
    now: now.toISOString(),
    rooms: serializedRooms,
    waitingParties,
    admittedParties,
    upcomingReservations,
  };
}

export type EtaCapacity = {
  diningTables: EtaTable[];
  tableOccupancy: EtaOccupancy[];
  turnMinutes: number;
  turnSampleCount: number;
};

export async function loadEtaCapacity(locationId: string): Promise<EtaCapacity> {
  const since = new Date(Date.now() - TURN_SAMPLE_DAYS * 24 * 60 * 60 * 1000);

  const [tables, assignments, finished] = await Promise.all([
    prisma.diningTable.findMany({
      where: { locationId },
      select: {
        id: true,
        floorPlanId: true,
        capacity: true,
        minimumPartySize: true,
        isBlocked: true,
        cleaningSince: true,
      },
    }),
    prisma.tableAssignment.findMany({
      where: { locationId, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
      select: {
        tableId: true,
        tableIds: true,
        expectedStartAt: true,
        expectedEndAt: true,
        queueEntryId: true,
        reservationId: true,
      },
    }),
    prisma.tableAssignment.findMany({
      where: { locationId, status: "COMPLETED", completedAt: { gte: since } },
      orderBy: { completedAt: "desc" },
      take: TURN_SAMPLE_LIMIT,
      select: { seatedAt: true, completedAt: true },
    }),
  ]);

  const tableOccupancy: EtaOccupancy[] = assignments.map((assignment) => {
    let tableIds = [assignment.tableId];
    if (assignment.tableIds && assignment.tableIds.length > 0) {
      tableIds = assignment.tableIds;
    }
    return {
      tableIds,
      start: assignment.expectedStartAt,
      end: assignment.expectedEndAt,
      queueEntryId: assignment.queueEntryId,
      reservationId: assignment.reservationId,
    };
  });

  const turn = estimateTurnMinutes(finished);

  return {
    diningTables: tables.map((table) => ({
      id: table.id,
      roomId: table.floorPlanId,
      capacity: table.capacity,
      minimumPartySize: table.minimumPartySize,
      isBlocked: table.isBlocked,
      cleaningSince: table.cleaningSince,
    })),
    tableOccupancy,
    turnMinutes: turn.minutes,
    turnSampleCount: turn.sampleCount,
  };
}

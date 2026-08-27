import type { TableShape } from "@/lib/floorGeometry";

export const LIVE_STATUSES = ["AVAILABLE", "RESERVED", "OCCUPIED", "CLEANING", "BLOCKED"] as const;

export type LiveStatus = (typeof LIVE_STATUSES)[number];

export type LiveAssignment = {
  id: string;
  status: string;
  source: string;
  partySize: number;
  partyName: string | null;
  queueEntryId: string | null;
  reservationId: string | null;
  expectedStartAt: string;
  expectedEndAt: string;
  seatedAt: string | null;
  seatedMinutes: number | null;
};

export type LiveTable = {
  id: string;
  name: string;
  capacity: number;
  minimumPartySize: number;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  isBlocked: boolean;
  cleaningSince: string | null;
  status: LiveStatus;
  currentAssignment: LiveAssignment | null;
  upcomingAssignment: LiveAssignment | null;
  recommendedPartyId: string | null;
  recommendedReasons: string[];
};

export type LiveZone = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LiveRoom = {
  id: string;
  name: string;
  width: number;
  height: number;
  sortOrder: number;
  zones: LiveZone[];
  tables: LiveTable[];
};

export const MATCH_STATES = ["MATCHED", "QUEUED", "NO_AVAILABILITY", "NO_CAPACITY"] as const;

export type MatchState = (typeof MATCH_STATES)[number];

export type WaitingParty = {
  id: string;
  name: string;
  partySize: number;
  joinedAt: string;
  waitingMinutes: number;
  recommendedTableId: string | null;
  recommendedTableName: string | null;
  recommendedReasons: string[];
  matchState: MatchState;
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

export type LiveFloor = {
  now: string;
  rooms: LiveRoom[];
  waitingParties: WaitingParty[];
  upcomingReservations: UpcomingReservation[];
};

export type StatusStyle = {
  node: string;
  swatch: string;
  badge: string;
};

const STATUS_STYLES: Record<LiveStatus, StatusStyle> = {
  AVAILABLE: {
    node: "border-emerald-400 bg-emerald-50 text-emerald-900",
    swatch: "border-emerald-400 bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-800",
  },
  RESERVED: {
    node: "border-amber-400 bg-amber-50 text-amber-900",
    swatch: "border-amber-400 bg-amber-100",
    badge: "bg-amber-100 text-amber-800",
  },
  OCCUPIED: {
    node: "border-indigo-500 bg-indigo-50 text-indigo-900",
    swatch: "border-indigo-500 bg-indigo-100",
    badge: "bg-indigo-100 text-indigo-800",
  },
  CLEANING: {
    node: "border-sky-400 bg-sky-50 text-sky-900",
    swatch: "border-sky-400 bg-sky-100",
    badge: "bg-sky-100 text-sky-800",
  },
  BLOCKED: {
    node: "border-slate-400 bg-slate-300 text-slate-700",
    swatch: "border-slate-400 bg-slate-300",
    badge: "bg-slate-200 text-slate-700",
  },
};

export function statusStyle(status: LiveStatus): StatusStyle {
  return STATUS_STYLES[status] ?? STATUS_STYLES.AVAILABLE;
}

export function countByStatus(tables: LiveTable[]): Record<LiveStatus, number> {
  const counts: Record<LiveStatus, number> = {
    AVAILABLE: 0,
    RESERVED: 0,
    OCCUPIED: 0,
    CLEANING: 0,
    BLOCKED: 0,
  };
  for (const table of tables) {
    if (counts[table.status] === undefined) {
      continue;
    }
    counts[table.status] += 1;
  }
  return counts;
}

export function allTables(rooms: LiveRoom[]): LiveTable[] {
  const tables: LiveTable[] = [];
  for (const room of rooms) {
    for (const table of room.tables) {
      tables.push(table);
    }
  }
  return tables;
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

export function seatableParties(table: LiveTable, parties: WaitingParty[]): WaitingParty[] {
  return parties.filter((party) => partyFitsTable(party.partySize, table));
}

export function moveTargets(rooms: LiveRoom[], table: LiveTable, partySize: number): LiveTable[] {
  return allTables(rooms).filter((candidate) => {
    if (candidate.id === table.id) {
      return false;
    }
    if (candidate.status === "BLOCKED" || candidate.status === "OCCUPIED") {
      return false;
    }
    return partyFitsTable(partySize, candidate);
  });
}

export function findTable(rooms: LiveRoom[], tableId: string | null): LiveTable | null {
  if (!tableId) {
    return null;
  }
  return allTables(rooms).find((table) => table.id === tableId) ?? null;
}

export function roomOfTable(rooms: LiveRoom[], tableId: string | null): LiveRoom | null {
  if (!tableId) {
    return null;
  }
  return rooms.find((room) => room.tables.some((table) => table.id === tableId)) ?? null;
}

export function formatClock(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function elapsedMinutes(iso: string | null, now: Date): number | null {
  if (!iso) {
    return null;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const elapsed = now.getTime() - parsed.getTime();
  if (elapsed < 0) {
    return 0;
  }
  return Math.floor(elapsed / 60000);
}

export const FLOOR_MODE_KEY = "seatping.business.floorMode";

export type FloorMode = "live" | "edit";

export function readFloorMode(): FloorMode {
  try {
    if (localStorage.getItem(FLOOR_MODE_KEY) === "edit") {
      return "edit";
    }
    return "live";
  } catch {
    return "live";
  }
}

export function persistFloorMode(mode: FloorMode): void {
  try {
    localStorage.setItem(FLOOR_MODE_KEY, mode);
  } catch {}
}

export type TableCandidate = {
  id: string;
  name: string;
  capacity: number;
  roomId: string;
  roomName: string;
  detail: string;
  recommended: boolean;
  status: LiveStatus | null;
};

export function combinableTables(
  rooms: LiveRoom[],
  excludeTableId: string | null = null,
): TableCandidate[] {
  const options: TableCandidate[] = [];

  for (const room of rooms) {
    for (const table of room.tables) {
      if (excludeTableId && table.id === excludeTableId) {
        continue;
      }
      if (table.status === "BLOCKED" || table.status === "OCCUPIED") {
        continue;
      }
      options.push({
        id: table.id,
        name: table.name,
        capacity: table.capacity,
        roomId: room.id,
        roomName: room.name,
        detail: room.name,
        recommended: false,
        status: table.status,
      });
    }
  }

  options.sort((a, b) => {
    if (a.roomName !== b.roomName) {
      return a.roomName.localeCompare(b.roomName);
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  return options;
}

export function joinedRoomId(tables: TableCandidate[]): string | null {
  if (tables.length === 0) {
    return null;
  }
  return tables[0].roomId;
}

export function sameRoom(tables: TableCandidate[]): boolean {
  const roomId = joinedRoomId(tables);
  if (!roomId) {
    return true;
  }
  return tables.every((table) => table.roomId === roomId);
}

export function combinedCapacity(tables: TableCandidate[]): number {
  return tables.reduce((total, table) => total + table.capacity, 0);
}

export function combinedName(tables: TableCandidate[]): string {
  return tables.map((table) => table.name).join(" + ");
}

export function candidateTablesForParty(
  rooms: LiveRoom[],
  partySize: number,
  recommendedId: string | null,
  excludeTableId: string | null = null,
): TableCandidate[] {
  const candidates: TableCandidate[] = [];

  for (const room of rooms) {
    for (const table of room.tables) {
      if (excludeTableId && table.id === excludeTableId) {
        continue;
      }
      if (table.status === "BLOCKED" || table.status === "OCCUPIED") {
        continue;
      }
      if (!partyFitsTable(partySize, table)) {
        continue;
      }
      candidates.push({
        id: table.id,
        name: table.name,
        capacity: table.capacity,
        roomId: room.id,
        roomName: room.name,
        detail: room.name,
        recommended: table.id === recommendedId,
        status: table.status,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.recommended !== b.recommended) {
      if (a.recommended) {
        return -1;
      }
      return 1;
    }
    if (a.capacity !== b.capacity) {
      return a.capacity - b.capacity;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  return candidates;
}

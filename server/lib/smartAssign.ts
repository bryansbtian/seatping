export const REJECT_BLOCKED = "BLOCKED";
export const REJECT_TOO_SMALL = "TOO_SMALL";
export const REJECT_BELOW_MINIMUM = "BELOW_MINIMUM";
export const REJECT_OCCUPANCY_CONFLICT = "OCCUPANCY_CONFLICT";

export const REASON_EXACT_FIT = "EXACT_FIT";
export const REASON_EFFICIENT_FIT = "EFFICIENT_FIT";
export const REASON_OVERSIZED = "OVERSIZED";
export const REASON_PREFERRED_ROOM = "PREFERRED_ROOM";
export const REASON_NEEDS_CLEANING = "NEEDS_CLEANING";
export const REASON_FREE_ALL_WINDOW = "FREE_ALL_WINDOW";
export const REASON_RESERVATION_SOON = "RESERVATION_SOON";
export const REASON_LONGEST_WAIT = "LONGEST_WAIT";
export const REASON_HIGH_PRIORITY = "HIGH_PRIORITY";

export const SCORE_EXACT_FIT = 100;
export const SCORE_WASTED_SEAT = 12;
export const SCORE_PREFERRED_ROOM = 40;
export const SCORE_CLEANING_PENALTY = 25;
export const SCORE_TIGHT_TURNAROUND_PENALTY = 30;
export const SCORE_WAIT_MINUTE = 2;

export const TIGHT_TURNAROUND_MINUTES = 30;
export const MAX_WAIT_SCORE_MINUTES = 120;
export const HIGH_PRIORITY_THRESHOLD = 1;

export type SmartTable = {
  id: string;
  name: string;
  roomId: string;
  roomName: string;
  capacity: number;
  minimumPartySize: number;
  isBlocked: boolean;
  cleaningSince: Date | null;
};

export type SmartParty = {
  id: string;
  partySize: number;
  joinedAt: Date;
  priority: number;
  preferredRoomIds: string[];
};

export type SmartOccupancy = {
  tableId: string;
  start: Date;
  end: Date;
};

export type SmartWindow = {
  start: Date;
  end: Date;
};

export type SmartContext = {
  now: Date;
  window: SmartWindow;
  occupancy: SmartOccupancy[];
  preferredRoomIds: string[];
};

export type TableScore = {
  tableId: string;
  score: number;
  reasons: string[];
};

export type PartyScore = {
  partyId: string;
  score: number;
  reasons: string[];
};

export type Rejection = {
  id: string;
  reason: string;
};

export type TableRanking = {
  ranked: TableScore[];
  rejected: Rejection[];
};

export type PartyRanking = {
  ranked: PartyScore[];
  rejected: Rejection[];
};

export function windowsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60000);
}

export function fitsTable(
  partySize: number,
  table: Pick<SmartTable, "capacity" | "minimumPartySize">,
): boolean {
  if (partySize > table.capacity) {
    return false;
  }
  if (partySize < table.minimumPartySize) {
    return false;
  }
  return true;
}

export function rejectTable(
  table: SmartTable,
  partySize: number,
  context: SmartContext,
): string | null {
  if (table.isBlocked) {
    return REJECT_BLOCKED;
  }
  if (partySize > table.capacity) {
    return REJECT_TOO_SMALL;
  }
  if (partySize < table.minimumPartySize) {
    return REJECT_BELOW_MINIMUM;
  }
  for (const busy of context.occupancy) {
    if (busy.tableId !== table.id) {
      continue;
    }
    if (windowsOverlap(context.window.start, context.window.end, busy.start, busy.end)) {
      return REJECT_OCCUPANCY_CONFLICT;
    }
  }
  return null;
}

export function minutesUntilNextOccupancy(table: SmartTable, context: SmartContext): number | null {
  let soonest: number | null = null;
  for (const busy of context.occupancy) {
    if (busy.tableId !== table.id) {
      continue;
    }
    if (busy.start.getTime() < context.window.end.getTime()) {
      continue;
    }
    const gap = minutesBetween(context.window.end, busy.start);
    if (soonest === null || gap < soonest) {
      soonest = gap;
    }
  }
  return soonest;
}

export function scoreTableForParty(
  table: SmartTable,
  party: Pick<SmartParty, "partySize" | "preferredRoomIds">,
  context: SmartContext,
): TableScore {
  const reasons: string[] = [];
  let score = 0;

  const wasted = table.capacity - party.partySize;
  if (wasted === 0) {
    score += SCORE_EXACT_FIT;
    reasons.push(REASON_EXACT_FIT);
  } else {
    score -= wasted * SCORE_WASTED_SEAT;
    if (wasted <= 1) {
      reasons.push(REASON_EFFICIENT_FIT);
    } else {
      reasons.push(REASON_OVERSIZED);
    }
  }

  const preferred = new Set([...party.preferredRoomIds, ...context.preferredRoomIds]);
  if (preferred.has(table.roomId)) {
    score += SCORE_PREFERRED_ROOM;
    reasons.push(REASON_PREFERRED_ROOM);
  }

  if (table.cleaningSince) {
    score -= SCORE_CLEANING_PENALTY;
    reasons.push(REASON_NEEDS_CLEANING);
  }

  const gap = minutesUntilNextOccupancy(table, context);
  if (gap === null) {
    reasons.push(REASON_FREE_ALL_WINDOW);
  } else if (gap < TIGHT_TURNAROUND_MINUTES) {
    score -= SCORE_TIGHT_TURNAROUND_PENALTY;
    reasons.push(REASON_RESERVATION_SOON);
  }

  return { tableId: table.id, score, reasons };
}

function compareTables(a: TableScore, b: TableScore, byId: Map<string, SmartTable>): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  const tableA = byId.get(a.tableId);
  const tableB = byId.get(b.tableId);
  if (tableA && tableB) {
    if (tableA.capacity !== tableB.capacity) {
      return tableA.capacity - tableB.capacity;
    }
    const byName = tableA.name.localeCompare(tableB.name, "en", { numeric: true });
    if (byName !== 0) {
      return byName;
    }
  }
  return a.tableId.localeCompare(b.tableId);
}

export function rankTablesForParty(
  tables: SmartTable[],
  party: SmartParty,
  context: SmartContext,
): TableRanking {
  const ranked: TableScore[] = [];
  const rejected: Rejection[] = [];
  const byId = new Map<string, SmartTable>();

  for (const table of tables) {
    byId.set(table.id, table);
    const rejection = rejectTable(table, party.partySize, context);
    if (rejection) {
      rejected.push({ id: table.id, reason: rejection });
      continue;
    }
    ranked.push(scoreTableForParty(table, party, context));
  }

  ranked.sort((a, b) => compareTables(a, b, byId));
  return { ranked, rejected };
}

export function scorePartyForTable(
  party: SmartParty,
  table: SmartTable,
  context: SmartContext,
): PartyScore {
  const reasons: string[] = [];
  let score = 0;

  let waited = minutesBetween(party.joinedAt, context.now);
  if (waited < 0) {
    waited = 0;
  }
  if (waited > MAX_WAIT_SCORE_MINUTES) {
    waited = MAX_WAIT_SCORE_MINUTES;
  }
  score += waited * SCORE_WAIT_MINUTE;

  if (party.priority >= HIGH_PRIORITY_THRESHOLD) {
    reasons.push(REASON_HIGH_PRIORITY);
  }

  const wasted = table.capacity - party.partySize;
  if (wasted === 0) {
    score += SCORE_EXACT_FIT;
    reasons.push(REASON_EXACT_FIT);
  } else {
    score -= wasted * SCORE_WASTED_SEAT;
    if (wasted <= 1) {
      reasons.push(REASON_EFFICIENT_FIT);
    }
  }

  const preferred = new Set([...party.preferredRoomIds, ...context.preferredRoomIds]);
  if (preferred.has(table.roomId)) {
    score += SCORE_PREFERRED_ROOM;
    reasons.push(REASON_PREFERRED_ROOM);
  }

  return { partyId: party.id, score, reasons };
}

export function rankPartiesForTable(
  parties: SmartParty[],
  table: SmartTable,
  context: SmartContext,
): PartyRanking {
  const ranked: PartyScore[] = [];
  const rejected: Rejection[] = [];
  const byId = new Map<string, SmartParty>();

  const tableRejection = rejectTable(table, table.minimumPartySize, context);
  if (tableRejection === REJECT_BLOCKED || tableRejection === REJECT_OCCUPANCY_CONFLICT) {
    return { ranked: [], rejected: parties.map((p) => ({ id: p.id, reason: tableRejection })) };
  }

  for (const party of parties) {
    byId.set(party.id, party);
    if (!fitsTable(party.partySize, table)) {
      let reason = REJECT_TOO_SMALL;
      if (party.partySize < table.minimumPartySize) {
        reason = REJECT_BELOW_MINIMUM;
      }
      rejected.push({ id: party.id, reason });
      continue;
    }
    ranked.push(scorePartyForTable(party, table, context));
  }

  ranked.sort((a, b) => {
    const partyA = byId.get(a.partyId);
    const partyB = byId.get(b.partyId);
    if (partyA && partyB && partyA.priority !== partyB.priority) {
      return partyB.priority - partyA.priority;
    }
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    if (partyA && partyB && partyA.joinedAt.getTime() !== partyB.joinedAt.getTime()) {
      return partyA.joinedAt.getTime() - partyB.joinedAt.getTime();
    }
    return a.partyId.localeCompare(b.partyId);
  });

  if (ranked.length > 0) {
    ranked[0].reasons = [...ranked[0].reasons, REASON_LONGEST_WAIT];
  }

  return { ranked, rejected };
}

export function bestTableForParty(
  tables: SmartTable[],
  party: SmartParty,
  context: SmartContext,
): TableScore | null {
  return rankTablesForParty(tables, party, context).ranked[0] ?? null;
}

export function bestPartyForTable(
  parties: SmartParty[],
  table: SmartTable,
  context: SmartContext,
): PartyScore | null {
  return rankPartiesForTable(parties, table, context).ranked[0] ?? null;
}

export function matchPartiesToTables(
  tables: SmartTable[],
  parties: SmartParty[],
  context: SmartContext,
): Record<string, { partyId: string; reasons: string[] }> {
  const claimed = new Set<string>();
  const matches: Record<string, { partyId: string; reasons: string[] }> = {};

  const ordered = [...parties].sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    if (a.joinedAt.getTime() !== b.joinedAt.getTime()) {
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    }
    return a.id.localeCompare(b.id);
  });

  for (const party of ordered) {
    const available = tables.filter((table) => {
      return !claimed.has(table.id);
    });
    const best = bestTableForParty(available, party, context);
    if (!best) {
      continue;
    }
    claimed.add(best.tableId);
    matches[best.tableId] = { partyId: party.id, reasons: best.reasons };
  }

  return matches;
}

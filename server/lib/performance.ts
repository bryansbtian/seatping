export const PERFORMANCE_PRESETS = ["today", "7d", "30d", "custom"] as const;

export type PerformancePreset = (typeof PERFORMANCE_PRESETS)[number];

export type PerformanceRange = { from: Date; to: Date; preset: PerformancePreset };

export type PerformanceQueueEntry = {
  guestCount: number;
  status: string;
  joinedAt: Date;
  admittedAt: Date | null;
  arrivedAt: Date | null;
  noShowAt: Date | null;
  removedAt: Date | null;
  leftAt: Date | null;
};

export type PerformanceReservation = {
  guestCount: number;
  status: string;
  reservationDateTime: string;
  arrivedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
};

export type PerformanceAssignment = {
  tableId: string;
  tableIds: string[];
  partySize: number;
  source: string;
  status: string;
  seatedAt: Date | null;
  completedAt: Date | null;
  queueEntryId: string | null;
  reservationId: string | null;
};

export type PerformanceTable = { id: string; name: string };

export type TableUtilization = {
  tableId: string;
  tableName: string;
  seatedMinutes: number;
  utilization: number;
};

export const GRANULARITIES = ["daily", "weekly", "monthly", "quarterly"] as const;

export type Granularity = (typeof GRANULARITIES)[number];

export type CoverBucket = { start: string; end: string; covers: number };

export type PerformanceMetrics = {
  covers: number;
  previousCovers: number;
  coversDelta: number;
  granularity: Granularity;
  coverBuckets: CoverBucket[];
  hasActivity: boolean;
  tablesUsed: number;
  tableCount: number;
  bookedParties: number;
  noShowCount: number;
  guestsServed: number;
  partiesSeated: number;
  averageQueueWaitMinutes: number | null;
  averageTableTurnMinutes: number | null;
  queueAbandonmentRate: number | null;
  reservationNoShowRate: number | null;
  averagePartySize: number | null;
  reservationCovers: number;
  walkInCovers: number;
  tableUtilization: number | null;
  perTableUtilization: TableUtilization[];
  peakServiceTimes: { hour: number; covers: number }[];
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const ABANDONED_QUEUE_STATUSES = ["LEFT", "REMOVED"];
export const SERVED_QUEUE_STATUSES = ["ARRIVED", "COMPLETED"];
export const SERVED_RESERVATION_STATUSES = ["ARRIVED", "COMPLETED"];

function startOfDay(at: Date): Date {
  const copy = new Date(at.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(at: Date): Date {
  const copy = startOfDay(at);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

export function rangeDays(range: { from: Date; to: Date }): number {
  return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS));
}

export function resolveGranularity(range: { from: Date; to: Date }): Granularity {
  const days = rangeDays(range);
  if (days <= 31) {
    return "daily";
  }
  if (days <= 120) {
    return "weekly";
  }
  if (days <= 730) {
    return "monthly";
  }
  return "quarterly";
}

export function buildBuckets(
  range: { from: Date; to: Date },
  granularity: Granularity,
): { start: Date; end: Date }[] {
  const buckets: { start: Date; end: Date }[] = [];
  let cursor = new Date(range.from.getTime());

  while (cursor.getTime() < range.to.getTime()) {
    let next: Date;
    if (granularity === "daily") {
      next = new Date(cursor.getTime());
      next.setDate(next.getDate() + 1);
    } else if (granularity === "weekly") {
      next = new Date(cursor.getTime());
      next.setDate(next.getDate() + 7);
    } else if (granularity === "monthly") {
      next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    } else {
      const quarterStart = Math.floor(cursor.getMonth() / 3) * 3;
      next = new Date(cursor.getFullYear(), quarterStart + 3, 1);
    }
    if (next.getTime() > range.to.getTime()) {
      next = new Date(range.to.getTime());
    }
    buckets.push({ start: new Date(cursor.getTime()), end: next });
    cursor = next;
  }

  return buckets;
}

export function previousRange(range: PerformanceRange): { from: Date; to: Date } {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span), to: new Date(range.from.getTime()) };
}

export function dayKey(at: Date): string {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveRange(
  preset: string,
  fromRaw?: string,
  toRaw?: string,
  now: Date = new Date(),
): PerformanceRange | null {
  if (preset === "today") {
    return { from: startOfDay(now), to: endOfDay(now), preset: "today" };
  }
  if (preset === "7d") {
    return {
      from: new Date(startOfDay(now).getTime() - 6 * DAY_MS),
      to: endOfDay(now),
      preset: "7d",
    };
  }
  if (preset === "30d") {
    return {
      from: new Date(startOfDay(now).getTime() - 29 * DAY_MS),
      to: endOfDay(now),
      preset: "30d",
    };
  }
  if (preset !== "custom") {
    return null;
  }

  if (!fromRaw || !toRaw) {
    return null;
  }
  const from = new Date(`${fromRaw}T00:00:00`);
  const to = new Date(`${toRaw}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }
  if (to.getTime() < from.getTime()) {
    return null;
  }
  return { from: startOfDay(from), to: endOfDay(to), preset: "custom" };
}

function withinRange(at: Date | null | undefined, range: PerformanceRange): boolean {
  if (!at) {
    return false;
  }
  const time = at.getTime();
  return time >= range.from.getTime() && time < range.to.getTime();
}

function minutesBetween(from: Date, to: Date): number | null {
  const elapsed = to.getTime() - from.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return null;
  }
  return elapsed / MINUTE_MS;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

function ratio(part: number, whole: number): number | null {
  if (whole <= 0) {
    return null;
  }
  return Math.round((part / whole) * 1000) / 1000;
}

export function queueWaitMinutes(entry: PerformanceQueueEntry): number | null {
  const servedAt = entry.arrivedAt ?? entry.admittedAt;
  if (!servedAt) {
    return null;
  }
  return minutesBetween(entry.joinedAt, servedAt);
}

export function assignmentTurnMinutes(assignment: PerformanceAssignment): number | null {
  if (!assignment.seatedAt || !assignment.completedAt) {
    return null;
  }
  return minutesBetween(assignment.seatedAt, assignment.completedAt);
}

function memberTableIds(assignment: PerformanceAssignment): string[] {
  if (assignment.tableIds && assignment.tableIds.length > 0) {
    return assignment.tableIds;
  }
  return [assignment.tableId];
}

export function serviceMinutesInRange(
  range: { from: Date; to: Date },
  openMinutesForDate: (dateKey: string) => number | null,
  now: Date,
): number {
  const end = Math.min(range.to.getTime(), now.getTime());
  let total = 0;
  const cursor = new Date(range.from.getTime());

  while (cursor.getTime() < end) {
    const dayStart = cursor.getTime();
    const dayEnd = new Date(cursor.getTime());
    dayEnd.setDate(dayEnd.getDate() + 1);

    const openMinutes = openMinutesForDate(dayKey(cursor));
    if (openMinutes !== null) {
      const elapsed = (Math.min(dayEnd.getTime(), end) - dayStart) / MINUTE_MS;
      total += Math.min(openMinutes, Math.max(0, elapsed));
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}

export function computePerformance(input: {
  range: PerformanceRange;
  queueEntries: PerformanceQueueEntry[];
  reservations: PerformanceReservation[];
  assignments: PerformanceAssignment[];
  tables: PerformanceTable[];
  openMinutesForDate?: (dateKey: string) => number | null;
  now?: Date;
}): PerformanceMetrics {
  const { range, queueEntries, reservations, assignments, tables } = input;
  const now = input.now ?? new Date();

  const seated = assignments.filter((assignment) => withinRange(assignment.seatedAt, range));

  const prior = previousRange(range);
  let previousCovers = 0;
  for (const assignment of assignments) {
    if (!assignment.seatedAt) {
      continue;
    }
    const time = assignment.seatedAt.getTime();
    if (time >= prior.from.getTime() && time < prior.to.getTime()) {
      previousCovers += assignment.partySize;
    }
  }

  const granularity = resolveGranularity(range);
  const buckets = buildBuckets(range, granularity);
  const bucketCovers = buckets.map(() => 0);

  let covers = 0;
  let reservationCovers = 0;
  let walkInCovers = 0;
  const partySizes: number[] = [];
  const peakByHour = new Map<number, number>();

  for (const assignment of seated) {
    covers += assignment.partySize;
    partySizes.push(assignment.partySize);
    if (assignment.reservationId) {
      reservationCovers += assignment.partySize;
    } else {
      walkInCovers += assignment.partySize;
    }
    if (assignment.seatedAt) {
      const hour = assignment.seatedAt.getHours();
      peakByHour.set(hour, (peakByHour.get(hour) ?? 0) + assignment.partySize);
      const seatedTime = assignment.seatedAt.getTime();
      for (let index = 0; index < buckets.length; index += 1) {
        if (
          seatedTime >= buckets[index].start.getTime() &&
          seatedTime < buckets[index].end.getTime()
        ) {
          bucketCovers[index] += assignment.partySize;
          break;
        }
      }
    }
  }

  let guestsServed = 0;
  for (const entry of queueEntries) {
    if (SERVED_QUEUE_STATUSES.includes(entry.status) && withinRange(entry.arrivedAt, range)) {
      guestsServed += entry.guestCount;
    }
  }
  for (const reservation of reservations) {
    const servedAt = reservation.arrivedAt ?? reservation.completedAt;
    if (SERVED_RESERVATION_STATUSES.includes(reservation.status) && withinRange(servedAt, range)) {
      guestsServed += reservation.guestCount;
    }
  }

  const waits: number[] = [];
  let joinedInRange = 0;
  let abandoned = 0;
  for (const entry of queueEntries) {
    if (!withinRange(entry.joinedAt, range)) {
      continue;
    }
    joinedInRange += 1;
    if (ABANDONED_QUEUE_STATUSES.includes(entry.status)) {
      abandoned += 1;
    }
    const wait = queueWaitMinutes(entry);
    if (wait !== null) {
      waits.push(wait);
    }
  }

  const turns: number[] = [];
  for (const assignment of seated) {
    const turn = assignmentTurnMinutes(assignment);
    if (turn !== null) {
      turns.push(turn);
    }
  }

  let reservationOutcomes = 0;
  let noShows = 0;
  for (const reservation of reservations) {
    const settledAt = reservation.noShowAt ?? reservation.arrivedAt ?? reservation.completedAt;
    if (!withinRange(settledAt, range)) {
      continue;
    }
    if (reservation.status === "NO_SHOW") {
      noShows += 1;
      reservationOutcomes += 1;
      continue;
    }
    if (SERVED_RESERVATION_STATUSES.includes(reservation.status)) {
      reservationOutcomes += 1;
    }
  }

  const seatedMinutesByTable = new Map<string, number>();
  for (const assignment of seated) {
    const turn = assignmentTurnMinutes(assignment);
    if (turn === null) {
      continue;
    }
    for (const tableId of memberTableIds(assignment)) {
      seatedMinutesByTable.set(tableId, (seatedMinutesByTable.get(tableId) ?? 0) + turn);
    }
  }

  const rangeEnd = Math.min(range.to.getTime(), now.getTime());
  let rangeMinutes = (rangeEnd - range.from.getTime()) / MINUTE_MS;
  if (rangeMinutes <= 0) {
    rangeMinutes = 0;
  }
  if (input.openMinutesForDate) {
    const serviceMinutes = serviceMinutesInRange(range, input.openMinutesForDate, now);
    if (serviceMinutes > 0) {
      rangeMinutes = serviceMinutes;
    }
  }

  const perTableUtilization: TableUtilization[] = tables.map((table) => {
    const seatedMinutes = Math.round(seatedMinutesByTable.get(table.id) ?? 0);
    let utilization = 0;
    if (rangeMinutes > 0) {
      utilization = Math.round((seatedMinutes / rangeMinutes) * 1000) / 1000;
    }
    return { tableId: table.id, tableName: table.name, seatedMinutes, utilization };
  });
  perTableUtilization.sort((a, b) => b.utilization - a.utilization);

  let tableUtilization: number | null = null;
  if (tables.length > 0 && rangeMinutes > 0 && seated.length > 0) {
    let totalSeated = 0;
    for (const entry of perTableUtilization) {
      totalSeated += entry.seatedMinutes;
    }
    tableUtilization = Math.round((totalSeated / (tables.length * rangeMinutes)) * 1000) / 1000;
  }

  const peakServiceTimes = [...peakByHour.entries()]
    .map(([hour, hourCovers]) => ({ hour, covers: hourCovers }))
    .sort((a, b) => a.hour - b.hour);

  let tablesUsed = 0;
  for (const entry of perTableUtilization) {
    if (entry.seatedMinutes > 0) {
      tablesUsed += 1;
    }
  }

  const coverBuckets: CoverBucket[] = buckets.map((bucket, index) => ({
    start: dayKey(bucket.start),
    end: dayKey(new Date(bucket.end.getTime() - 1)),
    covers: bucketCovers[index],
  }));

  let queueActivity = false;
  for (const entry of queueEntries) {
    if (withinRange(entry.joinedAt, range)) {
      queueActivity = true;
      break;
    }
  }

  let reservationActivity = false;
  for (const reservation of reservations) {
    const stamps = [
      reservation.arrivedAt,
      reservation.completedAt,
      reservation.cancelledAt,
      reservation.noShowAt,
    ];
    if (stamps.some((stamp) => withinRange(stamp, range))) {
      reservationActivity = true;
      break;
    }
  }

  let assignmentActivity = seated.length > 0;
  if (!assignmentActivity) {
    for (const assignment of assignments) {
      if (withinRange(assignment.completedAt, range)) {
        assignmentActivity = true;
        break;
      }
    }
  }

  const hasActivity = queueActivity || reservationActivity || assignmentActivity;

  return {
    covers,
    previousCovers,
    coversDelta: covers - previousCovers,
    granularity,
    coverBuckets,
    hasActivity,
    tablesUsed,
    tableCount: tables.length,
    bookedParties: reservationOutcomes,
    noShowCount: noShows,
    guestsServed,
    partiesSeated: seated.length,
    averageQueueWaitMinutes: average(waits),
    averageTableTurnMinutes: average(turns),
    queueAbandonmentRate: ratio(abandoned, joinedInRange),
    reservationNoShowRate: ratio(noShows, reservationOutcomes),
    averagePartySize: average(partySizes),
    reservationCovers,
    walkInCovers,
    tableUtilization,
    perTableUtilization,
    peakServiceTimes,
  };
}

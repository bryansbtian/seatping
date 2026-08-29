export type QueueRow = {
  id?: string;
  firstName: string;
  lastName: string;
  numGuests: number;
  joinedAt: string;
  notificationMethod?: string;
  status?: string;
  [key: string]: any;
};

export type QueueSummary = {
  waiting: number;
  averageWait: number | null;
  longestWait: number | null;
};

export function waitedMinutes(joinedAt: string, now: Date): number | null {
  const joined = new Date(joinedAt);
  if (Number.isNaN(joined.getTime())) {
    return null;
  }
  const elapsed = now.getTime() - joined.getTime();
  if (elapsed < 0) {
    return 0;
  }
  return Math.floor(elapsed / 60000);
}

export function queueSummary(rows: QueueRow[], now: Date): QueueSummary {
  const waits: number[] = [];
  for (const row of rows) {
    const waited = waitedMinutes(row.joinedAt, now);
    if (waited !== null) {
      waits.push(waited);
    }
  }

  let averageWait: number | null = null;
  let longestWait: number | null = null;
  if (waits.length > 0) {
    const total = waits.reduce((sum, value) => sum + value, 0);
    averageWait = Math.round(total / waits.length);
    longestWait = Math.max(...waits);
  }

  return { waiting: rows.length, averageWait, longestWait };
}

export function queueLegacyKey(row: QueueRow): string {
  return `${row.firstName}${row.lastName}${row.joinedAt}`;
}

export function queueFullName(row: QueueRow): string {
  return `${row.firstName} ${row.lastName}`.trim();
}

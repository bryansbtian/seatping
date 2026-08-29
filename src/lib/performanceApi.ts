import { api } from "@/lib/api";

export const PERFORMANCE_PRESETS = ["today", "7d", "30d", "custom"] as const;

export type PerformancePreset = (typeof PERFORMANCE_PRESETS)[number];

export type TableUtilization = {
  tableId: string;
  tableName: string;
  seatedMinutes: number;
  utilization: number;
};

export type Granularity = "daily" | "weekly" | "monthly" | "quarterly";

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

export type PerformanceResponse = {
  range: { preset: PerformancePreset; from: string; to: string };
  metrics: PerformanceMetrics;
};

export type PerformanceQuery = {
  preset: PerformancePreset;
  from?: string;
  to?: string;
};

export function performanceQueryString(query: PerformanceQuery): string {
  const params = new URLSearchParams({ preset: query.preset });
  if (query.preset === "custom" && query.from && query.to) {
    params.set("from", query.from);
    params.set("to", query.to);
  }
  return params.toString();
}

export async function fetchPerformance(
  locationId: string,
  query: PerformanceQuery,
): Promise<PerformanceResponse> {
  return api(`/api/performance/${locationId}?${performanceQueryString(query)}`);
}

export function formatMinutes(value: number | null): string {
  if (value === null) {
    return "--";
  }
  return `${Math.round(value)}m`;
}

export function formatPercent(value: number | null): string {
  if (value === null) {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

export function formatCount(value: number | null): string {
  if (value === null) {
    return "--";
  }
  return String(value);
}

export function formatDuration(value: number | null): string {
  if (value === null) {
    return "--";
  }
  const total = Math.round(value);
  if (total < 60) {
    return `${total}m`;
  }
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

export function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

export function formatDeltaWithPercent(delta: number, previous: number): string {
  const base = formatDelta(delta);
  if (previous <= 0 && delta === 0) {
    return base;
  }

  let percent = 100;
  if (previous > 0) {
    percent = Math.round((delta / previous) * 100);
  }
  if (previous <= 0 && delta < 0) {
    percent = -100;
  }

  let signed = String(percent);
  if (percent > 0) {
    signed = `+${percent}`;
  }
  return `${base} (${signed}%)`;
}

function parseDateKey(dateKey: string): Date | null {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function quarterOf(at: Date): number {
  return Math.floor(at.getMonth() / 3) + 1;
}

export const MIN_BAR_SLOT = 28;

export function bucketGroupSize(
  count: number,
  width: number | null,
  minSlot = MIN_BAR_SLOT,
): number {
  if (!width || width <= 0 || count <= 0) {
    return 1;
  }
  const maxBars = Math.max(1, Math.floor(width / minSlot));
  if (count <= maxBars) {
    return 1;
  }
  return Math.ceil(count / maxBars);
}

export function groupBuckets(buckets: CoverBucket[], size: number): CoverBucket[] {
  if (size <= 1) {
    return buckets;
  }
  const grouped: CoverBucket[] = [];
  for (let index = 0; index < buckets.length; index += size) {
    const slice = buckets.slice(index, index + size);
    let covers = 0;
    for (const bucket of slice) {
      covers += bucket.covers;
    }
    grouped.push({ start: slice[0].start, end: slice[slice.length - 1].end, covers });
  }
  return grouped;
}

export function bucketRangeLabel(bucket: CoverBucket): string {
  const start = parseDateKey(bucket.start);
  if (!start) {
    return bucket.start;
  }
  return start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function bucketRangeTooltip(bucket: CoverBucket): string {
  const start = parseDateKey(bucket.start);
  const end = parseDateKey(bucket.end);
  if (!start || !end) {
    return bucket.start;
  }
  if (bucket.start === bucket.end) {
    return start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  const from = start.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const to = end.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `${from} to ${to}`;
}

export function bucketAxisLabel(bucket: CoverBucket, granularity: Granularity): string {
  const start = parseDateKey(bucket.start);
  if (!start) {
    return bucket.start;
  }
  if (granularity === "daily") {
    return start.toLocaleDateString("en-US", { weekday: "short" });
  }
  if (granularity === "weekly") {
    return start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (granularity === "monthly") {
    return start.toLocaleDateString("en-US", { month: "short" });
  }
  return `Q${quarterOf(start)}`;
}

export function bucketTooltip(bucket: CoverBucket, granularity: Granularity): string {
  const start = parseDateKey(bucket.start);
  const end = parseDateKey(bucket.end);
  if (!start || !end) {
    return bucket.start;
  }
  if (granularity === "daily") {
    return start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  if (granularity === "weekly") {
    const from = start.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const to = end.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    return `${from} to ${to}`;
  }
  if (granularity === "monthly") {
    return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return `Q${quarterOf(start)} ${start.getFullYear()}`;
}

export function formatRangeLabel(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(new Date(toIso).getTime() - 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return "";
  }
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const fromLabel = from.toLocaleDateString("en-US", options);
  const toLabel = to.toLocaleDateString("en-US", options);
  if (fromLabel === toLabel) {
    return fromLabel;
  }
  return `${fromLabel} to ${toLabel}`;
}

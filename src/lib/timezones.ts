// All IANA timezones with a current UTC-offset label, e.g.
// "(UTC+07:00) Asia/Jakarta". Built once at module load, sorted by offset then
// name. Offsets reflect today's date, so they are DST-aware.
//
// The full list comes from Intl.supportedValuesOf("timeZone") (~400 zones) when
// available; otherwise we fall back to a representative set so the selector
// still works on older runtimes.

export type TimezoneOption = { value: string; label: string };

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

// Minutes that `timeZone` is ahead of UTC at `date` (negative = behind UTC).
function offsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  // Intl can emit hour "24" at midnight; normalize to 0.
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

function offsetLabel(min: number): string {
  const sign = min >= 0 ? "+" : "-";
  const abs = Math.abs(min);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${h}:${m}`;
}

// Used only when Intl.supportedValuesOf is unavailable.
const FALLBACK_ZONES = [
  "Pacific/Midway", "Pacific/Honolulu", "America/Anchorage",
  "America/Los_Angeles", "America/Denver", "America/Chicago",
  "America/New_York", "America/Sao_Paulo", "Atlantic/Azores",
  "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Europe/Athens", "Europe/Moscow", "Asia/Dubai", "Asia/Karachi",
  "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok", "Asia/Jakarta",
  "Asia/Singapore", "Asia/Makassar", "Asia/Shanghai", "Asia/Tokyo",
  "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
];

function listZones(): string[] {
  try {
    const supported = (Intl as any).supportedValuesOf;
    if (typeof supported === "function") {
      const zones = supported.call(Intl, "timeZone") as string[];
      if (Array.isArray(zones) && zones.length) return zones;
    }
  } catch {
    /* fall through to fallback */
  }
  return FALLBACK_ZONES;
}

/* ------------------------------------------------------------------ */
/*  Timezone-aware date keys for dashboard analytics                   */
/*                                                                     */
/*  Dashboards must group activity by the *restaurant's* local calendar */
/*  day — not UTC, and not whatever timezone the viewer's browser is in. */
/*  These turn an instant into a "YYYY-MM-DD" key (and a short label) in */
/*  a given IANA timezone, plus pure calendar-math helpers that operate  */
/*  on those keys so day/week bucketing stays DST- and offset-safe.     */
/* ------------------------------------------------------------------ */

/** "YYYY-MM-DD" for an instant, in the given IANA timezone. */
export function getDateKeyInTimezone(
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  try {
    // en-CA renders as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
}

/** Today's "YYYY-MM-DD" in the given timezone. */
export function getTodayKeyInTimezone(
  timezone: string = DEFAULT_TIMEZONE,
): string {
  return getDateKeyInTimezone(new Date(), timezone);
}

/** Hour of day (0–23) for an instant, in the given timezone. */
export function getHourInTimezone(
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): number {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return NaN;
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(d);
    return hour === "24" ? 0 : Number(hour);
  } catch {
    return d.getHours();
  }
}

/**
 * Short "Mon D" label (e.g. "Jun 5") for a date.
 *
 * - If given a "YYYY-MM-DD" key, the calendar date itself is formatted (anchored
 *   at UTC noon so it can never roll to an adjacent day), independent of any
 *   timezone — so a label always matches the key it was built from.
 * - If given an instant (Date / ISO string / epoch), it is formatted in
 *   `timezone`.
 */
export function formatDateLabelInTimezone(
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): string {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
  }
  const dt = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dt.getTime())) return "";
  try {
    return dt.toLocaleDateString("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
    });
  } catch {
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

/** Add `delta` whole days to a "YYYY-MM-DD" key (pure calendar math). */
export function addDaysToDateKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" of the Sunday that starts the week containing `key`. */
export function startOfWeekDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = (() => {
  const now = new Date();
  const withOffset = listZones().map((tz) => {
    let min = 0;
    try {
      min = offsetMinutes(tz, now);
    } catch {
      min = 0;
    }
    return {
      value: tz,
      // Show the full IANA name (underscores → spaces) so similarly-named
      // cities across regions stay unambiguous in one flat list.
      label: `(${offsetLabel(min)}) ${tz.replace(/_/g, " ")}`,
      min,
    };
  });
  withOffset.sort((a, b) => a.min - b.min || a.value.localeCompare(b.value));
  return withOffset.map(({ value, label }) => ({ value, label }));
})();

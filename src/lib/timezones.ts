
export type TimezoneOption = { value: string; label: string };

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

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
  }
  return FALLBACK_ZONES;
}


export function getDateKeyInTimezone(
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE,
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  try {
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

export function getTodayKeyInTimezone(
  timezone: string = DEFAULT_TIMEZONE,
): string {
  return getDateKeyInTimezone(new Date(), timezone);
}

export function getNowWallClockInTimezone(
  timezone: string = DEFAULT_TIMEZONE,
): string {
  const now = new Date();
  const date = getDateKeyInTimezone(now, timezone);
  let hh = "00";
  let mm = "00";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const v: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") v[p.type] = p.value;
    hh = v.hour === "24" ? "00" : (v.hour ?? "00");
    mm = v.minute ?? "00";
  } catch {
    hh = String(now.getHours()).padStart(2, "0");
    mm = String(now.getMinutes()).padStart(2, "0");
  }
  return `${date}T${hh}:${mm}`;
}

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

export function addDaysToDateKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

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
      label: `(${offsetLabel(min)}) ${tz.replace(/_/g, " ")}`,
      min,
    };
  });
  withOffset.sort((a, b) => a.min - b.min || a.value.localeCompare(b.value));
  return withOffset.map(({ value, label }) => ({ value, label }));
})();

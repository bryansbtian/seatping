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

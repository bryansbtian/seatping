export const DEMO_TIMEZONE = "America/New_York";
export const DEMO_DURATION_MINUTES = 15;
export const DEMO_HORIZON_DAYS = 90;
export const DEMO_SLOT_MS = DEMO_DURATION_MINUTES * 60_000;

export type DemoConfirmation = { start: string; end: string; meetLink: string | null };

export function dateInTimezone(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function isDemoSlot(start: Date, now = new Date()): boolean {
  const stamp = start.getTime();
  if (
    !Number.isFinite(stamp) ||
    stamp <= now.getTime() ||
    stamp > now.getTime() + DEMO_HORIZON_DAYS * 86_400_000 ||
    stamp % DEMO_SLOT_MS !== 0
  ) {
    return false;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DEMO_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(start);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return weekday !== "Sat" && weekday !== "Sun" && hour >= 9 && hour < 17;
}

export function monthRange(month: string): { start: Date; end: Date } {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 0)),
    end: new Date(Date.UTC(year, monthNumber, 2)),
  };
}

export function calculateDemoSlots(
  month: string,
  timeZone: string,
  busy: { start: string; end: string }[],
  now = new Date(),
): string[] {
  const range = monthRange(month);
  const intervals = busy.map((item) => ({
    start: Date.parse(item.start),
    end: Date.parse(item.end),
  }));
  const slots: string[] = [];
  const host = new Intl.DateTimeFormat("en-US", {
    timeZone: DEMO_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const visitor = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const first = Math.max(
    range.start.getTime(),
    Math.ceil((now.getTime() + 1) / DEMO_SLOT_MS) * DEMO_SLOT_MS,
  );
  const last = Math.min(range.end.getTime(), now.getTime() + DEMO_HORIZON_DAYS * 86_400_000);
  for (let stamp = first; stamp < last; stamp += DEMO_SLOT_MS) {
    const date = new Date(stamp);
    const parts = host.formatToParts(date);
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    if (weekday === "Sat" || weekday === "Sun" || hour < 9 || hour >= 17) {
      continue;
    }
    const local = visitor.formatToParts(date);
    const localWeekday = local.find((part) => part.type === "weekday")?.value;
    const localMonth = `${local.find((part) => part.type === "year")?.value}-${local.find((part) => part.type === "month")?.value}`;
    if (localMonth !== month || localWeekday === "Sat" || localWeekday === "Sun") {
      continue;
    }
    if (intervals.some((item) => stamp < item.end && stamp + DEMO_SLOT_MS > item.start)) {
      continue;
    }
    slots.push(date.toISOString());
  }
  return slots;
}


import { prisma } from "./prisma.js";
import {
  getDateOperatingStatus,
  isMinuteWithinOperatingHours,
  type DateOperatingStatus,
} from "./operatingHours.js";

export type ConfirmationMode = "auto" | "manual";
export type ContactMethod = "sms" | "whatsapp" | "email";
export type ReservationStatus =
  | "confirmed"
  | "arrived"
  | "completed"
  | "cancelled"
  | "no_show";

export const ACTIVE_STATUSES: ReservationStatus[] = ["confirmed", "arrived"];

export type ReservationSettings = {
  reservationStartTime: string;
  reservationEndTime: string;
  maxPartySize: number;
  maxReservedGuestsPerHour: number;
  bookingWindowDays: number;
  minNoticeMinutes: number;
  confirmationMode: ConfirmationMode;
  cancellationPolicy: string;
};

export const DEFAULT_RESERVATION_SETTINGS: ReservationSettings = {
  reservationStartTime: "11:00",
  reservationEndTime: "22:00",
  maxPartySize: 8,
  maxReservedGuestsPerHour: 40,
  bookingWindowDays: 30,
  minNoticeMinutes: 60,
  confirmationMode: "auto",
  cancellationPolicy: "",
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function validTime(v: any, fallback: string): string {
  if (typeof v === "string" && TIME_RE.test(v)) {
    return v;
  }
  return fallback;
}

export function normalizeSettings(raw: any): ReservationSettings {
  let s: any = {};
  if (raw && typeof raw === "object") {
    s = raw;
  }
  let mode: ConfirmationMode = "auto";
  if (s.confirmationMode === "manual") {
    mode = "manual";
  }
  let cancellationPolicy = "";
  if (typeof s.cancellationPolicy === "string") {
    cancellationPolicy = s.cancellationPolicy.slice(0, 1000);
  }
  return {
    reservationStartTime: validTime(
      s.reservationStartTime,
      DEFAULT_RESERVATION_SETTINGS.reservationStartTime,
    ),
    reservationEndTime: validTime(
      s.reservationEndTime,
      DEFAULT_RESERVATION_SETTINGS.reservationEndTime,
    ),
    maxPartySize: clampInt(s.maxPartySize, 1, 100, DEFAULT_RESERVATION_SETTINGS.maxPartySize),
    maxReservedGuestsPerHour: clampInt(
      s.maxReservedGuestsPerHour,
      1,
      10000,
      DEFAULT_RESERVATION_SETTINGS.maxReservedGuestsPerHour,
    ),
    bookingWindowDays: clampInt(s.bookingWindowDays, 0, 365, DEFAULT_RESERVATION_SETTINGS.bookingWindowDays),
    minNoticeMinutes: clampInt(s.minNoticeMinutes, 0, 7 * 24 * 60, DEFAULT_RESERVATION_SETTINGS.minNoticeMinutes),
    confirmationMode: mode,
    cancellationPolicy,
  };
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function tzOffsetMinutes(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) {
    if (p.type !== "literal") {
      map[p.type] = p.value;
    }
  }
  let hour: number;
  if (map.hour === "24") {
    hour = 0;
  } else {
    hour = Number(map.hour);
  }
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return Math.round((asUTC - at.getTime()) / 60000);
}

export function zonedWallTimeToMs(
  date: string,
  time: string,
  timeZone?: string,
): number {
  if (!timeZone) {
    return new Date(`${date}T${time}:00`).getTime();
  }
  try {
    const [y, mo, d] = date.split("-").map(Number);
    const [h, mi] = time.split(":").map(Number);
    const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
    const off1 = tzOffsetMinutes(timeZone, new Date(utcGuess));
    let ms = utcGuess - off1 * 60000;
    const off2 = tzOffsetMinutes(timeZone, new Date(ms));
    if (off2 !== off1) {
      ms = utcGuess - off2 * 60000;
    }
    return ms;
  } catch {
    return new Date(`${date}T${time}:00`).getTime();
  }
}

export function zonedDateStr(at: Date, timeZone?: string): string {
  if (!timeZone) {
    const y = at.getFullYear();
    const m = String(at.getMonth() + 1).padStart(2, "0");
    const d = String(at.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return zonedDateStr(at);
  }
}

function daysBetweenDateStr(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aMs = Date.UTC(ay, am - 1, ad);
  const bMs = Date.UTC(by, bm - 1, bd);
  return Math.round((bMs - aMs) / 86400000);
}

export function formatTimeLabel(t: string): string {
  const [hStr, mStr] = t.split(":");
  let h = Number(hStr);
  const m = mStr;
  let ampm: string;
  if (h >= 12) {
    ampm = "PM";
  } else {
    ampm = "AM";
  }
  h = h % 12;
  if (h === 0) {
    h = 12;
  }
  return `${h}:${m} ${ampm}`;
}

export function buildReservationDateTime(date: string, time: string): string {
  return `${date}T${time}`;
}

export function splitDateTime(dt: string): { date: string; time: string } {
  const [date, rest] = String(dt || "").split("T");
  const time = (rest || "").slice(0, 5);
  return { date: date || "", time };
}

export type Slot = {
  time: string;
  label: string;
  available: boolean;
  remaining: number;
  reason?: "full" | "too_soon" | "party_too_large" | "closed";
};

function activeGuestsInHour(
  reservations: any[],
  date: string,
  hour: number,
  excludeId?: string,
): number {
  let total = 0;
  for (const r of reservations) {
    if (!r || (excludeId && r.id === excludeId)) {
      continue;
    }
    if (!ACTIVE_STATUSES.includes(r.status)) {
      continue;
    }
    const { date: rDate, time: rTime } = splitDateTime(r.reservationDateTime);
    if (rDate !== date) {
      continue;
    }
    const rHour = Number(rTime.split(":")[0]);
    if (rHour !== hour) {
      continue;
    }
    total += Number(r.partySize) || 0;
  }
  return total;
}

export function computeAvailability(params: {
  settings: ReservationSettings;
  reservations: any[];
  date: string;
  partySize: number;
  now?: Date;
  excludeId?: string;
  timeZone?: string;
  openingHours?: any;
}): {
  slots: Slot[];
  partyTooLarge: boolean;
  outsideWindow: boolean;
  operatingStatus: DateOperatingStatus;
} {
  const { settings, reservations, date, partySize, timeZone, openingHours } = params;
  const now = params.now || new Date();

  const partyTooLarge = partySize > settings.maxPartySize;

  const todayStr = zonedDateStr(now, timeZone);
  let daysAhead = 0;
  if (DATE_RE.test(date)) {
    daysAhead = daysBetweenDateStr(todayStr, date);
  }
  const outsideWindow = daysAhead < 0 || daysAhead > settings.bookingWindowDays;

  const slots: Slot[] = [];
  const operatingStatus = getDateOperatingStatus(openingHours, date);
  if (!DATE_RE.test(date)) {
    return { slots, partyTooLarge, outsideWindow, operatingStatus };
  }

  const startMin = timeToMinutes(settings.reservationStartTime);
  const endMin = timeToMinutes(settings.reservationEndTime);
  const earliestBookableMs = now.getTime() + settings.minNoticeMinutes * 60000;

  if (operatingStatus.isClosed) {
    return { slots, partyTooLarge, outsideWindow, operatingStatus };
  }

  for (let m = startMin; m < endMin; m += 30) {
    if (!isMinuteWithinOperatingHours(operatingStatus, m)) {
      continue;
    }
    const time = minutesToTime(m);
    const hour = Math.floor(m / 60);
    const used = activeGuestsInHour(reservations, date, hour, params.excludeId);
    const remaining = Math.max(0, settings.maxReservedGuestsPerHour - used);

    const slotMs = zonedWallTimeToMs(date, time, timeZone);
    let available = true;
    let reason: Slot["reason"];

    if (partyTooLarge) {
      available = false;
      reason = "party_too_large";
    } else if (outsideWindow) {
      available = false;
      reason = "closed";
    } else if (slotMs < earliestBookableMs) {
      available = false;
      reason = "too_soon";
    } else if (used + partySize > settings.maxReservedGuestsPerHour) {
      available = false;
      reason = "full";
    }

    slots.push({ time, label: formatTimeLabel(time), available, remaining, reason });
  }

  return { slots, partyTooLarge, outsideWindow, operatingStatus };
}

export function validateReservationRequest(params: {
  settings: ReservationSettings;
  reservations: any[];
  date: string;
  time: string;
  partySize: number;
  now?: Date;
  excludeId?: string;
  timeZone?: string;
  openingHours?: any;
}): string | null {
  const { settings, reservations, date, time, partySize, timeZone, openingHours } = params;
  const now = params.now || new Date();

  if (!DATE_RE.test(date)) {
    return "A valid date is required.";
  }
  if (!TIME_RE.test(time)) {
    return "A valid time is required.";
  }
  if (!Number.isInteger(partySize) || partySize < 1) {
    return "Number of guests must be at least 1.";
  }
  if (partySize > settings.maxPartySize) {
    return `This restaurant accepts parties of up to ${settings.maxPartySize}.`;
  }

  const { slots, outsideWindow, operatingStatus } = computeAvailability({
    settings,
    reservations,
    date,
    partySize,
    now,
    excludeId: params.excludeId,
    timeZone,
    openingHours,
  });
  if (outsideWindow) {
    return `Reservations can only be made up to ${settings.bookingWindowDays} days in advance.`;
  }
  if (operatingStatus.isClosed) {
    return `This restaurant is closed on ${operatingStatus.dayName || "this date"}.`;
  }

  const slot = slots.find((s) => s.time === time);
  if (!slot) {
    if (operatingStatus.configured) {
      return "That time is outside the restaurant's operating hours.";
    }
    return "That time is outside reservation hours.";
  }
  if (slot.available) {
    return null;
  }

  switch (slot.reason) {
    case "too_soon":
      return `Reservations require at least ${settings.minNoticeMinutes} minutes notice.`;
    case "full":
      return `${formatTimeLabel(time)} is fully booked. Please choose another time.`;
    case "closed":
      return "That time is not available for reservations.";
    default:
      return "That time is no longer available.";
  }
}

export function serializeReservation(r: any, opts: { includeToken?: boolean } = {}) {
  const base = {
    id: r.id,
    locationId: r.locationId ?? null,
    businessUsername: r.businessUsername ?? null,
    firstName: r.firstName ?? "",
    lastName: r.lastName ?? "",
    name: r.name ?? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
    contactMethod: r.contactMethod ?? null,
    phone: r.phone ?? "",
    countryCode: r.countryCode ?? "",
    email: r.email ?? "",
    partySize: Number(r.partySize) || 0,
    reservationDateTime: r.reservationDateTime ?? null,
    notes: r.notes ?? "",
    status: r.status ?? "confirmed",
    source: r.source ?? "seatping_public",
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
    cancelledAt: r.cancelledAt ?? null,
    arrivedAt: r.arrivedAt ?? null,
    completedAt: r.completedAt ?? null,
    noShowAt: r.noShowAt ?? null,
  };
  if (opts.includeToken) {
    return { ...base, manageToken: r.manageToken ?? null };
  }
  return base;
}

export async function syncCustomerReservation(
  reservation: any,
  opts: { businessName?: string | null; locationName?: string | null } = {},
): Promise<void> {
  if (!reservation?.customerId) {
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: reservation.customerId },
    select: { upcomingReservations: true, pastReservations: true },
  });
  if (!user) {
    return;
  }

  const { date, time } = splitDateTime(reservation.reservationDateTime);
  const entry = {
    id: reservation.id,
    manageToken: reservation.manageToken ?? null,
    locationId: reservation.locationId ?? null,
    businessUsername: reservation.businessUsername ?? null,
    businessName: opts.businessName ?? null,
    locationName: opts.locationName ?? null,
    date,
    time,
    people: Number(reservation.partySize) || 0,
    status: reservation.status,
    createdAt: reservation.createdAt ?? null,
  };

  const active = ACTIVE_STATUSES.includes(reservation.status);
  let upcomingSource: any[] = [];
  if (Array.isArray(user.upcomingReservations)) {
    upcomingSource = user.upcomingReservations as any[];
  }
  let pastSource: any[] = [];
  if (Array.isArray(user.pastReservations)) {
    pastSource = user.pastReservations as any[];
  }
  const upcoming = upcomingSource.filter((r) => r?.id !== reservation.id);
  const past = pastSource.filter((r) => r?.id !== reservation.id);

  if (active) {
    upcoming.unshift(entry);
  }
  else {
    past.unshift(entry);
  }

  await prisma.user.update({
    where: { id: reservation.customerId },
    data: {
      upcomingReservations: upcoming as any,
      pastReservations: past as any,
    },
  });
}

import type { QueueEntry, Reservation } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  getLocationTimezone,
  getNowWallClockInTimezone,
  DEFAULT_LOCATION_TIMEZONE,
} from "./operatingHours.js";

export const RETURNING_THRESHOLD = 2;

export const SUGGESTED_GUEST_TAGS = [
  "VIP",
  "Regular",
  "Allergy",
  "Prefers Window Seat",
  "High Spender",
  "Needs Follow-Up",
];

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") {
    return null;
  }
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return null;
  }
  return trimmed;
}

const MIN_PHONE_DIGITS = 6;
const MIN_NATIONAL_DIGITS = 5;

export function normalizePhone(phone: unknown, countryCode?: unknown): string | null {
  let countryCodeDigits = "";
  if (typeof countryCode === "string") {
    countryCodeDigits = countryCode.replace(/\D+/g, "");
  }
  let nationalDigits = "";
  if (typeof phone === "string") {
    nationalDigits = phone.replace(/\D+/g, "");
  }
  nationalDigits = nationalDigits.replace(/^0+/, "");
  if (!nationalDigits) {
    return null;
  }
  if (countryCodeDigits && nationalDigits.startsWith(countryCodeDigits)) {
    const withoutCountryCode = nationalDigits.slice(countryCodeDigits.length);
    if (withoutCountryCode.length >= MIN_NATIONAL_DIGITS) {
      nationalDigits = withoutCountryCode;
    }
  }
  const digits = `${countryCodeDigits}${nationalDigits}`;
  if (digits.length < MIN_PHONE_DIGITS) {
    return null;
  }
  return digits;
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const m: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      m[p.type] = p.value;
    }
  }
  let hour: number;
  if (m.hour === "24") {
    hour = 0;
  } else {
    hour = Number(m.hour);
  }
  const asUtc = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    hour,
    Number(m.minute),
    Number(m.second),
  );
  return asUtc - instant.getTime();
}

function zonedWallClockToUtc(wallClock: string | null | undefined, timeZone: string): Date | null {
  if (!wallClock) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(wallClock)) {
    const d = new Date(wallClock);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d;
  }
  const naive = Date.parse(`${wallClock.slice(0, 16)}:00Z`);
  if (Number.isNaN(naive)) {
    return null;
  }
  const offset = tzOffsetMs(new Date(naive), timeZone);
  return new Date(naive - offset);
}

function formatVisitDate(d: Date | null, timeZone?: string): string | null {
  if (!d) {
    return null;
  }
  const dateFormatOptions: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
  };
  if (timeZone) {
    dateFormatOptions.timeZone = timeZone;
  }
  try {
    return d.toLocaleDateString("en-US", dateFormatOptions);
  } catch {
    return null;
  }
}

function modePartySize(sizes: number[]): number | null {
  const counts = new Map<number, number>();
  for (const s of sizes) {
    if (!Number.isFinite(s) || s <= 0) {
      continue;
    }
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [size, count] of counts) {
    if (count > bestCount) {
      best = size;
      bestCount = count;
    }
  }
  return best;
}

export type GuestStats = {
  totalVisits: number;
  waitlistVisitCount: number;
  upcomingReservationCount: number;
  pastReservationCount: number;
  noShowCount: number;
  cancelledCount: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  typicalPartySize: number | null;
};

export function computeStats(
  queueRows: QueueEntry[],
  reservationRows: Reservation[],
  timezone: string = DEFAULT_LOCATION_TIMEZONE,
): GuestStats {
  const now = Date.now();
  const nowLocal = getNowWallClockInTimezone(timezone);
  const partySizes: number[] = [];
  const completedVisitDates: Date[] = [];

  let waitlistVisitCount = 0;
  let queueNoShows = 0;
  for (const q of queueRows) {
    if (q.status === "NO_SHOW") {
      queueNoShows += 1;
    }
    if (typeof q.guestCount === "number") {
      partySizes.push(q.guestCount);
    }
    if (q.status === "ARRIVED") {
      waitlistVisitCount += 1;
      if (q.joinedAt) {
        const joined = new Date(q.joinedAt);
        if (joined.getTime() <= now) {
          completedVisitDates.push(joined);
        }
      }
    }
  }

  let upcoming = 0;
  let past = 0;
  let resNoShow = 0;
  let cancelled = 0;
  for (const r of reservationRows) {
    if (typeof r.guestCount === "number") {
      partySizes.push(r.guestCount);
    }
    const alreadyHappened =
      !!r.reservationDateTime && r.reservationDateTime.slice(0, 16) <= nowLocal;
    switch (r.status) {
      case "CANCELLED":
        cancelled += 1;
        break;
      case "NO_SHOW":
        resNoShow += 1;
        break;
      case "COMPLETED":
      case "ARRIVED": {
        past += 1;
        const instant = zonedWallClockToUtc(r.reservationDateTime, timezone);
        if (instant && alreadyHappened) {
          completedVisitDates.push(instant);
        }
        break;
      }
      default: {
        if (!alreadyHappened) {
          upcoming += 1;
        } else {
          past += 1;
        }
      }
    }
  }

  const totalVisits = waitlistVisitCount + past;

  const sorted = completedVisitDates.sort((a, b) => a.getTime() - b.getTime());
  let lastVisit: Date | null = null;
  if (sorted.length) {
    lastVisit = sorted[sorted.length - 1];
  }
  return {
    totalVisits,
    waitlistVisitCount,
    upcomingReservationCount: upcoming,
    pastReservationCount: past,
    noShowCount: queueNoShows + resNoShow,
    cancelledCount: cancelled,
    firstVisitAt: sorted[0] ?? null,
    lastVisitAt: lastVisit,
    typicalPartySize: modePartySize(partySizes),
  };
}

export function buildSummary(stats: GuestStats, timeZone?: string): string {
  if (stats.totalVisits <= 0) {
    return "New guest. More history will appear after future visits.";
  }
  const parts: string[] = [];
  if (stats.totalVisits === 1) {
    parts.push("New guest with 1 visit.");
  } else {
    parts.push(`Returning guest with ${stats.totalVisits} visits.`);
  }
  if (stats.typicalPartySize) {
    let people = "people";
    if (stats.typicalPartySize === 1) {
      people = "person";
    }
    parts.push(`Usually books for ${stats.typicalPartySize} ${people}.`);
  }
  const last = formatVisitDate(stats.lastVisitAt, timeZone);
  if (last) {
    parts.push(`Last visited on ${last}.`);
  }
  if (stats.upcomingReservationCount > 0) {
    let reservationSuffix = "s";
    if (stats.upcomingReservationCount === 1) {
      reservationSuffix = "";
    }
    parts.push(`Has ${stats.upcomingReservationCount} upcoming reservation${reservationSuffix}.`);
  }
  if (stats.noShowCount > 0) {
    let noShowSuffix = "s";
    if (stats.noShowCount === 1) {
      noShowSuffix = "";
    }
    parts.push(`Has ${stats.noShowCount} no-show${noShowSuffix}.`);
  }
  return parts.join(" ");
}

export function isReturning(totalVisits: number): boolean {
  return totalVisits >= RETURNING_THRESHOLD;
}

export async function recomputeGuestStats(guestId: string): Promise<void> {
  const guest = await prisma.guestProfile.findUnique({ where: { id: guestId } });
  if (!guest) {
    return;
  }

  let queueRowsPromise: Promise<QueueEntry[]> = Promise.resolve([] as QueueEntry[]);
  if (guest.sourceQueueEntryIds.length) {
    queueRowsPromise = prisma.queueEntry.findMany({
      where: { id: { in: guest.sourceQueueEntryIds } },
    });
  }
  let reservationRowsPromise: Promise<Reservation[]> = Promise.resolve([] as Reservation[]);
  if (guest.sourceReservationIds.length) {
    reservationRowsPromise = prisma.reservation.findMany({
      where: { id: { in: guest.sourceReservationIds } },
    });
  }

  const [queueRows, reservationRows, location] = await Promise.all([
    queueRowsPromise,
    reservationRowsPromise,
    prisma.location.findUnique({
      where: { id: guest.locationId },
      select: { restaurantProfile: true },
    }),
  ]);

  const timeZone = getLocationTimezone(location);
  const stats = computeStats(queueRows, reservationRows, timeZone);
  await prisma.guestProfile.update({
    where: { id: guest.id },
    data: {
      totalVisits: stats.totalVisits,
      waitlistVisitCount: stats.waitlistVisitCount,
      upcomingReservationCount: stats.upcomingReservationCount,
      pastReservationCount: stats.pastReservationCount,
      noShowCount: stats.noShowCount,
      cancelledCount: stats.cancelledCount,
      firstVisitAt: stats.firstVisitAt,
      lastVisitAt: stats.lastVisitAt,
      summary: buildSummary(stats, timeZone),
    },
  });
}

type VisitInput = {
  businessId: string;
  businessUsername?: string | null;
  locationId: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  email?: string | null;
  queueEntryId?: string | null;
  reservationId?: string | null;
};

export async function upsertGuestForVisit(input: VisitInput): Promise<string | null> {
  const normalizedPhone = normalizePhone(input.phone, input.countryCode);
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedPhone && !normalizedEmail) {
    return null;
  }

  const or: any[] = [];
  if (normalizedPhone) {
    or.push({ normalizedPhone });
  }
  if (normalizedEmail) {
    or.push({ normalizedEmail });
  }

  const existing = await prisma.guestProfile.findFirst({
    where: { businessId: input.businessId, locationId: input.locationId, OR: or },
    orderBy: { createdAt: "asc" },
  });

  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  let guestId: string;
  if (!existing) {
    let sourceQueueEntryIds: string[] = [];
    if (input.queueEntryId) {
      sourceQueueEntryIds = [input.queueEntryId];
    }
    let sourceReservationIds: string[] = [];
    if (input.reservationId) {
      sourceReservationIds = [input.reservationId];
    }
    const created = await prisma.guestProfile.create({
      data: {
        businessId: input.businessId,
        businessUsername: input.businessUsername ?? null,
        locationId: input.locationId,
        firstName,
        lastName,
        fullName,
        phone: input.phone || null,
        email: input.email || null,
        normalizedPhone,
        normalizedEmail,
        sourceQueueEntryIds,
        sourceReservationIds,
      },
    });
    guestId = created.id;
  } else {
    const sourceQueueEntryIds = mergeId(existing.sourceQueueEntryIds, input.queueEntryId);
    const sourceReservationIds = mergeId(existing.sourceReservationIds, input.reservationId);
    await prisma.guestProfile.update({
      where: { id: existing.id },
      data: {
        firstName: existing.firstName ?? firstName,
        lastName: existing.lastName ?? lastName,
        fullName: existing.fullName ?? fullName,
        phone: existing.phone ?? input.phone ?? null,
        email: existing.email ?? input.email ?? null,
        normalizedPhone: existing.normalizedPhone ?? normalizedPhone,
        normalizedEmail: existing.normalizedEmail ?? normalizedEmail,
        businessUsername: existing.businessUsername ?? input.businessUsername ?? null,
        sourceQueueEntryIds,
        sourceReservationIds,
      },
    });
    guestId = existing.id;
  }

  await recomputeGuestStats(guestId);
  return guestId;
}

function mergeId(list: string[], id?: string | null): string[] {
  if (!id) {
    return list;
  }
  if (list.includes(id)) {
    return list;
  }
  return [...list, id];
}

export async function syncGuestFromQueueEntry(
  entry: QueueEntry,
  opts: { businessUsername?: string | null } = {},
): Promise<void> {
  try {
    await upsertGuestForVisit({
      businessId: entry.businessId,
      businessUsername: opts.businessUsername ?? null,
      locationId: entry.locationId,
      firstName: entry.firstName,
      lastName: entry.lastName,
      phone: entry.phone,
      countryCode: entry.countryCode,
      email: entry.email,
      queueEntryId: entry.id,
    });
  } catch (err: any) {
    console.error("[guests] syncGuestFromQueueEntry failed:", err?.message || err);
  }
}

export async function syncGuestFromReservation(
  row: Reservation,
  opts: { businessUsername?: string | null } = {},
): Promise<void> {
  try {
    await upsertGuestForVisit({
      businessId: row.businessId,
      businessUsername: opts.businessUsername ?? row.businessUsername ?? null,
      locationId: row.locationId,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      countryCode: row.countryCode,
      email: row.email,
      reservationId: row.id,
    });
  } catch (err: any) {
    console.error("[guests] syncGuestFromReservation failed:", err?.message || err);
  }
}

export async function touchGuestByQueueEntryId(entryId: string): Promise<void> {
  try {
    const guest = await prisma.guestProfile.findFirst({
      where: { sourceQueueEntryIds: { has: entryId } },
      select: { id: true },
    });
    if (guest) {
      await recomputeGuestStats(guest.id);
    }
  } catch (err: any) {
    console.error("[guests] touchGuestByQueueEntryId failed:", err?.message || err);
  }
}

export async function touchGuestByReservationId(reservationId: string): Promise<void> {
  try {
    const guest = await prisma.guestProfile.findFirst({
      where: { sourceReservationIds: { has: reservationId } },
      select: { id: true },
    });
    if (guest) {
      await recomputeGuestStats(guest.id);
    }
  } catch (err: any) {
    console.error("[guests] touchGuestByReservationId failed:", err?.message || err);
  }
}

export type GuestBadge = { totalVisits: number; returning: boolean };

export async function loadGuestBadgeMap(businessId: string): Promise<Map<string, GuestBadge>> {
  const guests = await prisma.guestProfile.findMany({
    where: { businessId },
    select: {
      normalizedPhone: true,
      normalizedEmail: true,
      totalVisits: true,
    },
  });
  const map = new Map<string, GuestBadge>();
  for (const g of guests) {
    const badge: GuestBadge = {
      totalVisits: g.totalVisits,
      returning: isReturning(g.totalVisits),
    };
    if (g.normalizedPhone) {
      map.set(`p:${g.normalizedPhone}`, badge);
    }
    if (g.normalizedEmail) {
      map.set(`e:${g.normalizedEmail}`, badge);
    }
  }
  return map;
}

export function badgeForContact(
  map: Map<string, GuestBadge>,
  contact: { phone?: string | null; countryCode?: string | null; email?: string | null },
): GuestBadge | null {
  const np = normalizePhone(contact.phone, contact.countryCode);
  const ne = normalizeEmail(contact.email);
  if (np && map.has(`p:${np}`)) {
    return map.get(`p:${np}`)!;
  }
  if (ne && map.has(`e:${ne}`)) {
    return map.get(`e:${ne}`)!;
  }
  return null;
}

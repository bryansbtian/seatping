// server/lib/guests.ts
//
// Guest CRM (Phase 3 / P3A). A GuestProfile is the business-facing record of a
// repeat customer at one location. Profiles are built automatically from the
// two places a customer identifies themselves: joining the waitlist
// (QueueEntry) and creating a reservation (Reservation). The same real person
// is matched/merged by NORMALIZED phone and/or email so they don't get
// duplicate profiles.
//
// Design notes:
//   - A profile only stores identity + business-owned data (tags, notes) plus
//     DENORMALIZED counts/dates and the list of source row ids it aggregates.
//   - All counts/dates/summary are RECOMPUTED from the referenced source rows
//     (recomputeGuestStats) rather than incremented in place, so they can never
//     drift and a status change on a source row (no-show, cancel, complete)
//     flows through the moment we "touch" the guest.
//   - Every query is scoped by businessId. Callers must pass the authenticated
//     business's id; nothing here trusts client input for scoping.
import type { QueueEntry, Reservation, GuestProfile } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  getLocationTimezone,
  getNowWallClockInTimezone,
  DEFAULT_LOCATION_TIMEZONE,
} from "./operatingHours.js";

// A guest with >= this many visit records is considered "Returning". Below it,
// "New". Kept in one place so the badge, the filter, and the summary agree.
export const RETURNING_THRESHOLD = 2;

// Built-in tag suggestions surfaced in the UI. "New"/"Returning" are derived
// (not stored), so they are intentionally NOT in this list.
export const SUGGESTED_GUEST_TAGS = [
  "VIP",
  "Regular",
  "Allergy",
  "Prefers Window Seat",
  "High Spender",
  "Needs Follow-Up",
];

// ---------------------------------------------------------------------------
// Normalization — the merge keys
// ---------------------------------------------------------------------------

/** Lowercase + trim an email, or null if it isn't a usable address. */
export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}

/**
 * Digits-only phone (country code + number), or null when there's nothing
 * usable. A leading "00" international prefix is dropped so "+1 555..." and
 * "0015 55..." normalize the same. We deliberately keep this simple and
 * deterministic rather than locale-parsing — the goal is a stable merge key.
 */
export function normalizePhone(
  phone: unknown,
  countryCode?: unknown,
): string | null {
  const raw = `${typeof countryCode === "string" ? countryCode : ""}${
    typeof phone === "string" ? phone : ""
  }`;
  let digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  digits = digits.replace(/^0+/, "");
  if (digits.length < 6) return null; // too short to be a real number
  return digits;
}

// ---------------------------------------------------------------------------
// Stats recompute + summary
// ---------------------------------------------------------------------------

/** Parse the naive "YYYY-MM-DDTHH:MM" wall-clock string into a Date (or null). */
/** Offset (timezone - UTC) in ms for an instant in the given IANA timezone. */
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
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    m.hour === "24" ? 0 : Number(m.hour),
    Number(m.minute),
    Number(m.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Convert a naive local wall-clock "YYYY-MM-DDTHH:MM" (in `timeZone`) to a real
 * UTC instant. So a reservation booked for 8pm Jakarta becomes the correct
 * absolute moment, and first/last-visit dates are stored as true instants that
 * format back to the right local date in any timezone.
 */
function zonedWallClockToUtc(
  wallClock: string | null | undefined,
  timeZone: string,
): Date | null {
  if (!wallClock) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(wallClock)) {
    const d = new Date(wallClock);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const naive = Date.parse(`${wallClock.slice(0, 16)}:00Z`);
  if (Number.isNaN(naive)) return null;
  const offset = tzOffsetMs(new Date(naive), timeZone);
  return new Date(naive - offset);
}

function formatVisitDate(d: Date | null, timeZone?: string): string | null {
  if (!d) return null;
  try {
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return null;
  }
}

/** Most common party size across the supplied counts, or null. */
function modePartySize(sizes: number[]): number | null {
  const counts = new Map<number, number>();
  for (const s of sizes) {
    if (!Number.isFinite(s) || s <= 0) continue;
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

/** Aggregate stats from a guest's source queue + reservation rows. */
export function computeStats(
  queueRows: QueueEntry[],
  reservationRows: Reservation[],
  timezone: string = DEFAULT_LOCATION_TIMEZONE,
): GuestStats {
  const now = Date.now();
  // "Now" in the location's own timezone, as a naive wall-clock string. A
  // completed visit can never be later than this — a visit dated in the
  // location's future hasn't happened yet, so it must not become "Last Visit".
  const nowLocal = getNowWallClockInTimezone(timezone);
  const partySizes: number[] = [];
  // First/Last "visit" dates are COMPLETED visits only: a guest who actually
  // showed up, and only up to the location's current local time. No-shows,
  // cancellations, still-upcoming bookings, and future-dated rows are excluded
  // so "Last Visit" never points at a no-show or a future date.
  const completedVisitDates: Date[] = [];

  // "Waitlist" counts only the waitlist guests who were admitted/arrived (i.e.
  // actually showed up) — not no-shows or people who left. So it's a real
  // visit count and Total Visits = Waitlist + Past Reservations adds up.
  let waitlistVisitCount = 0;
  let queueNoShows = 0;
  for (const q of queueRows) {
    if (q.status === "NO_SHOW") queueNoShows += 1;
    if (typeof q.guestCount === "number") partySizes.push(q.guestCount);
    if (q.status === "ARRIVED") {
      waitlistVisitCount += 1;
      // Arrived waitlist visits feed first/last visit dates once they've passed.
      if (q.joinedAt) {
        const joined = new Date(q.joinedAt);
        if (joined.getTime() <= now) completedVisitDates.push(joined);
      }
    }
  }

  let upcoming = 0;
  let past = 0;
  let resNoShow = 0;
  let cancelled = 0;
  for (const r of reservationRows) {
    if (typeof r.guestCount === "number") partySizes.push(r.guestCount);
    // Has this reservation's local wall-clock time already passed for the
    // location? Compares the stored "YYYY-MM-DDTHH:MM" against the location's
    // current local time in the same frame.
    const alreadyHappened =
      !!r.reservationDateTime &&
      r.reservationDateTime.slice(0, 16) <= nowLocal;
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
        // Showed up → feeds first/last visit dates only once its time has
        // actually passed in the location's timezone. Store the true UTC
        // instant (converted from the local wall-clock) so the date renders
        // correctly in the location's timezone later.
        const instant = zonedWallClockToUtc(r.reservationDateTime, timezone);
        if (instant && alreadyHappened) completedVisitDates.push(instant);
        break;
      }
      default: {
        // PENDING / CONFIRMED — upcoming if its local time hasn't passed in the
        // location's timezone yet, otherwise it has already happened (the
        // business just never marked it complete).
        if (!alreadyHappened) upcoming += 1;
        else past += 1;
      }
    }
  }

  // Total Visits = admitted/arrived waitlist visits + past reservations.
  // Drives New vs Returning and the "N visits" summary. (No-shows, cancelled,
  // left-the-queue, and still-upcoming bookings are NOT visits.)
  const totalVisits = waitlistVisitCount + past;

  const sorted = completedVisitDates.sort((a, b) => a.getTime() - b.getTime());
  return {
    totalVisits,
    waitlistVisitCount,
    upcomingReservationCount: upcoming,
    pastReservationCount: past,
    noShowCount: queueNoShows + resNoShow,
    cancelledCount: cancelled,
    firstVisitAt: sorted[0] ?? null,
    lastVisitAt: sorted.length ? sorted[sorted.length - 1] : null,
    typicalPartySize: modePartySize(partySizes),
  };
}

/**
 * Deterministic, safe guest summary built only from real history (no external
 * AI). Falls back to a graceful message when there isn't enough data.
 */
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
    const people = stats.typicalPartySize === 1 ? "person" : "people";
    parts.push(`Usually books for ${stats.typicalPartySize} ${people}.`);
  }
  const last = formatVisitDate(stats.lastVisitAt, timeZone);
  if (last) parts.push(`Last visited on ${last}.`);
  if (stats.upcomingReservationCount > 0) {
    parts.push(
      `Has ${stats.upcomingReservationCount} upcoming reservation${
        stats.upcomingReservationCount === 1 ? "" : "s"
      }.`,
    );
  }
  if (stats.noShowCount > 0) {
    parts.push(
      `Has ${stats.noShowCount} no-show${stats.noShowCount === 1 ? "" : "s"}.`,
    );
  }
  return parts.join(" ");
}

/** True when the guest's visit count makes them a repeat/"Returning" guest. */
export function isReturning(totalVisits: number): boolean {
  return totalVisits >= RETURNING_THRESHOLD;
}

/**
 * Reload a guest's source rows and rewrite its denormalized stats + summary.
 * No-op if the guest no longer exists. Safe to call repeatedly.
 */
export async function recomputeGuestStats(guestId: string): Promise<void> {
  const guest = await prisma.guestProfile.findUnique({ where: { id: guestId } });
  if (!guest) return;

  const [queueRows, reservationRows, location] = await Promise.all([
    guest.sourceQueueEntryIds.length
      ? prisma.queueEntry.findMany({
          where: { id: { in: guest.sourceQueueEntryIds } },
        })
      : Promise.resolve([] as QueueEntry[]),
    guest.sourceReservationIds.length
      ? prisma.reservation.findMany({
          where: { id: { in: guest.sourceReservationIds } },
        })
      : Promise.resolve([] as Reservation[]),
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

// ---------------------------------------------------------------------------
// Upsert / merge
// ---------------------------------------------------------------------------

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

/**
 * Find-or-create the guest profile for a visit, merge in any newly-available
 * identity, attach the source row id, then recompute stats. Returns the guest
 * id, or null when there's no contact info to track by (no phone, no email).
 *
 * Matching is scoped to (businessId, locationId) and done on normalized
 * phone/email: match by either key, preferring an existing row that already has
 * one of them. This keeps the same person to one profile per location while
 * never leaking across businesses.
 */
export async function upsertGuestForVisit(
  input: VisitInput,
): Promise<string | null> {
  const normalizedPhone = normalizePhone(input.phone, input.countryCode);
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedPhone && !normalizedEmail) return null;

  const or: any[] = [];
  if (normalizedPhone) or.push({ normalizedPhone });
  if (normalizedEmail) or.push({ normalizedEmail });

  const existing = await prisma.guestProfile.findFirst({
    where: { businessId: input.businessId, locationId: input.locationId, OR: or },
    orderBy: { createdAt: "asc" },
  });

  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  let guestId: string;
  if (!existing) {
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
        sourceQueueEntryIds: input.queueEntryId ? [input.queueEntryId] : [],
        sourceReservationIds: input.reservationId ? [input.reservationId] : [],
      },
    });
    guestId = created.id;
  } else {
    const sourceQueueEntryIds = mergeId(
      existing.sourceQueueEntryIds,
      input.queueEntryId,
    );
    const sourceReservationIds = mergeId(
      existing.sourceReservationIds,
      input.reservationId,
    );
    await prisma.guestProfile.update({
      where: { id: existing.id },
      data: {
        // Fill in identity/contact only when newly available — never clobber
        // good data with blanks from a later sparse visit.
        firstName: existing.firstName ?? firstName,
        lastName: existing.lastName ?? lastName,
        fullName: existing.fullName ?? fullName,
        phone: existing.phone ?? input.phone ?? null,
        email: existing.email ?? input.email ?? null,
        normalizedPhone: existing.normalizedPhone ?? normalizedPhone,
        normalizedEmail: existing.normalizedEmail ?? normalizedEmail,
        businessUsername:
          existing.businessUsername ?? input.businessUsername ?? null,
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
  if (!id) return list;
  return list.includes(id) ? list : [...list, id];
}

// ---------------------------------------------------------------------------
// Sync entry points (called from the queue + reservation write paths)
// ---------------------------------------------------------------------------

/** Build/refresh the guest profile for a queue entry. Never throws. */
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

/** Build/refresh the guest profile for a reservation. Never throws. */
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

/**
 * Recompute the profile that already references this queue entry (after a
 * status change). No-op if no profile references it yet. Never throws.
 */
export async function touchGuestByQueueEntryId(entryId: string): Promise<void> {
  try {
    const guest = await prisma.guestProfile.findFirst({
      where: { sourceQueueEntryIds: { has: entryId } },
      select: { id: true },
    });
    if (guest) await recomputeGuestStats(guest.id);
  } catch (err: any) {
    console.error("[guests] touchGuestByQueueEntryId failed:", err?.message || err);
  }
}

/** Same as above for a reservation id. Never throws. */
export async function touchGuestByReservationId(
  reservationId: string,
): Promise<void> {
  try {
    const guest = await prisma.guestProfile.findFirst({
      where: { sourceReservationIds: { has: reservationId } },
      select: { id: true },
    });
    if (guest) await recomputeGuestStats(guest.id);
  } catch (err: any) {
    console.error("[guests] touchGuestByReservationId failed:", err?.message || err);
  }
}

// ---------------------------------------------------------------------------
// Dashboard "Returning" badge support
// ---------------------------------------------------------------------------

export type GuestBadge = { totalVisits: number; returning: boolean };

/**
 * Build a lookup of normalized-contact -> visit info for one business, so the
 * dashboard can stamp a "Returning"/"New" badge onto each live queue/reservation
 * row. Keyed by "p:<phone>" and "e:<email>" so a row matches on either contact.
 * Detection comes from the stored profile (totalVisits), not client guessing.
 */
export async function loadGuestBadgeMap(
  businessId: string,
): Promise<Map<string, GuestBadge>> {
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
    if (g.normalizedPhone) map.set(`p:${g.normalizedPhone}`, badge);
    if (g.normalizedEmail) map.set(`e:${g.normalizedEmail}`, badge);
  }
  return map;
}

/** Resolve the badge for a legacy customer/reservation object via its contact. */
export function badgeForContact(
  map: Map<string, GuestBadge>,
  contact: { phone?: string | null; countryCode?: string | null; email?: string | null },
): GuestBadge | null {
  const np = normalizePhone(contact.phone, contact.countryCode);
  const ne = normalizeEmail(contact.email);
  if (np && map.has(`p:${np}`)) return map.get(`p:${np}`)!;
  if (ne && map.has(`e:${ne}`)) return map.get(`e:${ne}`)!;
  return null;
}

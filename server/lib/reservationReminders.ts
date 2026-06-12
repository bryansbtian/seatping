// server/lib/reservationReminders.ts
//
// Sends a one-time "your reservation is in ~2 hours" reminder to customers.
//
// Queries the Reservation model (status CONFIRMED + reminderEmailSentAt unset).
// Dedup state (`reminderEmailSentAt`) is persisted on each reservation row, so
// the job is safe across restarts: a reminder is only ever sent once, and a
// crash mid-run simply retries next tick.
//
// This is intentionally a poll (not a per-reservation setTimeout) so it survives
// process restarts. On a long-lived server it runs from the setInterval in
// server/index.ts; on Vercel it is driven by a QStash Schedule hitting
// /api/cron/reservation-reminders (see scripts/setup-qstash-schedules.ts).
//
// Timezone note: reservation datetimes are stored as naive local wall-clock
// strings (`YYYY-MM-DDTHH:MM`, no offset) — the restaurant's local clock is the
// source of truth. To decide when a reservation is "~2 hours away" we must
// anchor that wall-clock time to a real instant using the *restaurant's* IANA
// timezone (e.g. Asia/Jakarta), not the server's clock — otherwise the reminder
// fires relative to wherever the server happens to run.

import { prisma } from "./prisma.js";
import {
  splitDateTime,
  formatTimeLabel,
  zonedWallTimeToMs,
} from "./reservations.js";
import { enqueueNotification } from "./notifications.js";

// Send when a confirmed reservation is this close (or closer) and still upcoming.
const REMINDER_WINDOW_MINUTES = 120;

/**
 * Restaurant's IANA timezone, read from its public opening-hours config
 * (location.restaurantProfile.openingHours.timezone). Falls back to the platform
 * default when a restaurant hasn't set one. Mirrors `locationTimeZone` in
 * server/routes/reservations.ts.
 */
function locationTimeZone(location: any): string {
  const oh = (location?.restaurantProfile as any)?.openingHours;
  const tz = oh && typeof oh === "object" ? oh.timezone : undefined;
  return typeof tz === "string" && tz ? tz : "Asia/Jakarta";
}

function readableDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Minutes from `now` until the reservation start; NaN if unparseable. The
 * reservation's wall-clock time is interpreted in the restaurant's `timeZone`
 * so "2 hours before" lands on the right real-world instant.
 */
function minutesUntil(
  reservationDateTime: string,
  now: Date,
  timeZone: string,
): number {
  const { date, time } = splitDateTime(reservationDateTime);
  const startMs = zonedWallTimeToMs(date, time || "00:00", timeZone);
  if (Number.isNaN(startMs)) return NaN;
  return (startMs - now.getTime()) / 60000;
}

/**
 * Sweep due 2-hour reminders. Now an indexed query on the Reservation model
 * (status CONFIRMED + reminderEmailSentAt unset) instead of scanning every
 * location's JSON array. Each due reminder is enqueued for background delivery
 * and the row is stamped so it never fires twice (dedup survives restarts; the
 * timezone-aware window check is applied per location).
 */
export async function runReservationReminderSweep(): Promise<void> {
  const now = new Date();
  const frontend = process.env.FRONTEND_URL || "https://www.seatping.biz";
  let sentCount = 0;

  // Candidate set: confirmed, not yet reminded, and within ±2 days of now.
  // `reservationDateTime` is "YYYY-MM-DDTHH:MM", so lexicographic bounds work.
  // The 2-day pad covers every timezone offset; anything outside it cannot be
  // inside the 120-minute window, so the sweep stays small no matter how many
  // future bookings exist.
  const dayMs = 24 * 60 * 60 * 1000;
  const boundStr = (d: Date) => d.toISOString().slice(0, 16);
  const candidates = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      reminderEmailSentAt: null,
      reservationDateTime: {
        gte: boundStr(new Date(now.getTime() - 2 * dayMs)),
        lte: boundStr(new Date(now.getTime() + 2 * dayMs)),
      },
    },
  });
  if (candidates.length === 0) return;

  // Resolve each candidate's location (for timezone + address) once.
  const locationIds = Array.from(new Set(candidates.map((r) => r.locationId)));
  const locations = await prisma.location.findMany({
    where: { id: { in: locationIds } },
  });
  const locById = new Map(locations.map((l) => [l.id, l]));
  const businessNameCache = new Map<string, string>();

  for (const r of candidates) {
    const location = locById.get(r.locationId);
    if (!location) continue;
    if (!r.email) continue;

    const timeZone = locationTimeZone(location);
    const mins = minutesUntil(r.reservationDateTime, now, timeZone);
    if (Number.isNaN(mins) || mins <= 0 || mins > REMINDER_WINDOW_MINUTES) continue;

    // Business name (cached per business).
    let businessName = businessNameCache.get(location.businessId);
    if (businessName === undefined) {
      const business = await prisma.business.findUnique({
        where: { id: location.businessId },
        select: { name: true },
      });
      businessName = business?.name || "the restaurant";
      businessNameCache.set(location.businessId, businessName);
    }
    const locationName = location.displayName || location.name || businessName;
    const { date, time } = splitDateTime(r.reservationDateTime);

    try {
      await enqueueNotification({
        type: "reservation_reminder",
        email: r.email,
        firstName: r.firstName || r.name || "there",
        businessName,
        address: location.address || locationName,
        dateLabel: readableDate(date),
        timeLabel: formatTimeLabel(time),
        partySize: Number(r.guestCount) || 1,
        manageUrl: r.manageToken
          ? `${frontend}/reservations/manage/${r.manageToken}`
          : undefined,
      });
      // Stamp immediately so a duplicate sweep can't re-enqueue. Single-row,
      // indexed update (no array RMW).
      await prisma.reservation.update({
        where: { id: r.id },
        data: { reminderEmailSentAt: new Date() },
      });
      sentCount++;
    } catch (e: any) {
      console.error("[RESERVATION-REMINDER] enqueue/stamp failed:", e?.message || e);
    }
  }

  if (sentCount > 0) {
    console.log(`[RESERVATION-REMINDER] sweep done — enqueued ${sentCount} reminder(s)`);
  }
}

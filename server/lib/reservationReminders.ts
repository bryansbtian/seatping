// server/lib/reservationReminders.ts
//
// Sends a one-time "your reservation is in ~2 hours" reminder to customers.
//
// Reservations live as JSON on the Location model (see server/lib/reservations.ts),
// so there is no Reservation table to query — this sweep scans locations and
// inspects their `reservations` arrays. Dedup state (`reminderEmailSentAt`) is
// persisted on each reservation object, so the job is safe across restarts: a
// reminder is only ever sent once, and a crash mid-run simply retries next tick.
//
// This is intentionally a poll (not a per-reservation setTimeout) so it survives
// process restarts. It's wired up in server/index.ts on the same interval-based
// pattern as the daily credit sweep (and, like that sweep, only runs on a
// long-lived server — not in a per-request serverless invocation).
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
import { sendReservationReminderEmail } from "./email.js";

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
 * A reservation is due for a reminder when it is confirmed, has an email, hasn't
 * already been reminded, and is upcoming within the reminder window.
 */
function isDueForReminder(r: any, now: Date, timeZone: string): boolean {
  if (!r || typeof r !== "object") return false;
  if (r.status !== "confirmed") return false; // not cancelled/completed/no_show/pending
  if (!r.email) return false;
  if (r.reminderEmailSentAt) return false;
  const mins = minutesUntil(r.reservationDateTime, now, timeZone);
  if (Number.isNaN(mins)) return false;
  return mins > 0 && mins <= REMINDER_WINDOW_MINUTES;
}

/**
 * Scan all locations and send any due 2-hour reminders, marking each one as
 * sent so it never fires twice. Best-effort: failures are logged and retried on
 * the next sweep (we only stamp `reminderEmailSentAt` after a successful send).
 */
export async function runReservationReminderSweep(): Promise<void> {
  const now = new Date();
  const frontend = process.env.FRONTEND_URL || "https://www.seatping.biz";
  let sentCount = 0;

  const locations = await prisma.location.findMany();
  const businessNameCache = new Map<string, string>();

  for (const location of locations) {
    const list = Array.isArray(location.reservations)
      ? (location.reservations as any[])
      : [];
    const timeZone = locationTimeZone(location);
    const due = list.filter((r) => isDueForReminder(r, now, timeZone));
    if (due.length === 0) continue;

    // Resolve the business name once per business.
    let businessName = businessNameCache.get(location.businessId);
    if (businessName === undefined) {
      const business = await prisma.business.findUnique({
        where: { id: location.businessId },
        select: { name: true },
      });
      businessName = business?.name || "the restaurant";
      businessNameCache.set(location.businessId, businessName);
    }
    const locationName =
      location.displayName || location.name || businessName;

    const sentIds = new Set<string>();
    for (const r of due) {
      const { date, time } = splitDateTime(r.reservationDateTime);
      try {
        const ok = await sendReservationReminderEmail({
          email: r.email,
          firstName: r.firstName || r.name || "there",
          businessName,
          address: location.address || locationName,
          dateLabel: readableDate(date),
          timeLabel: formatTimeLabel(time),
          partySize: Number(r.partySize) || 1,
          manageUrl: r.manageToken
            ? `${frontend}/reservations/manage/${r.manageToken}`
            : undefined,
        });
        if (ok) {
          sentIds.add(r.id);
          sentCount++;
        } else {
          console.error("[RESERVATION-REMINDER] send returned false for:", r.email);
        }
      } catch (e: any) {
        console.error("[RESERVATION-REMINDER] send failed:", e?.message || e);
      }
    }

    if (sentIds.size === 0) continue;

    // Stamp the ones we sent. We map over the list we read; this matches the
    // read-modify-write pattern used by the reservation manage endpoints.
    const stamp = new Date().toISOString();
    const nextList = list.map((r) =>
      sentIds.has(r?.id) ? { ...r, reminderEmailSentAt: stamp } : r
    );
    try {
      await prisma.location.update({
        where: { id: location.id },
        data: { reservations: nextList as any },
      });
    } catch (e: any) {
      console.error(
        "[RESERVATION-REMINDER] failed to persist reminder flags for location",
        location.id,
        e?.message || e
      );
    }
  }

  if (sentCount > 0) {
    console.log(`[RESERVATION-REMINDER] sweep done — sent ${sentCount} reminder(s)`);
  }
}

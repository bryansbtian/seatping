
import { prisma } from "./prisma.js";
import {
  splitDateTime,
  formatTimeLabel,
  zonedWallTimeToMs,
} from "./reservations.js";
import { enqueueNotification } from "./notifications.js";

const REMINDER_WINDOW_MINUTES = 120;

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

export async function runReservationReminderSweep(): Promise<void> {
  const now = new Date();
  const frontend = process.env.FRONTEND_URL || "https://www.seatping.biz";
  let sentCount = 0;

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

import { prisma } from "./prisma.js";
import { splitDateTime, formatTimeLabel, zonedWallTimeToMs } from "./reservations.js";
import { enqueueNotification } from "./notifications.js";

const REMINDER_WINDOW_MINUTES = 120;

function locationTimeZone(location: any): string {
  const oh = (location?.restaurantProfile as any)?.openingHours;
  let tz: unknown = undefined;
  if (oh && typeof oh === "object") {
    tz = oh.timezone;
  }
  if (typeof tz === "string" && tz) {
    return tz;
  }
  return "Asia/Jakarta";
}

function readableDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return date;
  }
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function minutesUntil(reservationDateTime: string, now: Date, timeZone: string): number {
  const { date, time } = splitDateTime(reservationDateTime);
  const startMs = zonedWallTimeToMs(date, time || "00:00", timeZone);
  if (Number.isNaN(startMs)) {
    return NaN;
  }
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
      OR: [{ reminderEmailSentAt: null }, { reminderEmailSentAt: { isSet: false } }],
      reservationDateTime: {
        gte: boundStr(new Date(now.getTime() - 2 * dayMs)),
        lte: boundStr(new Date(now.getTime() + 2 * dayMs)),
      },
    },
  });
  if (candidates.length === 0) {
    return;
  }

  const locationIds = Array.from(new Set(candidates.map((r) => r.locationId)));
  const locations = await prisma.location.findMany({
    where: { id: { in: locationIds } },
  });
  const locById = new Map(locations.map((l) => [l.id, l]));
  const businessNameCache = new Map<string, string>();

  for (const r of candidates) {
    const location = locById.get(r.locationId);
    if (!location) {
      continue;
    }
    if (!r.email) {
      continue;
    }

    const timeZone = locationTimeZone(location);
    const mins = minutesUntil(r.reservationDateTime, now, timeZone);
    if (Number.isNaN(mins) || mins <= 0 || mins > REMINDER_WINDOW_MINUTES) {
      continue;
    }

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

    let manageUrl: string | undefined = undefined;
    if (r.manageToken) {
      manageUrl = `${frontend}/reservations/manage/${r.manageToken}`;
    }

    let claimed = false;
    try {
      const claim = await prisma.reservation.updateMany({
        where: {
          id: r.id,
          OR: [{ reminderEmailSentAt: null }, { reminderEmailSentAt: { isSet: false } }],
        },
        data: { reminderEmailSentAt: new Date() },
      });
      claimed = claim.count > 0;
    } catch (e: any) {
      console.error("[RESERVATION-REMINDER] claim failed:", e?.message || e);
      continue;
    }
    if (!claimed) {
      continue;
    }

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
        manageUrl,
      });
      sentCount++;
    } catch (e: any) {
      console.error("[RESERVATION-REMINDER] enqueue failed:", e?.message || e);
      try {
        await prisma.reservation.update({
          where: { id: r.id },
          data: { reminderEmailSentAt: null },
        });
      } catch (releaseErr: any) {
        console.error(
          "[RESERVATION-REMINDER] claim release failed:",
          releaseErr?.message || releaseErr,
        );
      }
    }
  }

  if (sentCount > 0) {
    console.log(`[RESERVATION-REMINDER] sweep done, enqueued ${sentCount} reminder(s)`);
  }
}

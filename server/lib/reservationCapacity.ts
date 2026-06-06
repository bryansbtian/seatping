// server/lib/reservationCapacity.ts
//
// Atomic per-hour reservation capacity, backed by the SlotCounter model. The
// previous design summed guests from a JSON array and then wrote the array back
// (read-modify-write), which let two concurrent bookings both pass the capacity
// check and overbook. Here, a single guarded `$inc` on one SlotCounter document
// is atomic in MongoDB, so the cap is enforced even under heavy concurrency.
//
// Capacity is bucketed per clock-hour (a 7:00 and 7:30 booking both consume the
// 7 PM hour), matching the rule in server/lib/reservations.ts. Counters track
// ACTIVE guests only (PENDING | CONFIRMED | ARRIVED); a reservation releases its
// seats when it becomes CANCELLED / COMPLETED / NO_SHOW.

import { prisma } from "./prisma.js";
import { splitDateTime } from "./reservations.js";
import { withWriteRetry } from "./dbRetry.js";

/** Split a stored reservation datetime into the counter's (dateKey, hour). */
export function bucketOf(reservationDateTime: string): {
  dateKey: string;
  hour: number;
} {
  const { date, time } = splitDateTime(reservationDateTime);
  const hour = Number(String(time).split(":")[0]) || 0;
  return { dateKey: date, hour };
}

/**
 * Atomically try to reserve `guestCount` seats in (locationId, dateKey, hour)
 * without exceeding `cap`. Returns true if the seats were reserved.
 *
 * The counter document is created on demand (upsert) before the guarded inc, so
 * the very first booking of a bucket works. The guard
 * `reservedGuests <= cap - guestCount` is evaluated server-side inside a single
 * atomic update, so concurrent callers can never push the total past `cap`.
 */
export async function tryReserveCapacity(
  locationId: string,
  dateKey: string,
  hour: number,
  guestCount: number,
  cap: number,
): Promise<boolean> {
  if (guestCount <= 0) return true;
  if (guestCount > cap) return false;

  // Ensure the counter exists (no-op if it already does).
  await withWriteRetry(() =>
    prisma.slotCounter.upsert({
      where: { locationId_dateKey_hour: { locationId, dateKey, hour } },
      create: { locationId, dateKey, hour, reservedGuests: 0 },
      update: {},
    }),
  );

  const result = await withWriteRetry(() =>
    prisma.slotCounter.updateMany({
      where: {
        locationId,
        dateKey,
        hour,
        reservedGuests: { lte: cap - guestCount },
      },
      data: { reservedGuests: { increment: guestCount } },
    }),
  );
  return result.count === 1;
}

/**
 * Unconditionally add `guestCount` seats to a bucket (creating it if needed).
 * Used when a reservation re-enters the ACTIVE set via a business-initiated
 * status change (e.g. no_show -> confirmed), where the cap is not re-checked.
 */
export async function addCapacity(
  locationId: string,
  dateKey: string,
  hour: number,
  guestCount: number,
): Promise<void> {
  if (guestCount <= 0) return;
  await withWriteRetry(() =>
    prisma.slotCounter.upsert({
      where: { locationId_dateKey_hour: { locationId, dateKey, hour } },
      create: { locationId, dateKey, hour, reservedGuests: guestCount },
      update: { reservedGuests: { increment: guestCount } },
    }),
  );
}

/** Release `guestCount` seats from a bucket (never drops below zero). */
export async function releaseCapacity(
  locationId: string,
  dateKey: string,
  hour: number,
  guestCount: number,
): Promise<void> {
  if (guestCount <= 0) return;
  // Guard `>= guestCount` so a double-release can't drive the counter negative.
  await withWriteRetry(() =>
    prisma.slotCounter.updateMany({
      where: { locationId, dateKey, hour, reservedGuests: { gte: guestCount } },
      data: { reservedGuests: { decrement: guestCount } },
    }),
  );
}

/** Enum statuses that occupy capacity. Mirrors ACTIVE_STATUSES in reservations.ts. */
const ACTIVE_ENUM = ["PENDING", "CONFIRMED", "ARRIVED"];

/**
 * Adjust the counter when a reservation's status changes: release seats when it
 * leaves the ACTIVE set, re-add them when it re-enters. No-op for active->active
 * or inactive->inactive transitions.
 */
export async function applyStatusCapacityDelta(params: {
  locationId: string;
  reservationDateTime: string;
  guestCount: number;
  oldStatus: string;
  newStatus: string;
}): Promise<void> {
  const wasActive = ACTIVE_ENUM.includes(params.oldStatus);
  const isActive = ACTIVE_ENUM.includes(params.newStatus);
  if (wasActive === isActive) return;
  const { dateKey, hour } = bucketOf(params.reservationDateTime);
  if (!dateKey) return;
  if (wasActive && !isActive) {
    await releaseCapacity(params.locationId, dateKey, hour, params.guestCount);
  } else {
    await addCapacity(params.locationId, dateKey, hour, params.guestCount);
  }
}

/**
 * Recompute every SlotCounter for a location from its ACTIVE reservations. A
 * repair/seed helper: used by the migration to seed counters and available for
 * an admin "recount" if a counter ever drifts from the source of truth.
 */
export async function recountSlots(locationId: string): Promise<void> {
  const active = await prisma.reservation.findMany({
    where: {
      locationId,
      status: { in: ["PENDING", "CONFIRMED", "ARRIVED"] },
    },
    select: { reservationDateTime: true, guestCount: true },
  });

  const totals = new Map<string, number>();
  for (const r of active) {
    const { dateKey, hour } = bucketOf(r.reservationDateTime);
    if (!dateKey) continue;
    const key = `${dateKey}|${hour}`;
    totals.set(key, (totals.get(key) ?? 0) + (Number(r.guestCount) || 0));
  }

  // Zero out existing counters for this location, then set the recomputed totals.
  await prisma.slotCounter.deleteMany({ where: { locationId } });
  for (const [key, reservedGuests] of totals) {
    const [dateKey, hourStr] = key.split("|");
    await prisma.slotCounter.create({
      data: { locationId, dateKey, hour: Number(hourStr), reservedGuests },
    });
  }
}

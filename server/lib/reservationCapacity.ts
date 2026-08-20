import { prisma } from "./prisma.js";
import { splitDateTime } from "./reservations.js";
import { withWriteRetry } from "./dbRetry.js";

export function bucketOf(reservationDateTime: string): {
  dateKey: string;
  hour: number;
} {
  const { date, time } = splitDateTime(reservationDateTime);
  const hour = Number(String(time).split(":")[0]) || 0;
  return { dateKey: date, hour };
}

export async function tryReserveCapacity(
  locationId: string,
  dateKey: string,
  hour: number,
  guestCount: number,
  cap: number,
): Promise<boolean> {
  if (guestCount <= 0) {
    return true;
  }
  if (guestCount > cap) {
    return false;
  }

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

export async function addCapacity(
  locationId: string,
  dateKey: string,
  hour: number,
  guestCount: number,
): Promise<void> {
  if (guestCount <= 0) {
    return;
  }
  await withWriteRetry(() =>
    prisma.slotCounter.upsert({
      where: { locationId_dateKey_hour: { locationId, dateKey, hour } },
      create: { locationId, dateKey, hour, reservedGuests: guestCount },
      update: { reservedGuests: { increment: guestCount } },
    }),
  );
}

export async function releaseCapacity(
  locationId: string,
  dateKey: string,
  hour: number,
  guestCount: number,
): Promise<void> {
  if (guestCount <= 0) {
    return;
  }
  await withWriteRetry(() =>
    prisma.slotCounter.updateMany({
      where: { locationId, dateKey, hour, reservedGuests: { gte: guestCount } },
      data: { reservedGuests: { decrement: guestCount } },
    }),
  );
}

const ACTIVE_ENUM = ["CONFIRMED", "ARRIVED"];

export async function applyStatusCapacityDelta(params: {
  locationId: string;
  reservationDateTime: string;
  guestCount: number;
  oldStatus: string;
  newStatus: string;
}): Promise<void> {
  const wasActive = ACTIVE_ENUM.includes(params.oldStatus);
  const isActive = ACTIVE_ENUM.includes(params.newStatus);
  if (wasActive === isActive) {
    return;
  }
  const { dateKey, hour } = bucketOf(params.reservationDateTime);
  if (!dateKey) {
    return;
  }
  if (wasActive && !isActive) {
    await releaseCapacity(params.locationId, dateKey, hour, params.guestCount);
  } else {
    await addCapacity(params.locationId, dateKey, hour, params.guestCount);
  }
}

export async function recountSlots(locationId: string): Promise<void> {
  const active = await prisma.reservation.findMany({
    where: {
      locationId,
      status: { in: ["CONFIRMED", "ARRIVED"] },
    },
    select: { reservationDateTime: true, guestCount: true },
  });

  const totals = new Map<string, number>();
  for (const r of active) {
    const { dateKey, hour } = bucketOf(r.reservationDateTime);
    if (!dateKey) {
      continue;
    }
    const key = `${dateKey}|${hour}`;
    totals.set(key, (totals.get(key) ?? 0) + (Number(r.guestCount) || 0));
  }

  await prisma.slotCounter.deleteMany({ where: { locationId } });
  for (const [key, reservedGuests] of totals) {
    const [dateKey, hourStr] = key.split("|");
    await prisma.slotCounter.create({
      data: { locationId, dateKey, hour: Number(hourStr), reservedGuests },
    });
  }
}

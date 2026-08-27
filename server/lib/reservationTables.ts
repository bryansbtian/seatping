import { prisma } from "./prisma.js";
import { ACTIVE_ASSIGNMENT_STATUSES, createAssignment, isFailure, occupiedByAny } from "./floor.js";
import type { SmartOccupancy, SmartTable } from "./smartAssign.js";
import {
  normalizeSettings,
  reservationWindow,
  formatTimeLabel,
  splitDateTime,
  tablesForWindow,
  zonedWallTimeToMs,
  type ReservationInventory,
  type ReservationSettings,
  type SmartWindowRange,
} from "./reservations.js";
import { getLocationTimezone } from "./operatingHours.js";
import { businessNotificationEmail, restaurantNameForNotification } from "./business.js";
import { enqueueNotification } from "./notifications.js";

export async function locationHasFloorInventory(locationId: string): Promise<boolean> {
  const table = await prisma.diningTable.findFirst({
    where: { locationId },
    select: { id: true },
  });
  return Boolean(table);
}

export async function loadReservationInventory(
  locationId: string,
  options: { excludeReservationId?: string | null } = {},
): Promise<ReservationInventory> {
  const rooms = await prisma.floorPlan.findMany({
    where: { locationId },
    select: {
      id: true,
      name: true,
      tables: {
        select: {
          id: true,
          name: true,
          capacity: true,
          minimumPartySize: true,
          isBlocked: true,
        },
      },
    },
  });

  const setups: SmartTable[] = [];
  const tableById = new Map<string, SmartTable>();
  for (const room of rooms) {
    for (const table of room.tables) {
      const setup: SmartTable = {
        id: table.id,
        name: table.name,
        roomId: room.id,
        roomName: room.name,
        capacity: table.capacity,
        minimumPartySize: table.minimumPartySize,
        isBlocked: table.isBlocked,
        cleaningSince: null,
      };
      setups.push(setup);
      tableById.set(table.id, setup);
    }
  }

  const assignments = await prisma.tableAssignment.findMany({
    where: {
      locationId,
      status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
    },
    select: {
      tableId: true,
      tableIds: true,
      reservationId: true,
      expectedStartAt: true,
      expectedEndAt: true,
    },
  });

  const occupancy: SmartOccupancy[] = [];
  for (const assignment of assignments) {
    if (options.excludeReservationId && assignment.reservationId === options.excludeReservationId) {
      continue;
    }
    let memberIds = [assignment.tableId];
    if (assignment.tableIds && assignment.tableIds.length > 0) {
      memberIds = assignment.tableIds;
    }
    for (const memberId of memberIds) {
      occupancy.push({
        tableId: memberId,
        start: assignment.expectedStartAt,
        end: assignment.expectedEndAt,
      });
    }
  }

  return { setups, occupancy };
}

export function windowForReservation(
  location: { reservationSettings?: unknown; timezone?: string | null },
  reservationDateTime: string,
  settings?: ReservationSettings,
): SmartWindowRange {
  const resolved = settings ?? normalizeSettings((location as any).reservationSettings);
  const { date, time } = splitDateTime(reservationDateTime);
  const startMs = zonedWallTimeToMs(date, time, getLocationTimezone(location as any));
  return reservationWindow(startMs, resolved.defaultReservationDurationMinutes);
}

export async function assignTableForReservation(input: {
  businessId: string;
  locationId: string;
  reservationId: string;
  partySize: number;
  window: SmartWindowRange;
  now?: Date;
  inventory?: ReservationInventory | null;
}): Promise<{ assignment: any; tableName: string } | null> {
  const now = input.now ?? new Date();
  let inventory = input.inventory ?? null;
  if (input.inventory === undefined) {
    inventory = await loadReservationInventory(input.locationId, {
      excludeReservationId: input.reservationId,
    });
  }
  if (!inventory || inventory.setups.length === 0) {
    return null;
  }
  const ordered = tablesForWindow(inventory, input.partySize, input.window, now);

  for (const setup of ordered) {
    const outcome = await createAssignment({
      businessId: input.businessId,
      locationId: input.locationId,
      tableId: setup.id,
      tableIds: [setup.id],
      partySize: input.partySize,
      source: "SMART",
      status: "RESERVED",
      expectedStartAt: input.window.start,
      expectedEndAt: input.window.end,
      queueEntryId: null,
      reservationId: input.reservationId,
      guestProfileId: null,
    });

    if (!isFailure(outcome)) {
      return { assignment: outcome.value, tableName: setup.name };
    }
    if (outcome.status !== 409) {
      return null;
    }
    if (outcome.error === "That reservation already has a table") {
      return null;
    }
  }

  return null;
}

export const NEEDS_REVIEW_NO_TABLE = "NO_TABLE";

export async function flagReservationForReview(
  reservationId: string,
  reason: string = NEEDS_REVIEW_NO_TABLE,
): Promise<void> {
  await prisma.reservation.update({
    where: { id: reservationId },
    data: { needsReview: true, needsReviewReason: reason },
  });
}

export async function clearReservationReview(reservationId: string): Promise<void> {
  await prisma.reservation.update({
    where: { id: reservationId },
    data: { needsReview: false, needsReviewReason: null, needsReviewNotifiedAt: null },
  });
}

function frontendBase(): string {
  return (process.env.FRONTEND_URL || "https://www.seatping.biz").replace(/\/$/, "");
}

export function readableReservationDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function notifyReservationNeedsReview(reservationId: string): Promise<boolean> {
  const claimed = await prisma.reservation.updateMany({
    where: {
      id: reservationId,
      needsReview: true,
      OR: [{ needsReviewNotifiedAt: null }, { needsReviewNotifiedAt: { isSet: false } }],
    },
    data: { needsReviewNotifiedAt: new Date() },
  });
  if (claimed.count === 0) {
    return false;
  }

  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) {
    return false;
  }

  const [location, business] = await Promise.all([
    prisma.location.findUnique({ where: { id: reservation.locationId } }),
    prisma.business.findUnique({
      where: { id: reservation.businessId },
      select: { name: true, email: true },
    }),
  ]);
  if (!location) {
    return false;
  }

  const recipient = businessNotificationEmail(location, business);
  if (!recipient) {
    console.warn(
      `[NOTIFY] no business email for reservation ${reservationId}, skipping needs review email`,
    );
    return false;
  }

  const { date, time } = splitDateTime(reservation.reservationDateTime);
  const guestName =
    reservation.name || `${reservation.firstName} ${reservation.lastName}`.trim() || "Guest";
  const base = frontendBase();

  await enqueueNotification({
    type: "reservation_needs_review",
    businessEmail: recipient,
    locationName: restaurantNameForNotification(
      location,
      location.displayName || location.name || business?.name || "your restaurant",
    ),
    customerName: guestName,
    dateLabel: readableReservationDate(date),
    timeLabel: formatTimeLabel(time),
    partySize: reservation.guestCount,
    reservationId: reservation.id,
    reason: reservation.needsReviewReason,
    reservationsUrl: `${base}/business/reservations`,
    floorUrl: `${base}/business/floor`,
  });

  return true;
}

export async function assignOrFlagReservation(input: {
  businessId: string;
  locationId: string;
  reservationId: string;
  partySize: number;
  window: SmartWindowRange;
  now?: Date;
  inventory?: ReservationInventory | null;
}): Promise<{ assignment: any; tableName: string } | null> {
  const seated = await assignTableForReservation(input);
  if (seated) {
    await clearReservationReview(input.reservationId);
    return seated;
  }
  await flagReservationForReview(input.reservationId);
  try {
    await notifyReservationNeedsReview(input.reservationId);
  } catch (notifyErr: any) {
    console.error(
      "[NOTIFY] needs review notification failed:",
      (notifyErr && notifyErr.message) || notifyErr,
    );
  }
  return null;
}

export async function releaseReservationTables(reservationId: string): Promise<number> {
  const result = await prisma.tableAssignment.updateMany({
    where: {
      reservationId,
      status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
    },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return result.count;
}

export async function reassignTableForReservation(input: {
  businessId: string;
  locationId: string;
  reservationId: string;
  partySize: number;
  window: SmartWindowRange;
  now?: Date;
}): Promise<{ assignment: any; tableName: string } | null> {
  if (!(await locationHasFloorInventory(input.locationId))) {
    return null;
  }
  await releaseReservationTables(input.reservationId);
  return assignOrFlagReservation(input);
}

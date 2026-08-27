import { prisma } from "./prisma.js";
import { withWriteRetry } from "./dbRetry.js";
import { touchGuestByQueueEntryId, touchGuestByReservationId } from "./guests.js";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  OBJECT_ID_RE,
  TABLE_MAX_CAPACITY,
  TABLE_MIN_CAPACITY,
  createAssignment,
  fail,
  isFailure,
  moveAssignment,
  ok,
  type Outcome,
} from "./floor.js";

export const SEATED_QUEUE_STATUSES = ["WAITING", "ADMITTED"] as const;

export type ManualAssignInput = {
  businessId: string;
  locationId: string;
  tableId: string;
  tableIds?: string[];
  queueEntryId: string | null;
  reservationId: string | null;
  guestProfileId: string | null;
  partySize: number | null;
  seatNow: boolean;
  expectedStartAt: Date;
  expectedEndAt: Date;
};

export async function findActiveAssignmentForReservation(
  locationId: string,
  reservationId: string,
) {
  return prisma.tableAssignment.findFirst({
    where: {
      locationId,
      reservationId,
      status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
    },
  });
}

export async function findActiveAssignmentForQueueEntry(locationId: string, queueEntryId: string) {
  return prisma.tableAssignment.findFirst({
    where: {
      locationId,
      queueEntryId,
      status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
    },
  });
}

export async function resolvePartySize(input: {
  partySize: number | null;
  queueEntryId: string | null;
  reservationId: string | null;
}): Promise<Outcome<number>> {
  if (input.partySize !== null) {
    return ok(input.partySize);
  }

  if (input.queueEntryId) {
    const entry = await prisma.queueEntry.findUnique({
      where: { id: input.queueEntryId },
      select: { guestCount: true },
    });
    if (entry) {
      return ok(entry.guestCount);
    }
  }

  if (input.reservationId) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: input.reservationId },
      select: { guestCount: true },
    });
    if (reservation) {
      return ok(reservation.guestCount);
    }
  }

  return fail(400, "partySize is required");
}

export async function markQueueEntrySeated(queueEntryId: string): Promise<void> {
  const now = new Date();
  const entry = await prisma.queueEntry.findUnique({
    where: { id: queueEntryId },
    select: { id: true, status: true, admittedAt: true },
  });
  if (!entry) {
    return;
  }
  const seatable = SEATED_QUEUE_STATUSES.some((status) => status === entry.status);
  if (!seatable) {
    return;
  }

  const data: Record<string, unknown> = {
    status: "ARRIVED",
    finalStatus: "arrived",
    arrivedAt: now,
  };
  if (!entry.admittedAt) {
    data.admittedAt = now;
  }

  await withWriteRetry(() =>
    prisma.queueEntry.updateMany({
      where: { id: entry.id, status: { in: [...SEATED_QUEUE_STATUSES] } },
      data,
    }),
  );
  await touchGuestByQueueEntryId(entry.id);
}

export async function markReservationSeated(reservationId: string): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, status: true },
  });
  if (!reservation || reservation.status !== "CONFIRMED") {
    return;
  }

  await withWriteRetry(() =>
    prisma.reservation.updateMany({
      where: { id: reservation.id, status: "CONFIRMED" },
      data: { status: "ARRIVED", arrivedAt: new Date() },
    }),
  );
  await touchGuestByReservationId(reservation.id);
}

export async function markVisitClosed(assignment: {
  queueEntryId: string | null;
  reservationId: string | null;
}): Promise<void> {
  if (assignment.reservationId) {
    await withWriteRetry(() =>
      prisma.reservation.updateMany({
        where: { id: assignment.reservationId as string, status: "ARRIVED" },
        data: { status: "COMPLETED", completedAt: new Date() },
      }),
    );
    await touchGuestByReservationId(assignment.reservationId);
  }
  if (assignment.queueEntryId) {
    await touchGuestByQueueEntryId(assignment.queueEntryId);
  }
}

export async function manualAssign(input: ManualAssignInput): Promise<Outcome<any>> {
  if (!OBJECT_ID_RE.test(input.tableId)) {
    return fail(404, "Table not found or access denied");
  }
  if (input.queueEntryId && input.reservationId) {
    return fail(400, "An assignment cannot reference both a queue entry and a reservation");
  }

  const partySize = await resolvePartySize(input);
  if (isFailure(partySize)) {
    return partySize;
  }
  if (partySize.value < TABLE_MIN_CAPACITY || partySize.value > TABLE_MAX_CAPACITY) {
    return fail(400, `partySize must be between ${TABLE_MIN_CAPACITY} and ${TABLE_MAX_CAPACITY}`);
  }

  let existing = null;
  if (input.reservationId) {
    existing = await findActiveAssignmentForReservation(input.locationId, input.reservationId);
  }
  if (!existing && input.queueEntryId) {
    existing = await findActiveAssignmentForQueueEntry(input.locationId, input.queueEntryId);
  }

  let outcome: Outcome<any>;
  if (existing) {
    outcome = await moveAssignment({
      locationId: input.locationId,
      assignmentId: existing.id,
      tableId: input.tableId,
    });
  } else {
    outcome = await createAssignment({
      businessId: input.businessId,
      locationId: input.locationId,
      tableId: input.tableId,
      tableIds: input.tableIds,
      partySize: partySize.value,
      source: "MANUAL",
      status: seatStatus(input.seatNow),
      expectedStartAt: input.expectedStartAt,
      expectedEndAt: input.expectedEndAt,
      queueEntryId: input.queueEntryId,
      reservationId: input.reservationId,
      guestProfileId: input.guestProfileId,
    });
  }

  if (isFailure(outcome)) {
    return outcome;
  }

  if (outcome.value.status === "SEATED") {
    if (input.queueEntryId) {
      await markQueueEntrySeated(input.queueEntryId);
    }
    if (input.reservationId) {
      await markReservationSeated(input.reservationId);
    }
  }

  return ok({ assignment: outcome.value, moved: Boolean(existing) });
}

function seatStatus(seatNow: boolean): "SEATED" | "RESERVED" {
  if (seatNow) {
    return "SEATED";
  }
  return "RESERVED";
}

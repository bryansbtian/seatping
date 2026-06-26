
import type { QueueEntry, Reservation } from "@prisma/client";


export type LegacyQueueStatus =
  | "waiting"
  | "admitted"
  | "arrived"
  | "no_show"
  | "removed"
  | "left";

export function legacyKeyOf(
  firstName: any,
  lastName: any,
  joinedAt: any,
): string {
  return `${firstName ?? ""}${lastName ?? ""}${joinedAt ?? ""}`;
}

function iso(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}


function queueBase(e: QueueEntry) {
  const joinedAt = iso(e.joinedAt);
  return {
    firstName: e.firstName,
    lastName: e.lastName,
    name: `${e.firstName} ${e.lastName}`.trim(),
    numGuests: e.guestCount,
    partySize: e.guestCount,
    phoneNumber: e.phone ?? "",
    countryCode: e.countryCode ?? "+1",
    email: e.email ?? "",
    notificationMethod: e.notificationMethod ?? "",
    locationId: e.locationId,
    businessUsername: undefined as string | undefined,
    customerId: e.customerId ?? null,
    smsConsent: e.smsConsent ?? false,
    smsMarketingConsent: e.smsMarketingConsent ?? false,
    joinedAt,
    queueToken: e.queueToken,
  };
}

export function queueEntryToLegacy(
  e: QueueEntry,
  opts: { position?: number; businessUsername?: string | null } = {},
): any {
  const o: any = queueBase(e);
  if (opts.businessUsername != null) o.businessUsername = opts.businessUsername;

  if (e.status === "ADMITTED" || e.status === "ARRIVED" || e.status === "NO_SHOW") {
    o.status = "admitted";
    o.admittedAt = iso(e.admittedAt);
    o.finalStatus =
      e.finalStatus ??
      (e.status === "ARRIVED" ? "arrived" : e.status === "NO_SHOW" ? "no_show" : "pending");
    o.confirmedAt = iso(e.arrivedAt);
    o.noShowMarkedAt = iso(e.noShowAt);
  } else if (e.status === "REMOVED" || e.status === "LEFT") {
    o.status = e.status === "LEFT" ? "left" : "removed";
    o.removedAt = iso(e.removedAt);
    o.leftAt = iso(e.leftAt);
  } else if (opts.position != null) {
    o.position = opts.position;
  }
  return o;
}

export function reconstructQueueArrays(
  rows: QueueEntry[],
  businessUsername?: string | null,
): {
  queue: any[];
  admittedCustomers: any[];
  removedCustomers: any[];
} {
  const waiting = rows
    .filter((r) => r.status === "WAITING")
    .sort((a, b) => +new Date(a.joinedAt) - +new Date(b.joinedAt));
  const admittedRows = rows
    .filter(
      (r) =>
        r.status === "ADMITTED" ||
        r.status === "ARRIVED" ||
        r.status === "NO_SHOW",
    )
    .sort(
      (a, b) =>
        +new Date(a.admittedAt ?? a.joinedAt) -
        +new Date(b.admittedAt ?? b.joinedAt),
    );
  const removedRows = rows
    .filter((r) => r.status === "REMOVED" || r.status === "LEFT")
    .sort(
      (a, b) =>
        +new Date(a.removedAt ?? a.leftAt ?? a.joinedAt) -
        +new Date(b.removedAt ?? b.leftAt ?? b.joinedAt),
    );

  const stamp = (o: any) => {
    if (businessUsername != null) o.businessUsername = businessUsername;
    return o;
  };

  const queue = waiting.map((e, i) =>
    stamp({ ...queueBase(e), position: i + 1 }),
  );

  const admittedCustomers = admittedRows.map((e) => {
    const finalStatus =
      e.finalStatus ??
      (e.status === "ARRIVED"
        ? "arrived"
        : e.status === "NO_SHOW"
          ? "no_show"
          : "pending");
    return stamp({
      ...queueBase(e),
      status: "admitted",
      admittedAt: iso(e.admittedAt),
      finalStatus,
      confirmedAt: iso(e.arrivedAt),
      noShowMarkedAt: iso(e.noShowAt),
    });
  });

  const removedCustomers = removedRows.map((e) =>
    stamp({
      ...queueBase(e),
      status: e.status === "LEFT" ? "left" : "removed",
      removedAt: iso(e.removedAt),
      leftAt: iso(e.leftAt),
    }),
  );

  return { queue, admittedCustomers, removedCustomers };
}


const RES_ENUM_TO_LEGACY: Record<string, string> = {
  CONFIRMED: "confirmed",
  ARRIVED: "arrived",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
};

const RES_LEGACY_TO_ENUM: Record<string, string> = {
  confirmed: "CONFIRMED",
  arrived: "ARRIVED",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  no_show: "NO_SHOW",
};

export function reservationStatusToLegacy(status: string): string {
  return RES_ENUM_TO_LEGACY[status] ?? "confirmed";
}

export function reservationStatusToEnum(status: string): any {
  return RES_LEGACY_TO_ENUM[String(status || "").toLowerCase()] ?? "CONFIRMED";
}

export function reservationRowToLegacy(
  r: Reservation,
  opts: { includeToken?: boolean } = {},
): any {
  const base = {
    id: r.id,
    locationId: r.locationId,
    businessUsername: r.businessUsername ?? null,
    customerId: r.customerId ?? null,
    firstName: r.firstName ?? "",
    lastName: r.lastName ?? "",
    name: r.name ?? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
    contactMethod: r.contactMethod ?? "email",
    phone: r.phone ?? "",
    countryCode: r.countryCode ?? "",
    email: r.email ?? "",
    partySize: Number(r.guestCount) || 0,
    reservationDateTime: r.reservationDateTime ?? null,
    notes: r.notes ?? "",
    status: reservationStatusToLegacy(r.status),
    source: r.source ?? "seatping_public",
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
    cancelledAt: iso(r.cancelledAt),
    arrivedAt: iso(r.arrivedAt),
    completedAt: iso(r.completedAt),
    noShowAt: iso(r.noShowAt),
    reminderEmailSentAt: iso(r.reminderEmailSentAt),
  };
  if (opts.includeToken) return { ...base, manageToken: r.manageToken ?? null };
  return base;
}

import { api } from "@/lib/api";
import type { LiveFloor } from "@/lib/floorLive";

function base(locationId: string): string {
  return `/api/floor/${locationId}`;
}

export type SeatPartyBody = {
  queueEntryId?: string;
  reservationId?: string;
  partySize?: number;
  turnMinutes?: number;
};

export async function fetchLiveFloor(locationId: string): Promise<LiveFloor> {
  return api(`${base(locationId)}/live`);
}

export async function seatParty(
  locationId: string,
  tableId: string,
  body: SeatPartyBody,
): Promise<void> {
  await api(`${base(locationId)}/tables/${tableId}/seat`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function seatReservedAssignment(
  locationId: string,
  assignmentId: string,
): Promise<void> {
  await api(`${base(locationId)}/assignments/${assignmentId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "SEATED" }),
  });
}

export async function completeVisit(locationId: string, assignmentId: string): Promise<void> {
  await api(`${base(locationId)}/assignments/${assignmentId}/complete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function movePartyToTable(
  locationId: string,
  assignmentId: string,
  tableId: string,
): Promise<void> {
  await api(`${base(locationId)}/assignments/${assignmentId}/move`, {
    method: "POST",
    body: JSON.stringify({ tableId }),
  });
}

export async function markTableCleaning(locationId: string, tableId: string): Promise<void> {
  await api(`${base(locationId)}/tables/${tableId}/cleaning`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function markTableAvailable(locationId: string, tableId: string): Promise<void> {
  await api(`${base(locationId)}/tables/${tableId}/available`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type ManualAssignBody = {
  tableId: string;
  queueEntryId?: string;
  reservationId?: string;
  partySize?: number;
  seatNow?: boolean;
  turnMinutes?: number;
};

export async function assignTable(locationId: string, body: ManualAssignBody): Promise<void> {
  await api(`${base(locationId)}/assign`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

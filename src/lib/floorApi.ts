import { api } from "@/lib/api";
import type { TableShape } from "@/lib/floorGeometry";

export type DiningTable = {
  id: string;
  floorPlanId: string;
  locationId: string;
  name: string;
  capacity: number;
  minimumPartySize: number;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  isBlocked: boolean;
};

export type FloorZone = {
  id: string;
  floorPlanId: string;
  locationId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Room = {
  id: string;
  locationId: string;
  name: string;
  width: number;
  height: number;
  sortOrder: number;
  tables: DiningTable[];
  zones: FloorZone[];
};

export type ZonePatch = Partial<{
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type TablePatch = Partial<{
  name: string;
  capacity: number;
  minimumPartySize: number;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}>;

export type NewTable = {
  name: string;
  capacity: number;
  minimumPartySize: number;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

function base(locationId: string): string {
  return `/api/floor/${locationId}`;
}

export async function fetchRooms(locationId: string): Promise<Room[]> {
  const response = await api(base(locationId));
  return response.rooms ?? [];
}

export async function createRoom(
  locationId: string,
  body: { name?: string; width?: number; height?: number },
): Promise<Room> {
  const response = await api(`${base(locationId)}/rooms`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response.room;
}

export async function updateRoom(
  locationId: string,
  roomId: string,
  body: { name?: string; width?: number; height?: number },
): Promise<Room> {
  const response = await api(`${base(locationId)}/rooms/${roomId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return response.room;
}

export async function deleteRoom(locationId: string, roomId: string): Promise<void> {
  await api(`${base(locationId)}/rooms/${roomId}`, { method: "DELETE" });
}

export async function createZone(
  locationId: string,
  roomId: string,
  body: { name: string; x?: number; y?: number; width?: number; height?: number },
): Promise<FloorZone> {
  const response = await api(`${base(locationId)}/rooms/${roomId}/zones`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response.zone;
}

export async function updateZone(
  locationId: string,
  zoneId: string,
  body: ZonePatch,
): Promise<FloorZone> {
  const response = await api(`${base(locationId)}/zones/${zoneId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return response.zone;
}

export async function deleteZone(locationId: string, zoneId: string): Promise<void> {
  await api(`${base(locationId)}/zones/${zoneId}`, { method: "DELETE" });
}

export async function createTable(
  locationId: string,
  roomId: string,
  body: NewTable,
): Promise<DiningTable> {
  const response = await api(`${base(locationId)}/rooms/${roomId}/tables`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response.table;
}

export async function updateTable(
  locationId: string,
  tableId: string,
  body: TablePatch,
): Promise<DiningTable> {
  const response = await api(`${base(locationId)}/tables/${tableId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return response.table;
}

export async function deleteTable(locationId: string, tableId: string): Promise<void> {
  await api(`${base(locationId)}/tables/${tableId}`, { method: "DELETE" });
}

export async function blockTable(locationId: string, tableId: string): Promise<DiningTable> {
  const response = await api(`${base(locationId)}/tables/${tableId}/block`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return response.table;
}

export async function unblockTable(locationId: string, tableId: string): Promise<DiningTable> {
  const response = await api(`${base(locationId)}/tables/${tableId}/unblock`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return response.table;
}

export type TableCombination = {
  id: string;
  locationId: string;
  name: string;
  tableIds: string[];
  minimumPartySize: number;
  isActive: boolean;
  capacity: number;
};

export async function fetchCombinations(locationId: string): Promise<TableCombination[]> {
  const response = await api(`${base(locationId)}/combinations`);
  return response.combinations ?? [];
}

export async function createCombination(
  locationId: string,
  body: { tableIds: string[]; name?: string; minimumPartySize?: number },
): Promise<TableCombination> {
  const response = await api(`${base(locationId)}/combinations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response.combination;
}

export async function deleteCombination(locationId: string, combinationId: string): Promise<void> {
  await api(`${base(locationId)}/combinations/${combinationId}`, { method: "DELETE" });
}

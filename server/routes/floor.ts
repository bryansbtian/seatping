import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBusiness } from "../lib/auth.js";
import { withWriteRetry } from "../lib/dbRetry.js";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  FLOOR_MAX_DIMENSION,
  FLOOR_MIN_DIMENSION,
  MAX_ROOMS_PER_LOCATION,
  MAX_ZONES_PER_ROOM,
  OBJECT_ID_RE,
  ROOM_NAME_MAX_LENGTH,
  ZONE_MIN_SIZE,
  ZONE_NAME_MAX_LENGTH,
  TABLE_MAX_CAPACITY,
  TABLE_MAX_POSITION,
  TABLE_MAX_SIZE,
  TABLE_MIN_CAPACITY,
  TABLE_MIN_SIZE,
  TABLE_NAME_MAX_LENGTH,
  assertReferencesOwned,
  clampZoneToRoom,
  completeAssignment,
  createAssignment,
  findOwnedTable,
  findOwnedZone,
  findRoom,
  isFailure,
  listRooms,
  moveAssignment,
  normalizeRotation,
  parseDate,
  parseInteger,
  parseName,
  parseObjectId,
  parseOptionalObjectId,
  parseOptionalText,
  parseShape,
  parseSource,
  parseStatus,
  resolveOccupancyWindow,
  serializeAssignment,
  serializeFloorPlan,
  serializeTable,
  serializeZone,
  setTableCleaning,
  updateAssignment,
  type AssignmentStatusValue,
  type Failure,
} from "../lib/floor.js";
import { buildLiveFloor } from "../lib/floorLive.js";

const router = Router();

router.use(requireBusiness);

type OwnedLocation = { id: string; businessId: string };

function businessId(req: Request): string {
  return (req as any).auth.sub as string;
}

function sendFailure(res: Response, failure: Failure) {
  return res.status(failure.status).json({ error: failure.error });
}

async function loadOwnedLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const locationId = String(req.params.locationId || "").trim();
    if (!OBJECT_ID_RE.test(locationId)) {
      return res.status(404).json({ error: "Location not found or access denied" });
    }
    const location = await prisma.location.findFirst({
      where: { id: locationId, businessId: businessId(req) },
      select: { id: true, businessId: true },
    });
    if (!location) {
      return res.status(404).json({ error: "Location not found or access denied" });
    }
    res.locals.location = location as OwnedLocation;
    next();
  } catch (err: any) {
    console.error("[floor] ownership check error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
}

function ownedLocation(res: Response): OwnedLocation {
  return res.locals.location as OwnedLocation;
}

async function requireRoom(locationId: string, roomId: string, res: Response) {
  const room = await findRoom(locationId, roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found or access denied" });
    return null;
  }
  return room;
}

function readRoomSize(body: any, res: Response) {
  const size: { width?: number; height?: number } = {};

  if (body?.width !== undefined) {
    const parsed = parseInteger(body.width, "width", FLOOR_MIN_DIMENSION, FLOOR_MAX_DIMENSION);
    if (isFailure(parsed)) {
      sendFailure(res, parsed);
      return null;
    }
    size.width = parsed.value;
  }

  if (body?.height !== undefined) {
    const parsed = parseInteger(body.height, "height", FLOOR_MIN_DIMENSION, FLOOR_MAX_DIMENSION);
    if (isFailure(parsed)) {
      sendFailure(res, parsed);
      return null;
    }
    size.height = parsed.value;
  }

  return size;
}

router.get("/:locationId", loadOwnedLocation, async (_req: Request, res: Response) => {
  try {
    const location = ownedLocation(res);
    const rooms = await listRooms(location.id);
    return res.json({ rooms: rooms.map(serializeFloorPlan) });
  } catch (err: any) {
    console.error("[floor] list rooms error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:locationId/rooms", loadOwnedLocation, async (req: Request, res: Response) => {
  try {
    const location = ownedLocation(res);

    const existing = await prisma.floorPlan.count({ where: { locationId: location.id } });
    if (existing >= MAX_ROOMS_PER_LOCATION) {
      return res.status(409).json({ error: "This location already has the maximum rooms" });
    }

    let name = "Main Dining Room";
    if (req.body?.name !== undefined) {
      const parsed = parseName(req.body.name, "name", ROOM_NAME_MAX_LENGTH);
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      name = parsed.value;
    }

    const duplicate = await prisma.floorPlan.findFirst({
      where: { locationId: location.id, name },
      select: { id: true },
    });
    if (duplicate) {
      return res.status(409).json({ error: "A room with that name already exists here" });
    }

    const size = readRoomSize(req.body, res);
    if (!size) {
      return undefined;
    }

    const room = await withWriteRetry(() =>
      prisma.floorPlan.create({
        data: {
          businessId: location.businessId,
          locationId: location.id,
          name,
          width: size.width ?? 1200,
          height: size.height ?? 800,
          sortOrder: existing,
        },
      }),
    );

    return res.status(201).json({ room: serializeFloorPlan({ ...room, tables: [], zones: [] }) });
  } catch (err: any) {
    console.error("[floor] create room error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch(
  "/:locationId/rooms/:roomId",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const room = await requireRoom(location.id, String(req.params.roomId || ""), res);
      if (!room) {
        return undefined;
      }

      const data: Record<string, unknown> = {};

      if (req.body?.name !== undefined) {
        const parsed = parseName(req.body.name, "name", ROOM_NAME_MAX_LENGTH);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        if (parsed.value !== room.name) {
          const duplicate = await prisma.floorPlan.findFirst({
            where: { locationId: location.id, name: parsed.value, id: { not: room.id } },
            select: { id: true },
          });
          if (duplicate) {
            return res.status(409).json({ error: "A room with that name already exists here" });
          }
        }
        data.name = parsed.value;
      }

      const size = readRoomSize(req.body, res);
      if (!size) {
        return undefined;
      }
      if (size.width !== undefined) {
        data.width = size.width;
      }
      if (size.height !== undefined) {
        data.height = size.height;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "No room changes provided" });
      }

      await withWriteRetry(() => prisma.floorPlan.update({ where: { id: room.id }, data }));

      const updated = await findRoom(location.id, room.id);
      return res.json({ room: serializeFloorPlan(updated) });
    } catch (err: any) {
      console.error("[floor] update room error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.delete(
  "/:locationId/rooms/:roomId",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const room = await requireRoom(location.id, String(req.params.roomId || ""), res);
      if (!room) {
        return undefined;
      }

      const active = await prisma.tableAssignment.findFirst({
        where: {
          locationId: location.id,
          status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          table: { floorPlanId: room.id },
        },
        select: { id: true },
      });
      if (active) {
        return res
          .status(409)
          .json({ error: "A table in this room still has an active assignment" });
      }

      await withWriteRetry(() => prisma.floorPlan.delete({ where: { id: room.id } }));

      return res.json({ deleted: true, roomId: room.id });
    } catch (err: any) {
      console.error("[floor] delete room error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/:locationId/rooms/:roomId/zones",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const room = await requireRoom(location.id, String(req.params.roomId || ""), res);
      if (!room) {
        return undefined;
      }

      if (room.zones.length >= MAX_ZONES_PER_ROOM) {
        return res.status(409).json({ error: "This room already has the maximum zones" });
      }

      const name = parseName(req.body?.name, "name", ZONE_NAME_MAX_LENGTH);
      if (isFailure(name)) {
        return sendFailure(res, name);
      }

      const duplicate = room.zones.find((zone) => zone.name === name.value);
      if (duplicate) {
        return res.status(409).json({ error: "A zone with that name already exists here" });
      }

      const geometry = { x: 0, y: 0, width: 300, height: 200 };
      const fields: [string, number, number][] = [
        ["x", 0, TABLE_MAX_POSITION],
        ["y", 0, TABLE_MAX_POSITION],
        ["width", ZONE_MIN_SIZE, TABLE_MAX_SIZE],
        ["height", ZONE_MIN_SIZE, TABLE_MAX_SIZE],
      ];
      for (const [field, min, max] of fields) {
        if (req.body?.[field] !== undefined) {
          const parsed = parseInteger(req.body[field], field, min, max);
          if (isFailure(parsed)) {
            return sendFailure(res, parsed);
          }
          geometry[field as "x" | "y" | "width" | "height"] = parsed.value;
        }
      }

      const bounded = clampZoneToRoom(geometry, room);

      const zone = await withWriteRetry(() =>
        prisma.floorZone.create({
          data: {
            floorPlanId: room.id,
            businessId: location.businessId,
            locationId: location.id,
            name: name.value,
            ...bounded,
          },
        }),
      );

      return res.status(201).json({ zone: serializeZone(zone) });
    } catch (err: any) {
      console.error("[floor] create zone error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.patch(
  "/:locationId/zones/:zoneId",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const zone = await findOwnedZone(location.id, String(req.params.zoneId || ""));
      if (!zone) {
        return res.status(404).json({ error: "Zone not found or access denied" });
      }

      const room = await prisma.floorPlan.findFirst({
        where: { id: zone.floorPlanId, locationId: location.id },
      });
      if (!room) {
        return res.status(404).json({ error: "Room not found or access denied" });
      }

      const data: Record<string, unknown> = {};

      if (req.body?.name !== undefined) {
        const parsed = parseName(req.body.name, "name", ZONE_NAME_MAX_LENGTH);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        if (parsed.value !== zone.name) {
          const duplicate = await prisma.floorZone.findFirst({
            where: { floorPlanId: zone.floorPlanId, name: parsed.value, id: { not: zone.id } },
            select: { id: true },
          });
          if (duplicate) {
            return res.status(409).json({ error: "A zone with that name already exists here" });
          }
        }
        data.name = parsed.value;
      }

      const geometry = { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
      const fields: [string, number, number][] = [
        ["x", 0, TABLE_MAX_POSITION],
        ["y", 0, TABLE_MAX_POSITION],
        ["width", ZONE_MIN_SIZE, TABLE_MAX_SIZE],
        ["height", ZONE_MIN_SIZE, TABLE_MAX_SIZE],
      ];
      let geometryTouched = false;
      for (const [field, min, max] of fields) {
        if (req.body?.[field] !== undefined) {
          const parsed = parseInteger(req.body[field], field, min, max);
          if (isFailure(parsed)) {
            return sendFailure(res, parsed);
          }
          geometry[field as "x" | "y" | "width" | "height"] = parsed.value;
          geometryTouched = true;
        }
      }

      if (geometryTouched) {
        Object.assign(data, clampZoneToRoom(geometry, room));
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "No zone changes provided" });
      }

      const updated = await withWriteRetry(() =>
        prisma.floorZone.update({ where: { id: zone.id }, data }),
      );

      return res.json({ zone: serializeZone(updated) });
    } catch (err: any) {
      console.error("[floor] update zone error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.delete(
  "/:locationId/zones/:zoneId",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const zone = await findOwnedZone(location.id, String(req.params.zoneId || ""));
      if (!zone) {
        return res.status(404).json({ error: "Zone not found or access denied" });
      }

      await withWriteRetry(() => prisma.floorZone.delete({ where: { id: zone.id } }));

      return res.json({ deleted: true, zoneId: zone.id });
    } catch (err: any) {
      console.error("[floor] delete zone error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/:locationId/rooms/:roomId/tables",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const room = await requireRoom(location.id, String(req.params.roomId || ""), res);
      if (!room) {
        return undefined;
      }

      const name = parseName(req.body?.name, "name", TABLE_NAME_MAX_LENGTH);
      if (isFailure(name)) {
        return sendFailure(res, name);
      }

      const capacity = parseInteger(
        req.body?.capacity,
        "capacity",
        TABLE_MIN_CAPACITY,
        TABLE_MAX_CAPACITY,
      );
      if (isFailure(capacity)) {
        return sendFailure(res, capacity);
      }

      let minimumPartySize = 1;
      if (req.body?.minimumPartySize !== undefined && req.body?.minimumPartySize !== null) {
        const parsed = parseInteger(
          req.body.minimumPartySize,
          "minimumPartySize",
          TABLE_MIN_CAPACITY,
          TABLE_MAX_CAPACITY,
        );
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        minimumPartySize = parsed.value;
      }
      if (minimumPartySize > capacity.value) {
        return res.status(400).json({ error: "minimumPartySize cannot exceed capacity" });
      }

      let shape = "RECTANGLE";
      if (req.body?.shape !== undefined) {
        const parsed = parseShape(req.body.shape);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        shape = parsed.value;
      }

      const geometry: Record<string, number> = { x: 0, y: 0, width: 120, height: 80, rotation: 0 };
      const geometryFields: [string, number, number][] = [
        ["x", 0, TABLE_MAX_POSITION],
        ["y", 0, TABLE_MAX_POSITION],
        ["width", TABLE_MIN_SIZE, TABLE_MAX_SIZE],
        ["height", TABLE_MIN_SIZE, TABLE_MAX_SIZE],
      ];
      for (const [field, min, max] of geometryFields) {
        if (req.body?.[field] !== undefined) {
          const parsed = parseInteger(req.body[field], field, min, max);
          if (isFailure(parsed)) {
            return sendFailure(res, parsed);
          }
          geometry[field] = parsed.value;
        }
      }
      if (req.body?.rotation !== undefined) {
        const parsed = parseInteger(req.body.rotation, "rotation", -3600, 3600);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        geometry.rotation = normalizeRotation(parsed.value);
      }

      const duplicate = await prisma.diningTable.findFirst({
        where: { locationId: location.id, name: name.value },
        select: { id: true },
      });
      if (duplicate) {
        return res.status(409).json({ error: "A table with that name already exists here" });
      }

      const table = await withWriteRetry(() =>
        prisma.diningTable.create({
          data: {
            floorPlanId: room.id,
            businessId: location.businessId,
            locationId: location.id,
            name: name.value,
            capacity: capacity.value,
            minimumPartySize,
            shape: shape as any,
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            rotation: geometry.rotation,
          },
        }),
      );

      return res.status(201).json({ table: serializeTable(table) });
    } catch (err: any) {
      console.error("[floor] create table error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.patch(
  "/:locationId/tables/:tableId",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const table = await findOwnedTable(location.id, String(req.params.tableId || ""));
      if (!table) {
        return res.status(404).json({ error: "Table not found or access denied" });
      }

      const data: Record<string, unknown> = {};

      if (req.body?.name !== undefined) {
        const parsed = parseName(req.body.name, "name", TABLE_NAME_MAX_LENGTH);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        if (parsed.value !== table.name) {
          const duplicate = await prisma.diningTable.findFirst({
            where: { locationId: location.id, name: parsed.value, id: { not: table.id } },
            select: { id: true },
          });
          if (duplicate) {
            return res.status(409).json({ error: "A table with that name already exists here" });
          }
        }
        data.name = parsed.value;
      }

      let capacity = table.capacity;
      if (req.body?.capacity !== undefined) {
        const parsed = parseInteger(
          req.body.capacity,
          "capacity",
          TABLE_MIN_CAPACITY,
          TABLE_MAX_CAPACITY,
        );
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        capacity = parsed.value;
        data.capacity = parsed.value;
      }

      let minimumPartySize = table.minimumPartySize;
      if (req.body?.minimumPartySize !== undefined) {
        const parsed = parseInteger(
          req.body.minimumPartySize,
          "minimumPartySize",
          TABLE_MIN_CAPACITY,
          TABLE_MAX_CAPACITY,
        );
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        minimumPartySize = parsed.value;
        data.minimumPartySize = parsed.value;
      }

      if (minimumPartySize > capacity) {
        return res.status(400).json({ error: "minimumPartySize cannot exceed capacity" });
      }

      if (req.body?.shape !== undefined) {
        const parsed = parseShape(req.body.shape);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        data.shape = parsed.value;
      }

      const geometryFields: [string, number, number][] = [
        ["x", 0, TABLE_MAX_POSITION],
        ["y", 0, TABLE_MAX_POSITION],
        ["width", TABLE_MIN_SIZE, TABLE_MAX_SIZE],
        ["height", TABLE_MIN_SIZE, TABLE_MAX_SIZE],
      ];
      for (const [field, min, max] of geometryFields) {
        if (req.body?.[field] !== undefined) {
          const parsed = parseInteger(req.body[field], field, min, max);
          if (isFailure(parsed)) {
            return sendFailure(res, parsed);
          }
          data[field] = parsed.value;
        }
      }

      if (req.body?.rotation !== undefined) {
        const parsed = parseInteger(req.body.rotation, "rotation", -3600, 3600);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        data.rotation = normalizeRotation(parsed.value);
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "No table changes provided" });
      }

      const updated = await withWriteRetry(() =>
        prisma.diningTable.update({ where: { id: table.id }, data }),
      );

      return res.json({ table: serializeTable(updated) });
    } catch (err: any) {
      console.error("[floor] update table error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.delete(
  "/:locationId/tables/:tableId",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const table = await findOwnedTable(location.id, String(req.params.tableId || ""));
      if (!table) {
        return res.status(404).json({ error: "Table not found or access denied" });
      }

      const active = await prisma.tableAssignment.findFirst({
        where: { tableId: table.id, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
        select: { id: true },
      });
      if (active) {
        return res
          .status(409)
          .json({ error: "Table still has an active assignment and cannot be deleted" });
      }

      await withWriteRetry(() => prisma.diningTable.delete({ where: { id: table.id } }));

      return res.json({ deleted: true, tableId: table.id });
    } catch (err: any) {
      console.error("[floor] delete table error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/:locationId/tables/:tableId/block",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const table = await findOwnedTable(location.id, String(req.params.tableId || ""));
      if (!table) {
        return res.status(404).json({ error: "Table not found or access denied" });
      }

      const updated = await withWriteRetry(() =>
        prisma.diningTable.update({
          where: { id: table.id },
          data: { isBlocked: true },
        }),
      );

      return res.json({ table: serializeTable(updated) });
    } catch (err: any) {
      console.error("[floor] block table error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/:locationId/tables/:tableId/unblock",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const table = await findOwnedTable(location.id, String(req.params.tableId || ""));
      if (!table) {
        return res.status(404).json({ error: "Table not found or access denied" });
      }

      const updated = await withWriteRetry(() =>
        prisma.diningTable.update({
          where: { id: table.id },
          data: { isBlocked: false },
        }),
      );

      return res.json({ table: serializeTable(updated) });
    } catch (err: any) {
      console.error("[floor] unblock table error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.get("/:locationId/live", loadOwnedLocation, async (_req: Request, res: Response) => {
  try {
    const location = ownedLocation(res);
    const live = await buildLiveFloor(location.id);
    return res.json(live);
  } catch (err: any) {
    console.error("[floor] live floor error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post(
  "/:locationId/tables/:tableId/cleaning",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const outcome = await setTableCleaning(location.id, String(req.params.tableId || ""), true);
      if (isFailure(outcome)) {
        return sendFailure(res, outcome);
      }
      return res.json({ table: serializeTable(outcome.value) });
    } catch (err: any) {
      console.error("[floor] mark cleaning error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/:locationId/tables/:tableId/available",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const outcome = await setTableCleaning(location.id, String(req.params.tableId || ""), false);
      if (isFailure(outcome)) {
        return sendFailure(res, outcome);
      }
      return res.json({ table: serializeTable(outcome.value) });
    } catch (err: any) {
      console.error("[floor] mark available error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/:locationId/tables/:tableId/seat",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);

      const queueEntryId = parseOptionalObjectId(req.body?.queueEntryId, "queueEntryId");
      if (isFailure(queueEntryId)) {
        return sendFailure(res, queueEntryId);
      }
      const reservationId = parseOptionalObjectId(req.body?.reservationId, "reservationId");
      if (isFailure(reservationId)) {
        return sendFailure(res, reservationId);
      }
      const guestProfileId = parseOptionalObjectId(req.body?.guestProfileId, "guestProfileId");
      if (isFailure(guestProfileId)) {
        return sendFailure(res, guestProfileId);
      }

      if (queueEntryId.value && reservationId.value) {
        return res
          .status(400)
          .json({ error: "An assignment cannot reference both a queue entry and a reservation" });
      }

      const referenceFailure = await assertReferencesOwned({
        locationId: location.id,
        queueEntryId: queueEntryId.value,
        reservationId: reservationId.value,
        guestProfileId: guestProfileId.value,
      });
      if (referenceFailure) {
        return sendFailure(res, referenceFailure);
      }

      let partySize: number | null = null;
      if (req.body?.partySize !== undefined) {
        const parsed = parseInteger(
          req.body.partySize,
          "partySize",
          TABLE_MIN_CAPACITY,
          TABLE_MAX_CAPACITY,
        );
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        partySize = parsed.value;
      }

      if (partySize === null && queueEntryId.value) {
        const entry = await prisma.queueEntry.findUnique({
          where: { id: queueEntryId.value },
          select: { guestCount: true },
        });
        partySize = entry?.guestCount ?? null;
      }
      if (partySize === null && reservationId.value) {
        const reservation = await prisma.reservation.findUnique({
          where: { id: reservationId.value },
          select: { guestCount: true },
        });
        partySize = reservation?.guestCount ?? null;
      }
      if (partySize === null) {
        return res.status(400).json({ error: "partySize is required" });
      }

      const window = resolveOccupancyWindow({
        expectedStartAt: req.body?.expectedStartAt ?? new Date().toISOString(),
        expectedEndAt: req.body?.expectedEndAt,
        turnMinutes: req.body?.turnMinutes,
      });
      if (isFailure(window)) {
        return sendFailure(res, window);
      }

      const outcome = await createAssignment({
        businessId: location.businessId,
        locationId: location.id,
        tableId: String(req.params.tableId || ""),
        partySize,
        source: "MANUAL",
        status: "SEATED",
        expectedStartAt: window.value.start,
        expectedEndAt: window.value.end,
        queueEntryId: queueEntryId.value,
        reservationId: reservationId.value,
        guestProfileId: guestProfileId.value,
      });
      if (isFailure(outcome)) {
        return sendFailure(res, outcome);
      }

      return res.status(201).json({ assignment: serializeAssignment(outcome.value) });
    } catch (err: any) {
      console.error("[floor] seat party error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/:locationId/assignments/:assignmentId/move",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const tableId = parseObjectId(req.body?.tableId, "tableId");
      if (isFailure(tableId)) {
        return sendFailure(res, tableId);
      }

      const outcome = await moveAssignment({
        locationId: location.id,
        assignmentId: String(req.params.assignmentId || ""),
        tableId: tableId.value,
      });
      if (isFailure(outcome)) {
        return sendFailure(res, outcome);
      }

      return res.json({ assignment: serializeAssignment(outcome.value) });
    } catch (err: any) {
      console.error("[floor] move party error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.get("/:locationId/assignments", loadOwnedLocation, async (req: Request, res: Response) => {
  try {
    const location = ownedLocation(res);
    const where: Record<string, unknown> = { locationId: location.id };

    if (req.query.tableId !== undefined) {
      const parsed = parseObjectId(req.query.tableId, "tableId");
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      where.tableId = parsed.value;
    }

    if (req.query.status !== undefined) {
      const raw = String(req.query.status);
      if (raw === "ACTIVE") {
        where.status = { in: [...ACTIVE_ASSIGNMENT_STATUSES] };
      } else {
        const parsed = parseStatus(raw);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        where.status = parsed.value;
      }
    }

    if (req.query.from !== undefined) {
      const parsed = parseDate(req.query.from, "from");
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      where.expectedEndAt = { gt: parsed.value };
    }

    if (req.query.to !== undefined) {
      const parsed = parseDate(req.query.to, "to");
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      where.expectedStartAt = { lt: parsed.value };
    }

    const assignments = await prisma.tableAssignment.findMany({
      where,
      orderBy: { expectedStartAt: "asc" },
      take: 500,
    });

    return res.json({ assignments: assignments.map(serializeAssignment) });
  } catch (err: any) {
    console.error("[floor] list assignments error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:locationId/assignments", loadOwnedLocation, async (req: Request, res: Response) => {
  try {
    const location = ownedLocation(res);

    const tableId = parseObjectId(req.body?.tableId, "tableId");
    if (isFailure(tableId)) {
      return sendFailure(res, tableId);
    }

    const partySize = parseInteger(
      req.body?.partySize,
      "partySize",
      TABLE_MIN_CAPACITY,
      TABLE_MAX_CAPACITY,
    );
    if (isFailure(partySize)) {
      return sendFailure(res, partySize);
    }

    const source = parseSource(req.body?.source);
    if (isFailure(source)) {
      return sendFailure(res, source);
    }

    let status: AssignmentStatusValue = "RESERVED";
    if (req.body?.status !== undefined) {
      const parsed = parseStatus(req.body.status);
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      if (parsed.value !== "RESERVED" && parsed.value !== "SEATED") {
        return res.status(400).json({ error: "status must be RESERVED or SEATED on creation" });
      }
      status = parsed.value;
    }

    const window = resolveOccupancyWindow(req.body);
    if (isFailure(window)) {
      return sendFailure(res, window);
    }

    const queueEntryId = parseOptionalObjectId(req.body?.queueEntryId, "queueEntryId");
    if (isFailure(queueEntryId)) {
      return sendFailure(res, queueEntryId);
    }
    const reservationId = parseOptionalObjectId(req.body?.reservationId, "reservationId");
    if (isFailure(reservationId)) {
      return sendFailure(res, reservationId);
    }
    const guestProfileId = parseOptionalObjectId(req.body?.guestProfileId, "guestProfileId");
    if (isFailure(guestProfileId)) {
      return sendFailure(res, guestProfileId);
    }

    if (queueEntryId.value && reservationId.value) {
      return res
        .status(400)
        .json({ error: "An assignment cannot reference both a queue entry and a reservation" });
    }

    const referenceFailure = await assertReferencesOwned({
      locationId: location.id,
      queueEntryId: queueEntryId.value,
      reservationId: reservationId.value,
      guestProfileId: guestProfileId.value,
    });
    if (referenceFailure) {
      return sendFailure(res, referenceFailure);
    }

    const outcome = await createAssignment({
      businessId: location.businessId,
      locationId: location.id,
      tableId: tableId.value,
      partySize: partySize.value,
      source: source.value,
      status,
      expectedStartAt: window.value.start,
      expectedEndAt: window.value.end,
      queueEntryId: queueEntryId.value,
      reservationId: reservationId.value,
      guestProfileId: guestProfileId.value,
    });
    if (isFailure(outcome)) {
      return sendFailure(res, outcome);
    }

    return res.status(201).json({ assignment: serializeAssignment(outcome.value) });
  } catch (err: any) {
    console.error("[floor] create assignment error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch(
  "/:locationId/assignments/:assignmentId",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);

      let status: AssignmentStatusValue | null = null;
      if (req.body?.status !== undefined) {
        const parsed = parseStatus(req.body.status);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        status = parsed.value;
      }

      let partySize: number | null = null;
      if (req.body?.partySize !== undefined) {
        const parsed = parseInteger(
          req.body.partySize,
          "partySize",
          TABLE_MIN_CAPACITY,
          TABLE_MAX_CAPACITY,
        );
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        partySize = parsed.value;
      }

      let expectedStartAt: Date | null = null;
      if (req.body?.expectedStartAt !== undefined) {
        const parsed = parseDate(req.body.expectedStartAt, "expectedStartAt");
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        expectedStartAt = parsed.value;
      }

      let expectedEndAt: Date | null = null;
      if (req.body?.expectedEndAt !== undefined) {
        const parsed = parseDate(req.body.expectedEndAt, "expectedEndAt");
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        expectedEndAt = parsed.value;
      }

      if (!status && partySize === null && !expectedStartAt && !expectedEndAt) {
        return res.status(400).json({ error: "No assignment changes provided" });
      }

      const outcome = await updateAssignment({
        locationId: location.id,
        assignmentId: String(req.params.assignmentId || ""),
        status,
        partySize,
        expectedStartAt,
        expectedEndAt,
      });
      if (isFailure(outcome)) {
        return sendFailure(res, outcome);
      }

      return res.json({ assignment: serializeAssignment(outcome.value) });
    } catch (err: any) {
      console.error("[floor] update assignment error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post(
  "/:locationId/assignments/:assignmentId/complete",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = ownedLocation(res);
      const outcome = await completeAssignment(location.id, String(req.params.assignmentId || ""));
      if (isFailure(outcome)) {
        return sendFailure(res, outcome);
      }
      return res.json({ assignment: serializeAssignment(outcome.value) });
    } catch (err: any) {
      console.error("[floor] complete assignment error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;

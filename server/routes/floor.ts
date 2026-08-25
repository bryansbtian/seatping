import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBusiness } from "../lib/auth.js";
import { withWriteRetry } from "../lib/dbRetry.js";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  BLOCK_REASON_MAX_LENGTH,
  FLOOR_MAX_DIMENSION,
  FLOOR_MIN_DIMENSION,
  FLOOR_NAME_MAX_LENGTH,
  OBJECT_ID_RE,
  SECTION_MAX_LENGTH,
  TABLE_MAX_CAPACITY,
  TABLE_MAX_POSITION,
  TABLE_MAX_SIZE,
  TABLE_MIN_CAPACITY,
  TABLE_MIN_SIZE,
  TABLE_NAME_MAX_LENGTH,
  assertReferencesOwned,
  completeAssignment,
  createAssignment,
  findFloorPlan,
  findOwnedTable,
  isFailure,
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
  updateAssignment,
  type AssignmentStatusValue,
  type Failure,
} from "../lib/floor.js";

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

async function requireFloorPlan(locationId: string, res: Response) {
  const plan = await prisma.floorPlan.findUnique({ where: { locationId } });
  if (!plan) {
    res.status(404).json({ error: "Floor plan not found" });
    return null;
  }
  return plan;
}

router.get("/:locationId", loadOwnedLocation, async (_req: Request, res: Response) => {
  try {
    const location = ownedLocation(res);
    const plan = await findFloorPlan(location.id);
    if (!plan) {
      return res.json({ floorPlan: null });
    }
    return res.json({ floorPlan: serializeFloorPlan(plan) });
  } catch (err: any) {
    console.error("[floor] get plan error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:locationId", loadOwnedLocation, async (req: Request, res: Response) => {
  try {
    const location = ownedLocation(res);

    const existing = await prisma.floorPlan.findUnique({ where: { locationId: location.id } });
    if (existing) {
      return res.status(409).json({ error: "This location already has a floor plan" });
    }

    let name = "Main Floor";
    if (req.body?.name !== undefined) {
      const parsed = parseName(req.body.name, "name", FLOOR_NAME_MAX_LENGTH);
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      name = parsed.value;
    }

    let width = 1200;
    if (req.body?.width !== undefined) {
      const parsed = parseInteger(
        req.body.width,
        "width",
        FLOOR_MIN_DIMENSION,
        FLOOR_MAX_DIMENSION,
      );
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      width = parsed.value;
    }

    let height = 800;
    if (req.body?.height !== undefined) {
      const parsed = parseInteger(
        req.body.height,
        "height",
        FLOOR_MIN_DIMENSION,
        FLOOR_MAX_DIMENSION,
      );
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      height = parsed.value;
    }

    const plan = await withWriteRetry(() =>
      prisma.floorPlan.create({
        data: { businessId: location.businessId, locationId: location.id, name, width, height },
      }),
    );

    return res.status(201).json({ floorPlan: serializeFloorPlan({ ...plan, tables: [] }) });
  } catch (err: any) {
    console.error("[floor] create plan error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:locationId", loadOwnedLocation, async (req: Request, res: Response) => {
  try {
    const location = ownedLocation(res);
    const plan = await requireFloorPlan(location.id, res);
    if (!plan) {
      return undefined;
    }

    const data: Record<string, unknown> = {};

    if (req.body?.name !== undefined) {
      const parsed = parseName(req.body.name, "name", FLOOR_NAME_MAX_LENGTH);
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      data.name = parsed.value;
    }

    if (req.body?.width !== undefined) {
      const parsed = parseInteger(
        req.body.width,
        "width",
        FLOOR_MIN_DIMENSION,
        FLOOR_MAX_DIMENSION,
      );
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      data.width = parsed.value;
    }

    if (req.body?.height !== undefined) {
      const parsed = parseInteger(
        req.body.height,
        "height",
        FLOOR_MIN_DIMENSION,
        FLOOR_MAX_DIMENSION,
      );
      if (isFailure(parsed)) {
        return sendFailure(res, parsed);
      }
      data.height = parsed.value;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No floor plan changes provided" });
    }

    await withWriteRetry(() => prisma.floorPlan.update({ where: { id: plan.id }, data }));

    const updated = await findFloorPlan(location.id);
    return res.json({ floorPlan: serializeFloorPlan(updated) });
  } catch (err: any) {
    console.error("[floor] update plan error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:locationId/tables", loadOwnedLocation, async (req: Request, res: Response) => {
  try {
    const location = ownedLocation(res);
    const plan = await requireFloorPlan(location.id, res);
    if (!plan) {
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

    const section = parseOptionalText(req.body?.section, "section", SECTION_MAX_LENGTH);
    if (isFailure(section)) {
      return sendFailure(res, section);
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
          floorPlanId: plan.id,
          businessId: location.businessId,
          locationId: location.id,
          name: name.value,
          capacity: capacity.value,
          minimumPartySize,
          shape: shape as any,
          section: section.value,
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
});

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

      if (req.body?.section !== undefined) {
        const parsed = parseOptionalText(req.body.section, "section", SECTION_MAX_LENGTH);
        if (isFailure(parsed)) {
          return sendFailure(res, parsed);
        }
        data.section = parsed.value;
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

      const reason = parseOptionalText(req.body?.reason, "reason", BLOCK_REASON_MAX_LENGTH);
      if (isFailure(reason)) {
        return sendFailure(res, reason);
      }

      const updated = await withWriteRetry(() =>
        prisma.diningTable.update({
          where: { id: table.id },
          data: { isBlocked: true, blockedReason: reason.value },
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
          data: { isBlocked: false, blockedReason: null },
        }),
      );

      return res.json({ table: serializeTable(updated) });
    } catch (err: any) {
      console.error("[floor] unblock table error:", err?.message || err);
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

import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBusiness } from "../lib/auth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { computePerformance, previousRange, resolveRange } from "../lib/performance.js";
import { getDateOperatingStatus, getLocationOpeningHours } from "../lib/operatingHours.js";

const router = Router();

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

router.use(requireBusiness);
router.use(rateLimit({ name: "performance", windowMs: 60 * 1000, max: 60 }));

router.get("/:locationId", async (req: Request, res: Response) => {
  try {
    const businessId = (req as any).auth.sub as string;
    const locationId = String(req.params.locationId || "").trim();
    if (!OBJECT_ID_RE.test(locationId)) {
      return res.status(404).json({ error: "Location not found or access denied" });
    }

    const location = await prisma.location.findFirst({
      where: { id: locationId, businessId },
      select: { id: true, restaurantProfile: true },
    });
    if (!location) {
      return res.status(404).json({ error: "Location not found or access denied" });
    }

    const range = resolveRange(
      String(req.query.preset || "today"),
      String(req.query.from || ""),
      String(req.query.to || ""),
    );
    if (!range) {
      return res.status(400).json({ error: "A valid date range is required" });
    }

    const prior = previousRange(range);

    const [queueEntries, reservations, assignments, tables] = await Promise.all([
      prisma.queueEntry.findMany({
        where: { locationId, joinedAt: { gte: range.from, lt: range.to } },
        select: {
          guestCount: true,
          status: true,
          joinedAt: true,
          admittedAt: true,
          arrivedAt: true,
          noShowAt: true,
          removedAt: true,
          leftAt: true,
        },
      }),
      prisma.reservation.findMany({
        where: {
          locationId,
          OR: [
            { arrivedAt: { gte: range.from, lt: range.to } },
            { completedAt: { gte: range.from, lt: range.to } },
            { noShowAt: { gte: range.from, lt: range.to } },
            { cancelledAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          guestCount: true,
          status: true,
          reservationDateTime: true,
          arrivedAt: true,
          completedAt: true,
          cancelledAt: true,
          noShowAt: true,
        },
      }),
      prisma.tableAssignment.findMany({
        where: {
          locationId,
          OR: [
            { seatedAt: { gte: prior.from, lt: range.to } },
            { completedAt: { gte: range.from, lt: range.to } },
          ],
        },
        select: {
          tableId: true,
          tableIds: true,
          partySize: true,
          source: true,
          status: true,
          seatedAt: true,
          completedAt: true,
          queueEntryId: true,
          reservationId: true,
        },
      }),
      prisma.diningTable.findMany({
        where: { locationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const openingHours = getLocationOpeningHours(location);
    const openMinutesForDate = (dateKey: string): number | null => {
      const status = getDateOperatingStatus(openingHours, dateKey);
      if (!status.configured) {
        return null;
      }
      if (status.isClosed) {
        return 0;
      }
      let minutes = 0;
      for (const window of status.windows) {
        minutes += Math.max(0, window.closeMin - window.openMin);
      }
      return minutes;
    };

    const metrics = computePerformance({
      range,
      queueEntries,
      reservations,
      assignments,
      tables,
      openMinutesForDate,
    });

    return res.json({
      range: {
        preset: range.preset,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      metrics,
    });
  } catch (err: any) {
    console.error("[performance] metrics error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;

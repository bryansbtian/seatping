import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBusiness } from "../lib/auth.js";
import { resolveAudienceGuests } from "../lib/campaigns.js";
import { isReturning } from "../lib/guests.js";

const PREVIEW_GUEST_LIMIT = 100;

function bizId(req: any): string {
  const sub = req.auth?.sub;
  if (!sub) throw new Error("Unauthorized");
  return sub;
}

const router = Router();
router.use(requireBusiness);

router.get("/", async (req, res) => {
  try {
    const businessId = bizId(req);
    const locationId = String(req.query.locationId || "");
    if (!locationId) {
      return res.status(400).json({ error: "locationId is required" });
    }

    const audiences = await prisma.savedAudience.findMany({
      where: { businessId, locationId },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ audiences });
  } catch (err: any) {
    console.error("[audiences] list error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const businessId = bizId(req);
    const { locationId, name, description, filters } = req.body;

    if (!locationId || !name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Location ID and Name are required" });
    }

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business not found" });

    const audience = await prisma.savedAudience.create({
      data: {
        businessId,
        businessUsername: business.username,
        locationId,
        name: name.trim(),
        description: description ? String(description).trim() : null,
        filters: filters || {},
      },
    });

    return res.json({ audience });
  } catch (err: any) {
    console.error("[audiences] create error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/preview", async (req, res) => {
  try {
    const businessId = bizId(req);
    const { locationId, filters, timezone } = req.body;

    if (!locationId) {
      return res.status(400).json({ error: "locationId is required" });
    }

    const guests = await resolveAudienceGuests({
      businessId,
      locationId,
      audienceType: "custom_group",
      audienceConfig: { filters },
      timezone: timezone || "UTC",
    });

    const preview = guests.slice(0, PREVIEW_GUEST_LIMIT).map((g) => ({
      id: g.id,
      fullName:
        g.fullName ||
        [g.firstName, g.lastName].filter(Boolean).join(" ") ||
        null,
      phone: g.phone,
      normalizedPhone: g.normalizedPhone,
      email: g.email,
      tags: g.tags,
      lastVisitAt: g.lastVisitAt,
      totalVisits: g.totalVisits,
      returning: isReturning(g.totalVisits),
    }));

    return res.json({ count: guests.length, guests: preview });
  } catch (err: any) {
    console.error("[audiences] preview error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    const { name, description, filters } = req.body;

    const existing = await prisma.savedAudience.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Audience not found" });

    const audience = await prisma.savedAudience.update({
      where: { id },
      data: {
        name: typeof name === "string" && name.trim() ? name.trim() : existing.name,
        description: description !== undefined ? (description ? String(description).trim() : null) : existing.description,
        filters: filters !== undefined ? filters : existing.filters,
      },
    });

    return res.json({ audience });
  } catch (err: any) {
    console.error("[audiences] update error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");

    const existing = await prisma.savedAudience.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Audience not found" });

    await prisma.savedAudience.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[audiences] delete error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;

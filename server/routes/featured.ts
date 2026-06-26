import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const rows = await prisma.featuredRestaurant.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        business: { select: { username: true, name: true } },
        location: {
          include: { photos: { orderBy: { createdAt: "asc" }, take: 1 } },
        },
      },
    });

    const locationIds = rows.map((r) => r.locationId);
    const summaries =
      locationIds.length > 0
        ? await prisma.review.groupBy({
            by: ["locationId"],
            where: { locationId: { in: locationIds } },
            _avg: { rating: true },
            _count: { _all: true },
          })
        : [];
    const summaryByLocation = new Map(
      summaries.map((s) => [
        s.locationId,
        {
          rating:
            typeof s._avg.rating === "number"
              ? Math.round(s._avg.rating * 10) / 10
              : null,
          reviewCount: s._count._all,
        },
      ]),
    );

    const featured = rows.map((r) => {
      const loc: any = r.location || {};
      const rp: any = loc.restaurantProfile || {};
      const summary = summaryByLocation.get(r.locationId) || {
        rating: null,
        reviewCount: 0,
      };
      const bannerImageUrl =
        loc.bannerImageUrl || (loc.photos?.[0]?.url ?? null);

      return {
        id: r.id,
        locationId: r.locationId,
        sortOrder: r.sortOrder,
        businessUsername: r.business?.username ?? null,
        businessName: r.business?.name ?? null,
        name:
          rp.displayName || r.business?.name || loc.displayName || loc.name || "Restaurant",
        shortAddress: rp.shortAddress || loc.displayName || loc.area || loc.city || null,
        address: loc.address ?? "",
        area: loc.area ?? null,
        city: loc.city ?? null,
        cuisine:
          Array.isArray(rp.cuisineTypes) && rp.cuisineTypes.length
            ? rp.cuisineTypes[0]
            : null,
        priceRange: rp.priceRange ?? null,
        bannerImageUrl,
        rating: summary.rating,
        reviewCount: summary.reviewCount,
        reservationsEnabled: loc.reservationsEnabled ?? true,
        queueEnabled: loc.queueEnabled ?? true,
      };
    });

    return res.json({ featured });
  } catch (err: any) {
    console.error("[featured] list error:", err?.message || err);
    return res.status(500).json({ error: "Failed to load featured restaurants." });
  }
});

export default router;

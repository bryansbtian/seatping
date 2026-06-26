import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { limitGuard, clientIp, MINUTES } from "../lib/rateLimit.js";

const router = Router();

function pickCuisine(rp: any): string | null {
  if (!rp || typeof rp !== "object") return null;
  const arr = (rp as any).cuisineTypes;
  return Array.isArray(arr) && arr.length ? String(arr[0]) : null;
}

function isOpenNow(openingHours: any): boolean | null {
  if (!openingHours || typeof openingHours !== "object") return null;
  const tz =
    typeof openingHours.timezone === "string" && openingHours.timezone
      ? openingHours.timezone
      : undefined;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const weekday = parts.find((p) => p.type === "weekday")?.value?.toLowerCase();
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    if (!weekday) return null;
    const day = openingHours[weekday];
    if (!day || typeof day !== "object" || !day.enabled) return false;
    const open = String(day.open || "");
    const close = String(day.close || "");
    if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) return null;
    const cur = `${hour}:${minute}`;
    if (close <= open) return cur >= open || cur < close;
    return cur >= open && cur < close;
  } catch {
    return null;
  }
}

function matchesQuery(loc: any, business: any, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const rp = (loc?.restaurantProfile || {}) as any;
  const details = (rp?.details || {}) as any;
  const haystack = [
    loc?.displayName,
    loc?.name,
    loc?.address,
    loc?.area,
    loc?.city,
    loc?.country,
    business?.username,
    business?.name,
    rp?.displayName,
    rp?.tagline,
    rp?.description,
    rp?.priceRange,
    details?.city,
    details?.area,
    details?.address,
    ...(Array.isArray(rp?.cuisineTypes) ? rp.cuisineTypes : []),
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return haystack.some((s) => s.includes(needle));
}

router.get("/restaurants", async (req, res) => {
  try {
    if (
      await limitGuard(req, res, [
        { name: "search-restaurants-ip", key: clientIp(req), windowMs: MINUTES(1), max: 60 },
      ])
    )
      return;

    const q = String(req.query.query || "").trim();

    const rawLimit = parseInt(String(req.query.limit ?? ""), 10);
    const paginate = Number.isFinite(rawLimit) && rawLimit > 0;
    const limit = paginate ? Math.min(100, rawLimit) : Infinity;
    const rawPage = parseInt(String(req.query.page ?? "1"), 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

    const locations = await prisma.location.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: "desc" },
      include: {
        photos: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    });

    const businessIds = Array.from(
      new Set(locations.map((l) => l.businessId).filter(Boolean)),
    );
    const businesses = await prisma.business.findMany({
      where: { id: { in: businessIds } },
      select: { id: true, name: true, username: true },
    });
    const businessById = new Map(businesses.map((b) => [b.id, b]));

    const matched = locations.filter((loc) =>
      matchesQuery(loc, businessById.get(loc.businessId), q),
    );
    const total = matched.length;
    const filtered = paginate
      ? matched.slice((page - 1) * limit, (page - 1) * limit + limit)
      : matched;

    const locationIds = filtered.map((l) => l.id);
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

    const featuredRows = await prisma.featuredRestaurant.findMany({
      where: { isActive: true, locationId: { in: locationIds } },
      select: { locationId: true },
    });
    const featuredSet = new Set(featuredRows.map((f) => f.locationId));

    const results = filtered.map((loc: any) => {
      const rp = (loc.restaurantProfile || {}) as any;
      const business = businessById.get(loc.businessId);
      const summary = summaryByLocation.get(loc.id) || {
        rating: null,
        reviewCount: 0,
      };
      const bannerImageUrl =
        loc.bannerImageUrl || (loc.photos?.[0]?.url ?? null);
      return {
        locationId: loc.id,
        businessUsername: business?.username ?? null,
        businessName: business?.name ?? null,
        name:
          rp.displayName ||
          business?.name ||
          loc.displayName ||
          loc.name ||
          "Restaurant",
        shortAddress: rp.shortAddress || loc.displayName || loc.area || loc.city || null,
        locationDisplayName: loc.displayName ?? null,
        description: rp.description ?? null,
        tagline: rp.tagline ?? null,
        cuisine: pickCuisine(rp),
        priceRange: rp.priceRange ?? null,
        address: loc.address ?? "",
        area: loc.area ?? null,
        city: loc.city ?? null,
        bannerImageUrl,
        rating: summary.rating,
        reviewCount: summary.reviewCount,
        queueEnabled: loc.queueEnabled ?? true,
        reservationsEnabled: loc.reservationsEnabled ?? true,
        openNow: isOpenNow(rp.openingHours),
        featured: featuredSet.has(loc.id),
      };
    });

    return res.json({
      query: q,
      results,
      total,
      ...(paginate
        ? { page, limit, hasMore: page * limit < total }
        : {}),
    });
  } catch (err: any) {
    console.error("[search] error:", err?.message || err);
    return res.status(500).json({ error: "Search failed." });
  }
});

export default router;

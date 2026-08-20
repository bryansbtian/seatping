import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { limitGuard, clientIp, MINUTES } from "../lib/rateLimit.js";

const router = Router();

function pickCuisine(rp: any): string | null {
  if (!rp || typeof rp !== "object") {
    return null;
  }
  const arr = (rp as any).cuisineTypes;
  if (Array.isArray(arr) && arr.length) {
    return String(arr[0]);
  }
  return null;
}

function isOpenNow(openingHours: any): boolean | null {
  if (!openingHours || typeof openingHours !== "object") {
    return null;
  }
  let tz: string | undefined = undefined;
  if (typeof openingHours.timezone === "string" && openingHours.timezone) {
    tz = openingHours.timezone;
  }
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
    if (!weekday) {
      return null;
    }
    const day = openingHours[weekday];
    if (!day || typeof day !== "object" || !day.enabled) {
      return false;
    }
    const open = String(day.open || "");
    const close = String(day.close || "");
    if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) {
      return null;
    }
    const cur = `${hour}:${minute}`;
    if (close <= open) {
      return cur >= open || cur < close;
    }
    return cur >= open && cur < close;
  } catch {
    return null;
  }
}

function matchesQuery(loc: any, business: any, q: string): boolean {
  if (!q) {
    return true;
  }
  const needle = q.toLowerCase();
  const rp = (loc?.restaurantProfile || {}) as any;
  const details = (rp?.details || {}) as any;
  let cuisineTypes: any[] = [];
  if (Array.isArray(rp?.cuisineTypes)) {
    cuisineTypes = rp.cuisineTypes;
  }
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
    ...cuisineTypes,
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
    ) {
      return;
    }

    const q = String(req.query.query || "").trim();

    const rawLimit = parseInt(String(req.query.limit ?? ""), 10);
    const paginate = Number.isFinite(rawLimit) && rawLimit > 0;
    let limit = Infinity;
    if (paginate) {
      limit = Math.min(100, rawLimit);
    }
    const rawPage = parseInt(String(req.query.page ?? "1"), 10);
    let page = 1;
    if (Number.isFinite(rawPage) && rawPage > 0) {
      page = rawPage;
    }

    const locations = await prisma.location.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: "desc" },
      include: {
        photos: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    });

    const businessIds = Array.from(new Set(locations.map((l) => l.businessId).filter(Boolean)));
    const businesses = await prisma.business.findMany({
      where: { id: { in: businessIds } },
      select: { id: true, name: true, username: true },
    });
    const businessById = new Map(businesses.map((b) => [b.id, b]));

    const matched = locations.filter((loc) =>
      matchesQuery(loc, businessById.get(loc.businessId), q),
    );
    const total = matched.length;
    let filtered = matched;
    if (paginate) {
      filtered = matched.slice((page - 1) * limit, (page - 1) * limit + limit);
    }

    const locationIds = filtered.map((l) => l.id);
    let summaries: Array<{
      locationId: string;
      _avg: { rating: number | null };
      _count: { _all: number };
    }> = [];
    if (locationIds.length > 0) {
      const grouped = await prisma.review.groupBy({
        by: ["locationId"],
        where: { locationId: { in: locationIds } },
        _avg: { rating: true },
        _count: { _all: true },
      });
      summaries = grouped;
    }
    const summaryByLocation = new Map(
      summaries.map((s): [string, { rating: number | null; reviewCount: number }] => {
        let rating: number | null = null;
        if (typeof s._avg.rating === "number") {
          rating = Math.round(s._avg.rating * 10) / 10;
        }
        return [
          s.locationId,
          {
            rating,
            reviewCount: s._count._all,
          },
        ];
      }),
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
      const bannerImageUrl = loc.bannerImageUrl || (loc.photos?.[0]?.url ?? null);
      return {
        locationId: loc.id,
        businessUsername: business?.username ?? null,
        businessName: business?.name ?? null,
        name: rp.displayName || business?.name || loc.displayName || loc.name || "Restaurant",
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

    const payload: {
      query: string;
      results: typeof results;
      total: number;
      page?: number;
      limit?: number;
      hasMore?: boolean;
    } = {
      query: q,
      results,
      total,
    };
    if (paginate) {
      payload.page = page;
      payload.limit = limit;
      payload.hasMore = page * limit < total;
    }
    return res.json(payload);
  } catch (err: any) {
    console.error("[search] error:", err?.message || err);
    return res.status(500).json({ error: "Search failed." });
  }
});

export default router;

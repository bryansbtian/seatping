// server/routes/search.ts
//
// Public search feed.
//   GET /api/search/restaurants?query=...
//
// Matches the query (case-insensitive) against the location's display fields,
// the owning business name/username, address parts, restaurantProfile
// description, and cuisine types. Returns a list shaped for the SearchResults
// card. Returns featured-style summaries (rating + reviewCount) too.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
const router = Router();
function pickCuisine(rp) {
    if (!rp || typeof rp !== "object")
        return null;
    const arr = rp.cuisineTypes;
    return Array.isArray(arr) && arr.length ? String(arr[0]) : null;
}
const DAY_KEYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
/**
 * Whether the location is currently open, evaluated in the restaurant's own
 * timezone (openingHours.timezone). Returns null when hours aren't configured
 * so the UI can treat "unknown" differently from "closed". Handles overnight
 * spans (close <= open) like 18:00–02:00.
 */
function isOpenNow(openingHours) {
    if (!openingHours || typeof openingHours !== "object")
        return null;
    const tz = typeof openingHours.timezone === "string" && openingHours.timezone
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
        if (!weekday)
            return null;
        const day = openingHours[weekday];
        if (!day || typeof day !== "object" || !day.enabled)
            return false;
        const open = String(day.open || "");
        const close = String(day.close || "");
        if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close))
            return null;
        const cur = `${hour}:${minute}`;
        // Overnight span: open until the next day (e.g. 18:00–02:00).
        if (close <= open)
            return cur >= open || cur < close;
        return cur >= open && cur < close;
    }
    catch {
        // Invalid timezone string, etc.
        return null;
    }
}
function matchesQuery(loc, business, q) {
    if (!q)
        return true;
    const needle = q.toLowerCase();
    const rp = (loc?.restaurantProfile || {});
    const details = (rp?.details || {});
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
/**
 * GET /api/search/restaurants?query=...
 * Returns matching locations with summary fields. Empty query returns all
 * locations so the page can show a generic browse view.
 */
router.get("/restaurants", async (req, res) => {
    try {
        const q = String(req.query.query || "").trim();
        // Pagination is opt-in: when a `limit` is supplied we page; otherwise we
        // return all matches (the results page filters/sorts client-side and has no
        // pager). Either way we only ever load PUBLISHED locations — the indexed
        // `isPublished` filter keeps this off the full collection. (Cuisine /
        // description live in a JSON column, so final matching stays in JS over this
        // bounded published set; an Atlas Search index is the next step at scale.)
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
        const businessIds = Array.from(new Set(locations.map((l) => l.businessId).filter(Boolean)));
        const businesses = await prisma.business.findMany({
            where: { id: { in: businessIds } },
            select: { id: true, name: true, username: true },
        });
        const businessById = new Map(businesses.map((b) => [b.id, b]));
        const matched = locations.filter((loc) => matchesQuery(loc, businessById.get(loc.businessId), q));
        const total = matched.length;
        const filtered = paginate
            ? matched.slice((page - 1) * limit, (page - 1) * limit + limit)
            : matched;
        const locationIds = filtered.map((l) => l.id);
        const summaries = locationIds.length > 0
            ? await prisma.review.groupBy({
                by: ["locationId"],
                where: { locationId: { in: locationIds } },
                _avg: { rating: true },
                _count: { _all: true },
            })
            : [];
        const summaryByLocation = new Map(summaries.map((s) => [
            s.locationId,
            {
                rating: typeof s._avg.rating === "number"
                    ? Math.round(s._avg.rating * 10) / 10
                    : null,
                reviewCount: s._count._all,
            },
        ]));
        // Featured set so we can tag results with a `featured` flag for the chip
        // filter to use.
        const featuredRows = await prisma.featuredRestaurant.findMany({
            where: { isActive: true, locationId: { in: locationIds } },
            select: { locationId: true },
        });
        const featuredSet = new Set(featuredRows.map((f) => f.locationId));
        const results = filtered.map((loc) => {
            const rp = (loc.restaurantProfile || {});
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
                name: rp.displayName ||
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
    }
    catch (err) {
        console.error("[search] error:", err?.message || err);
        return res.status(500).json({ error: "Search failed." });
    }
});
export default router;

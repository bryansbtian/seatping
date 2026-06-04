// server/routes/restaurants.ts
//
// Public restaurant details page feed.
//   GET /api/restaurants/:businessUsername/:locationId
//
// Returns only public-safe data — no business credentials, billing, credits,
// or other private/admin fields. The second param is the raw locationId; the
// old custom slug feature was removed (multi-location businesses just use the
// per-location id).
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializePhoto } from "../lib/business.js";
import { requireCustomer } from "../lib/auth.js";
const router = Router();
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
function serializeReview(r) {
    return {
        id: r.id,
        customerName: r.customerName ?? null,
        customerUsername: r.customerUsername ?? null,
        rating: typeof r.rating === "number" ? r.rating : 0,
        description: r.description ?? null,
        partySize: typeof r.partySize === "number" ? r.partySize : null,
        serviceType: r.serviceType ?? null,
        createdAt: r.createdAt,
        // Optional business response. Public-page-safe; no owner controls implied.
        businessReply: r.businessReply ?? null,
        businessReplyCreatedAt: r.businessReplyCreatedAt ?? null,
        businessReplyUpdatedAt: r.businessReplyUpdatedAt ?? null,
    };
}
/**
 * Pull only the public-safe slice of restaurantProfile, dropping anything that
 * isn't meant for the customer page (no internal flags, owner notes, etc.).
 */
function publicProfile(rp) {
    const safe = rp && typeof rp === "object" ? rp : {};
    const details = safe.details && typeof safe.details === "object" ? safe.details : {};
    return {
        displayName: safe.displayName ?? null,
        shortAddress: safe.shortAddress ?? null,
        tagline: safe.tagline ?? null,
        description: safe.description ?? null,
        cuisineTypes: Array.isArray(safe.cuisineTypes) ? safe.cuisineTypes : [],
        priceRange: safe.priceRange ?? null,
        currency: safe.currency ?? null,
        menu: Array.isArray(safe.menu) ? safe.menu : [],
        openingHours: safe.openingHours && typeof safe.openingHours === "object"
            ? safe.openingHours
            : null,
        details: {
            address: details.address ?? null,
            area: details.area ?? null,
            city: details.city ?? null,
            country: details.country ?? null,
            phone: details.phone ?? null,
            website: details.website ?? null,
            instagram: details.instagram ?? null,
            googleMapsUrl: details.googleMapsUrl ?? null,
        },
        isPublished: Boolean(safe.isPublished),
    };
}
router.get("/:businessUsername/:locationId", async (req, res) => {
    try {
        const businessUsername = String(req.params.businessUsername || "").trim();
        const locationId = String(req.params.locationId || "").trim();
        if (!businessUsername || !OBJECT_ID_RE.test(locationId)) {
            return res.status(404).json({ error: "Restaurant not found" });
        }
        const business = await prisma.business.findUnique({
            where: { username: businessUsername },
            select: { id: true, name: true, username: true },
        });
        if (!business)
            return res.status(404).json({ error: "Restaurant not found" });
        const location = await prisma.location.findFirst({
            where: { id: locationId, businessId: business.id },
            include: { photos: { orderBy: { createdAt: "asc" } } },
        });
        if (!location)
            return res.status(404).json({ error: "Restaurant not found" });
        // Reviews + summary.
        const reviews = await prisma.review.findMany({
            where: { locationId: location.id },
            orderBy: { createdAt: "desc" },
        });
        const reviewCount = reviews.length;
        const rating = reviewCount > 0
            ? Math.round((reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviewCount) * 10) / 10
            : null;
        const profile = publicProfile(location.restaurantProfile);
        return res.json({
            restaurant: {
                // Business
                businessUsername: business.username,
                businessName: business.name ?? null,
                // Location
                locationId: location.id,
                name: profile.displayName ||
                    business.name ||
                    location.displayName ||
                    location.name ||
                    "Restaurant",
                // Short address (line 2 on cards): mall/branch label.
                shortAddress: profile.shortAddress || location.displayName || location.area || location.city || null,
                tagline: profile.tagline,
                description: profile.description,
                // Cuisine / price
                cuisineTypes: profile.cuisineTypes,
                priceRange: profile.priceRange,
                currency: profile.currency,
                // Location details
                address: profile.details.address || location.address || "",
                area: profile.details.area || location.area || null,
                city: profile.details.city || location.city || null,
                country: profile.details.country || location.country || null,
                latitude: typeof location.latitude === "number" ? location.latitude : null,
                longitude: typeof location.longitude === "number" ? location.longitude : null,
                googleMapsUrl: profile.details.googleMapsUrl || location.googleMapsUrl || null,
                phone: profile.details.phone,
                website: profile.details.website,
                instagram: profile.details.instagram,
                // Hours
                openingHours: profile.openingHours,
                // Media
                bannerImageUrl: location.bannerImageUrl ?? null,
                photos: Array.isArray(location.photos)
                    ? location.photos.map(serializePhoto)
                    : [],
                // Menu
                menu: profile.menu,
                // Reviews
                rating,
                reviewCount,
                reviews: reviews.map(serializeReview),
                // Toggles (so the page can hide Join Queue if the location disabled it)
                queueEnabled: location.queueEnabled ?? true,
                reservationsEnabled: location.reservationsEnabled ?? true,
            },
        });
    }
    catch (err) {
        console.error("[restaurants] details error:", err?.message || err);
        return res.status(500).json({ error: "Failed to load restaurant." });
    }
});
/**
 * POST /api/restaurants/:businessUsername/:locationId/reviews
 * Logged-in customers (only) can submit a review for a location. A customer
 * can have at most one review per location — repeat posts update the existing
 * row in place. Business owners cannot post reviews here (gated by
 * requireCustomer, which rejects business sessions).
 */
router.post("/:businessUsername/:locationId/reviews", requireCustomer, async (req, res) => {
    try {
        const businessUsername = String(req.params.businessUsername || "").trim();
        const locationId = String(req.params.locationId || "").trim();
        if (!businessUsername || !OBJECT_ID_RE.test(locationId)) {
            return res.status(404).json({ error: "Restaurant not found" });
        }
        const business = await prisma.business.findUnique({
            where: { username: businessUsername },
            select: { id: true },
        });
        if (!business)
            return res.status(404).json({ error: "Restaurant not found" });
        const location = await prisma.location.findFirst({
            where: { id: locationId, businessId: business.id },
            select: { id: true },
        });
        if (!location)
            return res.status(404).json({ error: "Restaurant not found" });
        const customerId = req.auth.sub;
        const { rating, description } = req.body || {};
        if (typeof rating !== "number" || !Number.isFinite(rating)) {
            return res.status(400).json({ error: "rating must be a number" });
        }
        const ratingInt = Math.round(rating);
        if (ratingInt < 1 || ratingInt > 5) {
            return res.status(400).json({ error: "rating must be between 1 and 5" });
        }
        if (description !== undefined && typeof description !== "string") {
            return res.status(400).json({ error: "description must be a string" });
        }
        const trimmedDescription = typeof description === "string" && description.trim()
            ? description.trim()
            : null;
        // Denormalize the customer's display fields so the review renders
        // without a join (matches existing Review serialization).
        const user = await prisma.user.findUnique({
            where: { id: customerId },
            select: { id: true, name: true, username: true },
        });
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        // One review per (customer, location): update if it already exists.
        const existing = await prisma.review.findFirst({
            where: { customerId, locationId: location.id },
            select: { id: true },
        });
        const data = {
            rating: ratingInt,
            description: trimmedDescription,
            customerName: user.name,
            customerUsername: user.username,
        };
        const saved = existing
            ? await prisma.review.update({ where: { id: existing.id }, data })
            : await prisma.review.create({
                data: { ...data, locationId: location.id, customerId },
            });
        return res.json({ review: serializeReview(saved) });
    }
    catch (err) {
        console.error("[restaurants] review create error:", err?.message || err);
        return res.status(500).json({ error: "Failed to save review." });
    }
});
export default router;

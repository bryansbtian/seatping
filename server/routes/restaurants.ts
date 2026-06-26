import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializePhoto } from "../lib/business.js";
import { requireCustomer } from "../lib/auth.js";

const router = Router();

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

function serializeReview(r: any) {
  return {
    id: r.id,
    customerName: r.customerName ?? null,
    customerUsername: r.customerUsername ?? null,
    rating: typeof r.rating === "number" ? r.rating : 0,
    description: r.description ?? null,
    partySize: typeof r.partySize === "number" ? r.partySize : null,
    serviceType: r.serviceType ?? null,
    createdAt: r.createdAt,
    businessReply: r.businessReply ?? null,
    businessReplyCreatedAt: r.businessReplyCreatedAt ?? null,
    businessReplyUpdatedAt: r.businessReplyUpdatedAt ?? null,
  };
}

function publicProfile(rp: any) {
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
    menuUrl: typeof safe.menuUrl === "string" && safe.menuUrl ? safe.menuUrl : null,
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
    if (!business) return res.status(404).json({ error: "Restaurant not found" });

    const location = await prisma.location.findFirst({
      where: { id: locationId, businessId: business.id },
      include: { photos: { orderBy: { createdAt: "asc" } } },
    });
    if (!location) return res.status(404).json({ error: "Restaurant not found" });

    const reviews = await prisma.review.findMany({
      where: { locationId: location.id },
      orderBy: { createdAt: "desc" },
    });
    const reviewCount = reviews.length;
    const rating =
      reviewCount > 0
        ? Math.round(
            (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviewCount) * 10
          ) / 10
        : null;

    const profile = publicProfile(location.restaurantProfile);

    return res.json({
      restaurant: {
        businessUsername: business.username,
        businessName: business.name ?? null,

        locationId: location.id,
        name:
          profile.displayName ||
          business.name ||
          location.displayName ||
          location.name ||
          "Restaurant",
        shortAddress:
          profile.shortAddress || location.displayName || location.area || location.city || null,
        tagline: profile.tagline,
        description: profile.description,

        cuisineTypes: profile.cuisineTypes,
        priceRange: profile.priceRange,
        currency: profile.currency,

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

        openingHours: profile.openingHours,

        bannerImageUrl: location.bannerImageUrl ?? null,
        photos: Array.isArray(location.photos)
          ? location.photos.map(serializePhoto)
          : [],

        menu: profile.menu,
        menuUrl: profile.menuUrl,

        rating,
        reviewCount,
        reviews: reviews.map(serializeReview),

        queueEnabled: location.queueEnabled ?? true,
        reservationsEnabled: location.reservationsEnabled ?? true,
      },
    });
  } catch (err: any) {
    console.error("[restaurants] details error:", err?.message || err);
    return res.status(500).json({ error: "Failed to load restaurant." });
  }
});

router.post(
  "/:businessUsername/:locationId/reviews",
  requireCustomer,
  async (req, res) => {
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
      if (!business) return res.status(404).json({ error: "Restaurant not found" });

      const location = await prisma.location.findFirst({
        where: { id: locationId, businessId: business.id },
        select: { id: true },
      });
      if (!location) return res.status(404).json({ error: "Restaurant not found" });

      const customerId = (req as any).auth.sub as string;
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
      const trimmedDescription =
        typeof description === "string" && description.trim()
          ? description.trim()
          : null;

      const user = await prisma.user.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, username: true },
      });
      if (!user) return res.status(401).json({ error: "Unauthorized" });

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
    } catch (err: any) {
      console.error("[restaurants] review create error:", err?.message || err);
      return res.status(500).json({ error: "Failed to save review." });
    }
  }
);

export default router;

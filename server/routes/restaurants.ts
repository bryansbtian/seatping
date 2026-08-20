import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializePhoto } from "../lib/business.js";
import { requireCustomer } from "../lib/auth.js";

const router = Router();

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

function serializeReview(r: any) {
  let rating = 0;
  if (typeof r.rating === "number") {
    rating = r.rating;
  }
  let partySize: number | null = null;
  if (typeof r.partySize === "number") {
    partySize = r.partySize;
  }
  return {
    id: r.id,
    customerName: r.customerName ?? null,
    customerUsername: r.customerUsername ?? null,
    rating,
    description: r.description ?? null,
    partySize,
    serviceType: r.serviceType ?? null,
    createdAt: r.createdAt,
    businessReply: r.businessReply ?? null,
    businessReplyCreatedAt: r.businessReplyCreatedAt ?? null,
    businessReplyUpdatedAt: r.businessReplyUpdatedAt ?? null,
  };
}

function publicProfile(rp: any) {
  let safe: any = {};
  if (rp && typeof rp === "object") {
    safe = rp;
  }
  let details: any = {};
  if (safe.details && typeof safe.details === "object") {
    details = safe.details;
  }
  let cuisineTypes: any[] = [];
  if (Array.isArray(safe.cuisineTypes)) {
    cuisineTypes = safe.cuisineTypes;
  }
  let menu: any[] = [];
  if (Array.isArray(safe.menu)) {
    menu = safe.menu;
  }
  let menuUrl: string | null = null;
  if (typeof safe.menuUrl === "string" && safe.menuUrl) {
    menuUrl = safe.menuUrl;
  }
  let openingHours: any = null;
  if (safe.openingHours && typeof safe.openingHours === "object") {
    openingHours = safe.openingHours;
  }
  return {
    displayName: safe.displayName ?? null,
    shortAddress: safe.shortAddress ?? null,
    tagline: safe.tagline ?? null,
    description: safe.description ?? null,
    cuisineTypes,
    priceRange: safe.priceRange ?? null,
    currency: safe.currency ?? null,
    menu,
    menuUrl,
    openingHours,
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
    if (!business) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const location = await prisma.location.findFirst({
      where: { id: locationId, businessId: business.id },
      include: { photos: { orderBy: { createdAt: "asc" } } },
    });
    if (!location) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const reviews = await prisma.review.findMany({
      where: { locationId: location.id },
      orderBy: { createdAt: "desc" },
    });
    const reviewCount = reviews.length;
    let rating: number | null = null;
    if (reviewCount > 0) {
      rating =
        Math.round((reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviewCount) * 10) / 10;
    }

    const profile = publicProfile(location.restaurantProfile);

    let latitude: number | null = null;
    if (typeof location.latitude === "number") {
      latitude = location.latitude;
    }
    let longitude: number | null = null;
    if (typeof location.longitude === "number") {
      longitude = location.longitude;
    }
    let serializedPhotos: any[] = [];
    if (Array.isArray(location.photos)) {
      serializedPhotos = location.photos.map(serializePhoto);
    }

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
        latitude,
        longitude,
        googleMapsUrl: profile.details.googleMapsUrl || location.googleMapsUrl || null,
        phone: profile.details.phone,
        website: profile.details.website,
        instagram: profile.details.instagram,

        openingHours: profile.openingHours,

        bannerImageUrl: location.bannerImageUrl ?? null,
        photos: serializedPhotos,

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
    if (!business) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const location = await prisma.location.findFirst({
      where: { id: locationId, businessId: business.id },
      select: { id: true },
    });
    if (!location) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

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
    let trimmedDescription: string | null = null;
    if (typeof description === "string" && description.trim()) {
      trimmedDescription = description.trim();
    }

    const user = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, username: true },
    });
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

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
    let saved;
    if (existing) {
      saved = await prisma.review.update({
        where: { id: existing.id },
        data,
      });
    } else {
      saved = await prisma.review.create({
        data: { ...data, locationId: location.id, customerId },
      });
    }

    return res.json({ review: serializeReview(saved) });
  } catch (err: any) {
    console.error("[restaurants] review create error:", err?.message || err);
    return res.status(500).json({ error: "Failed to save review." });
  }
});

export default router;

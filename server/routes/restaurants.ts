import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializePhoto } from "../lib/business.js";
import { requireCustomer } from "../lib/auth.js";
import { limitGuard, clientIp, MINUTES, HOURS } from "../lib/rateLimit.js";
import { ENTITY_ID_RE } from "../lib/entityId.js";
import { Prisma } from "@prisma/client";
import {
  decodeReviewCursor,
  encodeReviewCursor,
  REVIEW_PAGE_SIZE,
  reviewPageWhere,
  roundedReviewRating,
} from "../lib/reviewPagination.js";

const router = Router();

const publicReviewSelect = {
  id: true,
  customerName: true,
  customerUsername: true,
  rating: true,
  description: true,
  partySize: true,
  serviceType: true,
  createdAt: true,
  businessReply: true,
  businessReplyCreatedAt: true,
  businessReplyUpdatedAt: true,
} satisfies Prisma.ReviewSelect;

type PublicReview = Prisma.ReviewGetPayload<{ select: typeof publicReviewSelect }>;

function serializeReview(r: PublicReview) {
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
    if (!businessUsername || !ENTITY_ID_RE.test(locationId)) {
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
      select: {
        id: true,
        name: true,
        displayName: true,
        restaurantProfile: true,
        latitude: true,
        longitude: true,
        area: true,
        city: true,
        address: true,
        country: true,
        googleMapsUrl: true,
        bannerImageUrl: true,
        queueEnabled: true,
        reservationsEnabled: true,
        photos: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!location) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const paginated = req.query.version === "2";
    const [rows, aggregate] = await prisma.$transaction(
      [
        prisma.review.findMany({
          where: { locationId: location.id },
          select: publicReviewSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...(paginated && { take: REVIEW_PAGE_SIZE + 1 }),
        }),
        prisma.review.aggregate({
          where: { locationId: location.id },
          _count: true,
          _avg: { rating: true },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    let reviews = rows;
    if (paginated) {
      reviews = rows.slice(0, REVIEW_PAGE_SIZE);
    }
    const reviewCount = aggregate._count;
    let rating: number | null = null;
    if (reviewCount > 0) {
      rating = roundedReviewRating(aggregate._avg.rating);
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
        ...(paginated && {
          reviewsPage: {
            hasMore: rows.length > REVIEW_PAGE_SIZE,
            nextCursor: reviewNextCursor(location.id, rows),
          },
        }),

        queueEnabled: location.queueEnabled ?? true,
        reservationsEnabled: location.reservationsEnabled ?? true,
      },
    });
  } catch (err: any) {
    console.error("[restaurants] details error:", err?.message || err);
    return res.status(500).json({ error: "Failed to load restaurant." });
  }
});

function reviewNextCursor(locationId: string, reviews: PublicReview[]): string | null {
  if (reviews.length <= REVIEW_PAGE_SIZE) {
    return null;
  }
  return encodeReviewCursor(locationId, reviews[REVIEW_PAGE_SIZE - 1]);
}

router.get("/:businessUsername/:locationId/reviews", async (req, res) => {
  const businessUsername = String(req.params.businessUsername || "").trim();
  const locationId = String(req.params.locationId || "").trim();
  if (!businessUsername || !ENTITY_ID_RE.test(locationId)) {
    return res.status(404).json({ error: "Restaurant not found" });
  }
  let cursor;
  try {
    cursor = decodeReviewCursor(req.query.cursor, locationId);
  } catch {
    return res.status(400).json({ error: "Invalid review cursor" });
  }
  try {
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
    const [reviews, aggregate] = await prisma.$transaction(
      [
        prisma.review.findMany({
          where: reviewPageWhere(location.id, cursor),
          select: publicReviewSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: REVIEW_PAGE_SIZE + 1,
        }),
        prisma.review.aggregate({
          where: { locationId: location.id },
          _count: true,
          _avg: { rating: true },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return res.json({
      reviews: reviews.slice(0, REVIEW_PAGE_SIZE).map(serializeReview),
      nextCursor: reviewNextCursor(location.id, reviews),
      hasMore: reviews.length > REVIEW_PAGE_SIZE,
      totalReviews: aggregate._count,
      avgRating: roundedReviewRating(aggregate._avg.rating),
    });
  } catch {
    return res.status(500).json({ error: "Failed to load reviews." });
  }
});

router.post("/:businessUsername/:locationId/reviews", requireCustomer, async (req, res) => {
  try {
    const businessUsername = String(req.params.businessUsername || "").trim();
    const locationId = String(req.params.locationId || "").trim();
    if (!businessUsername || !ENTITY_ID_RE.test(locationId)) {
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
    if (
      await limitGuard(req, res, [
        { name: "review-create-user", key: customerId, windowMs: HOURS(1), max: 20 },
        { name: "review-create-ip", key: clientIp(req), windowMs: HOURS(1), max: 60 },
      ])
    ) {
      return;
    }

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

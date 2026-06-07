// server/routes/locations.ts
//
// Location media API — banner (hero) image + gallery photos. All routes require
// a logged-in BUSINESS session and verify the location belongs to that business
// before any change. Files are uploaded to Cloudinary from the backend only
// (the API secret never reaches the browser); MongoDB stores just the URL +
// Cloudinary publicId.
//
//   POST   /api/locations/:locationId/banner/upload      (one image, replaces existing)
//   DELETE /api/locations/:locationId/banner
//   POST   /api/locations/:locationId/photos/upload      (one or more images, max 10 total)
//   PATCH  /api/locations/:locationId/photos/:photoId     (update alt text)
//   DELETE /api/locations/:locationId/photos/:photoId
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requireBusiness } from "../lib/auth.js";
import { limitGuard, clientIp, MINUTES } from "../lib/rateLimit.js";
import { assembleBusinessMe, serializePhoto } from "../lib/business.js";
import {
  uploadImageBuffer,
  deleteImageByPublicId,
  signLocationUpload,
  publicIdInLocationFolder,
} from "../lib/cloudinary.js";

const router = Router();

// Minimal shape of a multer upload. We avoid annotating with the ambient
// `Express.Multer.File` global namespace because it doesn't reliably resolve in
// clean CI/deploy builds (the multer→express global namespace merge can fail),
// which broke `tsc` with "Cannot find namespace 'Express'".
type UploadedFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

// ---------------------------------------------------------------------------
// PUBLIC: live search suggestions for the homepage hero search input.
//   GET /api/locations/search-suggestions?query=imperial&limit=3
// Returns up to `limit` (max 3) ranked, published locations. Defined BEFORE the
// requireBusiness gate below so it stays public. Relevance is weighted so
// restaurant/business name matches outrank address/cuisine, and exact /
// starts-with matches outrank partial ones.
// ---------------------------------------------------------------------------
const SUGGEST_WEIGHTS = {
  name: 3.2, // restaurant name / business name
  label: 2.6, // short address / location label
  areaCity: 1.6,
  cuisine: 1.3,
  address: 1.0,
  text: 0.7, // tagline / description / username
};

function pickCuisineSuggest(rp: any): string | null {
  const arr = rp?.cuisineTypes;
  return Array.isArray(arr) && arr.length ? String(arr[0]) : null;
}

/** Match quality for one field: exact > starts-with > word-starts-with > includes. */
function fieldScore(value: any, needle: string): number {
  if (!value) return 0;
  const v = String(value).toLowerCase();
  if (v === needle) return 100;
  if (v.startsWith(needle)) return 60;
  if (v.split(/[\s,.&/-]+/).some((w) => w && w.startsWith(needle))) return 40;
  if (v.includes(needle)) return 20;
  return 0;
}

router.get("/search-suggestions", async (req, res) => {
  try {
    // Public, unauthenticated, fires on every keystroke in the hero search.
    // Throttle per IP at a level that allows fast typing but caps scripted load.
    if (
      await limitGuard(req, res, [
        { name: "suggestions-ip", key: clientIp(req), windowMs: MINUTES(1), max: 120 },
      ])
    )
      return;

    const q = String(req.query.query || "").trim().toLowerCase();
    const rawLimit = parseInt(String(req.query.limit || "3"), 10);
    const limit = Math.min(3, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 3));
    if (!q) return res.json({ suggestions: [] });

    // Only published locations are suggestible — filter at the DB via the
    // indexed `isPublished` column instead of loading the whole collection.
    const locations = await prisma.location.findMany({
      where: { isPublished: true },
      include: { photos: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    const businessIds = Array.from(
      new Set(locations.map((l) => l.businessId).filter(Boolean)),
    );
    const businesses = await prisma.business.findMany({
      where: { id: { in: businessIds } },
      select: { id: true, name: true, username: true },
    });
    const businessById = new Map(businesses.map((b) => [b.id, b]));

    const scored = locations
      .map((loc: any) => {
        const rp = (loc.restaurantProfile || {}) as any;
        // Only public/active (published) locations are suggestible.
        if (rp.isPublished === false) return null;
        const details = (rp.details || {}) as any;
        const biz = businessById.get(loc.businessId);

        const nameScore = Math.max(
          fieldScore(rp.displayName, q),
          fieldScore(biz?.name, q),
        );
        const labelScore = Math.max(
          fieldScore(loc.displayName, q),
          fieldScore(rp.shortAddress, q),
          fieldScore(loc.name, q),
        );
        const areaCityScore = Math.max(
          fieldScore(loc.area, q),
          fieldScore(loc.city, q),
          fieldScore(details.area, q),
          fieldScore(details.city, q),
        );
        const cuisineArr = Array.isArray(rp.cuisineTypes) ? rp.cuisineTypes : [];
        const cuisineScore = cuisineArr.reduce(
          (m: number, c: any) => Math.max(m, fieldScore(c, q)),
          0,
        );
        const addressScore = Math.max(
          fieldScore(loc.address, q),
          fieldScore(details.address, q),
        );
        const textScore = Math.max(
          fieldScore(rp.tagline, q),
          fieldScore(rp.description, q),
          fieldScore(biz?.username, q),
        );

        const score =
          nameScore * SUGGEST_WEIGHTS.name +
          labelScore * SUGGEST_WEIGHTS.label +
          areaCityScore * SUGGEST_WEIGHTS.areaCity +
          cuisineScore * SUGGEST_WEIGHTS.cuisine +
          addressScore * SUGGEST_WEIGHTS.address +
          textScore * SUGGEST_WEIGHTS.text;

        if (score <= 0) return null;
        return { loc, biz, rp, score };
      })
      .filter(Boolean) as Array<{ loc: any; biz: any; rp: any; score: number }>;

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const an = (a.rp.displayName || a.biz?.name || "").toLowerCase();
      const bn = (b.rp.displayName || b.biz?.name || "").toLowerCase();
      return an.localeCompare(bn);
    });

    const suggestions = scored.slice(0, limit).map(({ loc, biz, rp }) => ({
      locationId: loc.id,
      businessId: loc.businessId,
      businessUsername: biz?.username ?? null,
      businessName: biz?.name ?? null,
      name: rp.displayName || biz?.name || loc.displayName || loc.name || "Restaurant",
      shortAddress: rp.shortAddress || loc.displayName || loc.area || loc.city || null,
      cuisine: pickCuisineSuggest(rp),
      area: loc.area ?? null,
      city: loc.city ?? null,
      imageUrl: loc.bannerImageUrl || loc.photos?.[0]?.url || null,
      url: biz?.username ? `/restaurants/${biz.username}/${loc.id}` : null,
    }));

    return res.json({ suggestions });
  } catch (err: any) {
    console.error("[locations] search-suggestions error:", err?.message || err);
    return res.status(500).json({ error: "Failed to load suggestions." });
  }
});

// Every route below here mutates media, so a business session is always required.
router.use(requireBusiness);

// Per-business throttle for the dashboard mutation routes below. Keyed by the
// authenticated business id (falls back to IP if somehow absent), so one
// account's automation/abuse can't hammer uploads/edits. Generous for normal
// dashboard use (which batches several calls per save).
router.use(async (req, res, next) => {
  const businessId = (req as any).auth?.sub as string | undefined;
  if (
    await limitGuard(req, res, [
      {
        name: "biz-dashboard",
        key: businessId || clientIp(req),
        windowMs: MINUTES(1),
        max: 120,
      },
    ])
  )
    return;
  next();
});

// ---------------------------------------------------------------------------
// Upload constraints (images only, 5MB each, max 10 photos per location).
// ---------------------------------------------------------------------------
const MAX_PHOTOS_PER_LOCATION = 10;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_PHOTOS_PER_LOCATION },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG, PNG, and WEBP image files are allowed."));
  },
});

/** Run a multer middleware as a promise so we can return clean JSON errors. */
function runMulter(
  req: Request,
  res: Response,
  mw: (req: Request, res: Response, cb: (err?: unknown) => void) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    mw(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
  });
}

/** Turn a multer/file-filter error into a friendly, user-facing message. */
function uploadErrorMessage(err: any): string {
  if (err?.code === "LIMIT_FILE_SIZE") return "Each image must be 5MB or smaller.";
  if (err?.code === "LIMIT_FILE_COUNT")
    return `You can upload at most ${MAX_PHOTOS_PER_LOCATION} images at once.`;
  return err?.message || "Upload failed. Please try again.";
}

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

type OwnedLocation = { id: string; bannerImagePublicId: string | null };

/**
 * Middleware: confirm the :locationId belongs to the authenticated business.
 * Attaches the location to `res.locals.location`. Public users never reach here
 * (the router-level requireBusiness gate runs first).
 */
async function loadOwnedLocation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = (req as any).auth.sub as string;
    const locationId = String(req.params.locationId || "").trim();
    if (!OBJECT_ID_RE.test(locationId)) {
      return res.status(404).json({ error: "Location not found or access denied" });
    }
    const location = await prisma.location.findFirst({
      where: { id: locationId, businessId },
      select: { id: true, bannerImagePublicId: true },
    });
    if (!location) {
      return res.status(404).json({ error: "Location not found or access denied" });
    }
    res.locals.location = location as OwnedLocation;
    next();
  } catch (err: any) {
    console.error("[locations] ownership check error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
}

/** Refreshed business "me" payload, so the dashboard stays in sync after a change. */
async function refreshedUser(req: Request) {
  return assembleBusinessMe((req as any).auth.sub as string);
}

// ===========================================================================
// Banner (one hero image per location)
// ===========================================================================

/**
 * POST /api/locations/:locationId/banner/upload
 * Accepts one image (form field "file"), uploads it to Cloudinary, replaces any
 * existing banner (deleting the old Cloudinary asset), and returns the banner.
 */
router.post(
  "/:locationId/banner/upload",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      try {
        await runMulter(req, res, upload.single("file") as any);
      } catch (err) {
        return res.status(400).json({ error: uploadErrorMessage(err) });
      }

      const file = (req as any).file as UploadedFile | undefined;
      if (!file) {
        return res.status(400).json({ error: "No image file provided." });
      }

      const location = res.locals.location as OwnedLocation;
      const uploaded = await uploadImageBuffer(file.buffer, location.id, "banner");

      await prisma.location.update({
        where: { id: location.id },
        data: {
          bannerImageUrl: uploaded.url,
          bannerImagePublicId: uploaded.publicId,
        },
      });

      // Replace = delete the previous asset (best-effort, after the DB points at the new one).
      if (location.bannerImagePublicId) {
        await deleteImageByPublicId(location.bannerImagePublicId);
      }

      const user = await refreshedUser(req);
      return res.json({
        banner: { url: uploaded.url, publicId: uploaded.publicId },
        user,
      });
    } catch (err: any) {
      console.error("[locations] banner upload error:", err?.message || err);
      return res
        .status(500)
        .json({ error: err?.message || "Failed to upload banner." });
    }
  }
);

/**
 * POST /api/locations/:locationId/banner/sign
 * Returns a short-lived Cloudinary signature so the browser can upload the
 * banner DIRECTLY to Cloudinary (bypassing Vercel's ~4.5MB function body cap).
 */
router.post(
  "/:locationId/banner/sign",
  loadOwnedLocation,
  async (_req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      return res.json({ upload: signLocationUpload(location.id, "banner") });
    } catch (err: any) {
      console.error("[locations] banner sign error:", err?.message || err);
      return res
        .status(500)
        .json({ error: err?.message || "Failed to prepare upload." });
    }
  }
);

/**
 * POST /api/locations/:locationId/banner/commit
 * Body: { url, publicId } — persist a banner the browser already uploaded to
 * Cloudinary (via /banner/sign). The publicId is verified to live in this
 * location's banner folder before we trust it, then the old asset is replaced.
 */
router.post(
  "/:locationId/banner/commit",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      const { url, publicId } = (req.body || {}) as {
        url?: unknown;
        publicId?: unknown;
      };
      if (
        typeof url !== "string" ||
        !url ||
        typeof publicId !== "string" ||
        !publicId
      ) {
        return res.status(400).json({ error: "Missing uploaded image data." });
      }
      if (!publicIdInLocationFolder(publicId, location.id, "banner")) {
        return res.status(400).json({ error: "Invalid image reference." });
      }

      await prisma.location.update({
        where: { id: location.id },
        data: { bannerImageUrl: url, bannerImagePublicId: publicId },
      });

      // Replace = delete the previous asset (best-effort), unless it's the same.
      if (
        location.bannerImagePublicId &&
        location.bannerImagePublicId !== publicId
      ) {
        await deleteImageByPublicId(location.bannerImagePublicId);
      }

      const user = await refreshedUser(req);
      return res.json({ banner: { url, publicId }, user });
    } catch (err: any) {
      console.error("[locations] banner commit error:", err?.message || err);
      return res
        .status(500)
        .json({ error: err?.message || "Failed to save banner." });
    }
  }
);

/**
 * DELETE /api/locations/:locationId/banner
 * Removes the banner from the DB and deletes the Cloudinary asset (best-effort).
 */
router.delete(
  "/:locationId/banner",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      await prisma.location.update({
        where: { id: location.id },
        data: { bannerImageUrl: null, bannerImagePublicId: null },
      });
      await deleteImageByPublicId(location.bannerImagePublicId);

      const user = await refreshedUser(req);
      return res.json({ banner: null, user });
    } catch (err: any) {
      console.error("[locations] banner delete error:", err?.message || err);
      return res.status(500).json({ error: "Failed to remove banner." });
    }
  }
);

// ===========================================================================
// Gallery photos (max 10 per location)
// ===========================================================================

/**
 * POST /api/locations/:locationId/photos/upload
 * Accepts one or more images (form field "files"). Enforces the 10-photo cap
 * against what already exists, uploads to Cloudinary, and saves Photo rows.
 */
router.post(
  "/:locationId/photos/upload",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;

      const existingCount = await prisma.photo.count({
        where: { locationId: location.id },
      });
      const remaining = MAX_PHOTOS_PER_LOCATION - existingCount;
      if (remaining <= 0) {
        return res.status(400).json({
          error: `This location already has the maximum of ${MAX_PHOTOS_PER_LOCATION} photos.`,
        });
      }

      try {
        await runMulter(req, res, upload.array("files", MAX_PHOTOS_PER_LOCATION) as any);
      } catch (err) {
        return res.status(400).json({ error: uploadErrorMessage(err) });
      }

      const files = ((req as any).files as UploadedFile[]) || [];
      if (files.length === 0) {
        return res.status(400).json({ error: "No image files provided." });
      }
      if (files.length > remaining) {
        return res.status(400).json({
          error: `You can add ${remaining} more photo(s) (max ${MAX_PHOTOS_PER_LOCATION} per location).`,
        });
      }

      // Upload all to Cloudinary, then persist Photo rows (order preserved).
      const uploaded = await Promise.all(
        files.map((f) => uploadImageBuffer(f.buffer, location.id, "photo"))
      );
      const created = [];
      for (const u of uploaded) {
        const photo = await prisma.photo.create({
          data: { locationId: location.id, url: u.url, publicId: u.publicId },
        });
        created.push(serializePhoto(photo));
      }

      const user = await refreshedUser(req);
      return res.json({ photos: created, user });
    } catch (err: any) {
      console.error("[locations] photos upload error:", err?.message || err);
      return res
        .status(500)
        .json({ error: err?.message || "Failed to upload photos." });
    }
  }
);

/**
 * POST /api/locations/:locationId/photos/sign
 * Returns a Cloudinary signature for a direct browser upload of ONE gallery
 * photo, plus how many slots remain (so the client can stop early). Each photo
 * is uploaded + committed individually to keep payloads tiny.
 */
router.post(
  "/:locationId/photos/sign",
  loadOwnedLocation,
  async (_req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      const existingCount = await prisma.photo.count({
        where: { locationId: location.id },
      });
      const remaining = MAX_PHOTOS_PER_LOCATION - existingCount;
      if (remaining <= 0) {
        return res.status(400).json({
          error: `This location already has the maximum of ${MAX_PHOTOS_PER_LOCATION} photos.`,
        });
      }
      return res.json({
        upload: signLocationUpload(location.id, "photo"),
        remaining,
      });
    } catch (err: any) {
      console.error("[locations] photos sign error:", err?.message || err);
      return res
        .status(500)
        .json({ error: err?.message || "Failed to prepare upload." });
    }
  }
);

/**
 * POST /api/locations/:locationId/photos/commit
 * Body: { url, publicId } — persist one gallery photo already uploaded to
 * Cloudinary (via /photos/sign). Re-checks the 10-photo cap; if it's now full
 * the just-uploaded (orphan) asset is deleted so it doesn't linger.
 */
router.post(
  "/:locationId/photos/commit",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      const { url, publicId } = (req.body || {}) as {
        url?: unknown;
        publicId?: unknown;
      };
      if (
        typeof url !== "string" ||
        !url ||
        typeof publicId !== "string" ||
        !publicId
      ) {
        return res.status(400).json({ error: "Missing uploaded image data." });
      }
      if (!publicIdInLocationFolder(publicId, location.id, "photo")) {
        return res.status(400).json({ error: "Invalid image reference." });
      }

      const existingCount = await prisma.photo.count({
        where: { locationId: location.id },
      });
      if (existingCount >= MAX_PHOTOS_PER_LOCATION) {
        await deleteImageByPublicId(publicId); // don't keep the orphan
        return res.status(400).json({
          error: `This location already has the maximum of ${MAX_PHOTOS_PER_LOCATION} photos.`,
        });
      }

      const photo = await prisma.photo.create({
        data: { locationId: location.id, url, publicId },
      });

      const user = await refreshedUser(req);
      return res.json({ photo: serializePhoto(photo), user });
    } catch (err: any) {
      console.error("[locations] photos commit error:", err?.message || err);
      return res
        .status(500)
        .json({ error: err?.message || "Failed to save photo." });
    }
  }
);

/**
 * PATCH /api/locations/:locationId/photos/:photoId
 * Body: { altText } — update a photo's alt text (empty string clears it).
 */
router.patch(
  "/:locationId/photos/:photoId",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      const photoId = String(req.params.photoId || "").trim();
      if (!OBJECT_ID_RE.test(photoId)) {
        return res.status(404).json({ error: "Photo not found" });
      }

      const { altText } = req.body || {};
      if (altText !== undefined && altText !== null && typeof altText !== "string") {
        return res.status(400).json({ error: "altText must be a string" });
      }

      // Photo must belong to this (owned) location.
      const photo = await prisma.photo.findFirst({
        where: { id: photoId, locationId: location.id },
        select: { id: true },
      });
      if (!photo) return res.status(404).json({ error: "Photo not found" });

      const trimmed =
        typeof altText === "string" && altText.trim() ? altText.trim() : null;
      const updated = await prisma.photo.update({
        where: { id: photoId },
        data: { altText: trimmed },
      });

      const user = await refreshedUser(req);
      return res.json({ photo: serializePhoto(updated), user });
    } catch (err: any) {
      console.error("[locations] photo patch error:", err?.message || err);
      return res.status(500).json({ error: "Failed to update photo." });
    }
  }
);

/**
 * DELETE /api/locations/:locationId/photos/:photoId
 * Removes the photo row and deletes its Cloudinary asset (best-effort).
 */
router.delete(
  "/:locationId/photos/:photoId",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      const photoId = String(req.params.photoId || "").trim();
      if (!OBJECT_ID_RE.test(photoId)) {
        return res.status(404).json({ error: "Photo not found" });
      }

      const photo = await prisma.photo.findFirst({
        where: { id: photoId, locationId: location.id },
        select: { id: true, publicId: true },
      });
      if (!photo) return res.status(404).json({ error: "Photo not found" });

      await prisma.photo.delete({ where: { id: photoId } });
      await deleteImageByPublicId(photo.publicId);

      const user = await refreshedUser(req);
      return res.json({ user });
    } catch (err: any) {
      console.error("[locations] photo delete error:", err?.message || err);
      return res.status(500).json({ error: "Failed to delete photo." });
    }
  }
);

// ===========================================================================
// Reviews (owner-only)
// ===========================================================================

/** Normalize a Review row for the dashboard. No customer PII (phone/email). */
function serializeReview(r: any) {
  return {
    id: r.id,
    locationId: r.locationId,
    customerId: r.customerId ?? null,
    customerName: r.customerName ?? null,
    customerUsername: r.customerUsername ?? null,
    rating: typeof r.rating === "number" ? r.rating : 0,
    description: r.description ?? null,
    partySize: typeof r.partySize === "number" ? r.partySize : null,
    serviceType: r.serviceType ?? null,
    createdAt: r.createdAt,
    // Optional single business reply (owner-managed).
    businessReply: r.businessReply ?? null,
    businessReplyCreatedAt: r.businessReplyCreatedAt ?? null,
    businessReplyUpdatedAt: r.businessReplyUpdatedAt ?? null,
  };
}

const MAX_REPLY_LENGTH = 500;

/**
 * GET /api/locations/:locationId/reviews
 * Returns all reviews for a location the authenticated business owns, newest
 * first. Ownership is enforced by loadOwnedLocation — there is no public route
 * that dumps every review for a location.
 */
router.get(
  "/:locationId/reviews",
  loadOwnedLocation,
  async (_req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      const reviews = await prisma.review.findMany({
        where: { locationId: location.id },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ reviews: reviews.map(serializeReview) });
    } catch (err: any) {
      console.error("[locations] list reviews error:", err?.message || err);
      return res.status(500).json({ error: "Failed to load reviews." });
    }
  }
);

/**
 * PATCH /api/locations/:locationId/reviews/:reviewId/reply
 * Body: { reply }. Creates or updates the single owner reply on a review the
 * authenticated business owns. Customers' review text/rating are NEVER modified
 * here — owners can only reply.
 */
router.patch(
  "/:locationId/reviews/:reviewId/reply",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      const reviewId = String(req.params.reviewId || "").trim();
      if (!OBJECT_ID_RE.test(reviewId)) {
        return res.status(404).json({ error: "Review not found" });
      }

      const { reply } = req.body || {};
      if (typeof reply !== "string") {
        return res.status(400).json({ error: "reply must be a string" });
      }
      const trimmed = reply.trim();
      if (!trimmed) {
        return res.status(400).json({ error: "Reply cannot be empty." });
      }
      if (trimmed.length > MAX_REPLY_LENGTH) {
        return res
          .status(400)
          .json({ error: `Reply must be ${MAX_REPLY_LENGTH} characters or fewer.` });
      }

      const review = await prisma.review.findFirst({
        where: { id: reviewId, locationId: location.id },
        select: { id: true, businessReplyCreatedAt: true },
      });
      if (!review) return res.status(404).json({ error: "Review not found" });

      const now = new Date();
      const updated = await prisma.review.update({
        where: { id: reviewId },
        data: {
          businessReply: trimmed,
          // Stamp createdAt only on the very first reply; always bump updatedAt.
          businessReplyCreatedAt: review.businessReplyCreatedAt ?? now,
          businessReplyUpdatedAt: now,
        },
      });
      return res.json({ review: serializeReview(updated) });
    } catch (err: any) {
      console.error("[locations] review reply error:", err?.message || err);
      return res.status(500).json({ error: "Failed to save reply." });
    }
  }
);

/**
 * DELETE /api/locations/:locationId/reviews/:reviewId/reply
 * Clears the business reply. The customer's review itself is untouched.
 */
router.delete(
  "/:locationId/reviews/:reviewId/reply",
  loadOwnedLocation,
  async (req: Request, res: Response) => {
    try {
      const location = res.locals.location as OwnedLocation;
      const reviewId = String(req.params.reviewId || "").trim();
      if (!OBJECT_ID_RE.test(reviewId)) {
        return res.status(404).json({ error: "Review not found" });
      }
      const review = await prisma.review.findFirst({
        where: { id: reviewId, locationId: location.id },
        select: { id: true },
      });
      if (!review) return res.status(404).json({ error: "Review not found" });

      const updated = await prisma.review.update({
        where: { id: reviewId },
        data: {
          businessReply: null,
          businessReplyCreatedAt: null,
          businessReplyUpdatedAt: null,
        },
      });
      return res.json({ review: serializeReview(updated) });
    } catch (err: any) {
      console.error("[locations] review reply delete error:", err?.message || err);
      return res.status(500).json({ error: "Failed to delete reply." });
    }
  }
);

export default router;

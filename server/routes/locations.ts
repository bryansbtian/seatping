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

type UploadedFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

const SUGGEST_WEIGHTS = {
  name: 3.2,
  label: 2.6,
  areaCity: 1.6,
  cuisine: 1.3,
  address: 1.0,
  text: 0.7,
};

function pickCuisineSuggest(rp: any): string | null {
  const arr = rp?.cuisineTypes;
  return Array.isArray(arr) && arr.length ? String(arr[0]) : null;
}

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

router.use(requireBusiness);

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

const MAX_PHOTOS_PER_LOCATION = 10;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
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

function runMulter(
  req: Request,
  res: Response,
  mw: (req: Request, res: Response, cb: (err?: unknown) => void) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    mw(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
  });
}

function uploadErrorMessage(err: any): string {
  if (err?.code === "LIMIT_FILE_SIZE") return "Each image must be 5MB or smaller.";
  if (err?.code === "LIMIT_FILE_COUNT")
    return `You can upload at most ${MAX_PHOTOS_PER_LOCATION} images at once.`;
  return err?.message || "Upload failed. Please try again.";
}

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

type OwnedLocation = { id: string; bannerImagePublicId: string | null };

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

async function refreshedUser(req: Request) {
  return assembleBusinessMe((req as any).auth.sub as string);
}


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
        await deleteImageByPublicId(publicId);
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
    businessReply: r.businessReply ?? null,
    businessReplyCreatedAt: r.businessReplyCreatedAt ?? null,
    businessReplyUpdatedAt: r.businessReplyUpdatedAt ?? null,
  };
}

const MAX_REPLY_LENGTH = 500;

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

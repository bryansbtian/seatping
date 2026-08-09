import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import {
  signJwt,
  setAuthCookie,
  clearAuthCookie,
  requireCustomer,
  requireBusiness,
  requireAdmin,
  readSession,
} from "../lib/auth.js";
import {
  rateLimit,
  limitGuard,
  clientIp,
  MINUTES,
  HOURS,
} from "../lib/rateLimit.js";
import {
  CustomerSignUpSchema,
  BusinessSignUpSchema,
  LoginSchema,
  CustomerUpdateSchema,
  ChangePasswordSchema,
} from "../lib/validation.js";
import {
  DEFAULT_BASE_CREDITS,
  enforceTrialExpiration,
  buildLocationData,
  checkAndRefillMonthlyCredits,
} from "../lib/trial.js";
import {
  sendEmail,
  sendPasswordResetEmail,
  sendBusinessOnboardingEmail,
  sendCustomerWelcomeEmail,
  sendPasswordChangeConfirmationEmail,
} from "../lib/email.js";
import { assembleBusinessMe, augmentLocationWithLiveLists } from "../lib/business.js";
import { deleteImageByPublicId } from "../lib/cloudinary.js";
import { normalizeSettings, syncCustomerReservation } from "../lib/reservations.js";
import { syncCustomerQueue } from "../lib/queueSync.js";
import {
  syncGuestFromQueueEntry,
  touchGuestByQueueEntryId,
  touchGuestByReservationId,
} from "../lib/guests.js";
import { etaForToken, etaForAllQueueCustomers } from "../lib/queueEta.js";
import {
  queueEntryToLegacy,
  legacyKeyOf,
  reservationStatusToEnum,
  reservationRowToLegacy,
} from "../lib/liveData.js";
import { applyStatusCapacityDelta } from "../lib/reservationCapacity.js";
import { enqueueNotification, canNotifyRecipient } from "../lib/notifications.js";
import { withWriteRetry } from "../lib/dbRetry.js";
import {
  getLocationOperatingStatus,
  getLocationTimezone,
  getNowWallClockInTimezone,
} from "../lib/operatingHours.js";
import crypto from "crypto";

const router = Router();


function serializeCustomer(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    phone: user.phone,
    createdAt: user.createdAt,
  };
}

async function getOwnedBusiness(businessId: string, username: string) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, username },
    select: { id: true, name: true, username: true },
  });
  return business;
}


router.get("/session", (req, res) => {
  const customer = readSession(req, "customer");
  const business = readSession(req, "business");
  return res.json({
    customer: customer ? { name: customer.name } : null,
    business: business ? { name: business.name } : null,
  });
});


router.post("/signup", async (req, res) => {
  try {
    if (
      await limitGuard(req, res, [
        { name: "signup-ip", key: clientIp(req), windowMs: HOURS(1), max: 5 },
      ])
    )
      return;

    const parsed = CustomerSignUpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.flatten() });
    }

    const { name, username, email, phone, password } = parsed.data;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Email or username already in use" });
    }

    const hash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, username, email, phone, password: hash },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        createdAt: true,
      },
    });

    console.log("[auth] New customer created:", {
      id: user.id,
      email: user.email,
      username: user.username,
    });

    sendCustomerWelcomeEmail(user.email, user.name).catch((err) =>
      console.error("[auth] customer welcome email error:", err)
    );

    const token = signJwt({
      sub: user.id,
      accountType: "customer",
      name: user.name,
    });
    setAuthCookie(res, token, "customer");

    return res.status(201).json({ user });
  } catch (err: any) {
    console.error("[auth] customer signup error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const loginId = String(req.body?.emailOrUsername || "").toLowerCase().trim();
    if (
      await limitGuard(req, res, [
        { name: "login-ip", key: clientIp(req), windowMs: MINUTES(15), max: 10 },
        { name: "login-id", key: loginId, windowMs: MINUTES(15), max: 5 },
      ])
    )
      return;

    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.flatten() });
    }

    const { emailOrUsername, password } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: emailOrUsername }, { username: emailOrUsername }] },
    });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signJwt({
      sub: user.id,
      accountType: "customer",
      name: user.name,
    });
    setAuthCookie(res, token, "customer");

    return res.json({ user: serializeCustomer(user) });
  } catch (err: any) {
    console.error("[auth] customer login error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/customer/logout", (_req, res) => {
  clearAuthCookie(res, "customer");
  res.json({ ok: true });
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res, "customer");
  res.json({ ok: true });
});

type ActivityDisplay = { imageUrl: string | null; name: string | null };

async function attachActivityDetails<T extends Record<string, any>>(
  user: T,
): Promise<T> {
  const asArray = (v: unknown) => (Array.isArray(v) ? (v as any[]) : []);
  const upcoming = asArray(user.upcomingReservations);
  const past = asArray(user.pastReservations);
  const queue = asArray(user.queueingActivity);
  const all = [...upcoming, ...past, ...queue];
  if (all.length === 0) return user;

  const locationIds = new Set<string>();
  const usernames = new Set<string>();
  for (const e of all) {
    if (e?.locationId) locationIds.add(String(e.locationId));
    else if (e?.businessUsername) usernames.add(String(e.businessUsername));
  }

  const imgOf = (loc: any) =>
    loc?.bannerImageUrl ||
    (Array.isArray(loc?.photos) && loc.photos[0]?.url) ||
    null;

  const nameOf = (loc: any, businessName?: string | null) => {
    const rp = (loc?.restaurantProfile || {}) as any;
    return (
      rp.displayName ||
      businessName ||
      loc?.displayName ||
      loc?.name ||
      null
    );
  };

  const byLocation = new Map<string, ActivityDisplay>();
  if (locationIds.size > 0) {
    const locs = await prisma.location.findMany({
      where: { id: { in: [...locationIds] } },
      include: { photos: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    const bizIds = [...new Set(locs.map((l) => l.businessId))];
    const bizNames = new Map<string, string>();
    if (bizIds.length > 0) {
      const bizs = await prisma.business.findMany({
        where: { id: { in: bizIds } },
        select: { id: true, name: true },
      });
      for (const b of bizs) bizNames.set(b.id, b.name);
    }
    for (const l of locs) {
      byLocation.set(l.id, {
        imageUrl: imgOf(l),
        name: nameOf(l, bizNames.get(l.businessId)),
      });
    }
  }

  const byUsername = new Map<string, ActivityDisplay>();
  if (usernames.size > 0) {
    const bizs = await prisma.business.findMany({
      where: { username: { in: [...usernames] } },
      select: { id: true, username: true, name: true },
    });
    const bizLocs = bizs.length
      ? await prisma.location.findMany({
          where: { businessId: { in: bizs.map((b) => b.id) } },
          orderBy: { createdAt: "asc" },
          include: { photos: { orderBy: { createdAt: "asc" }, take: 1 } },
        })
      : [];
    const firstByBiz = new Map<string, any>();
    for (const l of bizLocs) {
      if (!firstByBiz.has(l.businessId)) firstByBiz.set(l.businessId, l);
    }
    for (const b of bizs) {
      const loc = firstByBiz.get(b.id);
      byUsername.set(b.username, {
        imageUrl: imgOf(loc),
        name: nameOf(loc, b.name),
      });
    }
  }

  const withDetails = (e: any) => {
    const display =
      (e?.locationId ? byLocation.get(String(e.locationId)) : undefined) ??
      (e?.businessUsername
        ? byUsername.get(String(e.businessUsername))
        : undefined);
    return {
      ...e,
      imageUrl: e?.imageUrl ?? display?.imageUrl ?? null,
      restaurantName: display?.name ?? e?.businessName ?? null,
    };
  };

  return {
    ...user,
    upcomingReservations: upcoming.map(withDetails),
    pastReservations: past.map(withDetails),
    queueingActivity: queue.map(withDetails),
  };
}

router.get("/me", requireCustomer, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        upcomingReservations: true,
        pastReservations: true,
        queueingActivity: true,
        savedRestaurants: true,
        createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: "Not found" });
    return res.json({ user: await attachActivityDetails(user) });
  } catch (err: any) {
    console.error("[auth] customer me error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/me", requireCustomer, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const parsed = CustomerUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.flatten() });
    }
    const { name, username, email, phone } = parsed.data;

    const dupe = await prisma.user.findFirst({
      where: { id: { not: userId }, OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (dupe) {
      const field = dupe.email === email ? "Email" : "Username";
      return res.status(409).json({ error: `${field} already in use` });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { name, username, email, phone },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        upcomingReservations: true,
        pastReservations: true,
        queueingActivity: true,
        savedRestaurants: true,
        createdAt: true,
      },
    });

    const token = signJwt({
      sub: user.id,
      accountType: "customer",
      name: user.name,
    });
    setAuthCookie(res, token, "customer");

    return res.json({ user: await attachActivityDetails(user) });
  } catch (err: any) {
    console.error("[auth] customer update error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/me/change-password", requireCustomer, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.flatten() });
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, password: true },
    });
    if (!user) return res.status(404).json({ error: "Not found" });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    sendPasswordChangeConfirmationEmail(user.email, user.name).catch((e) =>
      console.error("[auth] pw change email failed:", e)
    );

    return res.json({ success: true, message: "Password updated" });
  } catch (err: any) {
    console.error("[auth] change password error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});


const CUSTOMER_ME_SELECT = {
  id: true,
  name: true,
  email: true,
  username: true,
  phone: true,
  upcomingReservations: true,
  pastReservations: true,
  queueingActivity: true,
  savedRestaurants: true,
  createdAt: true,
} as const;

router.post("/me/saved-restaurants", requireCustomer, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const { businessUsername, businessName, locationName, area, city } =
      req.body || {};
    if (
      !businessUsername ||
      typeof businessUsername !== "string" ||
      !businessUsername.trim()
    ) {
      return res.status(400).json({ error: "businessUsername is required" });
    }
    const uname = businessUsername.trim();

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { savedRestaurants: true },
    });
    if (!current) return res.status(404).json({ error: "Not found" });

    const list = Array.isArray(current.savedRestaurants)
      ? (current.savedRestaurants as any[])
      : [];

    if (!list.some((s) => s?.businessUsername === uname)) {
      const str = (v: unknown) =>
        typeof v === "string" && v.trim() ? v.trim() : undefined;
      list.unshift({
        id: uname,
        businessUsername: uname,
        businessName: str(businessName),
        locationName: str(locationName),
        area: str(area),
        city: str(city),
        savedAt: new Date().toISOString(),
      });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { savedRestaurants: list },
      select: CUSTOMER_ME_SELECT,
    });
    return res.json({ user: await attachActivityDetails(user) });
  } catch (err: any) {
    console.error("[auth] save restaurant error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete(
  "/me/saved-restaurants/:businessUsername",
  requireCustomer,
  async (req, res) => {
    try {
      const userId = (req as any).auth.sub as string;
      const uname = String(req.params.businessUsername || "").trim();
      if (!uname) {
        return res.status(400).json({ error: "businessUsername is required" });
      }

      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { savedRestaurants: true },
      });
      if (!current) return res.status(404).json({ error: "Not found" });

      const list = Array.isArray(current.savedRestaurants)
        ? (current.savedRestaurants as any[])
        : [];
      const next = list.filter((s) => s?.businessUsername !== uname);

      const user = await prisma.user.update({
        where: { id: userId },
        data: { savedRestaurants: next },
        select: CUSTOMER_ME_SELECT,
      });
      return res.json({ user: await attachActivityDetails(user) });
    } catch (err: any) {
      console.error("[auth] remove saved restaurant error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

const SAVED_OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

async function buildSavedLocationEntry(locationId: string) {
  if (!SAVED_OBJECT_ID_RE.test(locationId)) return null;
  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    include: { photos: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!loc) return null;
  const biz = await prisma.business.findUnique({
    where: { id: loc.businessId },
    select: { name: true, username: true },
  });
  const rp = (loc.restaurantProfile || {}) as any;
  const agg = await prisma.review.aggregate({
    where: { locationId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const rating =
    agg._count._all > 0 && typeof agg._avg.rating === "number"
      ? Math.round(agg._avg.rating * 10) / 10
      : null;
  const cuisine =
    Array.isArray(rp.cuisineTypes) && rp.cuisineTypes.length
      ? String(rp.cuisineTypes[0])
      : null;
  return {
    id: locationId,
    locationId,
    businessUsername: biz?.username ?? null,
    businessName: biz?.name ?? null,
    name: rp.displayName || biz?.name || loc.displayName || loc.name || "Restaurant",
    locationName: rp.shortAddress || loc.displayName || loc.area || loc.city || null,
    area: loc.area ?? null,
    city: loc.city ?? null,
    cuisine,
    rating,
    imageUrl: loc.bannerImageUrl || (loc as any).photos?.[0]?.url || null,
    savedAt: new Date().toISOString(),
  };
}

function savedMatches(s: any, key: string): boolean {
  return s?.locationId === key || s?.id === key;
}

router.get(
  "/me/saved-locations/:locationId",
  requireCustomer,
  async (req, res) => {
    try {
      const userId = (req as any).auth.sub as string;
      const locationId = String(req.params.locationId || "").trim();
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { savedRestaurants: true },
      });
      const list = Array.isArray(current?.savedRestaurants)
        ? (current!.savedRestaurants as any[])
        : [];
      return res.json({ saved: list.some((s) => savedMatches(s, locationId)) });
    } catch (err: any) {
      console.error("[auth] saved-location status error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.post("/me/saved-locations", requireCustomer, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const locationId = String(req.body?.locationId || "").trim();
    if (!SAVED_OBJECT_ID_RE.test(locationId)) {
      return res.status(400).json({ error: "A valid locationId is required" });
    }

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { savedRestaurants: true },
    });
    if (!current) return res.status(404).json({ error: "Not found" });

    const list = Array.isArray(current.savedRestaurants)
      ? (current.savedRestaurants as any[])
      : [];

    if (!list.some((s) => savedMatches(s, locationId))) {
      const entry = await buildSavedLocationEntry(locationId);
      if (!entry) return res.status(404).json({ error: "Location not found" });
      list.unshift(entry);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { savedRestaurants: list },
      select: CUSTOMER_ME_SELECT,
    });
    return res.json({ user: await attachActivityDetails(user) });
  } catch (err: any) {
    console.error("[auth] save location error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete(
  "/me/saved-locations/:locationId",
  requireCustomer,
  async (req, res) => {
    try {
      const userId = (req as any).auth.sub as string;
      const locationId = String(req.params.locationId || "").trim();
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { savedRestaurants: true },
      });
      if (!current) return res.status(404).json({ error: "Not found" });

      const list = Array.isArray(current.savedRestaurants)
        ? (current.savedRestaurants as any[])
        : [];
      const next = list.filter((s) => !savedMatches(s, locationId));

      const user = await prisma.user.update({
        where: { id: userId },
        data: { savedRestaurants: next },
        select: CUSTOMER_ME_SELECT,
      });
      return res.json({ user: await attachActivityDetails(user) });
    } catch (err: any) {
      console.error("[auth] remove saved location error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);


async function buildCustomerReviewEntry(review: any) {
  const loc = await prisma.location.findUnique({
    where: { id: review.locationId },
    select: {
      id: true,
      businessId: true,
      name: true,
      displayName: true,
      area: true,
      city: true,
      address: true,
      restaurantProfile: true,
    },
  });
  const biz = loc
    ? await prisma.business.findUnique({
        where: { id: loc.businessId },
        select: { name: true, username: true },
      })
    : null;
  const rp = (loc?.restaurantProfile || {}) as any;
  return {
    id: review.id,
    locationId: review.locationId,
    businessUsername: biz?.username ?? null,
    rating: typeof review.rating === "number" ? review.rating : 0,
    description: review.description ?? null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    businessReply: review.businessReply ?? null,
    businessReplyCreatedAt: review.businessReplyCreatedAt ?? null,
    businessReplyUpdatedAt: review.businessReplyUpdatedAt ?? null,
    restaurantName:
      rp.displayName || biz?.name || loc?.displayName || loc?.name || "Restaurant",
    locationName:
      rp.shortAddress || loc?.displayName || loc?.area || loc?.city || loc?.address || null,
  };
}

router.get("/me/reviews", requireCustomer, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const rows = await prisma.review.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: "desc" },
    });
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      if (seen.has(r.locationId)) return false;
      seen.add(r.locationId);
      return true;
    });
    const reviews = await Promise.all(deduped.map(buildCustomerReviewEntry));
    return res.json({ reviews });
  } catch (err: any) {
    console.error("[auth] list customer reviews error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/me/reviews/:reviewId", requireCustomer, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const reviewId = String(req.params.reviewId || "").trim();
    if (!SAVED_OBJECT_ID_RE.test(reviewId)) {
      return res.status(404).json({ error: "Review not found" });
    }

    const existing = await prisma.review.findFirst({
      where: { id: reviewId, customerId: userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Review not found" });

    const { rating, description } = req.body || {};
    const data: { rating?: number; description?: string | null } = {};

    if (rating !== undefined) {
      if (typeof rating !== "number" || !Number.isFinite(rating)) {
        return res.status(400).json({ error: "rating must be a number" });
      }
      const ratingInt = Math.round(rating);
      if (ratingInt < 1 || ratingInt > 5) {
        return res.status(400).json({ error: "rating must be between 1 and 5" });
      }
      data.rating = ratingInt;
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return res.status(400).json({ error: "description must be a string" });
      }
      data.description =
        typeof description === "string" && description.trim()
          ? description.trim()
          : null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const saved = await prisma.review.update({ where: { id: reviewId }, data });
    return res.json({ review: await buildCustomerReviewEntry(saved) });
  } catch (err: any) {
    console.error("[auth] update customer review error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/me/reviews/:reviewId", requireCustomer, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const reviewId = String(req.params.reviewId || "").trim();
    if (!SAVED_OBJECT_ID_RE.test(reviewId)) {
      return res.status(404).json({ error: "Review not found" });
    }

    const existing = await prisma.review.findFirst({
      where: { id: reviewId, customerId: userId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Review not found" });

    await prisma.review.delete({ where: { id: reviewId } });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[auth] delete customer review error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});


router.post("/forgot-password", async (req, res) => {
  try {
    const { email, type } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }
    const normalized = email.toLowerCase();

    if (
      await limitGuard(req, res, [
        { name: "forgot-email", key: normalized, windowMs: HOURS(1), max: 3 },
        { name: "forgot-ip", key: clientIp(req), windowMs: HOURS(1), max: 10 },
      ])
    )
      return;
    const accountType = type === "business" ? "business" : "customer";

    const business =
      accountType === "business"
        ? await prisma.business.findUnique({
            where: { email: normalized },
            select: { id: true, email: true },
          })
        : null;
    const user =
      accountType === "customer"
        ? await prisma.user.findUnique({
            where: { email: normalized },
            select: { id: true, email: true },
          })
        : null;

    const genericOk = {
      success: true,
      message:
        "If an account with that email exists, a password reset link has been sent.",
    };
    if (!business && !user) return res.json(genericOk);

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    if (business) {
      await prisma.business.update({
        where: { id: business.id },
        data: { resetToken, resetTokenExpiry },
      });
    } else if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiry },
      });
    }

    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.APP_ORIGIN,
      process.env.CLIENT_ORIGIN,
      "http://localhost:8080",
      "http://localhost:5173",
    ].filter(Boolean) as string[];
    const reqOrigin =
      typeof req.headers.origin === "string" ? req.headers.origin : "";
    const baseUrl = allowedOrigins.includes(reqOrigin) ? reqOrigin : undefined;

    const targetEmail = (business?.email || user?.email) as string;
    const emailSent = await sendPasswordResetEmail(
      targetEmail,
      resetToken,
      business ? "business" : "customer",
      baseUrl,
    );
    if (!emailSent) return res.status(500).json({ error: "Failed to send email" });

    return res.json(genericOk);
  } catch (err: any) {
    console.error("[auth] forgot password error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    if (
      await limitGuard(req, res, [
        { name: "reset-ip", key: clientIp(req), windowMs: MINUTES(15), max: 10 },
      ])
    )
      return;

    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ error: "token and newPassword are required" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const business = await prisma.business.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
      select: { id: true, email: true, name: true },
    });
    if (business) {
      await prisma.business.update({
        where: { id: business.id },
        data: { password: hashedPassword, resetToken: null, resetTokenExpiry: null },
      });
      sendPasswordChangeConfirmationEmail(business.email, business.name).catch(
        (e) => console.error("[auth] pw change email failed:", e)
      );
      return res.json({ success: true, message: "Password has been reset successfully" });
    }

    const user = await prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
      select: { id: true, email: true, name: true },
    });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, resetToken: null, resetTokenExpiry: null },
      });
      sendPasswordChangeConfirmationEmail(user.email, user.name).catch((e) =>
        console.error("[auth] pw change email failed:", e)
      );
      return res.json({ success: true, message: "Password has been reset successfully" });
    }

    return res.status(400).json({ error: "Invalid or expired reset token" });
  } catch (err: any) {
    console.error("[auth] reset password error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});


router.get("/exists", async (req, res) => {
  try {
    if (
      await limitGuard(req, res, [
        { name: "exists-ip", key: clientIp(req), windowMs: MINUTES(10), max: 30 },
      ])
    )
      return;

    const username = String(req.query.username || "").trim();
    if (!username)
      return res.status(400).json({ error: "username is required" });
    const business = await prisma.business.findUnique({ where: { username } });
    return res.json({ exists: Boolean(business) });
  } catch (err: any) {
    console.error("[auth] exists error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/business/signup", async (req, res) => {
  try {
    if (
      await limitGuard(req, res, [
        { name: "biz-signup-ip", key: clientIp(req), windowMs: HOURS(1), max: 5 },
      ])
    )
      return;

    const parsed = BusinessSignUpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.flatten() });
    }

    const { name, username, email, phone, password } = parsed.data;

    const existing = await prisma.business.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Email or username already in use" });
    }

    const hash = await bcrypt.hash(password, 12);

    const business = await prisma.business.create({
      data: {
        name,
        username,
        email,
        phone,
        password: hash,
        trial: true,
        trialDurationDays: 7,
        maxLocations: 1,
        baseCredits: DEFAULT_BASE_CREDITS,
        creditsStartedAt: null,
      },
    });

    console.log("[auth] New business created:", {
      id: business.id,
      email: business.email,
      username: business.username,
    });

    sendBusinessOnboardingEmail(
      business.email,
      business.name,
      business.username,
      business.trial ? business.trialDurationDays : undefined
    ).catch((err) =>
      console.error("[auth] business onboarding email error:", err)
    );

    const token = signJwt({
      sub: business.id,
      accountType: "business",
      name: business.name,
    });
    setAuthCookie(res, token, "business");

    const me = await assembleBusinessMe(business.id);
    return res.status(201).json({ user: me });
  } catch (err: any) {
    console.error("[auth] business signup error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/business/login", async (req, res) => {
  try {
    const loginId = String(req.body?.emailOrUsername || "").toLowerCase().trim();
    if (
      await limitGuard(req, res, [
        { name: "biz-login-ip", key: clientIp(req), windowMs: MINUTES(15), max: 10 },
        { name: "biz-login-id", key: loginId, windowMs: MINUTES(15), max: 5 },
      ])
    )
      return;

    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.flatten() });
    }

    const { emailOrUsername, password } = parsed.data;

    const business = await prisma.business.findFirst({
      where: { OR: [{ email: emailOrUsername }, { username: emailOrUsername }] },
    });
    if (!business) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, business.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signJwt({
      sub: business.id,
      accountType: "business",
      name: business.name,
    });
    setAuthCookie(res, token, "business");

    return res.json({
      user: {
        id: business.id,
        name: business.name,
        email: business.email,
        username: business.username,
        phone: business.phone,
      },
    });
  } catch (err: any) {
    console.error("[auth] business login error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/business/logout", (_req, res) => {
  clearAuthCookie(res, "business");
  res.json({ ok: true });
});


const adminLoginLimiter = rateLimit({
  name: "admin-login",
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts. Please try again later.",
});

router.post("/admin/login", adminLoginLimiter, async (req, res) => {
  const GENERIC = "Invalid credentials.";
  try {
    const username = String(req.body?.username || "");
    const password = String(req.body?.password || "");

    const expectedUser = process.env.ADMIN_USERNAME;
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;
    if (!expectedUser || !passwordHash) {
      console.error("[ADMIN] ADMIN_USERNAME / ADMIN_PASSWORD_HASH not configured");
      return res.status(401).json({ error: GENERIC });
    }

    const passwordOk = await bcrypt.compare(password, passwordHash);
    const usernameOk = username === expectedUser;
    if (!usernameOk || !passwordOk) {
      return res.status(401).json({ error: GENERIC });
    }

    const token = signJwt({ sub: "admin", accountType: "admin", name: "Admin" });
    setAuthCookie(res, token, "admin");
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[ADMIN] login error:", err?.message || err);
    return res.status(401).json({ error: GENERIC });
  }
});

router.post("/admin/logout", (_req, res) => {
  clearAuthCookie(res, "admin");
  res.json({ ok: true });
});

router.get("/admin/session", (req, res) => {
  const session = readSession(req, "admin");
  res.json({ authenticated: session?.accountType === "admin" });
});

router.get("/business/me", requireBusiness, async (req, res) => {
  try {
    const businessId = (req as any).auth.sub as string;

    await enforceTrialExpiration(businessId);
    await checkAndRefillMonthlyCredits(businessId);

    const me = await assembleBusinessMe(businessId);
    if (!me) return res.status(404).json({ error: "Not found" });
    return res.json({ user: me });
  } catch (err: any) {
    console.error("[auth] business me error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/business/me", requireBusiness, async (req, res) => {
  try {
    const businessId = (req as any).auth.sub as string;
    const { locations } = req.body || {};
    if (!Array.isArray(locations)) {
      return res.status(400).json({ error: "locations array is required" });
    }

    const keepAddresses = new Set(
      locations
        .map((l: any) => (typeof l?.address === "string" ? l.address : null))
        .filter(Boolean)
    );

    const existing = await prisma.location.findMany({
      where: { businessId },
      select: { id: true, address: true, bannerImagePublicId: true },
    });

    const toDelete = existing.filter((l) => !keepAddresses.has(l.address));
    if (toDelete.length > 0) {
      const idsToDelete = toDelete.map((l) => l.id);

      const orphanPhotos = await prisma.photo.findMany({
        where: { locationId: { in: idsToDelete } },
        select: { publicId: true },
      });
      await Promise.all([
        ...toDelete.map((l) => deleteImageByPublicId(l.bannerImagePublicId)),
        ...orphanPhotos.map((p) => deleteImageByPublicId(p.publicId)),
      ]);

      await prisma.photo.deleteMany({
        where: { locationId: { in: idsToDelete } },
      });
      await prisma.location.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    const me = await assembleBusinessMe(businessId);
    return res.json({ user: me });
  } catch (err: any) {
    console.error("[auth] business update locations error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

const BUSINESS_LANGUAGES = ["en", "id"] as const;
type BusinessLanguage = (typeof BUSINESS_LANGUAGES)[number];

router.get("/business/language", requireBusiness, async (req, res) => {
  try {
    const businessId = (req as any).auth.sub as string;
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { language: true },
    });
    if (!business) return res.status(404).json({ error: "Not found" });
    return res.json({ language: (business.language as string) || "en" });
  } catch (err: any) {
    console.error("[auth] business get language error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/business/language", requireBusiness, async (req, res) => {
  try {
    const businessId = (req as any).auth.sub as string;
    const language = String(req.body?.language || "");
    if (!BUSINESS_LANGUAGES.includes(language as BusinessLanguage)) {
      return res
        .status(400)
        .json({ error: "language must be one of: en, id" });
    }
    await prisma.business.update({
      where: { id: businessId },
      data: { language },
    });
    return res.json({ language });
  } catch (err: any) {
    console.error("[auth] business set language error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/business/locations", requireBusiness, async (req, res) => {
  try {
    const businessId = (req as any).auth.sub as string;
    const {
      displayName,
      address,
      area,
      city,
      country,
      latitude,
      longitude,
      googlePlaceId,
      googleMapsUrl,
    } = req.body || {};

    if (!address || typeof address !== "string" || !address.trim()) {
      return res.status(400).json({ error: "address is required" });
    }
    if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
      return res.status(400).json({ error: "displayName is required" });
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) return res.status(404).json({ error: "Not found" });

    const count = await prisma.location.count({ where: { businessId } });
    const maxLocations = (business as any).maxLocations ?? 1;
    if (count >= maxLocations) {
      return res
        .status(400)
        .json({ error: `Max locations reached (${maxLocations})` });
    }

    await prisma.location.create({
      data: buildLocationData(business, {
        address: address.trim(),
        displayName: typeof displayName === "string" ? displayName : undefined,
        area: typeof area === "string" ? area : undefined,
        city: typeof city === "string" ? city : undefined,
        country: typeof country === "string" ? country : undefined,
        latitude: typeof latitude === "number" ? latitude : null,
        longitude: typeof longitude === "number" ? longitude : null,
        googlePlaceId: typeof googlePlaceId === "string" ? googlePlaceId : undefined,
        googleMapsUrl: typeof googleMapsUrl === "string" ? googleMapsUrl : undefined,
      }),
    });

    const me = await assembleBusinessMe(businessId);
    return res.json({ user: me });
  } catch (err: any) {
    console.error("[auth] add location error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/business/locations/:locationId", requireBusiness, async (req, res) => {
  try {
    const businessId = (req as any).auth.sub as string;
    const locationId = String(req.params.locationId || "").trim();
    if (!locationId) {
      return res.status(400).json({ error: "locationId is required" });
    }

    const owned = await prisma.location.findFirst({
      where: { id: locationId, businessId },
      select: { id: true },
    });
    if (!owned) {
      return res
        .status(404)
        .json({ error: "Location not found or access denied" });
    }

    const {
      restaurantProfile,
      address,
      queueEnabled,
      reservationsEnabled,
      reservationSettings,
    } = req.body || {};
    const data: Record<string, unknown> = {};

    if (restaurantProfile !== undefined) {
      if (
        typeof restaurantProfile !== "object" ||
        restaurantProfile === null ||
        Array.isArray(restaurantProfile)
      ) {
        return res
          .status(400)
          .json({ error: "restaurantProfile must be an object" });
      }
      data.restaurantProfile = restaurantProfile;
      data.isPublished = (restaurantProfile as any).isPublished === true;
    }
    if (address !== undefined) {
      if (typeof address !== "string" || !address.trim()) {
        return res.status(400).json({ error: "address must be a non-empty string" });
      }
      data.address = address.trim();
    }
    if (queueEnabled !== undefined) {
      if (typeof queueEnabled !== "boolean") {
        return res.status(400).json({ error: "queueEnabled must be a boolean" });
      }
      data.queueEnabled = queueEnabled;
    }
    if (reservationsEnabled !== undefined) {
      if (typeof reservationsEnabled !== "boolean") {
        return res
          .status(400)
          .json({ error: "reservationsEnabled must be a boolean" });
      }
      data.reservationsEnabled = reservationsEnabled;
    }
    if (reservationSettings !== undefined) {
      if (
        typeof reservationSettings !== "object" ||
        reservationSettings === null ||
        Array.isArray(reservationSettings)
      ) {
        return res
          .status(400)
          .json({ error: "reservationSettings must be an object" });
      }
      data.reservationSettings = normalizeSettings(reservationSettings);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No editable fields provided" });
    }

    await prisma.location.update({ where: { id: locationId }, data });

    const me = await assembleBusinessMe(businessId);
    return res.json({ user: me });
  } catch (err: any) {
    console.error("[auth] update location profile error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch(
  "/business/locations/:locationId/reservations/:reservationId",
  requireBusiness,
  async (req, res) => {
    try {
      const businessId = (req as any).auth.sub as string;
      const locationId = String(req.params.locationId || "").trim();
      const reservationId = String(req.params.reservationId || "").trim();
      const status = String(req.body?.status || "").trim();

      const ALLOWED = [
        "confirmed",
        "arrived",
        "completed",
        "cancelled",
        "no_show",
      ];
      if (!ALLOWED.includes(status)) {
        return res.status(400).json({ error: "Invalid reservation status" });
      }

      const location = await prisma.location.findFirst({
        where: { id: locationId, businessId },
      });
      if (!location) {
        return res
          .status(404)
          .json({ error: "Location not found or access denied" });
      }

      const existing = await prisma.reservation.findFirst({
        where: { id: reservationId, locationId, businessId },
      });
      if (!existing) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      if (status === "arrived" || status === "no_show") {
        const nowLocal = getNowWallClockInTimezone(
          getLocationTimezone(location),
        );
        const bookedDate = String(existing.reservationDateTime || "").slice(
          0,
          10,
        );
        if (bookedDate && bookedDate > nowLocal.slice(0, 10)) {
          return res.status(400).json({
            error:
              "This reservation is on a future date. You can only mark it arrived or no-show on the day of the reservation.",
          });
        }
      }

      const now = new Date();
      const newEnum = reservationStatusToEnum(status);
      const timestampField: Record<string, "cancelledAt" | "arrivedAt" | "completedAt" | "noShowAt"> = {
        cancelled: "cancelledAt",
        arrived: "arrivedAt",
        completed: "completedAt",
        no_show: "noShowAt",
      };

      const claimed = await withWriteRetry(() =>
        prisma.reservation.updateMany({
          where: { id: existing.id, status: existing.status },
          data: {
            status: newEnum,
            ...(timestampField[status] ? { [timestampField[status]]: now } : {}),
          },
        }),
      );
      if (claimed.count === 0) {
        return res.status(409).json({
          error: "This reservation was just updated by someone else. Please refresh.",
        });
      }

      await applyStatusCapacityDelta({
        locationId,
        reservationDateTime: existing.reservationDateTime,
        guestCount: existing.guestCount,
        oldStatus: existing.status,
        newStatus: newEnum,
      });

      const updated = await prisma.reservation.findUniqueOrThrow({
        where: { id: existing.id },
      });

      const biz = await prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      });
      await syncCustomerReservation(reservationRowToLegacy(updated), {
        businessName: biz?.name ?? null,
        locationName: location.displayName || location.name || biz?.name || null,
      });

      await touchGuestByReservationId(updated.id);

      const me = await assembleBusinessMe(businessId);
      return res.json({ user: me });
    } catch (err: any) {
      console.error("[auth] reservation status error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);


router.get("/business/:username/addresses", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username)
      return res.status(400).json({ error: "username is required" });

    const business = await prisma.business.findUnique({
      where: { username },
      select: { id: true, name: true },
    });
    if (!business) return res.status(404).json({ error: "Business not found" });

    const locations = await prisma.location.findMany({
      where: { businessId: business.id },
      select: {
        id: true,
        address: true,
        displayName: true,
        name: true,
        queueEnabled: true,
        restaurantProfile: true,
        area: true,
        city: true,
        country: true,
        latitude: true,
        longitude: true,
        googleMapsUrl: true,
      },
    });

    const addresses = locations.map((location) => {
      const rp = (location.restaurantProfile || {}) as any;
      const operatingStatus = getLocationOperatingStatus(location);
      return {
        id: location.id,
        address: location.address,
        displayName: location.displayName || location.name || null,
        restaurantName:
          rp.displayName || location.displayName || location.name || null,
        area: location.area,
        city: location.city,
        country: location.country,
        latitude: location.latitude,
        longitude: location.longitude,
        googleMapsUrl: location.googleMapsUrl,
        businessName: business.name,
        queueEnabled: location.queueEnabled ?? true,
        operatingStatus: {
          configured: operatingStatus.configured,
          isOpen: operatingStatus.isOpen,
          timezone: operatingStatus.timezone,
          localDate: operatingStatus.date,
          dayName: operatingStatus.dayName,
          todayHours: operatingStatus.hoursLabel,
        },
      };
    });

    return res.json({ addresses });
  } catch (err: any) {
    console.error("[auth] get business addresses error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/business/:username/queue", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username)
      return res.status(400).json({ error: "username is required" });

    const {
      locationId,
      address,
      firstName,
      lastName,
      numGuests,
      phoneNumber,
      countryCode,
      email,
      notificationMethod,
      smsConsent,
      smsMarketingConsent,
    } = req.body || {};

    if (!firstName || !lastName || !numGuests || !notificationMethod) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (!locationId && !address) {
      return res.status(400).json({ error: "A location is required" });
    }

    if (notificationMethod === "sms" || notificationMethod === "whatsapp") {
      if (!phoneNumber) {
        return res
          .status(400)
          .json({ error: "Phone number is required for SMS/WhatsApp notifications" });
      }
      if (notificationMethod === "sms" && !smsConsent) {
        return res
          .status(400)
          .json({ error: "SMS consent is required for SMS notifications" });
      }
    } else if (notificationMethod === "email") {
      if (!email) {
        return res
          .status(400)
          .json({ error: "Email is required for email notifications" });
      }
    } else {
      return res.status(400).json({ error: "Invalid notification method" });
    }

    const targetLoc = String(locationId || address || "").trim();
    const targetContact = String(phoneNumber || email || "")
      .toLowerCase()
      .trim();
    if (
      await limitGuard(req, res, [
        { name: "queue-join-ip", key: clientIp(req), windowMs: HOURS(1), max: 60 },
        {
          name: "queue-join-target",
          key: targetLoc && targetContact ? `${targetLoc}:${targetContact}` : null,
          windowMs: MINUTES(10),
          max: 3,
        },
      ])
    )
      return;

    const business = await prisma.business.findUnique({
      where: { username },
      select: { id: true, name: true },
    });
    if (!business) return res.status(404).json({ error: "Business not found" });

    const location = locationId
      ? await prisma.location.findFirst({
          where: { id: String(locationId), businessId: business.id },
        })
      : await prisma.location.findFirst({
          where: { businessId: business.id, address },
        });
    if (!location) {
      return res.status(404).json({
        error: "This queue link is invalid or no longer available.",
      });
    }
    if (!(location.queueEnabled ?? true)) {
      return res.status(400).json({
        error: "Queue joining is not available at this location.",
      });
    }

    const operatingStatus = getLocationOperatingStatus(location);
    if (operatingStatus.isOpen === false) {
      return res.status(400).json({
        error:
          "This location is currently closed. Queue joining is only available during operating hours.",
        operatingStatus: {
          configured: operatingStatus.configured,
          isOpen: operatingStatus.isOpen,
          timezone: operatingStatus.timezone,
          localDate: operatingStatus.date,
          dayName: operatingStatus.dayName,
          todayHours: operatingStatus.hoursLabel,
        },
      });
    }

    const existingWaiting = await prisma.queueEntry.findFirst({
      where: {
        locationId: location.id,
        status: "WAITING",
        ...(notificationMethod === "email"
          ? { email: String(email) }
          : { phone: String(phoneNumber) }),
      },
      select: { id: true },
    });
    if (existingWaiting) {
      return res.status(409).json({
        error:
          "This contact is already in the queue at this location. You'll be notified when it's your turn.",
        alreadyInQueue: true,
      });
    }

    const capRecipient =
      notificationMethod === "email" ? email : phoneNumber;
    const withinDailyCap = await canNotifyRecipient(
      notificationMethod,
      capRecipient,
    );
    if (!withinDailyCap) {
      return res.status(429).json({
        error:
          "Too many notifications have been sent to this contact today. Please use a different contact method or try again tomorrow.",
      });
    }

    const consumesCredit =
      notificationMethod === "sms" ||
      notificationMethod === "whatsapp" ||
      notificationMethod === "email";

    if (consumesCredit) {
      const charged = await withWriteRetry(() =>
        prisma.location.updateMany({
          where: { id: location.id, credits: { gt: 0 } },
          data: { credits: { decrement: 1 } },
        }),
      );
      if (charged.count === 0) {
        return res.status(400).json({
          error:
            "This location has no credits remaining for notifications. Please contact the business.",
        });
      }
    }

    const queueToken = crypto.randomBytes(16).toString("hex");

    const queueSession = readSession(req);
    const queueCustomerId =
      queueSession?.accountType === "customer" ? queueSession.sub : null;

    const joinedAt = new Date();

    let entry;
    try {
      entry = await prisma.queueEntry.create({
        data: {
          queueToken,
          legacyKey: legacyKeyOf(firstName, lastName, joinedAt.toISOString()),
          locationId: location.id,
          businessId: business.id,
          customerId: queueCustomerId,
          firstName: String(firstName),
          lastName: String(lastName),
          guestCount: Number(numGuests) || 0,
          notificationMethod: String(notificationMethod || ""),
          phone: phoneNumber || null,
          countryCode: countryCode || "+1",
          email: email || null,
          smsConsent: Boolean(smsConsent),
          smsMarketingConsent: Boolean(smsMarketingConsent),
          status: "WAITING",
          joinedAt,
        },
      });
    } catch (createErr) {
      if (consumesCredit) {
        await withWriteRetry(() =>
          prisma.location.update({
            where: { id: location.id },
            data: { credits: { increment: 1 } },
          }),
        ).catch(() => {});
      }
      throw createErr;
    }

    const position = await prisma.queueEntry.count({
      where: {
        locationId: location.id,
        status: "WAITING",
        joinedAt: { lte: joinedAt },
      },
    });

    const customer = queueEntryToLegacy(entry, { position, businessUsername: username });

    await syncCustomerQueue(customer, {
      status: "waiting",
      businessUsername: username,
      businessName: business.name,
      locationName: location.displayName || location.name || business.name,
      locationId: location.id,
    });

    await syncGuestFromQueueEntry(entry, { businessUsername: username });

    const businessName = business.name || "the business";
    const rpJoin = (location.restaurantProfile || {}) as any;
    const restaurantName =
      rpJoin.displayName ||
      location.displayName ||
      location.name ||
      businessName;

    if (
      notificationMethod === "sms" ||
      notificationMethod === "whatsapp" ||
      notificationMethod === "email"
    ) {
      await enqueueNotification({
        type: "queue_join",
        channel: notificationMethod,
        firstName: String(firstName),
        lastName: String(lastName),
        countryCode: countryCode || "+1",
        phoneNumber: phoneNumber || "",
        email: email || "",
        restaurantName,
        address: location.address,
        position,
      });
    }

    return res.json({
      success: true,
      customer,
      position,
      businessName: business.name,
      queueToken,
    });
  } catch (err: any) {
    console.error("[auth] add to queue error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

const QUEUE_HOLD_MS = 5 * 60 * 1000;

function admittedHoldInfo(admittedAt: string | null | undefined): {
  admittedAt: string | null;
  turnExpiresAt: string | null;
  expired: boolean;
} {
  const ms = admittedAt ? new Date(admittedAt).getTime() : NaN;
  if (!admittedAt || Number.isNaN(ms)) {
    return { admittedAt: admittedAt || null, turnExpiresAt: null, expired: false };
  }
  const expiresMs = ms + QUEUE_HOLD_MS;
  return {
    admittedAt,
    turnExpiresAt: new Date(expiresMs).toISOString(),
    expired: Date.now() > expiresMs,
  };
}

router.get("/business/:username/queue/token/:queueToken/status", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const queueToken = String(req.params.queueToken || "").trim();
    if (!username || !queueToken) {
      return res.status(400).json({ error: "username and queueToken are required" });
    }

    const business = await prisma.business.findUnique({
      where: { username },
      select: { id: true, name: true },
    });
    if (!business) return res.status(404).json({ error: "Business not found" });

    const entry = await prisma.queueEntry.findUnique({ where: { queueToken } });
    if (!entry || entry.businessId !== business.id) {
      return res.json({
        admitted: false,
        removed: false,
        message: "Queue session not found or expired",
      });
    }

    const location = await prisma.location.findUnique({
      where: { id: entry.locationId },
      select: { address: true },
    });
    const address = location?.address ?? "";

    if (entry.status === "WAITING") {
      const position = await prisma.queueEntry.count({
        where: {
          locationId: entry.locationId,
          status: "WAITING",
          joinedAt: { lte: entry.joinedAt },
        },
      });
      return res.json({
        admitted: false,
        removed: false,
        position,
        customer: queueEntryToLegacy(entry, { position, businessUsername: username }),
        address,
        businessName: business.name,
        message: "Customer is still waiting in queue",
      });
    }

    if (entry.status === "ARRIVED") {
      return res.json({
        admitted: false,
        removed: false,
        checkedIn: true,
        status: "arrived",
        customer: queueEntryToLegacy(entry, { businessUsername: username }),
        address,
        businessName: business.name,
        message: "Arrival confirmed",
      });
    }
    if (entry.status === "NO_SHOW") {
      return res.json({
        admitted: false,
        removed: true,
        status: "no_show",
        customer: queueEntryToLegacy(entry, { businessUsername: username }),
        address,
        businessName: business.name,
        message: "Marked as a no-show",
      });
    }
    if (entry.status === "ADMITTED") {
      const hold = admittedHoldInfo(entry.admittedAt ? entry.admittedAt.toISOString() : null);
      return res.json({
        admitted: true,
        removed: false,
        expired: hold.expired,
        admittedAt: hold.admittedAt,
        turnExpiresAt: hold.turnExpiresAt,
        customer: queueEntryToLegacy(entry, { businessUsername: username }),
        address,
        businessName: business.name,
        message: hold.expired ? "Hold window has expired" : "Customer has been admitted",
      });
    }

    return res.json({
      admitted: false,
      removed: true,
      status: entry.status === "LEFT" ? "left" : "removed",
      customer: queueEntryToLegacy(entry, { businessUsername: username }),
      address,
      businessName: business.name,
      message:
        entry.status === "LEFT"
          ? "Customer has left the queue"
          : "Customer has been removed from queue",
    });
  } catch (err: any) {
    console.error("[auth] check customer status by token error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get(
  "/business/:username/queue/token/:queueToken/eta",
  async (req, res) => {
    try {
      const username = String(req.params.username || "").trim();
      const queueToken = String(req.params.queueToken || "").trim();
      if (!username || !queueToken) {
        return res
          .status(400)
          .json({ error: "username and queueToken are required" });
      }

      const business = await prisma.business.findUnique({
        where: { username },
        select: { id: true },
      });
      if (!business) return res.status(404).json({ error: "Business not found" });

      const entry = await prisma.queueEntry.findUnique({
        where: { queueToken },
        select: { locationId: true, businessId: true, status: true },
      });
      if (entry && entry.businessId === business.id && entry.status === "WAITING") {
        const locationRow = await prisma.location.findUnique({
          where: { id: entry.locationId },
        });
        if (locationRow) {
          const location = await augmentLocationWithLiveLists(locationRow);
          const eta = etaForToken(location, queueToken);
          if (eta) return res.json({ eta });
        }
      }

      return res.status(404).json({ error: "Queue ticket not found or no longer waiting" });
    } catch (err: any) {
      console.error("[auth] queue eta error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.get(
  "/business/:username/locations/:locationId/queue-etas",
  requireBusiness,
  async (req, res) => {
    try {
      const businessId = (req as any).auth.sub as string;
      const locationId = String(req.params.locationId || "").trim();
      const locationRow = await prisma.location.findFirst({
        where: { id: locationId, businessId },
      });
      if (!locationRow) {
        return res
          .status(404)
          .json({ error: "Location not found or access denied" });
      }
      const location = await augmentLocationWithLiveLists(locationRow);
      return res.json({ etas: etaForAllQueueCustomers(location) });
    } catch (err: any) {
      console.error("[auth] queue-etas error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

router.get("/business/:username/queue/:customerId/status", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const customerId = String(req.params.customerId || "").trim();
    if (!username || !customerId) {
      return res.status(400).json({ error: "username and customerId are required" });
    }

    const business = await prisma.business.findUnique({
      where: { username },
      select: { id: true, name: true },
    });
    if (!business) return res.status(404).json({ error: "Business not found" });

    const matches = await prisma.queueEntry.findMany({
      where: { businessId: business.id, legacyKey: customerId },
    });
    const RANK: Record<string, number> = {
      WAITING: 0,
      ADMITTED: 1,
      ARRIVED: 2,
      NO_SHOW: 3,
      REMOVED: 4,
      LEFT: 5,
    };
    const entry = matches.sort((a, b) => RANK[a.status] - RANK[b.status])[0];
    if (!entry) {
      return res.json({ admitted: false, removed: false, message: "Customer not found" });
    }

    if (entry.status === "WAITING") {
      const position = await prisma.queueEntry.count({
        where: {
          locationId: entry.locationId,
          status: "WAITING",
          joinedAt: { lte: entry.joinedAt },
        },
      });
      return res.json({
        admitted: false,
        removed: false,
        position,
        message: "Customer is still waiting in queue",
      });
    }
    if (entry.status === "ARRIVED") {
      return res.json({
        admitted: false,
        removed: false,
        checkedIn: true,
        status: "arrived",
        customer: queueEntryToLegacy(entry),
        message: "Arrival confirmed",
      });
    }
    if (entry.status === "NO_SHOW") {
      return res.json({
        admitted: false,
        removed: true,
        status: "no_show",
        customer: queueEntryToLegacy(entry),
        message: "Marked as a no-show",
      });
    }
    if (entry.status === "ADMITTED") {
      const hold = admittedHoldInfo(entry.admittedAt ? entry.admittedAt.toISOString() : null);
      return res.json({
        admitted: true,
        removed: false,
        expired: hold.expired,
        admittedAt: hold.admittedAt,
        turnExpiresAt: hold.turnExpiresAt,
        customer: queueEntryToLegacy(entry),
        message: hold.expired ? "Hold window has expired" : "Customer has been admitted",
      });
    }

    return res.json({
      admitted: false,
      removed: true,
      status: entry.status === "LEFT" ? "left" : "removed",
      message:
        entry.status === "LEFT"
          ? "Customer has left the queue"
          : "Customer has been removed from queue",
    });
  } catch (err: any) {
    console.error("[auth] check customer status error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post(
  "/business/:username/queue/:customerId/admit",
  requireBusiness,
  async (req, res) => {
    try {
      const businessId = (req as any).auth.sub as string;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();
      if (!username || !customerId) {
        return res.status(400).json({ error: "username and customerId are required" });
      }

      const business = await getOwnedBusiness(businessId, username);
      if (!business) {
        return res.status(404).json({ error: "Business not found or access denied" });
      }

      const entry = await prisma.queueEntry.findFirst({
        where: { businessId: business.id, legacyKey: customerId, status: "WAITING" },
      });
      if (!entry) {
        return res.status(404).json({ error: "Customer not found in queue" });
      }

      const admittedAt = new Date();
      const result = await withWriteRetry(() =>
        prisma.queueEntry.updateMany({
          where: { id: entry.id, status: "WAITING" },
          data: { status: "ADMITTED", admittedAt, finalStatus: "pending" },
        }),
      );
      if (result.count === 0) {
        return res.status(409).json({ error: "Customer is no longer waiting" });
      }

      const location = await prisma.location.findUnique({
        where: { id: entry.locationId },
      });
      const businessName = business.name || "The business";
      const rpAdmit = (location?.restaurantProfile || {}) as any;
      const restaurantName =
        rpAdmit.displayName ||
        location?.displayName ||
        location?.name ||
        businessName;

      const admittedEntry = {
        ...entry,
        status: "ADMITTED" as const,
        admittedAt,
        finalStatus: "pending",
      };
      const customer = queueEntryToLegacy(admittedEntry, { businessUsername: username });

      await syncCustomerQueue(customer, {
        status: "admitted",
        businessUsername: username,
        businessName: business.name,
        locationName: location?.displayName || location?.name || business.name,
        locationId: entry.locationId,
      });

      if (
        entry.notificationMethod === "sms" ||
        entry.notificationMethod === "whatsapp" ||
        entry.notificationMethod === "email"
      ) {
        await enqueueNotification({
          type: "queue_admitted",
          channel: entry.notificationMethod,
          firstName: entry.firstName,
          countryCode: entry.countryCode || "+1",
          phoneNumber: entry.phone || "",
          email: entry.email || "",
          restaurantName,
        });
      }

      return res.json({
        success: true,
        customer,
        message: "Customer has been admitted",
      });
    } catch (err: any) {
      console.error("[auth] admit customer error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

router.post(
  "/business/:username/admitted/:customerId/confirm-arrival",
  requireBusiness,
  async (req, res) => {
    try {
      const businessId = (req as any).auth.sub as string;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();
      if (!username || !customerId) {
        return res.status(400).json({ error: "username and customerId are required" });
      }

      const business = await getOwnedBusiness(businessId, username);
      if (!business) {
        return res.status(404).json({ error: "Business not found or access denied" });
      }

      const entry = await prisma.queueEntry.findFirst({
        where: { businessId: business.id, legacyKey: customerId, status: "ADMITTED" },
      });
      if (!entry) {
        return res.status(404).json({ error: "Admitted customer not found" });
      }

      const arrivedAt = new Date();
      const result = await withWriteRetry(() =>
        prisma.queueEntry.updateMany({
          where: { id: entry.id, status: "ADMITTED" },
          data: { status: "ARRIVED", finalStatus: "arrived", arrivedAt },
        }),
      );
      if (result.count === 0) {
        return res.status(409).json({ error: "Customer is no longer admitted" });
      }

      const location = await prisma.location.findUnique({ where: { id: entry.locationId } });
      const arrivedEntry = {
        ...entry,
        status: "ARRIVED" as const,
        finalStatus: "arrived",
        arrivedAt,
      };
      await syncCustomerQueue(queueEntryToLegacy(arrivedEntry, { businessUsername: username }), {
        status: "arrived",
        businessUsername: username,
        businessName: business.name,
        locationName: location?.displayName || location?.name || business.name,
        locationId: entry.locationId,
      });
      await touchGuestByQueueEntryId(entry.id);
      return res.json({ success: true, message: "Customer arrival confirmed" });
    } catch (err: any) {
      console.error("[auth] confirm arrival error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

router.post(
  "/business/:username/admitted/:customerId/mark-no-show",
  requireBusiness,
  async (req, res) => {
    try {
      const businessId = (req as any).auth.sub as string;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();
      if (!username || !customerId) {
        return res.status(400).json({ error: "username and customerId are required" });
      }

      const business = await getOwnedBusiness(businessId, username);
      if (!business) {
        return res.status(404).json({ error: "Business not found or access denied" });
      }

      const entry = await prisma.queueEntry.findFirst({
        where: { businessId: business.id, legacyKey: customerId, status: "ADMITTED" },
      });
      if (!entry) {
        return res.status(404).json({ error: "Admitted customer not found" });
      }

      const noShowAt = new Date();
      const result = await withWriteRetry(() =>
        prisma.queueEntry.updateMany({
          where: { id: entry.id, status: "ADMITTED" },
          data: { status: "NO_SHOW", finalStatus: "no_show", noShowAt },
        }),
      );
      if (result.count === 0) {
        return res.status(409).json({ error: "Customer is no longer admitted" });
      }

      const location = await prisma.location.findUnique({ where: { id: entry.locationId } });
      const noShowEntry = {
        ...entry,
        status: "NO_SHOW" as const,
        finalStatus: "no_show",
        noShowAt,
      };
      await syncCustomerQueue(queueEntryToLegacy(noShowEntry, { businessUsername: username }), {
        status: "no_show",
        businessUsername: username,
        businessName: business.name,
        locationName: location?.displayName || location?.name || business.name,
        locationId: entry.locationId,
      });
      await touchGuestByQueueEntryId(entry.id);
      return res.json({ success: true, message: "Customer marked as no-show" });
    } catch (err: any) {
      console.error("[auth] mark no-show error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

router.delete(
  "/business/:username/queue/:customerId",
  requireBusiness,
  async (req, res) => {
    try {
      const businessId = (req as any).auth.sub as string;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();
      if (!username || !customerId) {
        return res.status(400).json({ error: "username and customerId are required" });
      }

      const business = await getOwnedBusiness(businessId, username);
      if (!business) {
        return res.status(404).json({ error: "Business not found or access denied" });
      }

      const entry = await prisma.queueEntry.findFirst({
        where: {
          businessId: business.id,
          legacyKey: customerId,
          status: { in: ["WAITING", "ADMITTED"] },
        },
      });
      if (!entry) {
        return res.status(404).json({ error: "Customer not found in queue" });
      }

      const removedAt = new Date();
      const result = await withWriteRetry(() =>
        prisma.queueEntry.updateMany({
          where: { id: entry.id, status: { in: ["WAITING", "ADMITTED"] } },
          data: { status: "REMOVED", removedAt },
        }),
      );
      if (result.count === 0) {
        return res.status(409).json({ error: "Customer is no longer in the queue" });
      }

      const location = await prisma.location.findUnique({ where: { id: entry.locationId } });
      const removedEntry = { ...entry, status: "REMOVED" as const, removedAt };
      const removedCustomer = queueEntryToLegacy(removedEntry, { businessUsername: username });

      await syncCustomerQueue(removedCustomer, {
        status: "removed",
        businessUsername: username,
        businessName: business.name,
        locationName: location?.displayName || location?.name || business.name,
        locationId: entry.locationId,
      });

      return res.json({
        success: true,
        customer: removedCustomer,
        message: "Customer has been removed from queue",
      });
    } catch (err: any) {
      console.error("[auth] remove customer error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

router.post("/business/:username/queue/:customerId/leave", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const customerId = String(req.params.customerId || "").trim();
    if (!username || !customerId) {
      return res.status(400).json({ error: "username and customerId are required" });
    }

    const business = await prisma.business.findUnique({
      where: { username },
      select: { id: true, name: true },
    });
    if (!business) return res.status(404).json({ error: "Business not found" });

    const entry = await prisma.queueEntry.findFirst({
      where: { businessId: business.id, legacyKey: customerId, status: "WAITING" },
    });
    if (entry) {
      const leftAt = new Date();
      const result = await withWriteRetry(() =>
        prisma.queueEntry.updateMany({
          where: { id: entry.id, status: "WAITING" },
          data: { status: "LEFT", leftAt },
        }),
      );
      if (result.count === 0) {
        return res.status(409).json({ error: "You are no longer waiting in the queue" });
      }

      const location = await prisma.location.findUnique({ where: { id: entry.locationId } });
      const leftEntry = { ...entry, status: "LEFT" as const, leftAt };
      const removedCustomer = queueEntryToLegacy(leftEntry, { businessUsername: username });

      await syncCustomerQueue(removedCustomer, {
        status: "left",
        businessUsername: username,
        businessName: business.name,
        locationName: location?.displayName || location?.name || business.name,
        locationId: entry.locationId,
      });

      return res.json({
        success: true,
        customer: removedCustomer,
        message: "You have left the queue",
      });
    }

    return res.status(404).json({ error: "Customer not found in queue" });
  } catch (err: any) {
    console.error("[auth] customer leave queue error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});


router.post("/test-email", requireAdmin, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }
    const testHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Test Email from SeatPing</h2>
        <p>This is a test email to verify SMTP configuration.</p>
        <p>Time: ${new Date().toISOString()}</p>
      </div>
    `;
    const emailSent = await sendEmail({ to: email, subject: "SeatPing Email Test", html: testHtml });
    if (emailSent) return res.json({ success: true, message: "Test email sent successfully" });
    return res.status(500).json({ error: "Failed to send test email" });
  } catch (err: any) {
    console.error("[auth] test email error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/telnyx/webhook", async (req, res) => {
  try {
    const event = req.body;
    console.log("[TELNYX-WEBHOOK] Received event:", {
      type: event.data?.event_type,
      messageId: event.data?.payload?.id,
      timestamp: new Date().toISOString(),
    });
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[TELNYX-WEBHOOK] Error processing webhook:", err?.message || err);
    return res.json({ received: true });
  }
});

export default router;

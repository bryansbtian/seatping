import Telnyx from "telnyx";
// server/routes/auth.ts
//
// Auth is split by account type:
//   - Customers live in the `users` collection (prisma.user). JWT accountType "customer".
//     Routes: /auth/signup, /auth/login, /auth/logout, /auth/me
//   - Businesses live in the `businesses` collection (prisma.business) and own
//     rows in the `locations` collection (prisma.location). JWT accountType "business".
//     Routes: /auth/business/signup, /auth/business/login, /auth/business/logout,
//             /auth/business/me (GET/PUT), /auth/business/locations,
//             and the /auth/business/:username/* queue API.
//
// A logged-in customer is never treated as a logged-in business and vice versa.
import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { signJwt, setAuthCookie, clearAuthCookie, clearAllAuthCookies, requireCustomer, requireBusiness, readSession, } from "../lib/auth.js";
import { CustomerSignUpSchema, BusinessSignUpSchema, LoginSchema, CustomerUpdateSchema, ChangePasswordSchema, } from "../lib/validation.js";
import { DEFAULT_BASE_CREDITS, enforceTrialExpiration, buildLocationData, checkAndRefillMonthlyCredits, } from "../lib/trial.js";
import { sendEmail, sendPasswordResetEmail, sendBusinessOnboardingEmail, sendCustomerWelcomeEmail, sendPasswordChangeConfirmationEmail, sendQueueJoinConfirmationEmail, sendQueueYourTurnEmail, } from "../lib/email.js";
import { sendQueueJoinedWhatsApp, sendQueueAdmittedWhatsApp, } from "../lib/whatsapp.js";
import { assembleBusinessMe } from "../lib/business.js";
import { deleteImageByPublicId } from "../lib/cloudinary.js";
import { normalizeSettings, syncCustomerReservation } from "../lib/reservations.js";
import { syncCustomerQueue } from "../lib/queueSync.js";
import { etaForToken, etaForAllQueueCustomers } from "../lib/queueEta.js";
import crypto from "crypto";
const router = Router();
// ===========================================================================
// Helpers
// ===========================================================================
/** Public customer-facing fields (no password). */
function serializeCustomer(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        phone: user.phone,
        createdAt: user.createdAt,
    };
}
/**
 * Load the business that the authenticated business session owns and verify it
 * matches the :username in the route. Returns null when not found / mismatched.
 */
async function getOwnedBusiness(businessId, username) {
    const business = await prisma.business.findFirst({
        where: { id: businessId, username },
        select: { id: true, name: true, username: true },
    });
    return business;
}
// ===========================================================================
// Session (public) — used by the customer-facing header to decide what to show
// ===========================================================================
/**
 * GET /auth/session
 * Returns the current account type without failing. Used by the header so a
 * business session does NOT make the customer homepage look logged in (the
 * header only treats accountType === "customer" as a logged-in customer).
 */
router.get("/session", (req, res) => {
    // Customer and business sessions live in separate cookies and can both be
    // active at once, so report each independently.
    const customer = readSession(req, "customer");
    const business = readSession(req, "business");
    return res.json({
        customer: customer ? { name: customer.name } : null,
        business: business ? { name: business.name } : null,
    });
});
// ===========================================================================
// CUSTOMER AUTH (users collection)
// ===========================================================================
/**
 * POST /auth/signup  (customer)
 * Body: { name, username, email, phone, password }
 */
router.post("/signup", async (req, res) => {
    try {
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
        // Fire-and-forget: a failed welcome email must never block signup.
        sendCustomerWelcomeEmail(user.email, user.name).catch((err) => console.error("[auth] customer welcome email error:", err));
        const token = signJwt({
            sub: user.id,
            accountType: "customer",
            name: user.name,
        });
        setAuthCookie(res, token, "customer");
        return res.status(201).json({ user });
    }
    catch (err) {
        console.error("[auth] customer signup error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/login  (customer)
 * Body: { emailOrUsername, password }
 */
router.post("/login", async (req, res) => {
    try {
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
        if (!user)
            return res.status(401).json({ error: "Invalid credentials" });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok)
            return res.status(401).json({ error: "Invalid credentials" });
        const token = signJwt({
            sub: user.id,
            accountType: "customer",
            name: user.name,
        });
        setAuthCookie(res, token, "customer");
        return res.json({ user: serializeCustomer(user) });
    }
    catch (err) {
        console.error("[auth] customer login error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/logout  (clears the session cookie for either account type)
 * Shared by both the customer and business headers, so it clears every session
 * cookie — it can't know which account type is logging out.
 */
router.post("/logout", (_req, res) => {
    clearAllAuthCookies(res);
    res.json({ ok: true });
});
/**
 * GET /auth/me  (customer, protected)
 */
router.get("/me", requireCustomer, async (req, res) => {
    try {
        const userId = req.auth.sub;
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
        if (!user)
            return res.status(404).json({ error: "Not found" });
        return res.json({ user });
    }
    catch (err) {
        console.error("[auth] customer me error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * PUT /auth/me  (customer, protected)
 * Update profile details: name, username, email, phone (phone may be cleared).
 * Re-issues the session token so the header name stays in sync after a rename.
 */
router.put("/me", requireCustomer, async (req, res) => {
    try {
        const userId = req.auth.sub;
        const parsed = CustomerUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            return res
                .status(400)
                .json({ error: "Invalid input", issues: parsed.error.flatten() });
        }
        const { name, username, email, phone } = parsed.data;
        // Username/email must stay unique (ignore the user's own row).
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
        return res.json({ user });
    }
    catch (err) {
        console.error("[auth] customer update error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/me/change-password  (customer, protected)
 * Body: { currentPassword, newPassword }. Verifies the current password first.
 */
router.post("/me/change-password", requireCustomer, async (req, res) => {
    try {
        const userId = req.auth.sub;
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
        if (!user)
            return res.status(404).json({ error: "Not found" });
        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) {
            return res.status(400).json({ error: "Current password is incorrect" });
        }
        const hash = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hash },
        });
        sendPasswordChangeConfirmationEmail(user.email, user.name).catch((e) => console.error("[auth] pw change email failed:", e));
        return res.json({ success: true, message: "Password updated" });
    }
    catch (err) {
        console.error("[auth] change password error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ===========================================================================
// CUSTOMER SAVED RESTAURANTS (bookmarks)
// Stored inline on the user doc as a JSON array, newest first, deduped by
// businessUsername. Mirrors the activity arrays so the profile can render
// cards without a join.
// ===========================================================================
// Fields returned for the customer "me" payload (shared by /me, PUT /me, and
// the saved-restaurants endpoints so the client always gets a consistent shape).
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
};
/**
 * POST /auth/me/saved-restaurants  (customer, protected)
 * Body: { businessUsername, businessName?, locationName?, area?, city? }
 * Adds a bookmark (no-op if already saved). Returns the updated customer.
 */
router.post("/me/saved-restaurants", requireCustomer, async (req, res) => {
    try {
        const userId = req.auth.sub;
        const { businessUsername, businessName, locationName, area, city } = req.body || {};
        if (!businessUsername ||
            typeof businessUsername !== "string" ||
            !businessUsername.trim()) {
            return res.status(400).json({ error: "businessUsername is required" });
        }
        const uname = businessUsername.trim();
        const current = await prisma.user.findUnique({
            where: { id: userId },
            select: { savedRestaurants: true },
        });
        if (!current)
            return res.status(404).json({ error: "Not found" });
        const list = Array.isArray(current.savedRestaurants)
            ? current.savedRestaurants
            : [];
        // Only add when not already bookmarked (dedup by businessUsername).
        if (!list.some((s) => s?.businessUsername === uname)) {
            const str = (v) => typeof v === "string" && v.trim() ? v.trim() : undefined;
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
        return res.json({ user });
    }
    catch (err) {
        console.error("[auth] save restaurant error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * DELETE /auth/me/saved-restaurants/:businessUsername  (customer, protected)
 * Removes a bookmark. Returns the updated customer.
 */
router.delete("/me/saved-restaurants/:businessUsername", requireCustomer, async (req, res) => {
    try {
        const userId = req.auth.sub;
        const uname = String(req.params.businessUsername || "").trim();
        if (!uname) {
            return res.status(400).json({ error: "businessUsername is required" });
        }
        const current = await prisma.user.findUnique({
            where: { id: userId },
            select: { savedRestaurants: true },
        });
        if (!current)
            return res.status(404).json({ error: "Not found" });
        const list = Array.isArray(current.savedRestaurants)
            ? current.savedRestaurants
            : [];
        const next = list.filter((s) => s?.businessUsername !== uname);
        const user = await prisma.user.update({
            where: { id: userId },
            data: { savedRestaurants: next },
            select: CUSTOMER_ME_SELECT,
        });
        return res.json({ user });
    }
    catch (err) {
        console.error("[auth] remove saved restaurant error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ---------------------------------------------------------------------------
// Saved restaurants are stored per LOCATION (not just per business) so a
// customer can save "Imperial Pacific Place" separately from "Imperial
// Senopati". Items are denormalized server-side from the location/business so a
// profile card renders without a join. Dedup key is `locationId`.
// ---------------------------------------------------------------------------
const SAVED_OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
/** Build a denormalized saved-location entry from a locationId, or null. */
async function buildSavedLocationEntry(locationId) {
    if (!SAVED_OBJECT_ID_RE.test(locationId))
        return null;
    const loc = await prisma.location.findUnique({
        where: { id: locationId },
        include: { photos: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!loc)
        return null;
    const biz = await prisma.business.findUnique({
        where: { id: loc.businessId },
        select: { name: true, username: true },
    });
    const rp = (loc.restaurantProfile || {});
    const agg = await prisma.review.aggregate({
        where: { locationId },
        _avg: { rating: true },
        _count: { _all: true },
    });
    const rating = agg._count._all > 0 && typeof agg._avg.rating === "number"
        ? Math.round(agg._avg.rating * 10) / 10
        : null;
    const cuisine = Array.isArray(rp.cuisineTypes) && rp.cuisineTypes.length
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
        imageUrl: loc.bannerImageUrl || loc.photos?.[0]?.url || null,
        savedAt: new Date().toISOString(),
    };
}
/** Match a saved entry to a locationId (new items) or legacy businessUsername id. */
function savedMatches(s, key) {
    return s?.locationId === key || s?.id === key;
}
/**
 * GET /auth/me/saved-locations/:locationId  (customer, protected)
 * Returns whether the current customer has saved this location.
 */
router.get("/me/saved-locations/:locationId", requireCustomer, async (req, res) => {
    try {
        const userId = req.auth.sub;
        const locationId = String(req.params.locationId || "").trim();
        const current = await prisma.user.findUnique({
            where: { id: userId },
            select: { savedRestaurants: true },
        });
        const list = Array.isArray(current?.savedRestaurants)
            ? current.savedRestaurants
            : [];
        return res.json({ saved: list.some((s) => savedMatches(s, locationId)) });
    }
    catch (err) {
        console.error("[auth] saved-location status error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/me/saved-locations  (customer, protected)
 * Body: { locationId }. Saves the exact location (dedup by locationId).
 */
router.post("/me/saved-locations", requireCustomer, async (req, res) => {
    try {
        const userId = req.auth.sub;
        const locationId = String(req.body?.locationId || "").trim();
        if (!SAVED_OBJECT_ID_RE.test(locationId)) {
            return res.status(400).json({ error: "A valid locationId is required" });
        }
        const current = await prisma.user.findUnique({
            where: { id: userId },
            select: { savedRestaurants: true },
        });
        if (!current)
            return res.status(404).json({ error: "Not found" });
        const list = Array.isArray(current.savedRestaurants)
            ? current.savedRestaurants
            : [];
        if (!list.some((s) => savedMatches(s, locationId))) {
            const entry = await buildSavedLocationEntry(locationId);
            if (!entry)
                return res.status(404).json({ error: "Location not found" });
            list.unshift(entry);
        }
        const user = await prisma.user.update({
            where: { id: userId },
            data: { savedRestaurants: list },
            select: CUSTOMER_ME_SELECT,
        });
        return res.json({ user });
    }
    catch (err) {
        console.error("[auth] save location error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * DELETE /auth/me/saved-locations/:locationId  (customer, protected)
 * Unsaves a location. Returns the updated customer.
 */
router.delete("/me/saved-locations/:locationId", requireCustomer, async (req, res) => {
    try {
        const userId = req.auth.sub;
        const locationId = String(req.params.locationId || "").trim();
        const current = await prisma.user.findUnique({
            where: { id: userId },
            select: { savedRestaurants: true },
        });
        if (!current)
            return res.status(404).json({ error: "Not found" });
        const list = Array.isArray(current.savedRestaurants)
            ? current.savedRestaurants
            : [];
        const next = list.filter((s) => !savedMatches(s, locationId));
        const user = await prisma.user.update({
            where: { id: userId },
            data: { savedRestaurants: next },
            select: CUSTOMER_ME_SELECT,
        });
        return res.json({ user });
    }
    catch (err) {
        console.error("[auth] remove saved location error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ===========================================================================
// CUSTOMER + BUSINESS PASSWORD RESET
// Looks up the email/token in both collections so either account type can reset.
// ===========================================================================
/**
 * POST /auth/forgot-password
 * Body: { email }
 */
router.post("/forgot-password", async (req, res) => {
    try {
        const { email, type } = req.body || {};
        if (!email || typeof email !== "string") {
            return res.status(400).json({ error: "email is required" });
        }
        const normalized = email.toLowerCase();
        // Reset within the account type the request came from (customer login vs
        // business login), so a shared email resets the correct account. Defaults
        // to customer for older clients that don't send a type.
        const accountType = type === "business" ? "business" : "customer";
        const business = accountType === "business"
            ? await prisma.business.findUnique({
                where: { email: normalized },
                select: { id: true, email: true },
            })
            : null;
        const user = accountType === "customer"
            ? await prisma.user.findUnique({
                where: { email: normalized },
                select: { id: true, email: true },
            })
            : null;
        // Always respond success to avoid leaking which emails exist.
        const genericOk = {
            success: true,
            message: "If an account with that email exists, a password reset link has been sent.",
        };
        if (!business && !user)
            return res.json(genericOk);
        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        if (business) {
            await prisma.business.update({
                where: { id: business.id },
                data: { resetToken, resetTokenExpiry },
            });
        }
        else if (user) {
            await prisma.user.update({
                where: { id: user.id },
                data: { resetToken, resetTokenExpiry },
            });
        }
        // Build the reset link from the request's origin so it points at wherever
        // the user actually is (localhost:8080 in dev, the live domain in prod),
        // validated against an allowlist to avoid host-header injection. Falls back
        // to FRONTEND_URL when the origin isn't recognized.
        const allowedOrigins = [
            process.env.FRONTEND_URL,
            process.env.APP_ORIGIN,
            process.env.CLIENT_ORIGIN,
            "http://localhost:8080",
            "http://localhost:5173",
        ].filter(Boolean);
        const reqOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
        const baseUrl = allowedOrigins.includes(reqOrigin) ? reqOrigin : undefined;
        const targetEmail = (business?.email || user?.email);
        const emailSent = await sendPasswordResetEmail(targetEmail, resetToken, business ? "business" : "customer", baseUrl);
        if (!emailSent)
            return res.status(500).json({ error: "Failed to send email" });
        return res.json(genericOk);
    }
    catch (err) {
        console.error("[auth] forgot password error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/reset-password
 * Body: { token, newPassword }
 */
router.post("/reset-password", async (req, res) => {
    try {
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
            sendPasswordChangeConfirmationEmail(business.email, business.name).catch((e) => console.error("[auth] pw change email failed:", e));
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
            sendPasswordChangeConfirmationEmail(user.email, user.name).catch((e) => console.error("[auth] pw change email failed:", e));
            return res.json({ success: true, message: "Password has been reset successfully" });
        }
        return res.status(400).json({ error: "Invalid or expired reset token" });
    }
    catch (err) {
        console.error("[auth] reset password error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ===========================================================================
// BUSINESS AUTH (businesses collection) — static paths first
// ===========================================================================
/**
 * GET /auth/exists?username=foo
 * Checks whether a BUSINESS username exists (used by the join-queue lookup).
 */
router.get("/exists", async (req, res) => {
    try {
        const username = String(req.query.username || "").trim();
        if (!username)
            return res.status(400).json({ error: "username is required" });
        const business = await prisma.business.findUnique({ where: { username } });
        return res.json({ exists: Boolean(business) });
    }
    catch (err) {
        console.error("[auth] exists error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/business/signup
 * Body: { name, username, email, phone, password }
 * Creates the business only — no location is created by default. The business
 * adds its first location later from Settings.
 */
router.post("/business/signup", async (req, res) => {
    try {
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
        // No plans — every new business starts on a 7-day trial with 300 base
        // credits and a single location. Activation (and any change to these) is
        // done manually by an admin.
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
        // No location is created at signup — the business adds its first location
        // later from Settings (POST /auth/business/locations).
        console.log("[auth] New business created:", {
            id: business.id,
            email: business.email,
            username: business.username,
        });
        // Fire-and-forget onboarding email; signup must not fail if it doesn't send.
        sendBusinessOnboardingEmail(business.email, business.name, business.username, business.trial ? business.trialDurationDays : undefined).catch((err) => console.error("[auth] business onboarding email error:", err));
        const token = signJwt({
            sub: business.id,
            accountType: "business",
            name: business.name,
        });
        setAuthCookie(res, token, "business");
        const me = await assembleBusinessMe(business.id);
        return res.status(201).json({ user: me });
    }
    catch (err) {
        console.error("[auth] business signup error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/business/login
 * Body: { emailOrUsername, password }
 */
router.post("/business/login", async (req, res) => {
    try {
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
        if (!business)
            return res.status(401).json({ error: "Invalid credentials" });
        const ok = await bcrypt.compare(password, business.password);
        if (!ok)
            return res.status(401).json({ error: "Invalid credentials" });
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
    }
    catch (err) {
        console.error("[auth] business login error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/business/logout
 */
router.post("/business/logout", (_req, res) => {
    clearAuthCookie(res, "business");
    res.json({ ok: true });
});
/**
 * GET /auth/business/me  (business, protected)
 * Returns business profile + assembled locations.
 */
router.get("/business/me", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        await enforceTrialExpiration(businessId);
        await checkAndRefillMonthlyCredits(businessId);
        const me = await assembleBusinessMe(businessId);
        if (!me)
            return res.status(404).json({ error: "Not found" });
        return res.json({ user: me });
    }
    catch (err) {
        console.error("[auth] business me error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * PUT /auth/business/me  (business, protected)
 * Body: { locations } - reconciles the locations list (used for removal).
 * Locations present (matched by address) are kept; any not present are deleted.
 */
router.put("/business/me", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        const { locations } = req.body || {};
        if (!Array.isArray(locations)) {
            return res.status(400).json({ error: "locations array is required" });
        }
        const keepAddresses = new Set(locations
            .map((l) => (typeof l?.address === "string" ? l.address : null))
            .filter(Boolean));
        const existing = await prisma.location.findMany({
            where: { businessId },
            select: { id: true, address: true, bannerImagePublicId: true },
        });
        const toDelete = existing.filter((l) => !keepAddresses.has(l.address));
        if (toDelete.length > 0) {
            const idsToDelete = toDelete.map((l) => l.id);
            // Best-effort cleanup of Cloudinary assets (banners + gallery photos) for
            // the locations being removed, so we don't leave orphaned remote files.
            const orphanPhotos = await prisma.photo.findMany({
                where: { locationId: { in: idsToDelete } },
                select: { publicId: true },
            });
            await Promise.all([
                ...toDelete.map((l) => deleteImageByPublicId(l.bannerImagePublicId)),
                ...orphanPhotos.map((p) => deleteImageByPublicId(p.publicId)),
            ]);
            // Remove gallery photos first (Cascade is emulated on MongoDB, but doing it
            // explicitly keeps the data consistent regardless of relation mode).
            await prisma.photo.deleteMany({
                where: { locationId: { in: idsToDelete } },
            });
            await prisma.location.deleteMany({
                where: { id: { in: idsToDelete } },
            });
        }
        const me = await assembleBusinessMe(businessId);
        return res.json({ user: me });
    }
    catch (err) {
        console.error("[auth] business update locations error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/business/locations  (business, protected)
 * Body: { displayName, address, area?, city?, country?, latitude?, longitude?,
 *         googlePlaceId?, googleMapsUrl? } — adds a new location, enforcing
 * maxLocations. `displayName` is the customer-facing label; Google Places
 * details are optional so manually-typed addresses still work.
 *
 * TODO(location): Use latitude and longitude for search distance, maps, and nearby restaurants.
 * TODO(location): Use googlePlaceId for future address validation and Google Maps deep links.
 */
router.post("/business/locations", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        const { displayName, address, area, city, country, latitude, longitude, googlePlaceId, googleMapsUrl, } = req.body || {};
        if (!address || typeof address !== "string" || !address.trim()) {
            return res.status(400).json({ error: "address is required" });
        }
        if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
            return res.status(400).json({ error: "displayName is required" });
        }
        const business = await prisma.business.findUnique({
            where: { id: businessId },
        });
        if (!business)
            return res.status(404).json({ error: "Not found" });
        const count = await prisma.location.count({ where: { businessId } });
        const maxLocations = business.maxLocations ?? 1;
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
    }
    catch (err) {
        console.error("[auth] add location error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * PUT /auth/business/locations/:locationId  (business, protected)
 * Update a location the business owns: its public restaurant profile JSON
 * (`restaurantProfile`), `address`, and the `queueEnabled` / `reservationsEnabled`
 * toggles. Used by the redesigned /business/settings profile editor.
 *
 * TODO(public-restaurant-page): Use location.restaurantProfile to power the
 * public restaurant detail page (/restaurant/:slug).
 */
router.put("/business/locations/:locationId", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        const locationId = String(req.params.locationId || "").trim();
        if (!locationId) {
            return res.status(400).json({ error: "locationId is required" });
        }
        // Ownership: the location must belong to the authenticated business.
        const owned = await prisma.location.findFirst({
            where: { id: locationId, businessId },
            select: { id: true },
        });
        if (!owned) {
            return res
                .status(404)
                .json({ error: "Location not found or access denied" });
        }
        const { restaurantProfile, address, queueEnabled, reservationsEnabled, reservationSettings, } = req.body || {};
        const data = {};
        if (restaurantProfile !== undefined) {
            if (typeof restaurantProfile !== "object" ||
                restaurantProfile === null ||
                Array.isArray(restaurantProfile)) {
                return res
                    .status(400)
                    .json({ error: "restaurantProfile must be an object" });
            }
            data.restaurantProfile = restaurantProfile;
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
            if (typeof reservationSettings !== "object" ||
                reservationSettings === null ||
                Array.isArray(reservationSettings)) {
                return res
                    .status(400)
                    .json({ error: "reservationSettings must be an object" });
            }
            // Normalize/validate so partial or malformed input can't corrupt the JSON.
            data.reservationSettings = normalizeSettings(reservationSettings);
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: "No editable fields provided" });
        }
        await prisma.location.update({ where: { id: locationId }, data });
        const me = await assembleBusinessMe(businessId);
        return res.json({ user: me });
    }
    catch (err) {
        console.error("[auth] update location profile error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * PATCH /auth/business/locations/:locationId/reservations/:reservationId
 *   (business, protected)
 * Change a reservation's status. Body: { status }. Allowed transitions map to
 * the dashboard actions: confirm, cancel, mark arrived/completed/no-show.
 */
router.patch("/business/locations/:locationId/reservations/:reservationId", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        const locationId = String(req.params.locationId || "").trim();
        const reservationId = String(req.params.reservationId || "").trim();
        const status = String(req.body?.status || "").trim();
        const ALLOWED = [
            "pending",
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
        const list = Array.isArray(location.reservations)
            ? location.reservations
            : [];
        const idx = list.findIndex((r) => r?.id === reservationId);
        if (idx === -1) {
            return res.status(404).json({ error: "Reservation not found" });
        }
        const now = new Date().toISOString();
        const timestampField = {
            cancelled: "cancelledAt",
            arrived: "arrivedAt",
            completed: "completedAt",
            no_show: "noShowAt",
        };
        const updated = {
            ...list[idx],
            status,
            updatedAt: now,
            ...(timestampField[status] ? { [timestampField[status]]: now } : {}),
        };
        const nextList = list.map((r, i) => (i === idx ? updated : r));
        await prisma.location.update({
            where: { id: location.id },
            data: { reservations: nextList },
        });
        // Keep the customer's profile copy in sync (no-op for guest bookings).
        const biz = await prisma.business.findUnique({
            where: { id: businessId },
            select: { name: true },
        });
        await syncCustomerReservation(updated, {
            businessName: biz?.name ?? null,
            locationName: location.displayName || location.name || biz?.name || null,
        });
        const me = await assembleBusinessMe(businessId);
        return res.json({ user: me });
    }
    catch (err) {
        console.error("[auth] reservation status error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ===========================================================================
// QUEUE API (business namespace, by :username) — Location collection
// ===========================================================================
/**
 * GET /auth/business/:username/addresses  (public)
 */
router.get("/business/:username/addresses", async (req, res) => {
    try {
        const username = String(req.params.username || "").trim();
        if (!username)
            return res.status(400).json({ error: "username is required" });
        const business = await prisma.business.findUnique({
            where: { username },
            select: { id: true, name: true },
        });
        if (!business)
            return res.status(404).json({ error: "Business not found" });
        const locations = await prisma.location.findMany({
            where: { businessId: business.id },
            select: {
                id: true,
                address: true,
                displayName: true,
                name: true,
                restaurantProfile: true,
                area: true,
                city: true,
                country: true,
                latitude: true,
                longitude: true,
                googleMapsUrl: true,
            },
        });
        // TODO(location): Use displayName as the customer-facing location label across reservations and queues.
        const addresses = locations.map((location) => {
            const rp = (location.restaurantProfile || {});
            return {
                id: location.id,
                address: location.address,
                // Customer-facing label, with safe fallbacks for legacy locations.
                displayName: location.displayName || location.name || null,
                // Public restaurant name (from the restaurant profile), falling back to
                // the location label for legacy locations without a profile.
                restaurantName: rp.displayName || location.displayName || location.name || null,
                area: location.area,
                city: location.city,
                country: location.country,
                latitude: location.latitude,
                longitude: location.longitude,
                googleMapsUrl: location.googleMapsUrl,
                businessName: business.name,
            };
        });
        return res.json({ addresses });
    }
    catch (err) {
        console.error("[auth] get business addresses error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/business/:username/queue  (public)
 * Adds a customer to a location's queue.
 */
router.post("/business/:username/queue", async (req, res) => {
    try {
        const username = String(req.params.username || "").trim();
        if (!username)
            return res.status(400).json({ error: "username is required" });
        const { locationId, address, firstName, lastName, numGuests, phoneNumber, countryCode, email, notificationMethod, smsConsent, smsMarketingConsent, } = req.body || {};
        // The location now comes from the QR code URL (locationId). `address` is kept
        // as a legacy fallback for the old business-wide /queue/:username link.
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
        }
        else if (notificationMethod === "email") {
            if (!email) {
                return res
                    .status(400)
                    .json({ error: "Email is required for email notifications" });
            }
        }
        else {
            return res.status(400).json({ error: "Invalid notification method" });
        }
        const business = await prisma.business.findUnique({
            where: { username },
            select: { id: true, name: true },
        });
        if (!business)
            return res.status(404).json({ error: "Business not found" });
        // Prefer the QR-scoped locationId; fall back to address for the legacy link.
        // Either way the location must belong to this business.
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
        const queue = Array.isArray(location.queue) ? location.queue : [];
        // Every notification channel consumes 1 credit at join time — SMS,
        // WhatsApp, and email alike.
        const consumesCredit = notificationMethod === "sms" ||
            notificationMethod === "whatsapp" ||
            notificationMethod === "email";
        const locationCredits = location.credits || 0;
        if (consumesCredit && locationCredits <= 0) {
            return res.status(400).json({
                error: "This location has no credits remaining for notifications. Please contact the business.",
            });
        }
        const queueToken = crypto.randomBytes(16).toString("hex");
        // Link the ticket to the logged-in customer (if any) so it shows up in their
        // profile's Queue Adventures. Guests join without an account (customerId null).
        const queueSession = readSession(req);
        const queueCustomerId = queueSession?.accountType === "customer" ? queueSession.sub : null;
        const customer = {
            firstName,
            lastName,
            // Combined name kept for code/UI that expects a single `name` field.
            name: `${firstName} ${lastName}`.trim(),
            numGuests: Number(numGuests),
            partySize: Number(numGuests),
            phoneNumber: phoneNumber || "",
            countryCode: countryCode || "+1",
            email: email || "",
            notificationMethod: notificationMethod || "",
            locationId: location.id,
            businessUsername: username,
            customerId: queueCustomerId,
            smsConsent: smsConsent || false,
            smsMarketingConsent: smsMarketingConsent || false,
            joinedAt: new Date().toISOString(),
            position: queue.length + 1,
            queueToken,
        };
        // Deduct exactly 1 credit at join time for the cost-bearing channels.
        await prisma.location.update({
            where: { id: location.id },
            data: {
                queue: [...queue, customer],
                ...(consumesCredit
                    ? { credits: Math.max(0, locationCredits - 1) }
                    : {}),
            },
        });
        await syncCustomerQueue(customer, {
            status: "waiting",
            businessUsername: username,
            businessName: business.name,
            locationName: location.displayName || location.name || business.name,
            locationId: location.id,
        });
        const businessName = business.name || "the business";
        // Customer-facing notifications use the restaurant's public name (from the
        // restaurant profile), not the parent business/account name.
        const rpJoin = (location.restaurantProfile || {});
        const restaurantName = rpJoin.displayName ||
            location.displayName ||
            location.name ||
            businessName;
        if (notificationMethod) {
            if (notificationMethod === "sms" && phoneNumber) {
                try {
                    const telnyxApiKey = process.env.TELNYX_API_KEY;
                    const telnyxPhoneNumber = process.env.TELNYX_PHONE_NUMBER;
                    if (telnyxApiKey && telnyxPhoneNumber) {
                        const telnyx = new Telnyx({ apiKey: telnyxApiKey });
                        const customerCountryCode = countryCode || "+1";
                        const phoneDigitsOnly = phoneNumber.trim().replace(/\D/g, "");
                        const formattedPhone = customerCountryCode + phoneDigitsOnly;
                        const message = await telnyx.messages.send({
                            from: telnyxPhoneNumber,
                            to: formattedPhone,
                            text: `Hi ${firstName}! You've joined the queue at ${restaurantName}. You're #${customer.position} in line. We'll text you when it's almost your turn. Reply STOP to opt out. - SeatPing`,
                        });
                        console.log("[QUEUE-JOIN] SMS confirmation sent:", message.data?.id, "to", formattedPhone);
                    }
                    else {
                        console.error("[QUEUE-JOIN] Missing Telnyx credentials - cannot send SMS confirmation");
                    }
                }
                catch (error) {
                    console.error("[QUEUE-JOIN] Failed to send SMS confirmation:", error?.message || error);
                }
            }
            if (notificationMethod === "whatsapp" && phoneNumber) {
                sendQueueJoinedWhatsApp({
                    countryCode: countryCode || "+1",
                    phoneNumber,
                    customerName: firstName,
                    businessName: restaurantName,
                    position: customer.position,
                }).catch((error) => console.error("[QUEUE-JOIN] Error sending WhatsApp confirmation:", error?.message || error));
            }
            if (notificationMethod === "email" && email) {
                try {
                    const emailSent = await sendQueueJoinConfirmationEmail(email, firstName, lastName, restaurantName, location.address, customer.position);
                    if (emailSent) {
                        console.log("[QUEUE-JOIN] Email confirmation sent to:", email);
                    }
                    else {
                        console.error("[QUEUE-JOIN] Failed to send email confirmation to:", email);
                    }
                }
                catch (error) {
                    console.error("[QUEUE-JOIN] Error sending email confirmation:", error?.message || error);
                }
            }
        }
        return res.json({
            success: true,
            customer,
            position: customer.position,
            businessName: business.name,
            queueToken,
        });
    }
    catch (err) {
        console.error("[auth] add to queue error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// How long an admitted customer's spot is held before it expires (5 minutes).
const QUEUE_HOLD_MS = 5 * 60 * 1000;
/**
 * Compute hold-window expiry info for an admitted customer from their
 * `admittedAt` timestamp. The 5-minute hold is anchored to admittedAt (stored in
 * the DB), so it survives refreshes and server restarts. Legacy admitted records
 * without an admittedAt can't be aged out, so they're treated as not expired.
 */
function admittedHoldInfo(admittedAt) {
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
/**
 * GET /auth/business/:username/queue/token/:queueToken/status  (public)
 */
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
        if (!business)
            return res.status(404).json({ error: "Business not found" });
        const locations = await prisma.location.findMany({
            where: { businessId: business.id },
        });
        for (const location of locations) {
            const queue = Array.isArray(location.queue) ? location.queue : [];
            const customerIndex = queue.findIndex((c) => c.queueToken === queueToken);
            if (customerIndex !== -1) {
                return res.json({
                    admitted: false,
                    removed: false,
                    position: customerIndex + 1,
                    customer: queue[customerIndex],
                    address: location.address,
                    businessName: business.name,
                    message: "Customer is still waiting in queue",
                });
            }
        }
        for (const location of locations) {
            const admittedCustomers = Array.isArray(location.admittedCustomers)
                ? location.admittedCustomers
                : [];
            const admittedCustomer = admittedCustomers.find((c) => c.queueToken === queueToken);
            if (admittedCustomer) {
                const hold = admittedHoldInfo(admittedCustomer.admittedAt);
                return res.json({
                    admitted: true,
                    removed: false,
                    expired: hold.expired,
                    admittedAt: hold.admittedAt,
                    turnExpiresAt: hold.turnExpiresAt,
                    customer: admittedCustomer,
                    address: location.address,
                    businessName: business.name,
                    message: hold.expired
                        ? "Hold window has expired"
                        : "Customer has been admitted",
                });
            }
            const removedCustomers = Array.isArray(location.removedCustomers)
                ? location.removedCustomers
                : [];
            const removedCustomer = removedCustomers.find((c) => c.queueToken === queueToken);
            if (removedCustomer) {
                return res.json({
                    admitted: false,
                    removed: true,
                    status: removedCustomer.status || "removed",
                    customer: removedCustomer,
                    address: location.address,
                    businessName: business.name,
                    message: removedCustomer.status === "left"
                        ? "Customer has left the queue"
                        : "Customer has been removed from queue",
                });
            }
        }
        return res.json({
            admitted: false,
            removed: false,
            message: "Queue session not found or expired",
        });
    }
    catch (err) {
        console.error("[auth] check customer status by token error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * GET /auth/business/:username/queue/token/:queueToken/eta  (public)
 * Smart estimated wait for a waiting customer. Customer-safe — returns only the
 * ETA/position/basis, no other customers' details. Location-isolated: only the
 * location that actually holds this token is used.
 */
router.get("/business/:username/queue/token/:queueToken/eta", async (req, res) => {
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
        if (!business)
            return res.status(404).json({ error: "Business not found" });
        const locations = await prisma.location.findMany({
            where: { businessId: business.id },
        });
        for (const location of locations) {
            const eta = etaForToken(location, queueToken);
            if (eta)
                return res.json({ eta });
        }
        // Not currently waiting (admitted/removed/expired) — no ETA to give.
        return res.status(404).json({ error: "Queue ticket not found or no longer waiting" });
    }
    catch (err) {
        console.error("[auth] queue eta error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * GET /auth/business/:username/locations/:locationId/queue-etas  (business)
 * Per-customer ETAs for the live waitlist of one owned location. Uses the same
 * helper as the customer endpoint so estimates stay consistent.
 */
router.get("/business/:username/locations/:locationId/queue-etas", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        const locationId = String(req.params.locationId || "").trim();
        const location = await prisma.location.findFirst({
            where: { id: locationId, businessId },
        });
        if (!location) {
            return res
                .status(404)
                .json({ error: "Location not found or access denied" });
        }
        return res.json({ etas: etaForAllQueueCustomers(location) });
    }
    catch (err) {
        console.error("[auth] queue-etas error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * GET /auth/business/:username/queue/:customerId/status  (public)
 */
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
        if (!business)
            return res.status(404).json({ error: "Business not found" });
        const locations = await prisma.location.findMany({
            where: { businessId: business.id },
        });
        const idOf = (c) => c.firstName + c.lastName + c.joinedAt;
        for (const location of locations) {
            const queue = Array.isArray(location.queue) ? location.queue : [];
            const idx = queue.findIndex((c) => idOf(c) === customerId);
            if (idx !== -1) {
                return res.json({
                    admitted: false,
                    removed: false,
                    position: idx + 1,
                    message: "Customer is still waiting in queue",
                });
            }
        }
        for (const location of locations) {
            const admittedCustomers = Array.isArray(location.admittedCustomers)
                ? location.admittedCustomers
                : [];
            const admittedById = admittedCustomers.find((c) => idOf(c) === customerId);
            if (admittedById) {
                const hold = admittedHoldInfo(admittedById.admittedAt);
                return res.json({
                    admitted: true,
                    removed: false,
                    expired: hold.expired,
                    admittedAt: hold.admittedAt,
                    turnExpiresAt: hold.turnExpiresAt,
                    customer: admittedById,
                    message: hold.expired
                        ? "Hold window has expired"
                        : "Customer has been admitted",
                });
            }
            const removedCustomers = Array.isArray(location.removedCustomers)
                ? location.removedCustomers
                : [];
            const removedCustomer = removedCustomers.find((c) => idOf(c) === customerId);
            if (removedCustomer) {
                return res.json({
                    admitted: false,
                    removed: true,
                    status: removedCustomer.status || "removed",
                    message: removedCustomer.status === "left"
                        ? "Customer has left the queue"
                        : "Customer has been removed from queue",
                });
            }
        }
        return res.json({ admitted: false, removed: false, message: "Customer not found" });
    }
    catch (err) {
        console.error("[auth] check customer status error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/business/:username/queue/:customerId/admit  (business, protected)
 */
router.post("/business/:username/queue/:customerId/admit", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        const username = String(req.params.username || "").trim();
        const customerId = String(req.params.customerId || "").trim();
        if (!username || !customerId) {
            return res.status(400).json({ error: "username and customerId are required" });
        }
        const business = await getOwnedBusiness(businessId, username);
        if (!business) {
            return res.status(404).json({ error: "Business not found or access denied" });
        }
        const locations = await prisma.location.findMany({ where: { businessId: business.id } });
        const idOf = (c) => c.firstName + c.lastName + c.joinedAt;
        let admittedCustomer = null;
        let targetLocation = null;
        for (const location of locations) {
            const queue = Array.isArray(location.queue) ? location.queue : [];
            const idx = queue.findIndex((c) => idOf(c) === customerId);
            if (idx === -1)
                continue;
            admittedCustomer = queue[idx];
            targetLocation = location;
            // Credits are charged at join time (per cost-bearing channel), not on admit.
            admittedCustomer.status = "admitted";
            admittedCustomer.admittedAt = new Date().toISOString();
            admittedCustomer.finalStatus = "pending";
            {
                const businessName = business.name || "The business";
                // Customer-facing notifications use the restaurant's public name.
                const rpAdmit = (location.restaurantProfile || {});
                const restaurantName = rpAdmit.displayName ||
                    location.displayName ||
                    location.name ||
                    businessName;
                if (admittedCustomer.notificationMethod === "sms" &&
                    admittedCustomer.phoneNumber &&
                    admittedCustomer.phoneNumber.trim() !== "") {
                    try {
                        const telnyxApiKey = process.env.TELNYX_API_KEY;
                        const telnyxPhoneNumber = process.env.TELNYX_PHONE_NUMBER;
                        if (!telnyxApiKey || !telnyxPhoneNumber) {
                            throw new Error("Telnyx credentials not configured");
                        }
                        const telnyx = new Telnyx({ apiKey: telnyxApiKey });
                        const customerCountryCode = admittedCustomer.countryCode || "+1";
                        const phoneDigitsOnly = admittedCustomer.phoneNumber.trim().replace(/\D/g, "");
                        const formattedPhone = customerCountryCode + phoneDigitsOnly;
                        const message = await telnyx.messages.send({
                            from: telnyxPhoneNumber,
                            to: formattedPhone,
                            text: `Good news! It's your turn at ${restaurantName}. Please proceed to the host within the next 5 minutes. Thank you for using SeatPing!`,
                        });
                        console.log("SMS notification sent:", message.data?.id, "to", formattedPhone);
                    }
                    catch (error) {
                        console.error("Failed to send SMS notification:", error?.message || error);
                    }
                }
                else if (admittedCustomer.notificationMethod === "whatsapp" &&
                    admittedCustomer.phoneNumber &&
                    admittedCustomer.phoneNumber.trim() !== "") {
                    try {
                        const sent = await sendQueueAdmittedWhatsApp({
                            countryCode: admittedCustomer.countryCode || "+1",
                            phoneNumber: admittedCustomer.phoneNumber,
                            businessName: restaurantName,
                        });
                        if (!sent) {
                            console.error("[ADMIT] WhatsApp queue_admitted send returned false for:", admittedCustomer.phoneNumber);
                        }
                    }
                    catch (error) {
                        console.error("[ADMIT] Failed to send WhatsApp notification:", error?.message || error);
                    }
                }
                else if (admittedCustomer.notificationMethod === "email" &&
                    admittedCustomer.email &&
                    admittedCustomer.email.trim() !== "") {
                    try {
                        const emailSent = await sendQueueYourTurnEmail(admittedCustomer.email, restaurantName);
                        if (emailSent) {
                            console.log("Email notification sent to:", admittedCustomer.email);
                        }
                        else {
                            console.error("Failed to send email notification to:", admittedCustomer.email);
                        }
                    }
                    catch (error) {
                        console.error("Failed to send email notification:", error?.message || error);
                    }
                }
                else {
                    console.log("No valid notification method or contact info - skipping notification");
                }
            }
            const admitted = Array.isArray(location.admittedCustomers)
                ? location.admittedCustomers
                : [];
            admitted.push(admittedCustomer);
            queue.splice(idx, 1);
            // No credit changes on admit — credits were charged at join time.
            await prisma.location.update({
                where: { id: location.id },
                data: {
                    queue: queue,
                    admittedCustomers: admitted,
                },
            });
            await syncCustomerQueue(admittedCustomer, {
                status: "admitted",
                businessUsername: username,
                businessName: business.name,
                locationName: location.displayName || location.name || business.name,
                locationId: location.id,
            });
            return res.json({
                success: true,
                customer: admittedCustomer,
                message: "Customer has been admitted",
            });
        }
        return res.status(404).json({ error: "Customer not found in queue" });
    }
    catch (err) {
        console.error("[auth] admit customer error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/business/:username/admitted/:customerId/confirm-arrival  (business, protected)
 */
router.post("/business/:username/admitted/:customerId/confirm-arrival", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        const username = String(req.params.username || "").trim();
        const customerId = String(req.params.customerId || "").trim();
        if (!username || !customerId) {
            return res.status(400).json({ error: "username and customerId are required" });
        }
        const business = await getOwnedBusiness(businessId, username);
        if (!business) {
            return res.status(404).json({ error: "Business not found or access denied" });
        }
        const locations = await prisma.location.findMany({ where: { businessId: business.id } });
        const idOf = (c) => c.firstName + c.lastName + c.joinedAt;
        for (const location of locations) {
            const admitted = Array.isArray(location.admittedCustomers)
                ? location.admittedCustomers
                : [];
            const idx = admitted.findIndex((c) => idOf(c) === customerId);
            if (idx === -1)
                continue;
            admitted[idx].finalStatus = "arrived";
            admitted[idx].confirmedAt = new Date().toISOString();
            await prisma.location.update({
                where: { id: location.id },
                data: { admittedCustomers: admitted },
            });
            await syncCustomerQueue(admitted[idx], {
                status: "arrived",
                businessUsername: username,
                businessName: business.name,
                locationName: location.displayName || location.name || business.name,
                locationId: location.id,
            });
            return res.json({ success: true, message: "Customer arrival confirmed" });
        }
        return res.status(404).json({ error: "Admitted customer not found" });
    }
    catch (err) {
        console.error("[auth] confirm arrival error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/business/:username/admitted/:customerId/mark-no-show  (business, protected)
 */
router.post("/business/:username/admitted/:customerId/mark-no-show", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        const username = String(req.params.username || "").trim();
        const customerId = String(req.params.customerId || "").trim();
        if (!username || !customerId) {
            return res.status(400).json({ error: "username and customerId are required" });
        }
        const business = await getOwnedBusiness(businessId, username);
        if (!business) {
            return res.status(404).json({ error: "Business not found or access denied" });
        }
        const locations = await prisma.location.findMany({ where: { businessId: business.id } });
        const idOf = (c) => c.firstName + c.lastName + c.joinedAt;
        for (const location of locations) {
            const admitted = Array.isArray(location.admittedCustomers)
                ? location.admittedCustomers
                : [];
            const idx = admitted.findIndex((c) => idOf(c) === customerId);
            if (idx === -1)
                continue;
            admitted[idx].finalStatus = "no_show";
            admitted[idx].noShowMarkedAt = new Date().toISOString();
            await prisma.location.update({
                where: { id: location.id },
                data: { admittedCustomers: admitted },
            });
            await syncCustomerQueue(admitted[idx], {
                status: "no_show",
                businessUsername: username,
                businessName: business.name,
                locationName: location.displayName || location.name || business.name,
                locationId: location.id,
            });
            return res.json({ success: true, message: "Customer marked as no-show" });
        }
        return res.status(404).json({ error: "Admitted customer not found" });
    }
    catch (err) {
        console.error("[auth] mark no-show error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * DELETE /auth/business/:username/queue/:customerId  (business, protected)
 */
router.delete("/business/:username/queue/:customerId", requireBusiness, async (req, res) => {
    try {
        const businessId = req.auth.sub;
        const username = String(req.params.username || "").trim();
        const customerId = String(req.params.customerId || "").trim();
        if (!username || !customerId) {
            return res.status(400).json({ error: "username and customerId are required" });
        }
        const business = await getOwnedBusiness(businessId, username);
        if (!business) {
            return res.status(404).json({ error: "Business not found or access denied" });
        }
        const locations = await prisma.location.findMany({ where: { businessId: business.id } });
        const idOf = (c) => c.firstName + c.lastName + c.joinedAt;
        for (const location of locations) {
            const queue = Array.isArray(location.queue) ? location.queue : [];
            const idx = queue.findIndex((c) => idOf(c) === customerId);
            if (idx === -1)
                continue;
            const removedCustomer = queue[idx];
            removedCustomer.status = "removed";
            removedCustomer.removedAt = new Date().toISOString();
            const removed = Array.isArray(location.removedCustomers)
                ? location.removedCustomers
                : [];
            removed.push(removedCustomer);
            queue.splice(idx, 1);
            await prisma.location.update({
                where: { id: location.id },
                data: { queue: queue, removedCustomers: removed },
            });
            await syncCustomerQueue(removedCustomer, {
                status: "removed",
                businessUsername: username,
                businessName: business.name,
                locationName: location.displayName || location.name || business.name,
                locationId: location.id,
            });
            return res.json({
                success: true,
                customer: removedCustomer,
                message: "Customer has been removed from queue",
            });
        }
        return res.status(404).json({ error: "Customer not found in queue" });
    }
    catch (err) {
        console.error("[auth] remove customer error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/business/:username/queue/:customerId/leave  (public)
 * Customer leaves the queue themselves.
 */
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
        if (!business)
            return res.status(404).json({ error: "Business not found" });
        const locations = await prisma.location.findMany({ where: { businessId: business.id } });
        const idOf = (c) => c.firstName + c.lastName + c.joinedAt;
        for (const location of locations) {
            const queue = Array.isArray(location.queue) ? location.queue : [];
            const idx = queue.findIndex((c) => idOf(c) === customerId);
            if (idx === -1)
                continue;
            const removedCustomer = queue[idx];
            removedCustomer.status = "left";
            removedCustomer.leftAt = new Date().toISOString();
            const removed = Array.isArray(location.removedCustomers)
                ? location.removedCustomers
                : [];
            removed.push(removedCustomer);
            queue.splice(idx, 1);
            await prisma.location.update({
                where: { id: location.id },
                data: { queue: queue, removedCustomers: removed },
            });
            await syncCustomerQueue(removedCustomer, {
                status: "left",
                businessUsername: username,
                businessName: business.name,
                locationName: location.displayName || location.name || business.name,
                locationId: location.id,
            });
            return res.json({
                success: true,
                customer: removedCustomer,
                message: "You have left the queue",
            });
        }
        return res.status(404).json({ error: "Customer not found in queue" });
    }
    catch (err) {
        console.error("[auth] customer leave queue error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ===========================================================================
// Misc (unchanged behavior)
// ===========================================================================
/**
 * POST /auth/test-email (debugging)
 */
router.post("/test-email", async (req, res) => {
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
        if (emailSent)
            return res.json({ success: true, message: "Test email sent successfully" });
        return res.status(500).json({ error: "Failed to send test email" });
    }
    catch (err) {
        console.error("[auth] test email error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
/**
 * POST /auth/telnyx/webhook
 */
router.post("/telnyx/webhook", async (req, res) => {
    try {
        const event = req.body;
        console.log("[TELNYX-WEBHOOK] Received event:", {
            type: event.data?.event_type,
            messageId: event.data?.payload?.id,
            timestamp: new Date().toISOString(),
        });
        return res.json({ received: true });
    }
    catch (err) {
        console.error("[TELNYX-WEBHOOK] Error processing webhook:", err?.message || err);
        return res.json({ received: true });
    }
});
export default router;

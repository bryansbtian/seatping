import express from "express";
import { prisma } from "../lib/prisma.js";
import { computeNextRefillDate } from "../lib/trial.js";
import { requireAdmin } from "../lib/auth.js";
const router = express.Router();
// Every admin route requires a valid admin session (httpOnly admin JWT cookie),
// issued by POST /auth/admin/login. This router was previously unauthenticated;
// the gate below closes that hole. Login itself lives on the auth router, so it
// is unaffected.
router.use(requireAdmin);
// Admin manages BUSINESS accounts (businesses collection) and their locations
// (locations collection). The "customer" wording in these routes refers to a
// business account, preserved for backwards compatibility with the admin UI.
// Update business credits
router.post("/update-credits", async (req, res) => {
    try {
        const { username, baseCredits } = req.body;
        if (!username || baseCredits === undefined) {
            return res.status(400).send("Missing required fields");
        }
        if (typeof baseCredits !== "number") {
            return res.status(400).send("Credits must be a number");
        }
        if (baseCredits < 0) {
            return res.status(400).send("Credits cannot be negative");
        }
        const business = await prisma.business.findUnique({ where: { username } });
        if (!business) {
            return res.status(404).send("Business not found");
        }
        const updated = await prisma.business.update({
            where: { username },
            data: { baseCredits, updatedAt: new Date() },
        });
        res.json({
            message: "Credits updated successfully",
            user: {
                username: updated.username,
                baseCredits: updated.baseCredits,
            },
        });
    }
    catch (error) {
        console.error("Error updating credits:", error);
        res.status(500).send("Internal server error");
    }
});
// Map Location rows to the admin UI's lightweight shape.
async function loadLocationsForBusiness(businessId) {
    const rows = await prisma.location.findMany({
        where: { businessId },
        orderBy: { createdAt: "asc" },
    });
    return rows.map((loc) => ({
        address: loc.address ?? "",
        displayName: loc.displayName ?? null,
        credits: typeof loc.credits === "number" ? loc.credits : 0,
    }));
}
// Lookup a business account by username
router.get("/customer/:username", async (req, res) => {
    try {
        const { username } = req.params;
        if (!username || !username.trim()) {
            return res.status(400).json({ error: "Username is required" });
        }
        const business = await prisma.business.findUnique({
            where: { username: username.trim() },
            select: {
                id: true,
                name: true,
                username: true,
                email: true,
                phone: true,
                trial: true,
                trialDurationDays: true,
                maxLocations: true,
                baseCredits: true,
                creditsStartedAt: true,
            },
        });
        if (!business) {
            return res.status(404).json({ error: "No customer found with this username." });
        }
        const locations = await loadLocationsForBusiness(business.id);
        res.json({
            customer: {
                name: business.name,
                username: business.username,
                email: business.email,
                phone: business.phone,
                trial: business.trial,
                trialDurationDays: business.trialDurationDays,
                maxLocations: business.maxLocations,
                baseCredits: business.baseCredits,
                creditsStartedAt: business.creditsStartedAt,
                locations,
            },
        });
    }
    catch (error) {
        console.error("Error fetching customer:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// Update a business account
router.patch("/customer/:username", async (req, res) => {
    try {
        const { username } = req.params;
        const { name, username: newUsername, email, phone, trial, trialDurationDays, maxLocations, baseCredits, locations, } = req.body ?? {};
        if (!username || !username.trim()) {
            return res.status(400).json({ error: "Username is required" });
        }
        const existing = await prisma.business.findUnique({
            where: { username: username.trim() },
        });
        if (!existing) {
            return res.status(404).json({ error: "No customer found with this username." });
        }
        const data = {};
        const stringFields = [
            ["name", name],
            ["phone", phone],
        ];
        for (const [key, value] of stringFields) {
            if (value === undefined)
                continue;
            if (typeof value !== "string" || !value.trim()) {
                return res.status(400).json({ error: `${key} must be a non-empty string` });
            }
            data[key] = value.trim();
        }
        if (email !== undefined) {
            if (typeof email !== "string" || !email.trim()) {
                return res.status(400).json({ error: "email must be a non-empty string" });
            }
            const trimmedEmail = email.trim();
            if (trimmedEmail !== existing.email) {
                const dup = await prisma.business.findUnique({ where: { email: trimmedEmail } });
                if (dup) {
                    return res.status(409).json({ error: "Email is already in use by another account" });
                }
            }
            data.email = trimmedEmail;
        }
        if (newUsername !== undefined) {
            if (typeof newUsername !== "string" || !newUsername.trim()) {
                return res.status(400).json({ error: "username must be a non-empty string" });
            }
            const trimmedUsername = newUsername.trim();
            if (trimmedUsername !== existing.username) {
                const dup = await prisma.business.findUnique({ where: { username: trimmedUsername } });
                if (dup) {
                    return res.status(409).json({ error: "Username is already taken" });
                }
                data.username = trimmedUsername;
            }
        }
        const numericFields = [
            ["trialDurationDays", trialDurationDays],
            ["maxLocations", maxLocations],
            ["baseCredits", baseCredits],
        ];
        for (const [key, value] of numericFields) {
            if (value === undefined)
                continue;
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
                return res.status(400).json({ error: `${key} must be a non-negative number` });
            }
            data[key] = Math.floor(value);
        }
        if (trial !== undefined) {
            if (typeof trial !== "boolean") {
                return res.status(400).json({ error: "trial must be a boolean" });
            }
            data.trial = trial;
        }
        // Locations live in their own collection now. If provided, patch each row
        // (matched by position) the same way the embedded-array version did.
        let locationRows = await prisma.location.findMany({
            where: { businessId: existing.id },
            orderBy: { createdAt: "asc" },
        });
        if (locations !== undefined) {
            if (!Array.isArray(locations)) {
                return res.status(400).json({ error: "locations must be an array" });
            }
            if (locations.length !== locationRows.length) {
                return res.status(400).json({
                    error: "locations length does not match existing locations",
                });
            }
            for (let idx = 0; idx < locationRows.length; idx++) {
                const patch = locations[idx] ?? {};
                const credits = patch.credits;
                const addr = patch.address;
                if (credits !== undefined && (typeof credits !== "number" || credits < 0)) {
                    return res.status(400).json({ error: `locations[${idx}].credits must be a non-negative number` });
                }
                if (addr !== undefined && (typeof addr !== "string" || !addr.trim())) {
                    return res.status(400).json({ error: `locations[${idx}].address must be a non-empty string` });
                }
                await prisma.location.update({
                    where: { id: locationRows[idx].id },
                    data: {
                        ...(addr !== undefined ? { address: addr.trim() } : {}),
                        ...(credits !== undefined ? { credits: Math.floor(credits) } : {}),
                    },
                });
            }
        }
        // Refill markers follow the trial flag (no plans, no manual date entry):
        //  - trial true -> false  = activation. Stamp creditsStartedAt = now and
        //    schedule the next refill one month out.
        //  - -> trial true         = back to trial; clear all refill markers.
        //  - already active, no trial change = leave the anchor untouched (so a
        //    plain baseCredits edit doesn't reset the cycle).
        if (Object.prototype.hasOwnProperty.call(data, "trial")) {
            const finalTrial = data.trial;
            const wasActivated = existing.trial === false;
            if (finalTrial === false && !wasActivated) {
                const now = new Date();
                data.creditsStartedAt = now;
                data.lastCreditRefillAt = now;
                data.nextCreditRefillAt = computeNextRefillDate(now, now);
            }
            else if (finalTrial === true) {
                data.creditsStartedAt = null;
                data.lastCreditRefillAt = null;
                data.nextCreditRefillAt = null;
            }
        }
        if (Object.keys(data).length === 0 && locations === undefined) {
            return res.status(400).json({ error: "No editable fields provided" });
        }
        const updated = Object.keys(data).length > 0
            ? await prisma.business.update({
                where: { username: username.trim() },
                data,
                select: {
                    id: true,
                    name: true,
                    username: true,
                    email: true,
                    phone: true,
                    trial: true,
                    trialDurationDays: true,
                    maxLocations: true,
                    baseCredits: true,
                    creditsStartedAt: true,
                    updatedAt: true,
                },
            })
            : existing;
        const sanitizedLocations = await loadLocationsForBusiness(existing.id);
        res.json({
            customer: {
                name: updated.name,
                username: updated.username,
                email: updated.email,
                phone: updated.phone,
                trial: updated.trial,
                trialDurationDays: updated.trialDurationDays,
                maxLocations: updated.maxLocations,
                baseCredits: updated.baseCredits,
                creditsStartedAt: updated.creditsStartedAt,
                locations: sanitizedLocations,
            },
            updatedAt: updated.updatedAt,
        });
    }
    catch (error) {
        console.error("Error updating customer:", error);
        res.status(500).json({ error: error?.message || "Internal server error" });
    }
});
// ===========================================================================
// Featured Restaurants (admin-curated homepage placements)
//
// NOTE: like the other /admin routes above, these are gated by the admin
// dashboard's client-side login. There is no server-side admin session yet —
// see the Admin page (hardcoded credentials). Harden together when an admin
// auth scheme is introduced.
// ===========================================================================
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
/** Lightweight location shape for the featured admin UI. */
function pickLocation(loc) {
    return {
        id: loc.id,
        displayName: loc.displayName ?? null,
        name: loc.name ?? null,
        address: loc.address ?? "",
        area: loc.area ?? null,
        city: loc.city ?? null,
    };
}
/** Featured row + joined business/location details for the admin list. */
function serializeFeatured(f) {
    return {
        id: f.id,
        businessId: f.businessId,
        locationId: f.locationId,
        isActive: f.isActive ?? true,
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : 0,
        createdAt: f.createdAt,
        business: f.business
            ? {
                id: f.business.id,
                username: f.business.username,
                name: f.business.name ?? null,
                email: f.business.email ?? null,
            }
            : null,
        location: f.location ? pickLocation(f.location) : null,
    };
}
/**
 * GET /admin/businesses/search?username=...
 * Search businesses by (partial, case-insensitive) username.
 */
router.get("/businesses/search", async (req, res) => {
    try {
        const username = String(req.query.username || "").trim();
        if (!username) {
            return res.status(400).json({ error: "username query is required" });
        }
        const businesses = await prisma.business.findMany({
            where: { username: { contains: username, mode: "insensitive" } },
            select: { id: true, username: true, name: true, email: true },
            orderBy: { username: "asc" },
            take: 10,
        });
        return res.json({ businesses });
    }
    catch (error) {
        console.error("[admin] business search error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET /admin/businesses/:businessId/locations
 * Locations owned by a business (for the featured-restaurant location picker).
 */
router.get("/businesses/:businessId/locations", async (req, res) => {
    try {
        const businessId = String(req.params.businessId || "").trim();
        if (!OBJECT_ID_RE.test(businessId)) {
            return res.status(404).json({ error: "Business not found" });
        }
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: { id: true },
        });
        if (!business)
            return res.status(404).json({ error: "Business not found" });
        const locations = await prisma.location.findMany({
            where: { businessId },
            orderBy: { createdAt: "asc" },
        });
        return res.json({ locations: locations.map(pickLocation) });
    }
    catch (error) {
        console.error("[admin] business locations error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET /admin/featured-restaurants
 * All featured restaurants with business + location details, sorted by
 * sortOrder asc then createdAt desc.
 */
router.get("/featured-restaurants", async (_req, res) => {
    try {
        const rows = await prisma.featuredRestaurant.findMany({
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
            include: { business: true, location: true },
        });
        return res.json({ featured: rows.map(serializeFeatured) });
    }
    catch (error) {
        console.error("[admin] list featured error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * POST /admin/featured-restaurants
 * Body: { businessId, locationId, sortOrder?, isActive? }. Validates the
 * business + location exist, the location belongs to the business, and there is
 * no existing feature for that location (one feature per location).
 */
router.post("/featured-restaurants", async (req, res) => {
    try {
        const { businessId, locationId, sortOrder, isActive } = req.body || {};
        if (!OBJECT_ID_RE.test(String(businessId || ""))) {
            return res.status(400).json({ error: "A valid businessId is required" });
        }
        if (!OBJECT_ID_RE.test(String(locationId || ""))) {
            return res.status(400).json({ error: "A valid locationId is required" });
        }
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: { id: true },
        });
        if (!business)
            return res.status(404).json({ error: "Business not found" });
        const location = await prisma.location.findUnique({
            where: { id: locationId },
            select: { id: true, businessId: true },
        });
        if (!location)
            return res.status(404).json({ error: "Location not found" });
        if (location.businessId !== businessId) {
            return res
                .status(400)
                .json({ error: "That location does not belong to the selected business" });
        }
        const existing = await prisma.featuredRestaurant.findUnique({
            where: { locationId },
            select: { id: true },
        });
        if (existing) {
            return res
                .status(409)
                .json({ error: "This location is already a featured restaurant" });
        }
        let order = 0;
        if (sortOrder !== undefined) {
            if (typeof sortOrder !== "number" || !Number.isFinite(sortOrder)) {
                return res.status(400).json({ error: "sortOrder must be a number" });
            }
            order = Math.floor(sortOrder);
        }
        let active = true;
        if (isActive !== undefined) {
            if (typeof isActive !== "boolean") {
                return res.status(400).json({ error: "isActive must be a boolean" });
            }
            active = isActive;
        }
        const created = await prisma.featuredRestaurant.create({
            data: { businessId, locationId, sortOrder: order, isActive: active },
            include: { business: true, location: true },
        });
        return res.json({ featured: serializeFeatured(created) });
    }
    catch (error) {
        console.error("[admin] create featured error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * PATCH /admin/featured-restaurants/:id
 * Body may include { sortOrder, isActive }.
 */
router.patch("/featured-restaurants/:id", async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!OBJECT_ID_RE.test(id)) {
            return res.status(404).json({ error: "Featured restaurant not found" });
        }
        const { sortOrder, isActive } = req.body || {};
        const data = {};
        if (sortOrder !== undefined) {
            if (typeof sortOrder !== "number" || !Number.isFinite(sortOrder)) {
                return res.status(400).json({ error: "sortOrder must be a number" });
            }
            data.sortOrder = Math.floor(sortOrder);
        }
        if (isActive !== undefined) {
            if (typeof isActive !== "boolean") {
                return res.status(400).json({ error: "isActive must be a boolean" });
            }
            data.isActive = isActive;
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: "No editable fields provided" });
        }
        const existing = await prisma.featuredRestaurant.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) {
            return res.status(404).json({ error: "Featured restaurant not found" });
        }
        const updated = await prisma.featuredRestaurant.update({
            where: { id },
            data,
            include: { business: true, location: true },
        });
        return res.json({ featured: serializeFeatured(updated) });
    }
    catch (error) {
        console.error("[admin] update featured error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * DELETE /admin/featured-restaurants/:id
 */
router.delete("/featured-restaurants/:id", async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (!OBJECT_ID_RE.test(id)) {
            return res.status(404).json({ error: "Featured restaurant not found" });
        }
        const existing = await prisma.featuredRestaurant.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) {
            return res.status(404).json({ error: "Featured restaurant not found" });
        }
        await prisma.featuredRestaurant.delete({ where: { id } });
        return res.json({ ok: true });
    }
    catch (error) {
        console.error("[admin] delete featured error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// ===========================================================================
// Campaign Templates review (Phase 3B)
//
// Admin reviews business-submitted CUSTOM campaign templates and prepares them
// for Email/SMS/WhatsApp (incl. the manual Meta template creation flow). These
// routes are the ONLY place a template can move to APPROVED/REJECTED — the
// business API never accepts an approval-state change. Admin-only Meta fields
// are returned here but never by the business serializers.
// ===========================================================================
const CT_STATUSES = ["DRAFT", "PENDING_SEATPING_REVIEW", "APPROVED", "REJECTED"];
function adminIdentity(req) {
    const auth = req.auth || {};
    return String(auth.name || auth.username || auth.sub || "admin");
}
/** Full template row for the admin console (includes internal Meta fields). */
function serializeAdminTemplate(t) {
    return {
        id: t.id,
        templateType: t.templateType,
        businessId: t.businessId,
        businessUsername: t.businessUsername,
        locationId: t.locationId,
        name: t.name,
        slug: t.slug,
        purpose: t.purpose,
        body: t.body,
        offerDetails: t.offerDetails,
        ctaText: t.ctaText,
        ctaUrl: t.ctaUrl,
        variables: t.variables,
        exampleValues: t.exampleValues ?? {},
        approvalStatus: t.approvalStatus,
        rejectionReason: t.rejectionReason,
        internalReviewNotes: t.internalReviewNotes,
        whatsappMetaStatus: t.whatsappMetaStatus,
        whatsappProviderTemplateName: t.whatsappProviderTemplateName,
        whatsappProviderTemplateId: t.whatsappProviderTemplateId,
        whatsappMetaCategory: t.whatsappMetaCategory,
        whatsappLanguage: t.whatsappLanguage,
        whatsappSubmittedAt: t.whatsappSubmittedAt,
        whatsappApprovedAt: t.whatsappApprovedAt,
        whatsappRejectedAt: t.whatsappRejectedAt,
        approvedBy: t.approvedBy,
        rejectedBy: t.rejectedBy,
        submittedAt: t.submittedAt,
        approvedAt: t.approvedAt,
        rejectedAt: t.rejectedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        business: t.business
            ? { id: t.business.id, name: t.business.name, username: t.business.username, email: t.business.email }
            : null,
    };
}
/** GET /admin/campaign-templates?status=&search= — custom template submissions. */
router.get("/campaign-templates", async (req, res) => {
    try {
        const where = { templateType: "CUSTOM" };
        const status = String(req.query.status || "").toUpperCase();
        if (status && CT_STATUSES.includes(status)) {
            where.approvalStatus = status;
        }
        const search = String(req.query.search || "").trim();
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { businessUsername: { contains: search, mode: "insensitive" } },
                { body: { contains: search, mode: "insensitive" } },
                { purpose: { contains: search, mode: "insensitive" } },
            ];
        }
        const templates = await prisma.campaignTemplate.findMany({
            where,
            orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
            take: 200,
        });
        // Join business display info (name searched separately since it lives on a
        // different collection in MongoDB).
        const businessIds = Array.from(new Set(templates.map((t) => t.businessId).filter(Boolean)));
        const businesses = businessIds.length
            ? await prisma.business.findMany({
                where: { id: { in: businessIds } },
                select: { id: true, name: true, username: true, email: true },
            })
            : [];
        const bMap = new Map(businesses.map((b) => [b.id, b]));
        // Status counts for the filter chips.
        const grouped = await prisma.campaignTemplate.groupBy({
            by: ["approvalStatus"],
            where: { templateType: "CUSTOM" },
            _count: { _all: true },
        });
        const counts = {};
        for (const g of grouped)
            counts[g.approvalStatus] = g._count._all;
        return res.json({
            templates: templates.map((t) => serializeAdminTemplate({ ...t, business: t.businessId ? bMap.get(t.businessId) : null })),
            counts,
        });
    }
    catch (error) {
        console.error("[admin] list campaign templates error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/** GET /admin/campaign-templates/:id — full review detail. */
router.get("/campaign-templates/:id", async (req, res) => {
    try {
        const id = String(req.params.id || "");
        if (!OBJECT_ID_RE.test(id))
            return res.status(404).json({ error: "Template not found" });
        const t = await prisma.campaignTemplate.findUnique({ where: { id } });
        if (!t)
            return res.status(404).json({ error: "Template not found" });
        const business = t.businessId
            ? await prisma.business.findUnique({
                where: { id: t.businessId },
                select: { id: true, name: true, username: true, email: true },
            })
            : null;
        let location = null;
        if (t.locationId) {
            const loc = await prisma.location.findUnique({ where: { id: t.locationId } });
            if (loc)
                location = pickLocation(loc);
        }
        return res.json({ template: serializeAdminTemplate({ ...t, business }), location });
    }
    catch (error) {
        console.error("[admin] get campaign template error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/** PATCH /admin/campaign-templates/:id/review — update internal notes + Meta fields. */
router.patch("/campaign-templates/:id/review", async (req, res) => {
    try {
        const id = String(req.params.id || "");
        if (!OBJECT_ID_RE.test(id))
            return res.status(404).json({ error: "Template not found" });
        const t = await prisma.campaignTemplate.findUnique({ where: { id } });
        if (!t)
            return res.status(404).json({ error: "Template not found" });
        const data = {};
        const stringFields = [
            "internalReviewNotes",
            "whatsappMetaStatus",
            "whatsappProviderTemplateName",
            "whatsappProviderTemplateId",
            "whatsappMetaCategory",
            "whatsappLanguage",
        ];
        for (const f of stringFields) {
            if (req.body?.[f] !== undefined) {
                data[f] = req.body[f] === null ? null : String(req.body[f]).slice(0, 2000);
            }
        }
        const dateFields = ["whatsappSubmittedAt", "whatsappApprovedAt", "whatsappRejectedAt"];
        for (const f of dateFields) {
            if (req.body?.[f] !== undefined) {
                data[f] = req.body[f] ? new Date(req.body[f]) : null;
            }
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: "No reviewable fields provided" });
        }
        const updated = await prisma.campaignTemplate.update({ where: { id }, data });
        return res.json({ template: serializeAdminTemplate(updated) });
    }
    catch (error) {
        console.error("[admin] review campaign template error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/** POST /admin/campaign-templates/:id/approve — approve for all three channels. */
router.post("/campaign-templates/:id/approve", async (req, res) => {
    try {
        const id = String(req.params.id || "");
        if (!OBJECT_ID_RE.test(id))
            return res.status(404).json({ error: "Template not found" });
        const t = await prisma.campaignTemplate.findUnique({ where: { id } });
        if (!t)
            return res.status(404).json({ error: "Template not found" });
        if (t.templateType !== "CUSTOM") {
            return res.status(400).json({ error: "Only custom templates require approval" });
        }
        const now = new Date();
        const updated = await prisma.campaignTemplate.update({
            where: { id },
            data: {
                approvalStatus: "APPROVED",
                approvedAt: now,
                approvedBy: adminIdentity(req),
                rejectionReason: null,
                rejectedAt: null,
                whatsappApprovedAt: t.whatsappApprovedAt ?? now,
                ...(req.body?.whatsappProviderTemplateName !== undefined
                    ? { whatsappProviderTemplateName: String(req.body.whatsappProviderTemplateName).slice(0, 500) }
                    : {}),
                ...(req.body?.whatsappMetaStatus !== undefined
                    ? { whatsappMetaStatus: String(req.body.whatsappMetaStatus).slice(0, 200) }
                    : {}),
            },
        });
        return res.json({ template: serializeAdminTemplate(updated) });
    }
    catch (error) {
        console.error("[admin] approve campaign template error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
/** POST /admin/campaign-templates/:id/reject — reject with a business-facing reason. */
router.post("/campaign-templates/:id/reject", async (req, res) => {
    try {
        const id = String(req.params.id || "");
        if (!OBJECT_ID_RE.test(id))
            return res.status(404).json({ error: "Template not found" });
        const reason = String(req.body?.rejectionReason || "").trim();
        if (!reason)
            return res.status(400).json({ error: "A rejection reason is required" });
        const t = await prisma.campaignTemplate.findUnique({ where: { id } });
        if (!t)
            return res.status(404).json({ error: "Template not found" });
        if (t.templateType !== "CUSTOM") {
            return res.status(400).json({ error: "Only custom templates can be rejected" });
        }
        const now = new Date();
        const updated = await prisma.campaignTemplate.update({
            where: { id },
            data: {
                approvalStatus: "REJECTED",
                rejectionReason: reason.slice(0, 1000),
                rejectedAt: now,
                rejectedBy: adminIdentity(req),
                whatsappRejectedAt: now,
            },
        });
        return res.json({ template: serializeAdminTemplate(updated) });
    }
    catch (error) {
        console.error("[admin] reject campaign template error:", error?.message || error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
export default router;

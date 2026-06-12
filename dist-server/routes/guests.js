// server/routes/guests.ts
//
// Guest CRM API (Phase 3 / P3A). Business-only. Every handler scopes its
// queries by the authenticated business id (req.auth.sub) and validates that
// the requested location belongs to that business, so guest data can never leak
// across businesses or locations.
//
// Mounted at /api/guests (the SPA owns the /business/guests *page* route).
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBusiness } from "../lib/auth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { isReturning, recomputeGuestStats, SUGGESTED_GUEST_TAGS, } from "../lib/guests.js";
import { reservationStatusToLegacy } from "../lib/liveData.js";
import { getLocationTimezone } from "../lib/operatingHours.js";
const router = Router();
// All guest routes are owner reads/writes behind business auth; a generous
// per-IP cap is plenty and protects the search endpoint from scripted scans.
const guestsLimiter = rateLimit({
    name: "guests-api",
    windowMs: 60 * 1000,
    max: 120,
});
router.use(requireBusiness, guestsLimiter);
/** The authenticated business id (set by requireBusiness). */
function bizId(req) {
    return String(req.auth?.sub || "");
}
/** Verify a location belongs to the authenticated business. */
async function ownedLocation(businessId, locationId) {
    if (!locationId)
        return null;
    return prisma.location.findFirst({
        where: { id: locationId, businessId },
        select: {
            id: true,
            name: true,
            displayName: true,
            address: true,
            restaurantProfile: true,
        },
    });
}
function locationLabel(loc) {
    return loc.displayName || loc.name || loc.address || "Location";
}
/** Public list-row shape for the guests table. */
function serializeGuestRow(g) {
    return {
        id: g.id,
        firstName: g.firstName,
        lastName: g.lastName,
        fullName: g.fullName || [g.firstName, g.lastName].filter(Boolean).join(" ") || null,
        phone: g.phone,
        normalizedPhone: g.normalizedPhone,
        email: g.email,
        tags: g.tags,
        totalVisits: g.totalVisits,
        waitlistVisitCount: g.waitlistVisitCount,
        upcomingReservationCount: g.upcomingReservationCount,
        pastReservationCount: g.pastReservationCount,
        noShowCount: g.noShowCount,
        cancelledCount: g.cancelledCount,
        firstVisitAt: g.firstVisitAt,
        lastVisitAt: g.lastVisitAt,
        hasNotes: Boolean(g.notes && g.notes.trim()),
        returning: isReturning(g.totalVisits),
        locationId: g.locationId,
    };
}
// ---------------------------------------------------------------------------
// GET /api/guests/meta — locations + suggested tags for the page chrome
// ---------------------------------------------------------------------------
router.get("/meta", async (req, res) => {
    try {
        const businessId = bizId(req);
        const locations = await prisma.location.findMany({
            where: { businessId },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, displayName: true, address: true },
        });
        return res.json({
            locations: locations.map((l) => ({ id: l.id, label: locationLabel(l) })),
            suggestedTags: SUGGESTED_GUEST_TAGS,
        });
    }
    catch (err) {
        console.error("[guests] meta error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ---------------------------------------------------------------------------
// GET /api/guests — list guests for a location (search + filters)
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
    try {
        const businessId = bizId(req);
        const locationId = String(req.query.locationId || "").trim();
        const location = await ownedLocation(businessId, locationId);
        if (!location) {
            return res.status(404).json({ error: "Location not found or access denied" });
        }
        const search = String(req.query.search || "").trim();
        const type = String(req.query.type || "").trim().toLowerCase(); // new | returning
        const tagsParam = String(req.query.tags || "").trim();
        const tags = tagsParam
            ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean)
            : [];
        const hasUpcoming = String(req.query.hasUpcoming || "") === "true";
        const hasNotes = String(req.query.hasNotes || "") === "true";
        const hasNoShow = String(req.query.hasNoShow || "") === "true";
        const where = { businessId, locationId };
        const idsParam = String(req.query.ids || "").trim();
        if (idsParam) {
            where.id = { in: idsParam.split(",").map((i) => i.trim()).filter(Boolean) };
        }
        if (search) {
            const digits = search.replace(/\D+/g, "");
            const or = [
                { fullName: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
            ];
            if (digits.length >= 3) {
                or.push({ normalizedPhone: { contains: digits } });
            }
            const tagsRaw = (await prisma.guestProfile.findRaw({
                filter: {
                    businessId: { $oid: businessId },
                    locationId: { $oid: locationId },
                    tags: { $regex: search, $options: "i" },
                },
            }));
            if (tagsRaw.length) {
                or.push({ id: { in: tagsRaw.map((t) => t._id.$oid) } });
            }
            where.AND = [...(where.AND || []), { OR: or }];
        }
        if (tags.length)
            where.tags = { hasSome: tags };
        if (type === "returning")
            where.totalVisits = { gte: 2 };
        else if (type === "new")
            where.totalVisits = { lt: 2 };
        if (hasUpcoming)
            where.upcomingReservationCount = { gt: 0 };
        if (hasNoShow)
            where.noShowCount = { gt: 0 };
        if (hasNotes) {
            where.AND = [
                ...(where.AND || []),
                { notes: { not: null } },
                { notes: { not: "" } },
            ];
        }
        const guests = await prisma.guestProfile.findMany({
            where,
            orderBy: [{ lastVisitAt: "desc" }, { updatedAt: "desc" }],
            take: 500,
        });
        return res.json({
            location: {
                id: location.id,
                label: locationLabel(location),
                timezone: getLocationTimezone(location),
            },
            guests: guests.map(serializeGuestRow),
        });
    }
    catch (err) {
        console.error("[guests] list error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ---------------------------------------------------------------------------
// GET /api/guests/:guestId — full profile + visit history timeline
// ---------------------------------------------------------------------------
router.get("/:guestId", async (req, res) => {
    try {
        const businessId = bizId(req);
        const guestId = String(req.params.guestId || "").trim();
        const guest = await prisma.guestProfile.findFirst({
            where: { id: guestId, businessId },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const location = await prisma.location.findFirst({
            where: { id: guest.locationId, businessId },
            select: {
                id: true,
                name: true,
                displayName: true,
                address: true,
                restaurantProfile: true,
            },
        });
        const locLabel = location ? locationLabel(location) : "Location";
        // Every visit-history time is rendered in the restaurant's own timezone.
        const locTz = getLocationTimezone(location);
        const [queueRows, reservationRows] = await Promise.all([
            guest.sourceQueueEntryIds.length
                ? prisma.queueEntry.findMany({
                    where: { id: { in: guest.sourceQueueEntryIds }, businessId },
                })
                : Promise.resolve([]),
            guest.sourceReservationIds.length
                ? prisma.reservation.findMany({
                    where: { id: { in: guest.sourceReservationIds }, businessId },
                })
                : Promise.resolve([]),
        ]);
        const now = Date.now();
        const waitlistHistory = queueRows
            .map((q) => ({
            id: q.id,
            source: "waitlist",
            status: legacyQueueStatus(q),
            partySize: q.guestCount,
            at: q.joinedAt ? new Date(q.joinedAt).toISOString() : null,
            // joinedAt is a real instant → render it in the location's timezone.
            atLabel: q.joinedAt ? formatInstantInTz(q.joinedAt, locTz) : null,
            location: locLabel,
            notes: null,
        }))
            .sort((a, b) => timeDesc(a.at, b.at));
        const reservationEvents = reservationRows.map((r) => {
            const when = r.reservationDateTime ? new Date(r.reservationDateTime) : null;
            const legacyStatus = reservationStatusToLegacy(r.status);
            const upcoming = !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(r.status) &&
                !!when &&
                when.getTime() >= now;
            return {
                id: r.id,
                source: "reservation",
                status: legacyStatus,
                partySize: r.guestCount,
                at: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null,
                // reservationDateTime is already a naive local wall-clock in the
                // location's timezone → render its literal components, no conversion.
                atLabel: formatWallClockLabel(r.reservationDateTime),
                location: locLabel,
                notes: r.notes || null,
                upcoming,
            };
        });
        const upcomingReservations = reservationEvents
            .filter((r) => r.upcoming)
            .sort((a, b) => timeAsc(a.at, b.at));
        const pastReservations = reservationEvents
            .filter((r) => !r.upcoming)
            .sort((a, b) => timeDesc(a.at, b.at));
        // Unified timeline: everything, newest first.
        const timeline = [
            ...waitlistHistory,
            ...reservationEvents.map(({ upcoming, ...rest }) => rest),
        ].sort((a, b) => timeDesc(a.at, b.at));
        return res.json({
            guest: {
                ...serializeGuestRow(guest),
                normalizedPhone: guest.normalizedPhone,
                normalizedEmail: guest.normalizedEmail,
                notes: guest.notes || "",
                summary: guest.summary || "",
                createdAt: guest.createdAt,
                updatedAt: guest.updatedAt,
                businessUsername: guest.businessUsername,
                location: { id: guest.locationId, label: locLabel, timezone: locTz },
            },
            timeline,
            upcomingReservations,
            pastReservations,
            waitlistHistory,
        });
    }
    catch (err) {
        console.error("[guests] detail error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ---------------------------------------------------------------------------
// PATCH /api/guests/:guestId — edit notes and/or replace custom tags
// ---------------------------------------------------------------------------
router.patch("/:guestId", async (req, res) => {
    try {
        const businessId = bizId(req);
        const guestId = String(req.params.guestId || "").trim();
        const guest = await prisma.guestProfile.findFirst({
            where: { id: guestId, businessId },
            select: { id: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const data = {};
        if (req.body?.notes !== undefined) {
            if (typeof req.body.notes !== "string") {
                return res.status(400).json({ error: "notes must be a string" });
            }
            data.notes = req.body.notes.slice(0, 5000);
        }
        if (req.body?.tags !== undefined) {
            const tags = sanitizeTags(req.body.tags);
            if (tags === null) {
                return res.status(400).json({ error: "tags must be an array of strings" });
            }
            data.tags = tags;
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: "Nothing to update" });
        }
        const updated = await prisma.guestProfile.update({
            where: { id: guest.id },
            data,
        });
        return res.json({ guest: serializeGuestRow(updated) });
    }
    catch (err) {
        console.error("[guests] patch error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ---------------------------------------------------------------------------
// POST /api/guests/:guestId/tags — add a single custom tag
// ---------------------------------------------------------------------------
router.post("/:guestId/tags", async (req, res) => {
    try {
        const businessId = bizId(req);
        const guestId = String(req.params.guestId || "").trim();
        const tag = String(req.body?.tag || "").trim().slice(0, 40);
        if (!tag)
            return res.status(400).json({ error: "tag is required" });
        const guest = await prisma.guestProfile.findFirst({
            where: { id: guestId, businessId },
            select: { id: true, tags: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        // Case-insensitive dedup so "VIP" and "vip" don't both stick.
        const exists = guest.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
        const tags = exists ? guest.tags : [...guest.tags, tag];
        if (tags.length > 30) {
            return res.status(400).json({ error: "Too many tags" });
        }
        const updated = await prisma.guestProfile.update({
            where: { id: guest.id },
            data: { tags },
        });
        return res.json({ guest: serializeGuestRow(updated) });
    }
    catch (err) {
        console.error("[guests] add tag error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ---------------------------------------------------------------------------
// DELETE /api/guests/:guestId/tags/:tag — remove a custom tag
// ---------------------------------------------------------------------------
router.delete("/:guestId/tags/:tag", async (req, res) => {
    try {
        const businessId = bizId(req);
        const guestId = String(req.params.guestId || "").trim();
        const tag = decodeURIComponent(String(req.params.tag || "")).trim();
        if (!tag)
            return res.status(400).json({ error: "tag is required" });
        const guest = await prisma.guestProfile.findFirst({
            where: { id: guestId, businessId },
            select: { id: true, tags: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        const tags = guest.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
        const updated = await prisma.guestProfile.update({
            where: { id: guest.id },
            data: { tags },
        });
        return res.json({ guest: serializeGuestRow(updated) });
    }
    catch (err) {
        console.error("[guests] remove tag error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ---------------------------------------------------------------------------
// POST /api/guests/:guestId/recompute — re-derive stats from source rows
// ---------------------------------------------------------------------------
router.post("/:guestId/recompute", async (req, res) => {
    try {
        const businessId = bizId(req);
        const guestId = String(req.params.guestId || "").trim();
        const guest = await prisma.guestProfile.findFirst({
            where: { id: guestId, businessId },
            select: { id: true },
        });
        if (!guest)
            return res.status(404).json({ error: "Guest not found" });
        await recomputeGuestStats(guest.id);
        const updated = await prisma.guestProfile.findUnique({ where: { id: guest.id } });
        return res.json({ guest: updated ? serializeGuestRow(updated) : null });
    }
    catch (err) {
        console.error("[guests] recompute error:", err?.message || err);
        return res.status(500).json({ error: "Server error" });
    }
});
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sanitizeTags(input) {
    if (!Array.isArray(input))
        return null;
    const seen = new Set();
    const out = [];
    for (const raw of input) {
        if (typeof raw !== "string")
            return null;
        const tag = raw.trim().slice(0, 40);
        if (!tag)
            continue;
        const key = tag.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(tag);
    }
    return out.slice(0, 30);
}
function legacyQueueStatus(q) {
    switch (q.status) {
        case "ADMITTED":
        case "ARRIVED":
            return q.status === "ARRIVED" ? "arrived" : "admitted";
        case "NO_SHOW":
            return "no_show";
        case "REMOVED":
            return "removed";
        case "LEFT":
            return "left";
        default:
            return "waiting";
    }
}
function timeDesc(a, b) {
    return (b ? Date.parse(b) : 0) - (a ? Date.parse(a) : 0);
}
function timeAsc(a, b) {
    return (a ? Date.parse(a) : 0) - (b ? Date.parse(b) : 0);
}
const VISIT_LABEL_OPTS = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
};
/** Format a real instant (e.g. a queue joinedAt) in the location's timezone. */
function formatInstantInTz(date, timeZone) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime()))
        return null;
    try {
        return d.toLocaleString("en-US", { ...VISIT_LABEL_OPTS, timeZone });
    }
    catch {
        return d.toLocaleString("en-US", VISIT_LABEL_OPTS);
    }
}
/**
 * Format a naive local wall-clock "YYYY-MM-DDTHH:MM" (already in the location's
 * timezone) by its literal components — render it as UTC so the displayed
 * date/time exactly match the stored value, no timezone shift.
 */
function formatWallClockLabel(wallClock) {
    if (!wallClock)
        return null;
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wallClock)
        ? `${wallClock}:00Z`
        : wallClock;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return null;
    return d.toLocaleString("en-US", { ...VISIT_LABEL_OPTS, timeZone: "UTC" });
}
export default router;

// server/lib/business.ts
//
// Shared serializers for the business "me" payload. Lives in lib (not a routes
// file) so both the auth routes and the location-media routes return the exact
// same location shape — including the banner fields + uploaded gallery photos.
import { prisma } from "./prisma.js";
import { reconstructQueueArrays, reservationRowToLegacy, } from "./liveData.js";
/** Empty live lists (used as a safe fallback). */
const EMPTY_LIVE = {
    queue: [],
    admittedCustomers: [],
    removedCustomers: [],
    reservations: [],
};
/**
 * Load and reconstruct the legacy queue/reservation arrays for one location from
 * the QueueEntry + Reservation models. This is the read-side bridge that keeps
 * the dashboard, ETA, and status endpoints working after storage moved off the
 * Location JSON fields.
 */
export async function loadLocationLiveLists(locationId, businessUsername) {
    const [queueRows, reservationRows] = await Promise.all([
        prisma.queueEntry.findMany({ where: { locationId } }),
        prisma.reservation.findMany({ where: { locationId } }),
    ]);
    const { queue, admittedCustomers, removedCustomers } = reconstructQueueArrays(queueRows, businessUsername);
    return {
        queue,
        admittedCustomers,
        removedCustomers,
        reservations: reservationRows.map((r) => reservationRowToLegacy(r, { includeToken: true })),
    };
}
/**
 * Return a Location row augmented with reconstructed live lists, so helpers that
 * read `location.queue` / `.admittedCustomers` / `.reservations` (e.g. the ETA
 * functions in queueEta.ts) keep working unchanged.
 */
export async function augmentLocationWithLiveLists(location) {
    const live = await loadLocationLiveLists(location.id, location.businessUsername);
    return { ...location, ...live };
}
/** Normalize a Photo row for the client. */
export function serializePhoto(p) {
    return {
        id: p.id,
        url: p.url,
        publicId: p.publicId,
        altText: p.altText ?? null,
        createdAt: p.createdAt,
    };
}
/**
 * Normalize a Location row into the shape the dashboard/queue UI expects.
 * Expects `loc.photos` to be loaded (via `include: { photos: ... }`); falls back
 * to an empty gallery when it isn't.
 */
export function serializeLocation(loc, live) {
    const lists = live ?? EMPTY_LIVE;
    return {
        id: loc.id,
        name: loc.name ?? null,
        displayName: loc.displayName ?? null,
        address: loc.address ?? "",
        area: loc.area ?? null,
        city: loc.city ?? null,
        country: loc.country ?? null,
        latitude: typeof loc.latitude === "number" ? loc.latitude : null,
        longitude: typeof loc.longitude === "number" ? loc.longitude : null,
        googlePlaceId: loc.googlePlaceId ?? null,
        googleMapsUrl: loc.googleMapsUrl ?? null,
        // Reconstructed from the QueueEntry / Reservation models (see liveData.ts).
        queue: lists.queue,
        admittedCustomers: lists.admittedCustomers,
        removedCustomers: lists.removedCustomers,
        credits: typeof loc.credits === "number" ? loc.credits : 0,
        queueEnabled: loc.queueEnabled ?? true,
        reservationsEnabled: loc.reservationsEnabled ?? true,
        reservationSettings: loc.reservationSettings ?? {},
        reservations: lists.reservations,
        restaurantProfile: loc.restaurantProfile ?? {},
        // Hero/banner image (one per location) + gallery photos (separate Photo model).
        bannerImageUrl: loc.bannerImageUrl ?? null,
        bannerImagePublicId: loc.bannerImagePublicId ?? null,
        photos: Array.isArray(loc.photos) ? loc.photos.map(serializePhoto) : [],
    };
}
/**
 * Assemble the business "me" payload: business profile + its locations (with
 * gallery photos loaded). Shape mirrors the legacy `/auth/me` response so the
 * dashboard, settings, and profile pages keep working unchanged.
 */
export async function assembleBusinessMe(businessId) {
    const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
            id: true,
            name: true,
            email: true,
            username: true,
            phone: true,
            trial: true,
            trialDurationDays: true,
            maxLocations: true,
            baseCredits: true,
            lastCreditRefillAt: true,
            nextCreditRefillAt: true,
            createdAt: true,
        },
    });
    if (!business)
        return null;
    const locations = await prisma.location.findMany({
        where: { businessId },
        orderBy: { createdAt: "asc" },
        include: { photos: { orderBy: { createdAt: "asc" } } },
    });
    // Batch-load all queue + reservation rows for this business's locations in two
    // indexed queries, then group in memory (avoids a per-location round trip).
    const [queueRows, reservationRows] = await Promise.all([
        prisma.queueEntry.findMany({ where: { businessId } }),
        prisma.reservation.findMany({ where: { businessId } }),
    ]);
    const queueByLoc = new Map();
    for (const r of queueRows) {
        const arr = queueByLoc.get(r.locationId) ?? [];
        arr.push(r);
        queueByLoc.set(r.locationId, arr);
    }
    const resByLoc = new Map();
    for (const r of reservationRows) {
        const arr = resByLoc.get(r.locationId) ?? [];
        arr.push(r);
        resByLoc.set(r.locationId, arr);
    }
    const serializedLocations = locations.map((loc) => {
        const { queue, admittedCustomers, removedCustomers } = reconstructQueueArrays(queueByLoc.get(loc.id) ?? [], business.username);
        const reservations = (resByLoc.get(loc.id) ?? []).map((r) => reservationRowToLegacy(r, { includeToken: true }));
        return serializeLocation(loc, {
            queue,
            admittedCustomers,
            removedCustomers,
            reservations,
        });
    });
    return { ...business, locations: serializedLocations };
}

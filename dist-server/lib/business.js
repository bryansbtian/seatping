// server/lib/business.ts
//
// Shared serializers for the business "me" payload. Lives in lib (not a routes
// file) so both the auth routes and the location-media routes return the exact
// same location shape — including the banner fields + uploaded gallery photos.
import { prisma } from "./prisma.js";
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
export function serializeLocation(loc) {
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
        queue: Array.isArray(loc.queue) ? loc.queue : [],
        admittedCustomers: Array.isArray(loc.admittedCustomers)
            ? loc.admittedCustomers
            : [],
        removedCustomers: Array.isArray(loc.removedCustomers)
            ? loc.removedCustomers
            : [],
        credits: typeof loc.credits === "number" ? loc.credits : 0,
        queueEnabled: loc.queueEnabled ?? true,
        reservationsEnabled: loc.reservationsEnabled ?? true,
        reservationSettings: loc.reservationSettings ?? {},
        reservations: Array.isArray(loc.reservations) ? loc.reservations : [],
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
    return { ...business, locations: locations.map(serializeLocation) };
}

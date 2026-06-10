// server/lib/business.ts
//
// Shared serializers for the business "me" payload. Lives in lib (not a routes
// file) so both the auth routes and the location-media routes return the exact
// same location shape — including the banner fields + uploaded gallery photos.
import { prisma } from "./prisma.js";
import {
  reconstructQueueArrays,
  reservationRowToLegacy,
} from "./liveData.js";
import { loadGuestBadgeMap, badgeForContact, type GuestBadge } from "./guests.js";

/** Live queue/reservation arrays reconstructed from the new models. */
export type LocationLiveLists = {
  queue: any[];
  admittedCustomers: any[];
  removedCustomers: any[];
  reservations: any[];
};

/** Empty live lists (used as a safe fallback). */
const EMPTY_LIVE: LocationLiveLists = {
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
export async function loadLocationLiveLists(
  locationId: string,
  businessUsername?: string | null,
): Promise<LocationLiveLists> {
  const [queueRows, reservationRows] = await Promise.all([
    prisma.queueEntry.findMany({ where: { locationId } }),
    prisma.reservation.findMany({ where: { locationId } }),
  ]);
  const { queue, admittedCustomers, removedCustomers } = reconstructQueueArrays(
    queueRows,
    businessUsername,
  );
  return {
    queue,
    admittedCustomers,
    removedCustomers,
    reservations: reservationRows.map((r) =>
      reservationRowToLegacy(r, { includeToken: true }),
    ),
  };
}

/**
 * Return a Location row augmented with reconstructed live lists, so helpers that
 * read `location.queue` / `.admittedCustomers` / `.reservations` (e.g. the ETA
 * functions in queueEta.ts) keep working unchanged.
 */
export async function augmentLocationWithLiveLists<T extends { id: string; businessUsername?: string | null }>(
  location: T,
): Promise<T & LocationLiveLists> {
  const live = await loadLocationLiveLists(location.id, location.businessUsername);
  return { ...location, ...live };
}

/** Normalize a Photo row for the client. */
export function serializePhoto(p: any) {
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
export function serializeLocation(loc: any, live?: LocationLiveLists) {
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
export async function assembleBusinessMe(businessId: string) {
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
      language: true,
      lastCreditRefillAt: true,
      nextCreditRefillAt: true,
      createdAt: true,
    },
  });
  if (!business) return null;

  // Legacy businesses created before the language field default to English.
  const language = (business as any).language ?? "en";

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
  const queueByLoc = new Map<string, typeof queueRows>();
  for (const r of queueRows) {
    const arr = queueByLoc.get(r.locationId) ?? [];
    arr.push(r);
    queueByLoc.set(r.locationId, arr);
  }
  const resByLoc = new Map<string, typeof reservationRows>();
  for (const r of reservationRows) {
    const arr = resByLoc.get(r.locationId) ?? [];
    arr.push(r);
    resByLoc.set(r.locationId, arr);
  }

  // Guest CRM: load the repeat-guest lookup once for the whole business, then
  // stamp a "Returning"/"New" badge onto every live queue + reservation row so
  // the dashboard can show it without any client-side guessing.
  const guestBadgeMap = await loadGuestBadgeMap(businessId);

  const serializedLocations = locations.map((loc) => {
    const { queue, admittedCustomers, removedCustomers } = reconstructQueueArrays(
      queueByLoc.get(loc.id) ?? [],
      business.username,
    );
    const reservations = (resByLoc.get(loc.id) ?? []).map((r) =>
      reservationRowToLegacy(r, { includeToken: true }),
    );
    return serializeLocation(loc, {
      queue: queue.map((c) => stampGuestBadge(c, guestBadgeMap, "queue")),
      admittedCustomers: admittedCustomers.map((c) =>
        stampGuestBadge(c, guestBadgeMap, "queue"),
      ),
      removedCustomers,
      reservations: reservations.map((r) =>
        stampGuestBadge(r, guestBadgeMap, "reservation"),
      ),
    });
  });

  return { ...business, language, locations: serializedLocations };
}

/**
 * Annotate a legacy queue/reservation object with its guest badge. Queue rows
 * carry the contact as `phoneNumber`; reservation rows as `phone`. Adds
 * `guestVisits` + `isReturning` (false/0 when the guest isn't recognized yet).
 */
function stampGuestBadge(
  item: any,
  map: Map<string, GuestBadge>,
  kind: "queue" | "reservation",
): any {
  const badge = badgeForContact(map, {
    phone: kind === "queue" ? item.phoneNumber : item.phone,
    countryCode: item.countryCode,
    email: item.email,
  });
  item.guestVisits = badge?.totalVisits ?? 0;
  item.isReturning = badge?.returning ?? false;
  return item;
}

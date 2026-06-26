import { prisma } from "./prisma.js";
import {
  reconstructQueueArrays,
  reservationRowToLegacy,
} from "./liveData.js";
import { loadGuestBadgeMap, badgeForContact, type GuestBadge } from "./guests.js";

export type LocationLiveLists = {
  queue: any[];
  admittedCustomers: any[];
  removedCustomers: any[];
  reservations: any[];
};

const EMPTY_LIVE: LocationLiveLists = {
  queue: [],
  admittedCustomers: [],
  removedCustomers: [],
  reservations: [],
};

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

export async function augmentLocationWithLiveLists<T extends { id: string; businessUsername?: string | null }>(
  location: T,
): Promise<T & LocationLiveLists> {
  const live = await loadLocationLiveLists(location.id, location.businessUsername);
  return { ...location, ...live };
}

export function serializePhoto(p: any) {
  return {
    id: p.id,
    url: p.url,
    publicId: p.publicId,
    altText: p.altText ?? null,
    createdAt: p.createdAt,
  };
}

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
    queue: lists.queue,
    admittedCustomers: lists.admittedCustomers,
    removedCustomers: lists.removedCustomers,
    credits: typeof loc.credits === "number" ? loc.credits : 0,
    queueEnabled: loc.queueEnabled ?? true,
    reservationsEnabled: loc.reservationsEnabled ?? true,
    reservationSettings: loc.reservationSettings ?? {},
    reservations: lists.reservations,
    restaurantProfile: loc.restaurantProfile ?? {},
    bannerImageUrl: loc.bannerImageUrl ?? null,
    bannerImagePublicId: loc.bannerImagePublicId ?? null,
    photos: Array.isArray(loc.photos) ? loc.photos.map(serializePhoto) : [],
  };
}

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

  const language = (business as any).language ?? "en";

  const locations = await prisma.location.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
    include: { photos: { orderBy: { createdAt: "asc" } } },
  });

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

import { prisma } from "./prisma.js";

type GuestProfileIdRow = { id: string };

export async function findGuestProfileIdsByExactTag(
  businessId: string,
  locationId: string,
  tag: string,
): Promise<string[]> {
  const trimmed = tag.trim();
  if (!trimmed) {
    return [];
  }
  const rows = await prisma.$queryRaw<GuestProfileIdRow[]>`
    SELECT id FROM guest_profiles
    WHERE "businessId" = ${businessId}
      AND "locationId" = ${locationId}
      AND EXISTS (
        SELECT 1 FROM unnest(tags) AS tag WHERE lower(tag) = lower(${trimmed})
      )
  `;
  return rows.map((row) => row.id);
}

export async function findGuestProfileIdsByTagSearch(
  businessId: string,
  locationId: string,
  search: string,
): Promise<string[]> {
  const trimmed = search.trim();
  if (!trimmed) {
    return [];
  }
  const rows = await prisma.$queryRaw<GuestProfileIdRow[]>`
    SELECT id FROM guest_profiles
    WHERE "businessId" = ${businessId}
      AND "locationId" = ${locationId}
      AND EXISTS (
        SELECT 1 FROM unnest(tags) AS tag WHERE strpos(lower(tag), lower(${trimmed})) > 0
      )
  `;
  return rows.map((row) => row.id);
}

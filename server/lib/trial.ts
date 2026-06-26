import { prisma } from "./prisma.js";

export const DEFAULT_BASE_CREDITS = 300;

export function isTrialExpired(business: any): boolean {
  const createdAt = new Date(business.createdAt);
  const trialDurationDays =
    typeof business.trialDurationDays === "number"
      ? business.trialDurationDays
      : 7;
  const trialEndDate = new Date(
    createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000
  );
  const now = new Date();

  return now > trialEndDate;
}

export function nextMonthlyAnchorAfter(anchor: Date, now: Date): Date {
  const next = new Date(anchor);
  while (next <= now) {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export function computeNextRefillDate(creditsStartedAt: Date, now: Date = new Date()): Date {
  return nextMonthlyAnchorAfter(creditsStartedAt, now);
}

export function shouldRefillMonthlyCredits(business: any): boolean {
  if (business.trial !== false) return false;
  if (!business.creditsStartedAt) return false;
  if (!business.nextCreditRefillAt) return false;
  const now = new Date();
  return new Date(business.nextCreditRefillAt) <= now;
}

export function getBaseCreditsForUser(business: any): number {
  return typeof business?.baseCredits === "number"
    ? business.baseCredits
    : DEFAULT_BASE_CREDITS;
}

export function getCreditsForLocation(business: any): number {
  if (isTrialExpired(business) && business.trial === true) {
    return 0;
  }
  return getBaseCreditsForUser(business);
}

export interface LocationDetailsInput {
  address: string;
  displayName?: string;
  area?: string;
  city?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string;
  googleMapsUrl?: string;
}

export function buildLocationData(
  business: any,
  location: string | LocationDetailsInput
): any {
  const credits = getCreditsForLocation(business);
  const baseCredits = getBaseCreditsForUser(business);
  const d: LocationDetailsInput =
    typeof location === "string" ? { address: location } : location;

  return {
    businessId: String(business.id),
    businessUsername: business.username ?? null,
    address: d.address,
    displayName: d.displayName?.trim() || null,
    area: d.area?.trim() || null,
    city: d.city?.trim() || null,
    country: d.country?.trim() || null,
    latitude: typeof d.latitude === "number" ? d.latitude : null,
    longitude: typeof d.longitude === "number" ? d.longitude : null,
    googlePlaceId: d.googlePlaceId?.trim() || null,
    googleMapsUrl: d.googleMapsUrl?.trim() || null,
    credits,
    baseCredits,
  };
}

export async function enforceTrialExpiration(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      trial: true,
      trialDurationDays: true,
      createdAt: true,
      baseCredits: true,
    },
  });

  if (!business) return;

  if (isTrialExpired(business) && business.trial === true) {
    console.log(
      `[TRIAL] Business ${business.id} trial expired and trial = true, enforcing 0 credits on all locations`
    );

    const result = await prisma.location.updateMany({
      where: { businessId },
      data: { credits: 0 },
    });

    console.log(
      `[TRIAL] Zeroed credits on ${result.count} locations for business ${business.id}`
    );
  } else if (isTrialExpired(business) && business.trial === false) {
    console.log(
      `[TRIAL] Business ${business.id} manually activated (trial = false), credits managed by monthly refill logic`
    );
  } else {
    console.log(`[TRIAL] Business ${business.id} trial is still active`);
  }
}

export async function refillCreditsForUser(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      baseCredits: true,
      creditsStartedAt: true,
    },
  });
  if (!business || !business.creditsStartedAt) return;

  await prisma.location.updateMany({
    where: { businessId },
    data: {
      credits: business.baseCredits || 0,
    },
  });

  const now = new Date();
  const nextRefill = computeNextRefillDate(new Date(business.creditsStartedAt), now);

  await prisma.business.update({
    where: { id: businessId },
    data: {
      lastCreditRefillAt: now,
      nextCreditRefillAt: nextRefill,
    },
  });

  console.log(
    `[CREDITS] Refilled business ${businessId} (credits=${business.baseCredits}); nextCreditRefillAt=${nextRefill.toISOString()}`
  );
}

async function backfillNextCreditRefillAt(business: {
  id: string;
  trial: boolean;
  creditsStartedAt: Date | null;
  nextCreditRefillAt: Date | null;
}): Promise<Date | null> {
  if (business.trial !== false) return null;
  if (!business.creditsStartedAt) return null;
  if (business.nextCreditRefillAt) return business.nextCreditRefillAt;

  const next = computeNextRefillDate(new Date(business.creditsStartedAt));
  await prisma.business.update({
    where: { id: business.id },
    data: { nextCreditRefillAt: next },
  });
  console.log(
    `[CREDITS] Backfilled nextCreditRefillAt for business ${business.id} -> ${next.toISOString()}`
  );
  return next;
}

export async function checkAndRefillMonthlyCredits(
  businessId: string
): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      trial: true,
      creditsStartedAt: true,
      nextCreditRefillAt: true,
    },
  });
  if (!business) return;
  if (business.trial !== false) return;
  if (!business.creditsStartedAt) return;

  const nextRefill = await backfillNextCreditRefillAt(business);
  if (!nextRefill) return;

  if (new Date(nextRefill) <= new Date()) {
    await refillCreditsForUser(businessId);
    console.log(`[MONTHLY] Credits refilled on-demand for business ${businessId}`);
  }
}

export async function runDailyCreditRefillSweep(): Promise<void> {
  const now = new Date();
  console.log(`[CREDIT-SWEEP] starting at ${now.toISOString()}`);

  const dueBusinesses = await prisma.business.findMany({
    where: {
      trial: false,
      creditsStartedAt: { not: null },
      nextCreditRefillAt: { lte: now },
    },
    select: { id: true },
  });
  for (const b of dueBusinesses) {
    try {
      await refillCreditsForUser(b.id);
    } catch (err) {
      console.error(`[CREDIT-SWEEP] refill failed for ${b.id}:`, err);
    }
  }

  const legacyBusinesses = await prisma.business.findMany({
    where: {
      trial: false,
      creditsStartedAt: { not: null },
      nextCreditRefillAt: null,
    },
    select: { id: true, trial: true, creditsStartedAt: true, nextCreditRefillAt: true },
  });
  for (const b of legacyBusinesses) {
    try {
      await backfillNextCreditRefillAt(b);
    } catch (err) {
      console.error(`[CREDIT-SWEEP] backfill failed for ${b.id}:`, err);
    }
  }

  console.log(
    `[CREDIT-SWEEP] done — refilled=${dueBusinesses.length}, backfilled=${legacyBusinesses.length}`
  );
}

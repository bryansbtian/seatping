import { prisma } from "./prisma.js";
import { withBusinessCreditLock } from "./businessCreditLock.js";
import { measureDatabase } from "./performanceTiming.js";

export const DEFAULT_BASE_CREDITS = 300;

export function isTrialExpired(business: any): boolean {
  const createdAt = new Date(business.createdAt);
  let trialDurationDays = 7;
  if (typeof business.trialDurationDays === "number") {
    trialDurationDays = business.trialDurationDays;
  }
  const trialEndDate = new Date(createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);
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
  if (business.trial !== false) {
    return false;
  }
  if (!business.creditsStartedAt) {
    return false;
  }
  if (!business.nextCreditRefillAt) {
    return false;
  }
  const now = new Date();
  return new Date(business.nextCreditRefillAt) <= now;
}

export function getBaseCreditsForUser(business: any): number {
  if (typeof business?.baseCredits === "number") {
    return business.baseCredits;
  }
  return DEFAULT_BASE_CREDITS;
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

export function buildLocationData(business: any, location: string | LocationDetailsInput): any {
  const credits = getCreditsForLocation(business);
  const baseCredits = getBaseCreditsForUser(business);
  let d: LocationDetailsInput;
  if (typeof location === "string") {
    d = { address: location };
  } else {
    d = location;
  }

  let latitude: number | null = null;
  if (typeof d.latitude === "number") {
    latitude = d.latitude;
  }
  let longitude: number | null = null;
  if (typeof d.longitude === "number") {
    longitude = d.longitude;
  }

  return {
    businessId: String(business.id),
    businessUsername: business.username ?? null,
    address: d.address,
    displayName: d.displayName?.trim() || null,
    area: d.area?.trim() || null,
    city: d.city?.trim() || null,
    country: d.country?.trim() || null,
    latitude,
    longitude,
    googlePlaceId: d.googlePlaceId?.trim() || null,
    googleMapsUrl: d.googleMapsUrl?.trim() || null,
    credits,
    baseCredits,
  };
}

async function maintainBusinessCredits(
  businessId: string,
  expiration: boolean,
  monthly: boolean,
): Promise<void> {
  await withBusinessCreditLock(businessId, async (tx) => {
    const business = await measureDatabase("credit.business", () =>
      tx.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          trial: true,
          trialDurationDays: true,
          createdAt: true,
          baseCredits: true,
          creditsStartedAt: true,
          nextCreditRefillAt: true,
        },
      }),
    );
    if (!business) {
      return;
    }
    if (business.trial) {
      if (expiration && isTrialExpired(business)) {
        await measureDatabase("credit.expire", () =>
          tx.location.updateMany({
            where: { businessId, credits: { not: 0 } },
            data: { credits: 0 },
          }),
        );
      }
      return;
    }
    if (!monthly || !business.creditsStartedAt) {
      return;
    }
    const now = new Date();
    const nextRefill = computeNextRefillDate(business.creditsStartedAt, now);
    if (!business.nextCreditRefillAt) {
      await measureDatabase("credit.anchor", () =>
        tx.business.update({
          where: { id: businessId },
          data: { nextCreditRefillAt: nextRefill },
        }),
      );
      return;
    }
    if (business.nextCreditRefillAt > now) {
      return;
    }
    await measureDatabase("credit.refill", () =>
      tx.location.updateMany({
        where: { businessId },
        data: { credits: business.baseCredits },
      }),
    );
    await measureDatabase("credit.anchor", () =>
      tx.business.update({
        where: { id: businessId },
        data: { lastCreditRefillAt: now, nextCreditRefillAt: nextRefill },
      }),
    );
  });
}

export function enforceTrialExpiration(businessId: string): Promise<void> {
  return maintainBusinessCredits(businessId, true, false);
}

export function checkAndRefillMonthlyCredits(businessId: string): Promise<void> {
  return maintainBusinessCredits(businessId, false, true);
}

export function refreshBusinessCredits(businessId: string): Promise<void> {
  return maintainBusinessCredits(businessId, true, true);
}

export function refillCreditsForUser(businessId: string): Promise<void> {
  return checkAndRefillMonthlyCredits(businessId);
}

export async function runDailyCreditRefillSweep(): Promise<void> {
  const now = new Date();
  const businesses = await prisma.business.findMany({
    where: {
      trial: false,
      creditsStartedAt: { not: null },
      OR: [{ nextCreditRefillAt: { lte: now } }, { nextCreditRefillAt: null }],
    },
    select: { id: true },
  });
  for (const business of businesses) {
    try {
      await checkAndRefillMonthlyCredits(business.id);
    } catch {
      console.error("[CREDIT-SWEEP] Credit maintenance failed");
    }
  }
}

// server/lib/trial.ts
import { prisma } from "./prisma.js";

/**
 * Check if a user's trial has expired
 * @param user - The user object from database
 * @returns true if trial has expired, false otherwise
 */
export function isTrialExpired(user: any): boolean {
  // Trial expires when account is more than 7 days old, regardless of trial field
  // trial = false means user purchased a plan, NOT that trial expired
  const createdAt = new Date(user.createdAt);
  const trialDurationDays =
    typeof user.trialDurationDays === "number" ? user.trialDurationDays : 7;
  const trialEndDate = new Date(
    createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000
  );
  const now = new Date();

  return now > trialEndDate;
}

/**
 * Compute the first monthly anchor that is strictly after `now`, starting from `anchor`.
 * Uses calendar-month arithmetic, so cycles are 28-31 days long.
 */
export function nextMonthlyAnchorAfter(anchor: Date, now: Date): Date {
  const next = new Date(anchor);
  while (next <= now) {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

/**
 * Compute the next refill date for a user given their planStartedAt.
 * Always returns the first monthly anchor strictly after `now`.
 */
export function computeNextRefillDate(planStartedAt: Date, now: Date = new Date()): Date {
  return nextMonthlyAnchorAfter(planStartedAt, now);
}

/**
 * Check if monthly credits need to be refilled.
 * Returns true only for users on a paid plan whose next refill date has arrived.
 */
export function shouldRefillMonthlyCredits(user: any): boolean {
  if (user.trial !== false) return false;
  if (!user.planStartedAt) return false;
  if (!user.nextCreditRefillAt) return false;
  const now = new Date();
  return new Date(user.nextCreditRefillAt) <= now;
}

/**
 * Get credits for a location based on plan
 * @param plan - The plan name
 * @returns Object with smsCredits and customerCredits
 */
export function getCreditsForPlan(plan: string): {
  smsCredits: number;
  customerCredits: number;
} {
  switch (plan) {
    case "Starter":
      return { smsCredits: 300, customerCredits: 300 };
    case "Professional":
      return { smsCredits: 600, customerCredits: 600 };
    default:
      return { smsCredits: 300, customerCredits: 300 };
  }
}

/**
 * Get base credits for a user based on their plan
 * @param user - The user object from database
 * @returns Object with baseSMSCredits and baseCustomerCredits
 */
export function getBaseCreditsForUser(user: any): {
  baseSMSCredits: number;
  baseCustomerCredits: number;
} {
  const planCredits = getCreditsForPlan((user as any).plan);

  return {
    baseSMSCredits: planCredits.smsCredits,
    baseCustomerCredits: planCredits.customerCredits,
  };
}

/**
 * Get credits for a location based on trial status and user's base credits
 * @param user - The user object from database
 * @returns Object with smsCredits and customerCredits
 */
export function getCreditsForLocation(user: any): {
  smsCredits: number;
  customerCredits: number;
} {
  // If trial has expired (account > 7 days old) and trial = true, return 0 credits
  if (isTrialExpired(user) && user.trial === true) {
    return { smsCredits: 0, customerCredits: 0 };
  }

  // If trial has expired but trial = false (user purchased plan), use base credits
  if (isTrialExpired(user) && user.trial === false) {
    return {
      smsCredits: user.baseSMSCredits || 0,
      customerCredits: user.baseCustomerCredits || 0,
    };
  }

  // If trial is still active (account ≤ 7 days old), use base credits
  return {
    smsCredits: user.baseSMSCredits || 0,
    customerCredits: user.baseCustomerCredits || 0,
  };
}

/**
 * Enforce trial expiration on all locations for a user
 * This ensures that even if users try to manipulate the system, they get 0 credits
 * @param userId - The user ID
 */
export async function enforceTrialExpiration(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      trial: true,
      trialDurationDays: true,
      createdAt: true,
      plan: true,
      baseSMSCredits: true,
      baseCustomerCredits: true,
      locations: true,
    },
  });

  if (!user) return;

  // Check if trial has expired (account > 7 days old) AND user is still in trial mode
  if (isTrialExpired(user) && user.trial === true) {
    // Trial expired and user is still in trial mode - set all credits to 0
    console.log(
      `[TRIAL] User ${user.id} trial has expired (account > 7 days old) and trial = true, enforcing 0 credits`
    );

    const locations = ((user as any).locations as any[]) || [];

    const updatedLocations = locations.map((location: any) => ({
      ...location,
      smsCredits: 0,
      customerCredits: 0,
    }));

    await prisma.user.update({
      where: { id: userId },
      data: { locations: updatedLocations as any },
    });

    console.log(
      `[TRIAL] Updated ${locations.length} locations to 0 credits for user ${user.id}`
    );
  } else if (isTrialExpired(user) && user.trial === false) {
    // Trial expired but user has purchased a plan - do NOT reset credits
    console.log(
      `[TRIAL] User ${user.id} has purchased a plan (trial = false), credits managed by monthly refill logic`
    );
  } else {
    console.log(
      `[TRIAL] User ${user.id} trial is still active (account ≤ 7 days old)`
    );
  }
}

/**
 * Validate and enforce credits when adding a new location
 * @param user - The user object from database
 * @param address - The address for the new location
 * @returns The location object with proper credits
 */
export function createLocationWithTrialEnforcement(
  user: any,
  address: string
): any {
  const credits = getCreditsForLocation(user);

  return {
    address,
    queue: [],
    admittedCustomers: [],
    removedCustomers: [],
    smsCredits: credits.smsCredits,
    customerCredits: credits.customerCredits,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Refill credits for all locations to the user's base credits.
 * Leaves `planStartedAt` unchanged and advances `nextCreditRefillAt` to the
 * next monthly anchor strictly after `now` (single jump — no per-cycle catch-up).
 *
 * Caller is responsible for ensuring the user is eligible (trial === false,
 * planStartedAt set, refill is actually due).
 */
export async function refillCreditsForUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      locations: true,
      baseSMSCredits: true,
      baseCustomerCredits: true,
      planStartedAt: true,
    },
  });
  if (!user || !user.planStartedAt) return;

  const locations = ((user as any).locations as any[]) || [];
  const updatedLocations = locations.map((location: any) => ({
    ...location,
    smsCredits: user.baseSMSCredits || 0,
    customerCredits: user.baseCustomerCredits || 0,
  }));

  const now = new Date();
  const nextRefill = computeNextRefillDate(new Date(user.planStartedAt), now);

  await prisma.user.update({
    where: { id: userId },
    data: {
      locations: updatedLocations as any,
      lastCreditRefillAt: now,
      nextCreditRefillAt: nextRefill,
    },
  });

  console.log(
    `[CREDITS] Refilled user ${userId} (SMS=${user.baseSMSCredits}, Customers=${user.baseCustomerCredits}); nextCreditRefillAt=${nextRefill.toISOString()}`
  );
}

/**
 * Handle plan purchase - refill credits and set planStartedAt
 * @param userId - The user ID
 * @param plan - The plan name
 */
export async function handlePlanPurchase(
  userId: string,
  plan: string
): Promise<void> {
  const planCredits = getCreditsForPlan(plan);
  const now = new Date();
  const nextRefill = computeNextRefillDate(now, now);

  // Set plan, planStartedAt to current time, mark as not in trial, set base credits, and update maxLocations
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: plan,
      planStartedAt: now,
      lastCreditRefillAt: now,
      nextCreditRefillAt: nextRefill,
      trial: false, // User has purchased a plan (NOT that trial expired)
      baseSMSCredits: planCredits.smsCredits,
      baseCustomerCredits: planCredits.customerCredits,
      maxLocations: plan === "Professional" ? 3 : 1, // Update maxLocations based on plan
      locations: [], // Delete all locations when changing plans
    },
  });

  console.log(
    `[PLAN] User ${userId} purchased plan ${plan}, base credits set, maxLocations updated, and all locations deleted`
  );
}

/**
 * For users on a paid plan with `planStartedAt` set but no `nextCreditRefillAt`
 * (e.g. accounts created before this feature shipped), seed `nextCreditRefillAt`
 * to the next monthly anchor strictly after now. Does NOT perform a refill.
 */
async function backfillNextCreditRefillAt(user: {
  id: string;
  trial: boolean;
  planStartedAt: Date | null;
  nextCreditRefillAt: Date | null;
}): Promise<Date | null> {
  if (user.trial !== false) return null;
  if (!user.planStartedAt) return null;
  if (user.nextCreditRefillAt) return user.nextCreditRefillAt;

  const next = computeNextRefillDate(new Date(user.planStartedAt));
  await prisma.user.update({
    where: { id: user.id },
    data: { nextCreditRefillAt: next },
  });
  console.log(
    `[CREDITS] Backfilled nextCreditRefillAt for user ${user.id} -> ${next.toISOString()}`
  );
  return next;
}

/**
 * Check and refill monthly credits for a single user if due.
 * Safe to call frequently — short-circuits when the user isn't eligible or not yet due.
 */
export async function checkAndRefillMonthlyCredits(
  userId: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      trial: true,
      planStartedAt: true,
      nextCreditRefillAt: true,
    },
  });
  if (!user) return;
  if (user.trial !== false) return;
  if (!user.planStartedAt) return;

  const nextRefill = await backfillNextCreditRefillAt(user);
  if (!nextRefill) return;

  if (new Date(nextRefill) <= new Date()) {
    await refillCreditsForUser(userId);
    console.log(`[MONTHLY] Credits refilled on-demand for user ${userId}`);
  }
}

/**
 * Daily scheduled sweep: refill credits for every paid user whose
 * `nextCreditRefillAt` is due. Also seeds `nextCreditRefillAt` for legacy
 * accounts that don't have it yet.
 */
export async function runDailyCreditRefillSweep(): Promise<void> {
  const now = new Date();
  console.log(`[CREDIT-SWEEP] starting at ${now.toISOString()}`);

  // Refill anyone with a due nextCreditRefillAt
  const dueUsers = await prisma.user.findMany({
    where: {
      trial: false,
      planStartedAt: { not: null },
      nextCreditRefillAt: { lte: now },
    },
    select: { id: true },
  });
  for (const u of dueUsers) {
    try {
      await refillCreditsForUser(u.id);
    } catch (err) {
      console.error(`[CREDIT-SWEEP] refill failed for ${u.id}:`, err);
    }
  }

  // Backfill legacy users that don't have nextCreditRefillAt yet
  const legacyUsers = await prisma.user.findMany({
    where: {
      trial: false,
      planStartedAt: { not: null },
      nextCreditRefillAt: null,
    },
    select: { id: true, trial: true, planStartedAt: true, nextCreditRefillAt: true },
  });
  for (const u of legacyUsers) {
    try {
      await backfillNextCreditRefillAt(u);
    } catch (err) {
      console.error(`[CREDIT-SWEEP] backfill failed for ${u.id}:`, err);
    }
  }

  console.log(
    `[CREDIT-SWEEP] done — refilled=${dueUsers.length}, backfilled=${legacyUsers.length}`
  );
}

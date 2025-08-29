// server/lib/trial.ts
import { prisma } from "./prisma";

/**
 * Check if a user's trial has expired
 * @param user - The user object from database
 * @returns true if trial has expired, false otherwise
 */
export function isTrialExpired(user: any): boolean {
  if (!user.trial) {
    // If not in trial mode, consider it "expired" for credit purposes
    return true;
  }

  const createdAt = new Date(user.createdAt);
  const trialDurationDays = user.trialDurationDays || 7;
  const trialEndDate = new Date(createdAt.getTime() + (trialDurationDays * 24 * 60 * 60 * 1000));
  const now = new Date();

  return now > trialEndDate;
}

/**
 * Check if monthly credits need to be refilled
 * @param user - The user object from database
 * @returns true if credits should be refilled, false otherwise
 */
export function shouldRefillMonthlyCredits(user: any): boolean {
  if (user.trial || !user.planStartedAt) {
    return false; // No refill for trial users or users without plan
  }

  const planStartedAt = new Date(user.planStartedAt);
  const now = new Date();
  const monthsSincePlanStart = (now.getFullYear() - planStartedAt.getFullYear()) * 12 + 
    (now.getMonth() - planStartedAt.getMonth());

  // Check if it's been at least 1 month since plan started
  return monthsSincePlanStart >= 1;
}

/**
 * Get credits for a location based on plan
 * @param plan - The plan name
 * @returns Object with smsCredits and customerCredits
 */
export function getCreditsForPlan(plan: string): { smsCredits: number; customerCredits: number } {
  switch (plan) {
    case "Starter":
      return { smsCredits: 200, customerCredits: 50 };
    case "Professional":
      return { smsCredits: 500, customerCredits: 100 };
    case "Custom":
      return { smsCredits: 5000, customerCredits: 1000 };
    default:
      return { smsCredits: 200, customerCredits: 50 };
  }
}

/**
 * Get credits for a location based on trial status
 * @param user - The user object from database
 * @param plan - The plan name
 * @returns Object with smsCredits and customerCredits
 */
export function getCreditsForLocation(user: any, plan: string): { smsCredits: number; customerCredits: number } {
  // If trial has expired, return 0 credits regardless of plan
  if (isTrialExpired(user)) {
    return { smsCredits: 0, customerCredits: 0 };
  }

  // If trial is active, return credits based on plan
  return getCreditsForPlan(plan);
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
      locations: true,
    },
  });

  if (!user) return;

  // If trial has expired, set all locations to 0 credits
  if (isTrialExpired(user)) {
    console.log(`[TRIAL] User ${user.id} trial has expired, enforcing 0 credits`);
    
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
    
    console.log(`[TRIAL] Updated ${locations.length} locations to 0 credits for user ${user.id}`);
  } else {
    console.log(`[TRIAL] User ${user.id} trial is still active`);
  }
}

/**
 * Validate and enforce credits when adding a new location
 * @param user - The user object from database
 * @param address - The address for the new location
 * @returns The location object with proper credits
 */
export function createLocationWithTrialEnforcement(user: any, address: string): any {
  const credits = getCreditsForLocation(user, (user as any).plan);
  
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
 * Refill credits for all locations based on plan
 * @param userId - The user ID
 * @param plan - The plan name
 */
export async function refillCreditsForPlan(userId: string, plan: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locations: true },
  });

  if (!user) return;

  const locations = ((user as any).locations as any[]) || [];
  const credits = getCreditsForPlan(plan);
  
  const updatedLocations = locations.map((location: any) => ({
    ...location,
    smsCredits: credits.smsCredits,
    customerCredits: credits.customerCredits,
  }));

  await prisma.user.update({
    where: { id: userId },
    data: { locations: updatedLocations as any },
  });

  console.log(`[CREDITS] Refilled credits for user ${userId} with plan ${plan}`);
}

/**
 * Handle plan purchase - refill credits and set planStartedAt
 * @param userId - The user ID
 * @param plan - The plan name
 */
export async function handlePlanPurchase(userId: string, plan: string): Promise<void> {
  // Set planStartedAt to current time
  await prisma.user.update({
    where: { id: userId },
    data: { 
      planStartedAt: new Date(),
      trial: false, // End trial
    },
  });

  // Refill credits for all locations
  await refillCreditsForPlan(userId, plan);

  console.log(`[PLAN] User ${userId} purchased plan ${plan}, credits refilled`);
}

/**
 * Check and refill monthly credits if needed
 * @param userId - The user ID
 */
export async function checkAndRefillMonthlyCredits(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      trial: true,
      plan: true,
      planStartedAt: true,
      locations: true,
    },
  });

  if (!user) return;

  if (shouldRefillMonthlyCredits(user)) {
    await refillCreditsForPlan(userId, (user as any).plan);
    console.log(`[MONTHLY] Monthly credits refilled for user ${userId}`);
  }
}

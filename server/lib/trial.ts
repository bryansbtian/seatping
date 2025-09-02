// server/lib/trial.ts
import { prisma } from "./prisma";

/**
 * Check if a user's trial has expired
 * @param user - The user object from database
 * @returns true if trial has expired, false otherwise
 */
export function isTrialExpired(user: any): boolean {
  // Trial expires when account is more than 7 days old, regardless of trial field
  // trial = false means user purchased a plan, NOT that trial expired
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
  // Only refill for users who have purchased a plan (trial = false) and have planStartedAt
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
    default:
      return { smsCredits: 200, customerCredits: 50 };
  }
}

/**
 * Get base credits for a user based on their plan
 * @param user - The user object from database
 * @returns Object with baseSMSCredits and baseCustomerCredits
 */
export function getBaseCreditsForUser(user: any): { baseSMSCredits: number; baseCustomerCredits: number } {
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
export function getCreditsForLocation(user: any): { smsCredits: number; customerCredits: number } {
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

  // Check if trial has expired (account > 7 days old)
  if (isTrialExpired(user)) {
    if (user.trial === true) {
      // Trial expired and user is still in trial mode - set all credits to 0
      console.log(`[TRIAL] User ${user.id} trial has expired (account > 7 days old) and trial = true, enforcing 0 credits`);
      
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
      // Trial expired but user has purchased a plan - keep credits as per plan
      console.log(`[TRIAL] User ${user.id} trial has expired (account > 7 days old) but trial = false, keeping plan credits`);
      
      const locations = ((user as any).locations as any[]) || [];
      
      const updatedLocations = locations.map((location: any) => ({
        ...location,
        smsCredits: user.baseSMSCredits || 0,
        customerCredits: user.baseCustomerCredits || 0,
      }));

      await prisma.user.update({
        where: { id: userId },
        data: { locations: updatedLocations as any },
      });
      
      console.log(`[TRIAL] Updated ${locations.length} locations to plan credits for user ${user.id}`);
    }
  } else {
    console.log(`[TRIAL] User ${user.id} trial is still active (account ≤ 7 days old)`);
  }
}

/**
 * Validate and enforce credits when adding a new location
 * @param user - The user object from database
 * @param address - The address for the new location
 * @returns The location object with proper credits
 */
export function createLocationWithTrialEnforcement(user: any, address: string): any {
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
 * Refill credits for all locations based on user's base credits
 * @param userId - The user ID
 * @param plan - The plan name
 */
export async function refillCreditsForPlan(userId: string, plan: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { 
      locations: true,
      baseSMSCredits: true,
      baseCustomerCredits: true,
    },
  });

  if (!user) return;

  const locations = ((user as any).locations as any[]) || [];
  
  const updatedLocations = locations.map((location: any) => ({
    ...location,
    smsCredits: user.baseSMSCredits || 0,
    customerCredits: user.baseCustomerCredits || 0,
  }));

  await prisma.user.update({
    where: { id: userId },
    data: { locations: updatedLocations as any },
  });

  console.log(`[CREDITS] Refilled credits for user ${userId} with base credits: SMS=${user.baseSMSCredits}, Customers=${user.baseCustomerCredits}`);
}

/**
 * Handle plan purchase - refill credits and set planStartedAt
 * @param userId - The user ID
 * @param plan - The plan name
 */
export async function handlePlanPurchase(userId: string, plan: string): Promise<void> {
  const planCredits = getCreditsForPlan(plan);
  
  // Set plan, planStartedAt to current time, mark as not in trial, set base credits, and update maxLocations
  await prisma.user.update({
    where: { id: userId },
    data: { 
      plan: plan,
      planStartedAt: new Date(),
      trial: false, // User has purchased a plan (NOT that trial expired)
      baseSMSCredits: planCredits.smsCredits,
      baseCustomerCredits: planCredits.customerCredits,
      maxLocations: plan === "Professional" ? 3 : 1, // Update maxLocations based on plan
      locations: [], // Delete all locations when changing plans
    },
  });

  console.log(`[PLAN] User ${userId} purchased plan ${plan}, base credits set, maxLocations updated, and all locations deleted`);
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

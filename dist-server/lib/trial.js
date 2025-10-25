import { prisma } from "./prisma.js";

export function isTrialExpired(user) {
  const createdAt = new Date(user.createdAt);
  const trialDurationDays =
    typeof user.trialDurationDays === "number" ? user.trialDurationDays : 7;
  const trialEndDate = new Date(
    createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000
  );
  const now = new Date();
  return now > trialEndDate;
}

export function shouldRefillMonthlyCredits(user) {
  if (user.trial || !user.planStartedAt) {
    return false;
  }
  const planStartedAt = new Date(user.planStartedAt);
  const now = new Date();
  const billingDayOfMonth = planStartedAt.getDate();
  let nextBillingDate = new Date(planStartedAt);
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  while (nextBillingDate <= now) {
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  }

  const previousBillingDate = new Date(nextBillingDate);
  previousBillingDate.setMonth(previousBillingDate.getMonth() - 1);

  return now >= previousBillingDate && planStartedAt < previousBillingDate;
}

export function getCreditsForPlan(plan) {
  switch (plan) {
    case "Starter":
      return { smsCredits: 300, customerCredits: 300 };
    case "Professional":
      return { smsCredits: 1500, customerCredits: 1500 };
    default:
      return { smsCredits: 300, customerCredits: 300 };
  }
}

export function getBaseCreditsForUser(user) {
  const planCredits = getCreditsForPlan(user.plan);
  return {
    baseSMSCredits: planCredits.smsCredits,
    baseCustomerCredits: planCredits.customerCredits,
  };
}

export function getCreditsForLocation(user) {
  if (isTrialExpired(user) && user.trial === true) {
    return { smsCredits: 0, customerCredits: 0 };
  }

  if (isTrialExpired(user) && user.trial === false) {
    return {
      smsCredits: user.baseSMSCredits || 0,
      customerCredits: user.baseCustomerCredits || 0,
    };
  }

  return {
    smsCredits: user.baseSMSCredits || 0,
    customerCredits: user.baseCustomerCredits || 0,
  };
}

export async function enforceTrialExpiration(userId) {
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

  if (isTrialExpired(user)) {
    if (user.trial === true) {
      console.log(
        `[TRIAL] User ${user.id} trial has expired (account > 7 days old) and trial = true, enforcing 0 credits`
      );
      const locations = user.locations || [];
      const updatedLocations = locations.map((location) => ({
        ...location,
        smsCredits: 0,
        customerCredits: 0,
      }));
      await prisma.user.update({
        where: { id: userId },
        data: { locations: updatedLocations },
      });
      console.log(
        `[TRIAL] Updated ${locations.length} locations to 0 credits for user ${user.id}`
      );
    } else {
      console.log(
        `[TRIAL] User ${user.id} trial has expired (account > 7 days old) but trial = false, keeping plan credits`
      );
      const locations = user.locations || [];
      const updatedLocations = locations.map((location) => ({
        ...location,
        smsCredits: user.baseSMSCredits || 0,
        customerCredits: user.baseCustomerCredits || 0,
      }));
      await prisma.user.update({
        where: { id: userId },
        data: { locations: updatedLocations },
      });
      console.log(
        `[TRIAL] Updated ${locations.length} locations to plan credits for user ${user.id}`
      );
    }
  } else {
    console.log(
      `[TRIAL] User ${user.id} trial is still active (account ≤ 7 days old)`
    );
  }
}

export function createLocationWithTrialEnforcement(user, address) {
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

export async function refillCreditsForPlan(userId, plan) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      locations: true,
      baseSMSCredits: true,
      baseCustomerCredits: true,
      planStartedAt: true,
    },
  });
  if (!user) return;
  const locations = user.locations || [];
  const updatedLocations = locations.map((location) => ({
    ...location,
    smsCredits: user.baseSMSCredits || 0,
    customerCredits: user.baseCustomerCredits || 0,
  }));

  const currentPlanStartedAt = user.planStartedAt
    ? new Date(user.planStartedAt)
    : new Date();
  const newPlanStartedAt = new Date(currentPlanStartedAt);
  newPlanStartedAt.setMonth(newPlanStartedAt.getMonth() + 1);
  await prisma.user.update({
    where: { id: userId },
    data: {
      locations: updatedLocations,
      planStartedAt: newPlanStartedAt,
    },
  });
  console.log(
    `[CREDITS] Refilled credits for user ${userId} with base credits: SMS=${user.baseSMSCredits}, Customers=${user.baseCustomerCredits}`
  );
  console.log(
    `[CREDITS] Updated planStartedAt from ${currentPlanStartedAt.toISOString()} to ${newPlanStartedAt.toISOString()}`
  );
}

export async function handlePlanPurchase(userId, plan) {
  const planCredits = getCreditsForPlan(plan);

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: plan,
      planStartedAt: new Date(),
      trial: false,
      baseSMSCredits: planCredits.smsCredits,
      baseCustomerCredits: planCredits.customerCredits,
      maxLocations: plan === "Professional" ? 3 : 1,
      locations: [],
    },
  });
  console.log(
    `[PLAN] User ${userId} purchased plan ${plan}, base credits set, maxLocations updated, and all locations deleted`
  );
}

export async function checkAndRefillMonthlyCredits(userId) {
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
    await refillCreditsForPlan(userId, user.plan);
    console.log(`[MONTHLY] Monthly credits refilled for user ${userId}`);
  }
}

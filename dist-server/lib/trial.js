// server/lib/trial.ts
//
// Credit + trial logic for BUSINESS accounts.
//
// Business accounts live in the `businesses` collection (prisma.business) and
// each business owns rows in the `locations` collection (prisma.location).
// Credits are tracked per location.
//
// There are no plans — billing is manual. Every business starts on a 7-day
// trial with 300 base credits and 1 location. A business is "activated" by an
// admin turning `trial` off, which stamps `creditsStartedAt` and anchors the
// monthly credit refill from that moment.
import { prisma } from "./prisma.js";
/** Default base credits granted to a new business and its locations. */
export const DEFAULT_BASE_CREDITS = 300;
/**
 * Check if a business's trial has expired
 * @param business - The business object from database
 * @returns true if trial has expired, false otherwise
 */
export function isTrialExpired(business) {
    // Trial expires when the account is more than `trialDurationDays` old,
    // regardless of the trial field. trial = false means the business was
    // manually activated, NOT that the trial expired.
    const createdAt = new Date(business.createdAt);
    const trialDurationDays = typeof business.trialDurationDays === "number"
        ? business.trialDurationDays
        : 7;
    const trialEndDate = new Date(createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    return now > trialEndDate;
}
/**
 * Compute the first monthly anchor that is strictly after `now`, starting from `anchor`.
 * Uses calendar-month arithmetic, so cycles are 28-31 days long.
 */
export function nextMonthlyAnchorAfter(anchor, now) {
    const next = new Date(anchor);
    while (next <= now) {
        next.setMonth(next.getMonth() + 1);
    }
    return next;
}
/**
 * Compute the next refill date for a business given their credits-cycle anchor
 * (`creditsStartedAt`). Always returns the first monthly anchor strictly after `now`.
 */
export function computeNextRefillDate(creditsStartedAt, now = new Date()) {
    return nextMonthlyAnchorAfter(creditsStartedAt, now);
}
/**
 * Check if monthly credits need to be refilled.
 * Returns true only for activated businesses (trial === false) whose next
 * refill date has arrived.
 */
export function shouldRefillMonthlyCredits(business) {
    if (business.trial !== false)
        return false;
    if (!business.creditsStartedAt)
        return false;
    if (!business.nextCreditRefillAt)
        return false;
    const now = new Date();
    return new Date(business.nextCreditRefillAt) <= now;
}
/**
 * Base (monthly) credits for a business. Plans are gone, so this is simply the
 * business's configured `baseCredits` (defaults to 300).
 * @param business - The business object from database
 */
export function getBaseCreditsForUser(business) {
    return typeof business?.baseCredits === "number"
        ? business.baseCredits
        : DEFAULT_BASE_CREDITS;
}
/**
 * Credits a new/refilled location should start with, based on trial status.
 * @param business - The business object from database
 */
export function getCreditsForLocation(business) {
    // Trial expired while still in trial mode -> no credits.
    if (isTrialExpired(business) && business.trial === true) {
        return 0;
    }
    // Active trial, or manually activated -> base credits.
    return getBaseCreditsForUser(business);
}
/**
 * Build a Prisma `Location` create payload for a business, with credits derived
 * from the business's trial status. The returned object is ready to pass to
 * `prisma.location.create({ data })`.
 *
 * Accepts either a plain address string (legacy) or a details object carrying
 * the Google Places fields + the customer-facing displayName.
 * @param business - The business object (must include id + username)
 * @param location - Address string, or location details object
 */
export function buildLocationData(business, location) {
    const credits = getCreditsForLocation(business);
    const baseCredits = getBaseCreditsForUser(business);
    const d = typeof location === "string" ? { address: location } : location;
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
        queue: [],
        admittedCustomers: [],
        removedCustomers: [],
        credits,
        baseCredits,
    };
}
/**
 * Enforce trial expiration on all of a business's locations.
 * If the trial has expired while still in trial mode, every location's credits
 * are zeroed out.
 * @param businessId - The business ID
 */
export async function enforceTrialExpiration(businessId) {
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
    if (!business)
        return;
    if (isTrialExpired(business) && business.trial === true) {
        console.log(`[TRIAL] Business ${business.id} trial expired and trial = true, enforcing 0 credits on all locations`);
        const result = await prisma.location.updateMany({
            where: { businessId },
            data: { credits: 0 },
        });
        console.log(`[TRIAL] Zeroed credits on ${result.count} locations for business ${business.id}`);
    }
    else if (isTrialExpired(business) && business.trial === false) {
        console.log(`[TRIAL] Business ${business.id} manually activated (trial = false), credits managed by monthly refill logic`);
    }
    else {
        console.log(`[TRIAL] Business ${business.id} trial is still active`);
    }
}
/**
 * Refill credits for all of a business's locations to the base credits.
 * Leaves `creditsStartedAt` unchanged and advances `nextCreditRefillAt` to the
 * next monthly anchor strictly after `now`.
 *
 * Caller is responsible for ensuring the business is eligible (trial === false,
 * creditsStartedAt set, refill is actually due).
 */
export async function refillCreditsForUser(businessId) {
    const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
            baseCredits: true,
            creditsStartedAt: true,
        },
    });
    if (!business || !business.creditsStartedAt)
        return;
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
    console.log(`[CREDITS] Refilled business ${businessId} (credits=${business.baseCredits}); nextCreditRefillAt=${nextRefill.toISOString()}`);
}
/**
 * For activated businesses with `creditsStartedAt` set but no
 * `nextCreditRefillAt`, seed `nextCreditRefillAt` to the next monthly anchor
 * strictly after now. Does NOT perform a refill.
 */
async function backfillNextCreditRefillAt(business) {
    if (business.trial !== false)
        return null;
    if (!business.creditsStartedAt)
        return null;
    if (business.nextCreditRefillAt)
        return business.nextCreditRefillAt;
    const next = computeNextRefillDate(new Date(business.creditsStartedAt));
    await prisma.business.update({
        where: { id: business.id },
        data: { nextCreditRefillAt: next },
    });
    console.log(`[CREDITS] Backfilled nextCreditRefillAt for business ${business.id} -> ${next.toISOString()}`);
    return next;
}
/**
 * Check and refill monthly credits for a single business if due.
 * Safe to call frequently — short-circuits when not eligible or not yet due.
 */
export async function checkAndRefillMonthlyCredits(businessId) {
    const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
            id: true,
            trial: true,
            creditsStartedAt: true,
            nextCreditRefillAt: true,
        },
    });
    if (!business)
        return;
    if (business.trial !== false)
        return;
    if (!business.creditsStartedAt)
        return;
    const nextRefill = await backfillNextCreditRefillAt(business);
    if (!nextRefill)
        return;
    if (new Date(nextRefill) <= new Date()) {
        await refillCreditsForUser(businessId);
        console.log(`[MONTHLY] Credits refilled on-demand for business ${businessId}`);
    }
}
/**
 * Daily scheduled sweep: refill credits for every activated business whose
 * `nextCreditRefillAt` is due. Also seeds `nextCreditRefillAt` for accounts that
 * were activated but don't have it yet.
 */
export async function runDailyCreditRefillSweep() {
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
        }
        catch (err) {
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
        }
        catch (err) {
            console.error(`[CREDIT-SWEEP] backfill failed for ${b.id}:`, err);
        }
    }
    console.log(`[CREDIT-SWEEP] done — refilled=${dueBusinesses.length}, backfilled=${legacyBusinesses.length}`);
}

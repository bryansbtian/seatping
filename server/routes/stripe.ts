// server/routes/stripe.ts  (adjust the path/filename to match your project)
import express from "express";
import Stripe from "stripe";
// ⬇️ Adjust this import to your project structure if needed (e.g., "../prisma" or "../lib/prisma")
import { prisma } from "../lib/prisma";

const router = express.Router();

// 🔒 Require a SECRET key (sk_...). Crash early if misconfigured.
if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith("sk_")) {
  throw new Error("Invalid STRIPE_SECRET_KEY (must start with sk_)");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // apiVersion: "2024-06-20", // optional
});

// ===== Price IDs (env wins; defaults fall back to what you shared) =====
const PRICE_IDS = {
  "Starter Monthly": process.env.STRIPE_PRICE_STARTER_MONTHLY ?? "price_1S5GXlDHwj4NMuGRzrNP0h6Y",
  "Starter Yearly": process.env.STRIPE_PRICE_STARTER_YEARLY ?? "price_1S5GisDHwj4NMuGRvS2GIgze",
  "Professional Monthly": process.env.STRIPE_PRICE_PRO_MONTHLY ?? "price_1S5GaEDHwj4NMuGRnRGHxklm",
  "Professional Yearly": process.env.STRIPE_PRICE_PRO_YEARLY ?? "price_1S5Gn4DHwj4NMuGR4yoViRmE",
} as const;

type PlanName = "Starter" | "Professional";

const PLAN_RULES: Record<PlanName, { plan: PlanName; baseCustomerCredits: number; baseSMSCredits: number; maxLocations: number }> = {
  Starter: { plan: "Starter", baseCustomerCredits: 50, baseSMSCredits: 200, maxLocations: 1 },
  Professional: { plan: "Professional", baseCustomerCredits: 100, baseSMSCredits: 500, maxLocations: 3 },
};

const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:8080";

// ---------- helpers ----------
const priceIdToPlan = (priceId?: string | null): PlanName | null => {
  if (!priceId) return null;
  console.log("[stripe] Looking up plan for priceId:", priceId);
  
  switch (priceId) {
    case PRICE_IDS["Starter Monthly"]:
    case PRICE_IDS["Starter Yearly"]:
      console.log("[stripe] Matched Starter plan");
      return "Starter";
    case PRICE_IDS["Professional Monthly"]:
    case PRICE_IDS["Professional Yearly"]:
      console.log("[stripe] Matched Professional plan");
      return "Professional";
    default:
      console.log("[stripe] No plan match found for priceId:", priceId);
      return null;
  }
};

const normalizePlanName = (name?: string | null): PlanName | null => {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  console.log("[stripe] Normalizing plan name:", name, "->", n);
  
  if (n.startsWith("starter")) return "Starter";
  if (n.startsWith("professional") || n === "pro") return "Professional";
  return null;
};

async function applyPlanToUser(userId: string, plan: PlanName, setStartTime: boolean) {
  const r = PLAN_RULES[plan];
  console.log("[stripe] applying plan", { userId, plan, setStartTime, ...r });
  
  try {
    // Check if user exists first
    console.log("[stripe] Checking if user exists:", userId);
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      console.error("[stripe] ❌ User not found:", userId);
      throw new Error(`User not found: ${userId}`);
    }
    
    console.log("[stripe] User found, current plan:", existingUser.plan, "-> new plan:", plan);
    
    const updateData = {
      plan: r.plan,
      baseCustomerCredits: r.baseCustomerCredits,
      baseSMSCredits: r.baseSMSCredits,
      maxLocations: r.maxLocations,
      trial: false,                               // 🔒 ensure trial is OFF
      ...(setStartTime ? { planStartedAt: new Date() } : {}),
      updatedAt: new Date(),
    };
    
    console.log("[stripe] Updating user with data:", updateData);
    
    const result = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
    
    console.log("[stripe] ✅ user updated successfully", { 
      userId, 
      oldPlan: existingUser.plan,
      newPlan: result.plan,
      trial: result.trial,
      planStartedAt: result.planStartedAt 
    });

    // After updating the user's plan and base credits, update existing locations' credits
    try {
      const userWithLocations = await prisma.user.findUnique({
        where: { id: userId },
        select: { locations: true, baseSMSCredits: true, baseCustomerCredits: true },
      });

      const locations = ((userWithLocations as any)?.locations as any[]) || [];
      if (locations.length > 0) {
        const updatedLocations = locations.map((location: any) => ({
          ...location,
          smsCredits: (userWithLocations as any)?.baseSMSCredits || 0,
          customerCredits: (userWithLocations as any)?.baseCustomerCredits || 0,
        }));

        await prisma.user.update({
          where: { id: userId },
          data: { locations: updatedLocations as any },
        });

        console.log(
          `[stripe] ✅ Updated ${locations.length} existing locations with base credits (SMS=${(userWithLocations as any)?.baseSMSCredits}, Customers=${(userWithLocations as any)?.baseCustomerCredits})`
        );
      } else {
        console.log("[stripe] No existing locations to update for this user");
      }
    } catch (locErr: any) {
      console.error("[stripe] ⚠️ Failed to update locations with base credits:", locErr?.message || locErr);
    }
    return result;
    
  } catch (error: any) {
    console.error("[stripe] ❌ Failed to update user:", {
      userId,
      plan,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

function planKeyToPlan(name: string): PlanName {
  return name.startsWith("Professional") ? "Professional" : "Starter";
}

// ---------- Create Checkout Session (frontend calls this) ----------
router.post("/create-checkout-session", express.json(), async (req, res) => {
  try {
    console.log("[stripe] Creating checkout session with body:", req.body);
    
    const { planKey, userId } = req.body as { planKey?: keyof typeof PRICE_IDS; userId?: string };
    if (!planKey || !(planKey in PRICE_IDS)) {
      console.error("[stripe] Invalid planKey:", planKey);
      return res.status(400).json({ error: "Invalid or missing planKey" });
    }
    if (!userId) {
      console.error("[stripe] Missing userId");
      return res.status(400).json({ error: "Missing userId" });
    }

    const priceId = PRICE_IDS[planKey];
    const planName = planKeyToPlan(planKey);
    
    console.log("[stripe] Session details:", { planKey, userId, priceId, planName });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_ORIGIN}/business/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_ORIGIN}/pricing`,
      client_reference_id: String(userId),          // ← maps regardless of payer email
      metadata: { plan: planName, userId: userId }, // ← webhook reads this (no guessing)
      allow_promotion_codes: true,
    });

    console.log("[stripe] ✅ Checkout session created:", { sessionId: session.id, url: session.url });
    return res.json({ url: session.url });
  } catch (err: any) {
    console.error("[stripe] ❌ create-checkout-session failed:", err?.message || err);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ---------- Webhook (must be mounted BEFORE any express.json()) ----------
router.post("/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  console.log("=".repeat(80));
  console.log("🚨 STRIPE WEBHOOK RECEIVED 🚨");
  console.log("=".repeat(80));
  console.log("[stripe] 🎯 Webhook received:", {
    hasSignature: !!sig,
    hasSecret: !!whsec,
    bodyLength: req.body?.length,
    contentType: req.headers["content-type"]
  });

  if (!whsec) {
    console.error("[stripe] ❌ Missing STRIPE_WEBHOOK_SECRET");
    return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");
  }
  if (!sig) {
    console.error("[stripe] ❌ Missing stripe-signature header");
    return res.status(400).send("Missing stripe-signature");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, whsec);
    console.log("[stripe] ✅ Webhook signature verified");
  } catch (err: any) {
    console.error("[stripe] ❌ Signature verification failed:", err?.message || err);
    return res.status(400).send(`Webhook Error: ${err?.message || err}`);
  }

  console.log("[stripe] 🎯 Processing event:", {
    type: event.type,
    id: event.id,
    created: new Date(event.created * 1000).toISOString()
  });

  // Add specific logging for subscription events
  if (event.type.includes("subscription")) {
    console.log("[stripe] 🔍 Subscription event details:", {
      type: event.type,
      id: event.id,
      data: JSON.stringify(event.data, null, 2)
    });
  }

  // Add specific logging for invoice events
  if (event.type.includes("invoice")) {
    console.log("[stripe] 🔍 Invoice event details:", {
      type: event.type,
      id: event.id,
      data: JSON.stringify(event.data, null, 2)
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[stripe] 🛒 Checkout session completed:", {
          sessionId: session.id,
          mode: session.mode,
          paymentStatus: session.payment_status,
          clientReferenceId: session.client_reference_id,
          customerId: session.customer,
          metadata: session.metadata
        });

        // Use your own id, not email
        const userId = session.client_reference_id || (session.metadata as any)?.userId;
        console.log("[stripe] session user identification:", {
          userId,
          client_reference_id: session.client_reference_id,
          metaUserId: (session.metadata as any)?.userId,
        });
        
        if (!userId) {
          console.error("[stripe] ❌ no client_reference_id on session", { sessionId: session.id });
          break;
        }

        // Save customerId so portal updates work later
        const customerId = (session.customer as string) || undefined;
        if (customerId) {
          console.log("[stripe] Saving customer ID:", customerId, "for user:", userId);
          try { 
            await prisma.user.update({ 
              where: { id: userId }, 
              data: { customerId } 
            }); 
            console.log("[stripe] ✅ Customer ID saved");
          } catch (error) {
            console.error("[stripe] ❌ Failed to save customer ID:", error);
          }
        }

        // Derive plan (prefer metadata, else inspect line item price/product)
        let plan: PlanName | null = normalizePlanName((session.metadata as any)?.plan) || null;
        console.log("[stripe] Plan from metadata:", plan);
        
        if (!plan) {
          console.log("[stripe] No plan in metadata, fetching session details...");
          const full = await stripe.checkout.sessions.retrieve(session.id, { expand: ["line_items.data.price.product"] });
          const priceId = full?.line_items?.data?.[0]?.price?.id ?? null;
          console.log("[stripe] Price ID from line items:", priceId);
          
          plan = priceIdToPlan(priceId);
          if (!plan) {
            const product = full?.line_items?.data?.[0]?.price?.product as Stripe.Product | undefined;
            console.log("[stripe] Product name from line items:", product?.name);
            plan = normalizePlanName(product?.name);
          }
        }

        if (plan) {
          console.log("[stripe] 🎯 Applying plan:", plan, "to user:", userId);
          try {
            await applyPlanToUser(userId, plan, true);      // first activation → set planStartedAt
            console.log("[stripe] ✅ Plan applied successfully");
          } catch (error) {
            console.error("[stripe] ❌ Failed to apply plan:", error);
          }
        } else {
          console.warn("[stripe] ⚠️ session completed but plan unknown", { sessionId: session.id });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        
        console.log("[stripe] 📋 Subscription event:", {
          type: event.type,
          subscriptionId: sub.id,
          customerId,
          status: sub.status,
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
          currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString()
        });

        console.log("[stripe] 🔍 Looking up user by customerId:", customerId);
        const user = await prisma.user.findFirst({ where: { customerId } });
        if (!user) {
          console.warn("[stripe] ⚠️ no user for customerId on subscription.*", { customerId });
          // Let's also try to find users without customerId to debug
          const allUsers = await prisma.user.findMany({ 
            select: { id: true, email: true, customerId: true, plan: true, trial: true },
            take: 5 
          });
          console.log("[stripe] 🔍 Sample users in database:", allUsers);
          break;
        }

        console.log("[stripe] ✅ Found user for subscription:", { 
          userId: user.id, 
          email: user.email, 
          currentPlan: user.plan,
          currentTrial: user.trial,
          currentPlanStartedAt: user.planStartedAt
        });

        const priceId = sub.items.data[0]?.price?.id;
        let plan = priceIdToPlan(priceId);
        if (!plan) {
          // optional: try product name if price mapping not set
          const price = sub.items.data[0]?.price;
          if (price && typeof price.product !== "string") {
            plan = normalizePlanName(price.product?.name);
          }
        }
        if (!plan) {
          console.warn("[stripe] ⚠️ subscription.* unknown plan", { priceId, subscriptionId: sub.id });
          break;
        }

        // Determine if we should set start time:
        // - For new subscriptions (created event)
        // - When plan changes (upgrade/downgrade)
        // - When user was in trial and now has a paid plan
        const isNewSubscription = event.type === "customer.subscription.created";
        const isPlanChange = user.plan !== plan;
        const isTrialToPaid = user.trial === true;
        
        const setStartTime = isNewSubscription || isPlanChange || isTrialToPaid;
        
        console.log("[stripe] Subscription update analysis:", { 
          isNewSubscription,
          isPlanChange,
          isTrialToPaid,
          currentPlan: user.plan, 
          newPlan: plan, 
          willSetStartTime: setStartTime,
          subscriptionStatus: sub.status
        });
        
        try {
          await applyPlanToUser(user.id, plan, setStartTime);
          console.log("[stripe] ✅ Subscription plan applied successfully", {
            userId: user.id,
            oldPlan: user.plan,
            newPlan: plan,
            setStartTime,
            eventType: event.type
          });
        } catch (error) {
          console.error("[stripe] ❌ Failed to apply subscription plan:", error);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        
        console.log("[stripe] 🗑️ Subscription cancelled:", {
          subscriptionId: sub.id,
          customerId,
          status: sub.status,
          cancelledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null
        });

        const user = await prisma.user.findFirst({ where: { customerId } });
        if (!user) {
          console.warn("[stripe] ⚠️ no user for customerId on subscription deletion", { customerId });
          break;
        }

        console.log("[stripe] Found user for cancelled subscription:", { 
          userId: user.id, 
          email: user.email, 
          currentPlan: user.plan
        });

        // When subscription is cancelled, we should:
        // 1. Keep the user's current plan and credits until the end of the billing period
        // 2. Set trial to true so they can continue using the service until expiry
        // 3. Don't reset planStartedAt as they should keep their current benefits
        
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              trial: true, // Mark as trial so they can continue until period end
              updatedAt: new Date(),
            },
          });
          
          console.log("[stripe] ✅ User marked as trial after subscription cancellation", {
            userId: user.id,
            email: user.email
          });
        } catch (error) {
          console.error("[stripe] ❌ Failed to update user after subscription cancellation:", error);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        // Fallback: ensure trial is OFF if session/subscription events were missed
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        
        console.log("[stripe] 💰 Invoice payment succeeded:", {
          invoiceId: invoice.id,
          customerId,
          amount: invoice.amount_paid,
          subscriptionId: invoice.subscription,
          billingReason: invoice.billing_reason
        });
        
        console.log("[stripe] 🔍 Looking up user by customerId for invoice:", customerId);
        const user = await prisma.user.findFirst({ where: { customerId } });
        if (!user) {
          console.warn("[stripe] ⚠️ no user for invoice customerId", { customerId });
          break;
        }

        // For subscription updates, we need to get the plan from the subscription
        let plan: PlanName | null = null;
        let priceId = invoice.lines.data[0]?.price?.id;
        
        console.log("[stripe] 🔍 Invoice line items:", {
          lineItemsCount: invoice.lines.data.length,
          firstLineItem: invoice.lines.data[0],
          priceId: priceId
        });

        // Try to get plan from price ID first
        if (priceId) {
          plan = priceIdToPlan(priceId);
          console.log("[stripe] 🔍 Plan from price ID:", { priceId, plan });
        }

        // If no plan from price ID and this is a subscription update, get it from the subscription
        if (!plan && invoice.subscription && invoice.billing_reason === "subscription_update") {
          console.log("[stripe] 🔍 Getting plan from subscription for update");
          try {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            const subPriceId = subscription.items.data[0]?.price?.id;
            plan = priceIdToPlan(subPriceId);
            console.log("[stripe] 🔍 Plan from subscription:", { subPriceId, plan });
          } catch (subError) {
            console.error("[stripe] ❌ Failed to retrieve subscription:", subError);
          }
        }

        if (!plan) {
          console.warn("[stripe] ⚠️ invoice payment but unknown plan", { 
            priceId, 
            invoiceId: invoice.id, 
            billingReason: invoice.billing_reason,
            subscriptionId: invoice.subscription 
          });
          break;
        }

        // For invoice payments, we should:
        // - Set start time if user was in trial
        // - Set start time if plan changed
        // - Don't set start time for regular renewals
        const isTrialToPaid = user.trial === true;
        const isPlanChange = user.plan !== plan;
        const isRenewal = invoice.billing_reason === "subscription_cycle";
        
        const setStartTime = isTrialToPaid || isPlanChange;
        
        console.log("[stripe] Invoice payment analysis:", { 
          currentPlan: user.plan, 
          newPlan: plan, 
          currentTrial: user.trial,
          billingReason: invoice.billing_reason,
          isTrialToPaid,
          isPlanChange,
          isRenewal,
          willSetStartTime: setStartTime 
        });
        
        try {
          await applyPlanToUser(user.id, plan, setStartTime);
          console.log("[stripe] ✅ Invoice plan applied successfully", {
            userId: user.id,
            oldPlan: user.plan,
            newPlan: plan,
            setStartTime,
            billingReason: invoice.billing_reason
          });
        } catch (error) {
          console.error("[stripe] ❌ Failed to apply invoice plan:", error);
        }
        break;
      }

      default:
        console.log("[stripe] ℹ️ Ignoring event type:", event.type);
        break;
    }

    console.log("=".repeat(80));
    console.log("✅ WEBHOOK PROCESSED SUCCESSFULLY:", event.type);
    console.log("=".repeat(80));
    return res.json({ received: true });
  } catch (e: any) {
    console.error("[stripe] ❌ Handler error:", {
      message: e?.message,
      stack: e?.stack,
      eventType: event?.type,
      eventId: event?.id
    });
    return res.json({ received: true });
  }
});

// ---------- DEV HELPERS ----------

// Manually apply by userId (ObjectId string)
router.post("/dev/apply", express.json(), async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Disabled in production" });
  }
  const { userId, plan } = req.body as { userId?: string; plan?: PlanName };
  if (!userId || !plan || !["Starter", "Professional"].includes(plan)) {
    return res.status(400).json({ error: "Usage: { userId, plan: 'Starter' | 'Professional' }" });
  }
  try {
    console.log("[stripe] DEV: Applying plan manually:", { userId, plan });
    await applyPlanToUser(userId, plan, true);
    return res.json({ ok: true, userId, plan });
  } catch (e: any) {
    console.error("[stripe] DEV: Manual apply failed:", e?.message || e);
    return res.status(500).json({ error: e?.message || "update failed" });
  }
});

// ✅ DEV-ONLY: apply plan by email (no IDs). Disabled in production.
router.post("/dev/apply-by-email", express.json(), async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Disabled in production" });
  }

  const { email, plan } = req.body as { email?: string; plan?: PlanName };
  if (!email || !plan || !["Starter", "Professional"].includes(plan)) {
    return res
      .status(400)
      .json({ error: "Usage: { email, plan: 'Starter' | 'Professional' }" });
  }

  try {
    console.log("[stripe] DEV: Applying plan by email:", { email, plan });
    
    // case-insensitive email match
    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
    });

    if (!user) {
      console.error("[stripe] DEV: No user found with email:", email);
      return res.status(404).json({ error: "No user with that email" });
    }

    console.log("[stripe] DEV: Found user:", { userId: user.id, email: user.email, currentPlan: user.plan });
    await applyPlanToUser(user.id, plan, true);
    return res.json({ ok: true, userId: user.id, email: user.email, plan });
  } catch (e: any) {
    console.error("[stripe] DEV: apply-by-email failed:", e?.message || e);
    return res.status(500).json({ error: e?.message || "update failed" });
  }
});

// Database connection test
router.get("/dev/db-test", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Disabled in production" });
  }
  
  try {
    console.log("[stripe] DEV: Testing database connection...");
    const userCount = await prisma.user.count();
    const firstUser = await prisma.user.findFirst();
    
    const result = { 
      connected: true, 
      userCount,
      sampleUser: firstUser ? { 
        id: firstUser.id, 
        email: firstUser.email, 
        plan: firstUser.plan,
        trial: firstUser.trial,
        customerId: firstUser.customerId
      } : null
    };
    
    console.log("[stripe] DEV: Database test result:", result);
    res.json(result);
  } catch (error: any) {
    console.error("[stripe] DEV: Database test failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// Environment check
router.get("/dev/env-check", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Disabled in production" });
  }
  
  const envCheck = {
    hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    appOrigin: process.env.APP_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
    priceIds: PRICE_IDS
  };
  
  console.log("[stripe] DEV: Environment check:", envCheck);
  res.json(envCheck);
});

// quick health
router.get("/ping", (_req, res) => res.json({ ok: true }));

// Test webhook endpoint
router.post("/test-webhook", express.json(), (req, res) => {
  console.log("🧪 TEST WEBHOOK CALLED:", req.body);
  res.json({ received: true, body: req.body });
});

// Test database connection and user lookup
router.get("/test-db", async (req, res) => {
  try {
    console.log("🧪 TESTING DATABASE CONNECTION");
    const userCount = await prisma.user.count();
    const users = await prisma.user.findMany({ 
      select: { id: true, email: true, customerId: true, plan: true, trial: true },
      take: 3 
    });
    
    console.log("🧪 DATABASE TEST RESULTS:", { userCount, users });
    res.json({ 
      success: true, 
      userCount, 
      users,
      message: "Database connection working" 
    });
  } catch (error: any) {
    console.error("🧪 DATABASE TEST FAILED:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Manual test for applyPlanToUser function
router.post("/test-apply-plan", express.json(), async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Disabled in production" });
  }
  
  const { userId, plan } = req.body as { userId?: string; plan?: PlanName };
  if (!userId || !plan || !["Starter", "Professional"].includes(plan)) {
    return res.status(400).json({ error: "Usage: { userId, plan: 'Starter' | 'Professional' }" });
  }
  
  try {
    console.log("🧪 MANUAL TEST: Applying plan", { userId, plan });
    const result = await applyPlanToUser(userId, plan, true);
    console.log("🧪 MANUAL TEST: Plan applied successfully", result);
    res.json({ success: true, result });
  } catch (error: any) {
    console.error("🧪 MANUAL TEST: Failed to apply plan:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
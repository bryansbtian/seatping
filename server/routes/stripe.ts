// server/routes/stripe.ts  (adjust the path/filename to match your project)
import express from "express";
import Stripe from "stripe";
// ⬇️ Adjust this import to your project structure if needed (e.g., "../prisma" or "../lib/prisma")
import { prisma } from "../lib/prisma.js";
import { sendPlanChangeEmail, sendSubscriptionCancellationEmail } from "../lib/email.js";

const router = express.Router();

// 🔒 Require a SECRET key (sk_...). Crash early if misconfigured.
if (
  !process.env.STRIPE_SECRET_KEY ||
  !process.env.STRIPE_SECRET_KEY.startsWith("sk_")
) {
  throw new Error("Invalid STRIPE_SECRET_KEY (must start with sk_)");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // apiVersion: "2024-06-20", // optional
});

// ===== Price IDs (env wins; defaults fall back to what you shared) =====
const PRICE_IDS = {
  "Starter Monthly":
    process.env.STRIPE_PRICE_STARTER_MONTHLY ??
    "price_1SEZpZDHwj4NMuGRF47HyAQQ",
  "Starter Yearly":
    process.env.STRIPE_PRICE_STARTER_YEARLY ?? "price_1SEZrNDHwj4NMuGR1cZEJREy",
  "Professional Monthly":
    process.env.STRIPE_PRICE_PRO_MONTHLY ?? "price_1SEZrlDHwj4NMuGRJKbFthwJ",
  "Professional Yearly":
    process.env.STRIPE_PRICE_PRO_YEARLY ?? "price_1SEZs8DHwj4NMuGRC7G1ndkN",
} as const;

type PlanName = "Starter" | "Professional";

const PLAN_RULES: Record<
  PlanName,
  {
    plan: PlanName;
    baseCustomerCredits: number;
    baseSMSCredits: number;
    maxLocations: number;
  }
> = {
  Starter: {
    plan: "Starter",
    baseCustomerCredits: 300,
    baseSMSCredits: 300,
    maxLocations: 1,
  },
  Professional: {
    plan: "Professional",
    baseCustomerCredits: 1500,
    baseSMSCredits: 1500,
    maxLocations: 3,
  },
};

const APP_ORIGIN = process.env.APP_ORIGIN ?? "https://www.seatping.biz";

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

async function applyPlanToUser(
  userId: string,
  plan: PlanName,
  setStartTime: boolean
) {
  const r = PLAN_RULES[plan];
  console.log("[stripe] applying plan", { userId, plan, setStartTime, ...r });

  try {
    // Check if user exists first
    console.log("[stripe] Checking if user exists:", userId);
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existingUser) {
      console.error("[stripe] ❌ User not found:", userId);
      throw new Error(`User not found: ${userId}`);
    }

    console.log(
      "[stripe] User found, current plan:",
      existingUser.plan,
      "-> new plan:",
      plan
    );

    const updateData = {
      plan: r.plan,
      baseCustomerCredits: r.baseCustomerCredits,
      baseSMSCredits: r.baseSMSCredits,
      maxLocations: r.maxLocations,
      trial: false, // 🔒 ensure trial is OFF
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
      planStartedAt: result.planStartedAt,
    });

    // After updating the user's plan and base credits, update existing locations' credits
    try {
      const userWithLocations = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          locations: true,
          baseSMSCredits: true,
          baseCustomerCredits: true,
        },
      });

      const locations = (userWithLocations?.locations as { address: string; queue: string[] }[]) || [];
      if (locations.length > 0) {
        const updatedLocations = locations.map((location: { address: string; queue: string[] }) => ({
          ...location,
          smsCredits: userWithLocations?.baseSMSCredits || 0,
          customerCredits: userWithLocations?.baseCustomerCredits || 0,
        }));

        await prisma.user.update({
          where: { id: userId },
          data: { locations: updatedLocations as { address: string; queue: string[] }[] },
        });

        console.log(
          `[stripe] ✅ Updated ${
            locations.length
          } existing locations with base credits (SMS=${
            userWithLocations?.baseSMSCredits
          }, Customers=${userWithLocations?.baseCustomerCredits})`
        );
      } else {
        console.log("[stripe] No existing locations to update for this user");
      }
    } catch (locErr: any) {
      console.error(
        "[stripe] ⚠️ Failed to update locations with base credits:",
        locErr?.message || locErr
      );
    }
    return result;
  } catch (error: any) {
    console.error("[stripe] ❌ Failed to update user:", {
      userId,
      plan,
      error: error?.message,
      stack: error?.stack,
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

    const { planKey, userId } = req.body as {
      planKey?: keyof typeof PRICE_IDS;
      userId?: string;
    };
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

    console.log("[stripe] Session details:", {
      planKey,
      userId,
      priceId,
      planName,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_ORIGIN}/business/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_ORIGIN}/pricing`,
      client_reference_id: String(userId), // ← maps regardless of payer email
      metadata: { plan: planName, userId: userId }, // ← webhook reads this (no guessing)
      allow_promotion_codes: true,
    });

    console.log("[stripe] ✅ Checkout session created:", {
      sessionId: session.id,
      url: session.url,
    });
    return res.json({ url: session.url });
  } catch (err: any) {
    console.error(
      "[stripe] ❌ create-checkout-session failed:",
      err?.message || err
    );
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
    contentType: req.headers["content-type"],
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
    console.error(
      "[stripe] ❌ Signature verification failed:",
      err?.message || err
    );
    return res.status(400).send(`Webhook Error: ${err?.message || err}`);
  }

  console.log("[stripe] 🎯 Processing event:", {
    type: event.type,
    id: event.id,
    created: new Date(event.created * 1000).toISOString(),
  });

  // Add specific logging for subscription events
  if (event.type.includes("subscription")) {
    console.log("[stripe] 🔍 Subscription event details:", {
      type: event.type,
      id: event.id,
      data: JSON.stringify(event.data, null, 2),
    });
  }

  // Add specific logging for invoice events
  if (event.type.includes("invoice")) {
    console.log("[stripe] 🔍 Invoice event details:", {
      type: event.type,
      id: event.id,
      data: JSON.stringify(event.data, null, 2),
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
          metadata: session.metadata,
        });

        // Use your own id, not email
        const userId: string | null =
          session.client_reference_id || (session.metadata as { userId: string })?.userId;
        console.log("[stripe] session user identification:", {
          userId,
          client_reference_id: session.client_reference_id,
          metaUserId: (session.metadata as { userId: string })?.userId,
        });

        if (!userId) {
          console.error("[stripe] ❌ no client_reference_id on session", {
            sessionId: session.id,
          });
          break;
        }

        // Save customerId so portal updates work later
        const customerId = (session.customer as string) || undefined;
        if (customerId) {
          console.log(
            "[stripe] Saving customer ID:",
            customerId,
            "for user:",
            userId
          );
          try {
            await prisma.user.update({
              where: { id: userId },
              data: { customerId },
            });
            console.log("[stripe] ✅ Customer ID saved");
          } catch (error) {
            console.error("[stripe] ❌ Failed to save customer ID:", error);
          }
        }

        // Derive plan (prefer metadata, else inspect line item price/product)
        let plan: PlanName | null =
          normalizePlanName((session.metadata as { plan: PlanName })?.plan) || null;
        console.log("[stripe] Plan from metadata:", plan);

        if (!plan) {
          console.log(
            "[stripe] No plan in metadata, fetching session details..."
          );
          const full = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ["line_items.data.price.product"],
          });
          const priceId = full?.line_items?.data?.[0]?.price?.id ?? null;
          console.log("[stripe] Price ID from line items:", priceId);

          plan = priceIdToPlan(priceId);
          if (!plan) {
            const product = full?.line_items?.data?.[0]?.price?.product as
              | Stripe.Product
              | undefined;
            console.log(
              "[stripe] Product name from line items:",
              product?.name
            );
            plan = normalizePlanName(product?.name);
          }
        }

        if (plan) {
          console.log("[stripe] 🎯 Applying plan:", plan, "to user:", userId);
          try {
            const user = await applyPlanToUser(userId, plan, true); // first activation → set planStartedAt
            if (user && user.email) {
              await sendPlanChangeEmail(user.email, plan);
            }
            console.log("[stripe] ✅ Plan applied successfully");
          } catch (error: any) {
            console.error("[stripe] ❌ Failed to apply plan:", error);
          }
        } else {
          console.warn("[stripe] ⚠️ session completed but plan unknown", {
            sessionId: session.id,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("customer.subscription.updated", JSON.stringify(subscription, null, 2));
        const customerId = subscription.customer as string;
        const user = await prisma.user.findFirst({ where: { customerId } });

        if (user) {
          const priceId = subscription.items.data[0]?.price.id;
          const plan = priceIdToPlan(priceId);
          if (plan) {
            await applyPlanToUser(user.id, plan, true);
            if (user.email) {
              await sendPlanChangeEmail(user.email, plan);
            }
          }
        }

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("customer.subscription.deleted", JSON.stringify(subscription, null, 2));
        const customerId = subscription.customer as string;
        const user = await prisma.user.findFirst({ where: { customerId } });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: "Starter",
              trial: true,
              trialDurationDays: 0,
              baseCustomerCredits: PLAN_RULES.Starter.baseCustomerCredits,
              baseSMSCredits: PLAN_RULES.Starter.baseSMSCredits,
              maxLocations: PLAN_RULES.Starter.maxLocations,
            },
          });
          if (user.email) {
            await sendSubscriptionCancellationEmail(user.email);
          }
        }

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        console.log("[stripe] 💰 Invoice paid:", {
          invoiceId: invoice.id,
          customerId,
          amount: invoice.amount_paid,
          subscriptionId: (invoice as any).subscription,
          billingReason: invoice.billing_reason,
        });

        const user = await prisma.user.findFirst({ where: { customerId } });
        if (!user) {
          console.warn("[stripe] ⚠️ no user for invoice customerId", {
            customerId,
          });
          break;
        }

        const priceId = (invoice.lines.data[0] as any)?.price?.id;
        const plan = priceIdToPlan(priceId);

        if (plan) {
          console.log("[stripe] 🎯 Applying plan from invoice:", plan, "to user:", user.id);
          await applyPlanToUser(user.id, plan, true);
        } else {
          console.warn("[stripe] ⚠️ invoice paid but plan unknown", {
            priceId,
            invoiceId: invoice.id,
          });
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
      eventId: event?.id,
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
    return res
      .status(400)
      .json({ error: "Usage: { userId, plan: 'Starter' | 'Professional' }" });
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

    console.log("[stripe] DEV: Found user:", {
      userId: user.id,
      email: user.email,
      currentPlan: user.plan,
    });
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
      sampleUser: firstUser
        ? {
            id: firstUser.id,
            email: firstUser.email,
            plan: firstUser.plan,
            trial: firstUser.trial,
            customerId: firstUser.customerId,
          }
        : null,
    };

    console.log("[stripe] DEV: Database test result:", result);
    res.json(result);
  } catch (error: any) {
    console.error("[stripe] DEV: Database test failed:", error);
    res.status(500).json({ error: error?.message });
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
    priceIds: PRICE_IDS,
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
      select: {
        id: true,
        email: true,
        customerId: true,
        plan: true,
        trial: true,
      },
      take: 3,
    });

    console.log("🧪 DATABASE TEST RESULTS:", { userCount, users });
    res.json({
      success: true,
      userCount,
      users,
      message: "Database connection working",
    });
  } catch (error: any) {
    console.error("🧪 DATABASE TEST FAILED:", error);
    res.status(500).json({
      success: false,
      error: error?.message,
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
    return res
      .status(400)
      .json({ error: "Usage: { userId, plan: 'Starter' | 'Professional' }" });
  }

  try {
    console.log("🧪 MANUAL TEST: Applying plan", { userId, plan });
    const result = await applyPlanToUser(userId, plan, true);
    console.log("🧪 MANUAL TEST: Plan applied successfully", result);
    res.json({ success: true, result });
  } catch (error: any) {
    console.error("🧪 MANUAL TEST: Failed to apply plan:", error);
    res.status(500).json({ success: false, error: error?.message });
  }
});

export default router;

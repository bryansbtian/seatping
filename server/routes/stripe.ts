import express from "express";
import Stripe from "stripe";
import { prisma } from "../lib/prisma";

const router = express.Router();

// 🔒 Ensure we never boot with a publishable key
if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith("sk_")) {
  throw new Error("Invalid STRIPE_SECRET_KEY (must start with sk_)");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // apiVersion: "2024-06-20", // optional
});

const PLAN_RULES = {
  Starter:      { plan: "Starter" as const,      baseCustomerCredits: 50,  baseSMSCredits: 200, maxLocations: 1 },
  Professional: { plan: "Professional" as const, baseCustomerCredits: 100, baseSMSCredits: 500, maxLocations: 3 },
};
type PlanName = keyof typeof PLAN_RULES;

function normalizePlanName(name?: string | null): PlanName | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  if (n.startsWith("starter")) return "Starter";
  if (n.startsWith("professional") || n === "pro") return "Professional";
  return null;
}

/** Determine which plan was purchased (no email involved) */
async function derivePlanFromSession(session: Stripe.Checkout.Session): Promise<PlanName | null> {
  // 1) metadata.plan if you pass it
  const metaPlan = normalizePlanName((session.metadata as any)?.plan);
  if (metaPlan) { console.log("[stripe] plan via metadata:", metaPlan); return metaPlan; }

  // 2) expand price/product
  const full = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items.data.price.product"],
  });

  const priceId = full?.line_items?.data?.[0]?.price?.id ?? null;
  if (priceId) {
    if (process.env.STRIPE_PRICE_STARTER === priceId)      { console.log("[stripe] plan via price id: Starter"); return "Starter"; }
    if (process.env.STRIPE_PRICE_PROFESSIONAL === priceId) { console.log("[stripe] plan via price id: Professional"); return "Professional"; }
  }

  const product = full?.line_items?.data?.[0]?.price?.product as Stripe.Product | undefined;
  const byName = normalizePlanName(product?.name);
  if (byName) { console.log("[stripe] plan via product name:", byName); return byName; }

  console.warn("[stripe] could not derive plan", { sessionId: session.id, priceId, productName: product?.name });
  return null;
}

/** Map session → your user WITHOUT using email */
async function findUserForSession(session: Stripe.Checkout.Session) {
  // ✅ Primary: client_reference_id (must be provided from your app)
  if (session.client_reference_id) {
    const u = await prisma.user.findUnique({ where: { id: session.client_reference_id } });
    if (u) { console.log("[stripe] user via client_reference_id", u.id); return u; }
    console.warn("[stripe] no user for client_reference_id", session.client_refereance_id);
  }

  // ✅ Secondary (optional): metadata.userId if you decide to send it
  const metaUserId = (session.metadata as any)?.userId;
  if (typeof metaUserId === "string" && metaUserId) {
    const u = await prisma.user.findUnique({ where: { id: metaUserId } });
    if (u) { console.log("[stripe] user via metadata.userId", u.id); return u; }
    console.warn("[stripe] no user for metadata.userId", metaUserId);
  }

  // ❌ No email fallback — payer email may differ and should not be required.
  return null;
}

async function applyPlanToUser(userId: string, plan: PlanName) {
  const r = PLAN_RULES[plan];
  console.log("[stripe] applying plan", { userId, plan, ...r });

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: r.plan,
      baseCustomerCredits: r.baseCustomerCredits,
      baseSMSCredits: r.baseSMSCredits,
      maxLocations: r.maxLocations,
      planStartedAt: new Date(),
      trial: false,
      updatedAt: new Date(),
    },
  });

  console.log("[stripe] user updated OK", { userId });
}

router.post(
  "/webhook",
  // tolerant to content-type variations; MUST be mounted before any express.json()
  express.raw({ type: "*/*" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;

    console.log("[stripe] diag:", {
      hasSignature: !!sig,
      bodyIsBuffer: Buffer.isBuffer(req.body),
      contentType: req.headers["content-type"],
      whsecPrefix: whsec ? String(whsec).slice(0, 6) : null,
      skPrefix: process.env.STRIPE_SECRET_KEY?.slice(0, 3),
    });

    if (!whsec) return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");
    if (!sig) return res.status(400).send("Missing stripe-signature");

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, whsec);
    } catch (err: any) {
      console.error("❌ Signature verification failed:", err?.message || err);
      return res.status(400).send(`Webhook Error: ${err?.message || err}`);
    }

    console.log("[stripe] ▶ event received:", event.type);

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;

          // MUST find the user without emails
          const user = await findUserForSession(session);
          if (!user) {
            console.error("[stripe] abort: no matching user; ensure client_reference_id or metadata.userId is sent", {
              sessionId: session.id,
            });
            break;
          }

          const plan = await derivePlanFromSession(session);
          if (!plan) {
            console.error("[stripe] abort: could not derive plan", { sessionId: session.id });
            break;
          }

          await applyPlanToUser(user.id, plan);
          break;
        }

        default:
          console.log("[stripe] unhandled event:", event.type);
      }

      return res.json({ received: true });
    } catch (e) {
      console.error("❌ Error while processing event:", event.type, e);
      return res.json({ received: true });
    }
  }
);

router.get("/ping", (_req, res) => res.json({ ok: true }));

export default router;

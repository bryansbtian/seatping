import express from "express";
import { prisma } from "../lib/prisma";
import Stripe from "stripe";

const router = express.Router();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2025-08-27.basil",
});

// Stripe webhook endpoint
router.post("/webhook", async (req, res) => {
  console.log("🎯 Stripe webhook received!");
  
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Get the raw body
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    console.log("📦 Webhook body received:", {
      hasSignature: !!sig,
      hasSecret: !!endpointSecret,
      bodyLength: body.length,
      contentType: req.headers["content-type"]
    });

    let event: Stripe.Event;

    try {
      if (!endpointSecret) {
        console.error("❌ Stripe webhook secret not configured");
        return res.status(400).send("Webhook secret not configured");
      }
      
      if (!sig) {
        console.error("❌ No Stripe signature found in headers");
        return res.status(400).send("No signature found");
      }
      
      event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
      console.log("✅ Webhook signature verified successfully, event type:", event.type);
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err);
      return res.status(400).send(`Webhook Error: ${err}`);
    }

    // Handle the event
    try {
      console.log(`🔄 Processing event: ${event.type}`);
      
      switch (event.type) {
        case "checkout.session.completed":
          console.log("💳 Processing checkout.session.completed - Payment successful!");
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case "invoice.payment_succeeded":
          console.log("💰 Processing invoice.payment_succeeded - Recurring payment successful!");
          await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        case "customer.subscription.updated":
          console.log("🔄 Processing customer.subscription.updated");
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case "customer.subscription.deleted":
          console.log("❌ Processing customer.subscription.deleted");
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        default:
          console.log(`ℹ️ Unhandled event type: ${event.type}`);
      }

      console.log("✅ Webhook processed successfully");
      res.json({ received: true });
    } catch (error) {
      console.error("❌ Error processing webhook:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });
});

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log("🎉 PAYMENT SUCCESSFUL! Processing checkout session:", session.id);
  
  try {
    // Retrieve the full session with expanded line items (like the working example)
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items']
    });
    
    const customerId = fullSession?.customer;
    const customer = await stripe.customers.retrieve(customerId as string);
    const priceId = fullSession?.line_items?.data[0]?.price?.id;
    
    console.log("📋 Session details:", {
      customerId,
      customerEmail: customer.email,
      priceId
    });
    
    if (!customer.email) {
      console.error("❌ No customer email found");
      return;
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: customer.email }
    });

    if (!user) {
      console.error("❌ User not found for email:", customer.email);
      return;
    }

    console.log("👤 Found user:", user.email, "Current plan:", user.plan, "Trial:", user.trial);
    
    let planName = "Starter";
    let baseCustomerCredits = 50;
    let baseSMSCredits = 200;
    let maxLocations = 1;

    switch (priceId) {
      case "price_1S5GXlDHwj4NMuGRzrNP0h6Y": // Starter Monthly
        planName = "Starter";
        baseCustomerCredits = 50;
        baseSMSCredits = 200;
        maxLocations = 1;
        break;
      case "price_1S5GisDHwj4NMuGRvS2GIgze": // Starter Yearly
        planName = "Starter";
        baseCustomerCredits = 50;
        baseSMSCredits = 200;
        maxLocations = 1;
        break;
      case "price_1S5GaEDHwj4NMuGRnRGHxklm": // Professional Monthly
        planName = "Professional";
        baseCustomerCredits = 100;
        baseSMSCredits = 500;
        maxLocations = 3;
        break;
      case "price_1S5Gn4DHwj4NMuGR4yoViRmE": // Professional Yearly
        planName = "Professional";
        baseCustomerCredits = 100;
        baseSMSCredits = 500;
        maxLocations = 3;
        break;
      default:
        console.error("Unknown price ID:", priceId);
        return;
    }

    // Update user's plan and trial status
    console.log("💾 Updating user database with new plan:", {
      planName,
      baseCustomerCredits,
      baseSMSCredits,
      maxLocations
    });
    
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: planName,
        trial: false,
        baseCustomerCredits,
        baseSMSCredits,
        maxLocations,
        planStartedAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log("🎉 SUCCESS! User account updated:", {
      email: updatedUser.email,
      plan: updatedUser.plan,
      trial: updatedUser.trial,
      baseCustomerCredits: updatedUser.baseCustomerCredits,
      baseSMSCredits: updatedUser.baseSMSCredits,
      maxLocations: updatedUser.maxLocations,
      planStartedAt: updatedUser.planStartedAt
    });
    
    console.log("🚀 User is now on a paid plan and trial is disabled!");
  } catch (error) {
    console.error("Error handling checkout session completed:", error);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log("Processing invoice payment succeeded:", invoice.id);
  
  try {
    const customerEmail = invoice.customer_email;
    
    if (!customerEmail) {
      console.error("No customer email found in invoice");
      return;
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: customerEmail }
    });

    if (!user) {
      console.error("User not found for email:", customerEmail);
      return;
    }

    // Reset credits for the new billing period
    await prisma.user.update({
      where: { id: user.id },
      data: {
        baseCustomerCredits: user.baseCustomerCredits,
        baseSMSCredits: user.baseSMSCredits,
        updatedAt: new Date()
      }
    });

    console.log(`Successfully renewed subscription for user ${user.email}`);
  } catch (error) {
    console.error("Error handling invoice payment succeeded:", error);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("Processing subscription updated:", subscription.id);
  
  try {
    const customerEmail = subscription.metadata?.email;
    
    if (!customerEmail) {
      console.error("No customer email found in subscription metadata");
      return;
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: customerEmail }
    });

    if (!user) {
      console.error("User not found for email:", customerEmail);
      return;
    }

    // Update subscription status
    const isActive = subscription.status === "active";
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        trial: !isActive, // If subscription is not active, put back on trial
        updatedAt: new Date()
      }
    });

    console.log(`Updated subscription status for user ${user.email}: ${subscription.status}`);
  } catch (error) {
    console.error("Error handling subscription updated:", error);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("Processing subscription deleted:", subscription.id);
  
  try {
    const customerEmail = subscription.metadata?.email;
    
    if (!customerEmail) {
      console.error("No customer email found in subscription metadata");
      return;
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email: customerEmail }
    });

    if (!user) {
      console.error("User not found for email:", customerEmail);
      return;
    }

    // Reset user to trial status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan: "Starter",
        trial: true,
        baseCustomerCredits: 50,
        baseSMSCredits: 200,
        maxLocations: 1,
        planStartedAt: null,
        updatedAt: new Date()
      }
    });

    console.log(`Reset user ${user.email} to trial status after subscription cancellation`);
  } catch (error) {
    console.error("Error handling subscription deleted:", error);
  }
}

export default router;

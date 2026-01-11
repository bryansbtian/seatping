import Telnyx from "telnyx";
// server/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import {
  signJwt,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from "../lib/auth.js";
import { LoginSchema, SignUpSchema } from "../lib/validation.js";
import {
  isTrialExpired,
  getCreditsForLocation,
  getCreditsForPlan,
  enforceTrialExpiration,
  createLocationWithTrialEnforcement,
  checkAndRefillMonthlyCredits,
  handlePlanPurchase
} from "../lib/trial.js";
import { sendPasswordResetEmail, sendEmail, sendRegistrationConfirmationEmail, sendPasswordChangeConfirmationEmail, sendQueueJoinConfirmationEmail } from "../lib/email.js";
import crypto from "crypto";

const router = Router();

// Note: Old utility functions replaced with trial-enforced versions in ../lib/trial.ts

/**
 * GET /auth/exists?username=foo
 * Returns: { exists: boolean }
 */
router.get("/exists", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    if (!username)
      return res.status(400).json({ error: "username is required" });
    const user = await prisma.user.findUnique({ where: { username } });
    return res.json({ exists: Boolean(user) });
  } catch (err: any) {
    console.error("[auth] exists error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/locations (protected)
 * Body: { address }
 * - Enforces maxLocations based on user.maxLocations
 * - Pushes a new location object into locations array
 */
router.post("/locations", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const { address } = req.body || {};
    if (!address || typeof address !== "string") {
      return res.status(400).json({ error: "address is required" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "Not found" });

    const locations = ((user as any).locations as any[]) || [];
    const maxLocations = (user as any).maxLocations ?? 1;
    if (locations.length >= maxLocations) {
      return res
        .status(400)
        .json({ error: `Max locations reached (${maxLocations})` });
    }

    // Create new location with proper credits based on plan and trial status
    const newLocation = createLocationWithTrialEnforcement(
      user,
      address
    );

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { locations: [...locations, newLocation] as any },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        plan: true,
        trial: true,
        trialDurationDays: true,
        maxLocations: true,
        planStartedAt: true,
        locations: true,
        createdAt: true,
      },
    });
    return res.json({ user: updated });
  } catch (err: any) {
    console.error("[auth] add location error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/signup
 * Body: { name, username, email, phone, password }
 */
router.post("/signup", async (req, res) => {
  try {
    const parsed = SignUpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.flatten() });
    }

    const { name, username, email, phone, password, plan } = parsed.data;

    // Check duplicates
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true, email: true, username: true },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Email or username already in use" });
    }

    const hash = await bcrypt.hash(password, 12);

    // Set defaults based on plan
    const maxLocations = plan === "Professional" ? 3 : 1;
    const baseCredits = getCreditsForPlan(plan);

    const user = await prisma.user.create({
      data: {
        name,
        username,
        email,
        phone,
        password: hash,
        plan,
        locations: [],
        trial: true,
        trialDurationDays: 7,
        maxLocations,
        baseSMSCredits: baseCredits.smsCredits,
        baseCustomerCredits: baseCredits.customerCredits,
        planStartedAt: null, // Will be set when user actually starts a plan
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        plan: true,
        trial: true,
        trialDurationDays: true,
        maxLocations: true,
        baseSMSCredits: true,
        baseCustomerCredits: true,
        planStartedAt: true,
        createdAt: true,
      },
    });

    // 🔵 Log new user creation (safe fields only)
    console.log("[auth] New user created:", {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
    });

    // Send registration confirmation email (don't wait for it)
    sendRegistrationConfirmationEmail(user.email, user.name, user.username, user.plan || 'Starter')
      .then((sent) => {
        if (sent) {
          console.log('[auth] Registration confirmation email sent to:', user.email);
        } else {
          console.error('[auth] Failed to send registration confirmation email to:', user.email);
        }
      })
      .catch((err) => {
        console.error('[auth] Error sending registration confirmation email:', err);
      });

    const token = signJwt({ sub: user.id });
    setAuthCookie(res, token);

    return res.status(201).json({ user });
  } catch (err: any) {
    console.error("[auth] signup error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/login
 * Body: { emailOrUsername, password }
 */
router.post("/login", async (req, res) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.flatten() });
    }

    const { emailOrUsername, password } = parsed.data;

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailOrUsername }, { username: emailOrUsername }],
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signJwt({ sub: user.id });
    setAuthCookie(res, token);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        phone: user.phone,
        plan: (user as any).plan,
      },
    });
  } catch (err: any) {
    console.error("[auth] login error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/logout
 */
router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/**
 * GET /auth/me  (protected)
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    
    // Enforce trial expiration before returning user data
    await enforceTrialExpiration(userId);
    
    // Check and refill monthly credits if needed
    await checkAndRefillMonthlyCredits(userId);
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        plan: true,
        trial: true,
        trialDurationDays: true,
        maxLocations: true,
        planStartedAt: true,
        locations: true,
        createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: "Not found" });
    res.json({ user });
  } catch (err: any) {
    console.error("[auth] me error:", err?.message || err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /auth/business/:username/addresses
 * Returns: { addresses: Array<{address: string, businessName: string}> }
 */
router.get("/business/:username/addresses", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username)
      return res.status(400).json({ error: "username is required" });

    const user = await prisma.user.findUnique({
      where: { username },
      select: { name: true, locations: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Business not found" });
    }

    const locations = ((user as any).locations as any[]) || [];
    const addresses = locations.map((location: any) => ({
      address: location.address,
      businessName: (user as any).name,
    }));

    return res.json({ addresses });
  } catch (err: any) {
    console.error("[auth] get business addresses error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/business/:username/queue
 * Body: { address, firstName, lastName, numGuests, phoneNumber, waitingPreference }
 * Adds customer to the queue for a specific location
 */
router.post("/business/:username/queue", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username)
      return res.status(400).json({ error: "username is required" });

    const {
      address,
      firstName,
      lastName,
      numGuests,
      phoneNumber,
      countryCode,
      email,
      waitingPreference,
      notificationMethod,
      smsConsent,
      smsMarketingConsent,
    } = req.body || {};

    if (
      !address ||
      !firstName ||
      !lastName ||
      !numGuests ||
      !waitingPreference
    ) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Validate notification method requirements
    if (waitingPreference === "wait_anywhere") {
      if (!notificationMethod) {
        return res
          .status(400)
          .json({ error: "Notification method is required for Wait Anywhere" });
      }

      if (notificationMethod === "sms" || notificationMethod === "whatsapp") {
        if (!phoneNumber) {
          return res
            .status(400)
            .json({ error: "Phone number is required for SMS/WhatsApp notifications" });
        }
        if (notificationMethod === "sms" && !smsConsent) {
          return res
            .status(400)
            .json({ error: "SMS consent is required for SMS notifications" });
        }
      }

      if (notificationMethod === "email") {
        if (!email) {
          return res
            .status(400)
            .json({ error: "Email is required for email notifications" });
        }
      }
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        locations: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Business not found" });
    }

    const locations = ((user as any).locations as any[]) || [];
    const locationIndex = locations.findIndex(
      (loc: any) => loc.address === address
    );

    if (locationIndex === -1) {
      return res.status(404).json({ error: "Location not found" });
    }

    const location = locations[locationIndex];

    // Check if location has enough SMS credits for SMS/WhatsApp notifications
    if (waitingPreference === "wait_anywhere" &&
        (notificationMethod === "sms" || notificationMethod === "whatsapp")) {
      const locationSmsCredits = location.smsCredits || 0;
      if (locationSmsCredits <= 0) {
        return res.status(400).json({
          error:
            "This location has insufficient SMS credits for SMS/WhatsApp notifications",
        });
      }
    }

    // Generate a unique queue token for customer persistence
    const queueToken = crypto.randomBytes(16).toString('hex');

    const customer = {
      firstName,
      lastName,
      numGuests: Number(numGuests),
      phoneNumber: phoneNumber || "",
      countryCode: countryCode || "+1", // Store country code, default to +1
      email: email || "", // Store email for email notifications
      waitingPreference,
      notificationMethod: notificationMethod || "", // Store notification method preference
      smsConsent: smsConsent || false, // Store SMS consent for compliance
      smsMarketingConsent: smsMarketingConsent || false, // Store marketing consent
      joinedAt: new Date().toISOString(),
      position: (location.queue || []).length + 1,
      queueToken, // Store token with customer data
    };

    // Add customer to the queue
    location.queue = [...(location.queue || []), customer];

    // Update the locations array
    locations[locationIndex] = location;

    // Update the business with the new queue
    await prisma.user.update({
      where: { id: (user as any).id },
      data: {
        locations: locations as any,
      },
    });

    // Send confirmation notifications based on notification method
    const businessName = (user as any).name || "the business";

    if (waitingPreference === "wait_anywhere" && notificationMethod) {
      // Send SMS confirmation
      if (notificationMethod === "sms" && phoneNumber) {
        try {
          const telnyxApiKey = process.env.TELNYX_API_KEY;
          const telnyxPhoneNumber = process.env.TELNYX_PHONE_NUMBER;

          if (telnyxApiKey && telnyxPhoneNumber) {
            const telnyx = new Telnyx({ apiKey: telnyxApiKey });

            // Format phone number to E.164 format
            const customerCountryCode = countryCode || "+1";
            const phoneDigitsOnly = phoneNumber.trim().replace(/\D/g, '');
            const formattedPhone = customerCountryCode + phoneDigitsOnly;

            const message = await telnyx.messages.send({
              from: telnyxPhoneNumber,
              to: formattedPhone,
              text: `Hi ${firstName}! You've joined the queue at ${businessName}. You're #${customer.position} in line. We'll text you when it's almost your turn. Reply STOP to opt out. - SeatPing`,
            });

            console.log("[QUEUE-JOIN] SMS confirmation sent successfully:", message.data?.id, "to", formattedPhone);
          } else {
            console.error("[QUEUE-JOIN] Missing Telnyx credentials - cannot send SMS confirmation");
          }
        } catch (error: any) {
          console.error("[QUEUE-JOIN] Failed to send SMS confirmation:", error?.message || error);
          // Don't fail the queue join if SMS fails - just log the error
        }
      }

      // Send email confirmation
      if (notificationMethod === "email" && email) {
        try {
          const emailSent = await sendQueueJoinConfirmationEmail(
            email,
            firstName,
            lastName,
            businessName,
            address,
            customer.position
          );

          if (emailSent) {
            console.log("[QUEUE-JOIN] Email confirmation sent successfully to:", email);
          } else {
            console.error("[QUEUE-JOIN] Failed to send email confirmation to:", email);
          }
        } catch (error: any) {
          console.error("[QUEUE-JOIN] Error sending email confirmation:", error?.message || error);
          // Don't fail the queue join if email fails - just log the error
        }
      }
    }

    return res.json({
      success: true,
      customer,
      position: customer.position,
      businessName: (user as any).name,
      queueToken, // Return token to frontend for persistence
    });
  } catch (err: any) {
    console.error("[auth] add to queue error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /auth/business/:username/queue/token/:queueToken/status
 * Returns: { admitted: boolean, removed: boolean, position?: number, customer?: object, message?: string }
 * Checks customer status by queue token (for persistence after browser refresh)
 */
router.get("/business/:username/queue/token/:queueToken/status", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const queueToken = String(req.params.queueToken || "").trim();

    if (!username || !queueToken) {
      return res
        .status(400)
        .json({ error: "username and queueToken are required" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, name: true, locations: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Business not found" });
    }

    const locations = ((user as any).locations as any[]) || [];

    // Check if customer is still in queue by token
    for (const location of locations) {
      const queue = location.queue || [];
      const customerIndex = queue.findIndex(
        (c: any) => c.queueToken === queueToken
      );

      if (customerIndex !== -1) {
        const customer = queue[customerIndex];
        return res.json({
          admitted: false,
          removed: false,
          position: customerIndex + 1,
          customer,
          address: location.address,
          businessName: (user as any).name,
          message: "Customer is still waiting in queue",
        });
      }
    }

    // Customer not in queue - check if they were admitted or removed
    for (const location of locations) {
      // Check admitted customers
      const admittedCustomers = location.admittedCustomers || [];
      const admittedCustomer = admittedCustomers.find(
        (c: any) => c.queueToken === queueToken
      );

      if (admittedCustomer) {
        return res.json({
          admitted: true,
          removed: false,
          customer: admittedCustomer,
          address: location.address,
          businessName: (user as any).name,
          message: "Customer has been admitted",
        });
      }

      // Check removed customers
      const removedCustomers = location.removedCustomers || [];
      const removedCustomer = removedCustomers.find(
        (c: any) => c.queueToken === queueToken
      );

      if (removedCustomer) {
        return res.json({
          admitted: false,
          removed: true,
          status: removedCustomer.status || "removed",
          customer: removedCustomer,
          address: location.address,
          businessName: (user as any).name,
          message: removedCustomer.status === "left"
            ? "Customer has left the queue"
            : "Customer has been removed from queue",
        });
      }
    }

    // Customer not found anywhere
    return res.json({
      admitted: false,
      removed: false,
      message: "Queue session not found or expired",
    });
  } catch (err: any) {
    console.error("[auth] check customer status by token error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /auth/business/:username/queue/:customerId/status
 * Returns: { admitted: boolean, removed: boolean, position?: number, message?: string }
 * Checks if a specific customer has been admitted or removed
 */
router.get("/business/:username/queue/:customerId/status", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const customerId = String(req.params.customerId || "").trim();

    if (!username || !customerId) {
      return res
        .status(400)
        .json({ error: "username and customerId are required" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, name: true, locations: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Business not found" });
    }

    const locations = ((user as any).locations as any[]) || [];

    // First check if customer is still in queue
    let customerFound = false;
    let customerPosition = 0;

    for (const location of locations) {
      const queue = location.queue || [];
      const customerIndex = queue.findIndex(
        (c: any) => c.firstName + c.lastName + c.joinedAt === customerId
      );

      if (customerIndex !== -1) {
        customerFound = true;
        customerPosition = customerIndex + 1;
        break;
      }
    }

    if (customerFound) {
      // Customer is still in queue (waiting)
      return res.json({
        admitted: false,
        removed: false,
        position: customerPosition,
        message: "Customer is still waiting in queue",
      });
    }

    // Customer not in queue - check if they were admitted or removed
    for (const location of locations) {
      // Check admitted customers
      const admittedCustomers = location.admittedCustomers || [];
      const admittedCustomer = admittedCustomers.find(
        (c: any) => c.firstName + c.lastName + c.joinedAt === customerId
      );

      if (admittedCustomer) {
        return res.json({
          admitted: true,
          removed: false,
          message: "Customer has been admitted",
        });
      }

      // Check removed customers
      const removedCustomers = location.removedCustomers || [];
      const removedCustomer = removedCustomers.find(
        (c: any) => c.firstName + c.lastName + c.joinedAt === customerId
      );

      if (removedCustomer) {
        return res.json({
          admitted: false,
          removed: true,
          status: removedCustomer.status || "removed", // "removed" or "left"
          message: removedCustomer.status === "left" 
            ? "Customer has left the queue" 
            : "Customer has been removed from queue",
        });
      }
    }

    // Customer not found anywhere - might be a new customer or error
    return res.json({
      admitted: false,
      removed: false,
      message: "Customer not found",
    });
  } catch (err: any) {
    console.error("[auth] check customer status error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/business/:username/queue/:customerId/admit (protected)
 * Admits a customer from the queue (they go to Step 5)
 */
router.post(
  "/business/:username/queue/:customerId/admit",
  requireAuth,
  async (req, res) => {
    try {
      const userId = (req as any).auth.sub as string;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();

      if (!username || !customerId) {
        return res
          .status(400)
          .json({ error: "username and customerId are required" });
      }

      // Verify the business user owns this username
      const user = await prisma.user.findFirst({
        where: { id: userId, username },
        select: {
          id: true,
          name: true,
          locations: true,
        },
      });

      if (!user) {
        return res
          .status(404)
          .json({ error: "Business not found or access denied" });
      }

      const locations = ((user as any).locations as any[]) || [];
      let customerFound = false;
      let admittedCustomer = null;
      let locationIndex = -1;

      // Find and remove the customer from queue, marking as admitted
      for (let i = 0; i < locations.length; i++) {
        const queue = locations[i].queue || [];
        const customerIndex = queue.findIndex(
          (c: any) => c.firstName + c.lastName + c.joinedAt === customerId
        );

        if (customerIndex !== -1) {
          admittedCustomer = queue[customerIndex];
          locationIndex = i;

          // Check if location has enough customer credits
          const locationCustomerCredits = locations[i].customerCredits || 0;
          if (locationCustomerCredits <= 0) {
            return res.status(400).json({
              error:
                "This location has insufficient customer credits. Please upgrade your plan.",
            });
          }

          // Mark customer as admitted and remove from queue
          admittedCustomer.status = "admitted";
          admittedCustomer.admittedAt = new Date().toISOString();
          admittedCustomer.finalStatus = "pending"; // Track if customer arrived or was a no-show

          // Send notification to customer when admitted
          console.log("Admitting customer:", admittedCustomer);
          console.log("Customer notification method:", admittedCustomer.notificationMethod);
          console.log("Customer waiting preference:", admittedCustomer.waitingPreference);

          // Send notification based on customer's notification method preference
          if (admittedCustomer.waitingPreference === "wait_anywhere") {
            const businessName = (user as any).name || "The business";

            // Send SMS notification
            if (admittedCustomer.notificationMethod === "sms" && admittedCustomer.phoneNumber && admittedCustomer.phoneNumber.trim() !== "") {
              try {
                const telnyxApiKey = process.env.TELNYX_API_KEY;
                const telnyxPhoneNumber = process.env.TELNYX_PHONE_NUMBER;

                if (!telnyxApiKey || !telnyxPhoneNumber) {
                  console.error('Missing Telnyx credentials:', {
                    hasApiKey: !!telnyxApiKey,
                    hasTelnyxPhone: !!telnyxPhoneNumber
                  });
                  throw new Error('Telnyx credentials not configured');
                }

                const telnyx = new Telnyx({ apiKey: telnyxApiKey });

                // Format phone number to E.164 format using the stored country code
                const customerCountryCode = admittedCustomer.countryCode || "+1";
                let phoneDigitsOnly = admittedCustomer.phoneNumber.trim().replace(/\D/g, '');

                // Construct full phone number with country code
                let formattedPhone = customerCountryCode + phoneDigitsOnly;

                const message = await telnyx.messages.send({
                  from: telnyxPhoneNumber,
                  to: formattedPhone,
                  text: `Good news! It's your turn at ${businessName}. Please proceed to the host within the next 5 minutes. Thank you for using SeatPing!`,
                });
                console.log("SMS notification sent successfully:", message.data?.id, "to", formattedPhone);
              } catch (error: any) {
                console.error('Failed to send SMS notification:', error?.message || error);
                // Don't fail the admission if SMS fails - just log the error
              }
            }
            // Send WhatsApp notification (TODO: implement WhatsApp logic)
            else if (admittedCustomer.notificationMethod === "whatsapp" && admittedCustomer.phoneNumber && admittedCustomer.phoneNumber.trim() !== "") {
              // TODO: Implement WhatsApp notification logic
              console.log("WhatsApp notification not yet implemented - customer:", admittedCustomer.phoneNumber);
            }
            // Send Email notification
            else if (admittedCustomer.notificationMethod === "email" && admittedCustomer.email && admittedCustomer.email.trim() !== "") {
              try {
                const emailHtml = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Good News!</h2>
                    <p style="font-size: 16px;">It's your turn at <strong>${businessName}</strong>!</p>
                    <p style="font-size: 14px;">Please proceed to the host within the next 5 minutes.</p>
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                    <p style="font-size: 12px; color: #6b7280;">Thank you for using SeatPing!</p>
                  </div>
                `;

                const emailSent = await sendEmail({
                  to: admittedCustomer.email,
                  subject: `It's your turn at ${businessName}!`,
                  html: emailHtml,
                });

                if (emailSent) {
                  console.log("Email notification sent successfully to:", admittedCustomer.email);
                } else {
                  console.error("Failed to send email notification to:", admittedCustomer.email);
                }
              } catch (error: any) {
                console.error('Failed to send email notification:', error?.message || error);
                // Don't fail the admission if email fails - just log the error
              }
            } else {
              console.log("No valid notification method or contact info - skipping notification");
            }
          } else {
            console.log("Customer chose 'on_premises' - skipping notification");
          }


          // Store in a separate admitted customers list
          if (!locations[i].admittedCustomers) {
            locations[i].admittedCustomers = [];
          }
          locations[i].admittedCustomers.push(admittedCustomer);

          // Remove from queue
          locations[i].queue.splice(customerIndex, 1);
          customerFound = true;
          break;
        }
      }

      if (!customerFound) {
        return res.status(404).json({ error: "Customer not found in queue" });
      }

      // Calculate credit deductions
      let customerCreditsToDeduct = 1; // Always deduct 1 customer credit when admitting
      let smsCreditsToDeduct = 0; // Initialize SMS credits to deduct

      // Deduct credits from the specific location
      const location = locations[locationIndex];
      location.customerCredits = Math.max(
        0,
        (location.customerCredits || 0) - customerCreditsToDeduct
      );

      // Deduct SMS credit if customer opted for SMS or WhatsApp notifications
      if (admittedCustomer.waitingPreference === "wait_anywhere" &&
          (admittedCustomer.notificationMethod === "sms" || admittedCustomer.notificationMethod === "whatsapp")) {
        smsCreditsToDeduct = 1;
        location.smsCredits = Math.max(
          0,
          (location.smsCredits || 0) - smsCreditsToDeduct
        );
      }

      // Update locations array
      locations[locationIndex] = location;

      // Update the business data with credit deductions
      await prisma.user.update({
        where: { id: userId },
        data: {
          locations: locations as any,
        },
      });

      return res.json({
        success: true,
        customer: admittedCustomer,
        message: "Customer has been admitted",
        creditsDeducted: {
          customerCredits: customerCreditsToDeduct,
          smsCredits: smsCreditsToDeduct,
        },
      });
    } catch (err: any) {
      console.error("[auth] admit customer error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * POST /auth/business/:username/admitted/:customerId/confirm-arrival (protected)
 * Marks an admitted customer as arrived/confirmed
 */
router.post(
  "/business/:username/admitted/:customerId/confirm-arrival",
  requireAuth,
  async (req, res) => {
    try {
      const userId = (req as any).auth.sub as string;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();

      if (!username || !customerId) {
        return res
          .status(400)
          .json({ error: "username and customerId are required" });
      }

      // Verify the business user owns this username
      const user = await prisma.user.findFirst({
        where: { id: userId, username },
        select: { id: true, locations: true },
      });

      if (!user) {
        return res
          .status(404)
          .json({ error: "Business not found or access denied" });
      }

      const locations = ((user as any).locations as any[]) || [];
      let customerFound = false;

      // Find the admitted customer and update their finalStatus
      for (let i = 0; i < locations.length; i++) {
        const admittedCustomers = locations[i].admittedCustomers || [];
        const customerIndex = admittedCustomers.findIndex(
          (c: any) => c.firstName + c.lastName + c.joinedAt === customerId
        );

        if (customerIndex !== -1) {
          admittedCustomers[customerIndex].finalStatus = "arrived";
          admittedCustomers[customerIndex].confirmedAt = new Date().toISOString();
          locations[i].admittedCustomers = admittedCustomers;
          customerFound = true;
          break;
        }
      }

      if (!customerFound) {
        return res.status(404).json({ error: "Admitted customer not found" });
      }

      // Update the business data
      await prisma.user.update({
        where: { id: userId },
        data: {
          locations: locations as any,
        },
      });

      return res.json({
        success: true,
        message: "Customer arrival confirmed",
      });
    } catch (err: any) {
      console.error("[auth] confirm arrival error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * POST /auth/business/:username/admitted/:customerId/mark-no-show (protected)
 * Marks an admitted customer as no-show
 */
router.post(
  "/business/:username/admitted/:customerId/mark-no-show",
  requireAuth,
  async (req, res) => {
    try {
      const userId = (req as any).auth.sub as string;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();

      if (!username || !customerId) {
        return res
          .status(400)
          .json({ error: "username and customerId are required" });
      }

      // Verify the business user owns this username
      const user = await prisma.user.findFirst({
        where: { id: userId, username },
        select: { id: true, locations: true },
      });

      if (!user) {
        return res
          .status(404)
          .json({ error: "Business not found or access denied" });
      }

      const locations = ((user as any).locations as any[]) || [];
      let customerFound = false;

      // Find the admitted customer and update their finalStatus
      for (let i = 0; i < locations.length; i++) {
        const admittedCustomers = locations[i].admittedCustomers || [];
        const customerIndex = admittedCustomers.findIndex(
          (c: any) => c.firstName + c.lastName + c.joinedAt === customerId
        );

        if (customerIndex !== -1) {
          admittedCustomers[customerIndex].finalStatus = "no_show";
          admittedCustomers[customerIndex].noShowMarkedAt = new Date().toISOString();
          locations[i].admittedCustomers = admittedCustomers;
          customerFound = true;
          break;
        }
      }

      if (!customerFound) {
        return res.status(404).json({ error: "Admitted customer not found" });
      }

      // Update the business data
      await prisma.user.update({
        where: { id: userId },
        data: {
          locations: locations as any,
        },
      });

      return res.json({
        success: true,
        message: "Customer marked as no-show",
      });
    } catch (err: any) {
      console.error("[auth] mark no-show error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * DELETE /auth/business/:username/queue/:customerId (protected)
 * Removes a customer from the queue (they get kicked out)
 */
router.delete(
  "/business/:username/queue/:customerId",
  requireAuth,
  async (req, res) => {
    try {
      const userId = (req as any).auth.sub as string;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();

      if (!username || !customerId) {
        return res
          .status(400)
          .json({ error: "username and customerId are required" });
      }

      // Verify the business user owns this username
      const user = await prisma.user.findFirst({
        where: { id: userId, username },
        select: { id: true, name: true, locations: true },
      });

      if (!user) {
        return res
          .status(404)
          .json({ error: "Business not found or access denied" });
      }

      const locations = ((user as any).locations as any[]) || [];
      let customerFound = false;
      let removedCustomer = null;

      // Find and remove the customer from queue, marking as removed
      for (let i = 0; i < locations.length; i++) {
        const queue = locations[i].queue || [];
        const customerIndex = queue.findIndex(
          (c: any) => c.firstName + c.lastName + c.joinedAt === customerId
        );

        if (customerIndex !== -1) {
          removedCustomer = queue[customerIndex];
          // Mark customer as removed
          removedCustomer.status = "removed";
          removedCustomer.removedAt = new Date().toISOString();

          // Store in a separate removed customers list
          if (!locations[i].removedCustomers) {
            locations[i].removedCustomers = [];
          }
          locations[i].removedCustomers.push(removedCustomer);

          // Remove from queue
          locations[i].queue.splice(customerIndex, 1);
          customerFound = true;
          break;
        }
      }

      if (!customerFound) {
        return res.status(404).json({ error: "Customer not found in queue" });
      }

      // Update the business data
      await prisma.user.update({
        where: { id: userId },
        data: { locations: locations as any },
      });

      return res.json({
        success: true,
        customer: removedCustomer,
        message: "Customer has been removed from queue",
      });
    } catch (err: any) {
      console.error("[auth] remove customer error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * POST /auth/business/:username/queue/:customerId/leave
 * Allows a customer to leave the queue themselves
 */
router.post(
  "/business/:username/queue/:customerId/leave",
  async (req, res) => {
    try {
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();

      if (!username || !customerId) {
        return res
          .status(400)
          .json({ error: "username and customerId are required" });
      }

      // Find the business user
      const user = await prisma.user.findFirst({
        where: { username },
        select: { id: true, name: true, locations: true },
      });

      if (!user) {
        return res.status(404).json({ error: "Business not found" });
      }

      const locations = ((user as any).locations as any[]) || [];
      let customerFound = false;
      let removedCustomer = null;

      // Find and remove the customer from queue
      for (let i = 0; i < locations.length; i++) {
        const queue = locations[i].queue || [];
        const customerIndex = queue.findIndex(
          (c: any) => c.firstName + c.lastName + c.joinedAt === customerId
        );

        if (customerIndex !== -1) {
          removedCustomer = queue[customerIndex];
          // Mark customer as left (not removed by business)
          removedCustomer.status = "left";
          removedCustomer.leftAt = new Date().toISOString();

          // Store in a separate removed customers list
          if (!locations[i].removedCustomers) {
            locations[i].removedCustomers = [];
          }
          locations[i].removedCustomers.push(removedCustomer);

          // Remove from queue
          locations[i].queue.splice(customerIndex, 1);
          customerFound = true;
          break;
        }
      }

      if (!customerFound) {
        return res.status(404).json({ error: "Customer not found in queue" });
      }

      // Update the business data
      await prisma.user.update({
        where: { id: user.id },
        data: { locations: locations as any },
      });

      return res.json({
        success: true,
        customer: removedCustomer,
        message: "You have left the queue",
      });
    } catch (err: any) {
      console.error("[auth] customer leave queue error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * PUT /auth/me (protected)
 * Body: { locations } - Updates user locations
 */
router.put("/me", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const { locations } = req.body || {};

    if (!locations || !Array.isArray(locations)) {
      return res.status(400).json({ error: "locations array is required" });
    }

    // Enforce trial expiration before processing updates
    await enforceTrialExpiration(userId);

    // Get current user to access plan information
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, locations: true, trial: true, trialDurationDays: true, createdAt: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentLocations = ((currentUser as any).locations as any[]) || [];

    // Process locations to ensure new ones have credits
    const processedLocations = locations.map((location: any) => {
      // Check if this is a new location (doesn't exist in current locations)
      const existingLocation = currentLocations.find(
        (loc: any) => loc.address === location.address
      );

      if (existingLocation) {
        // Keep existing location with all its data
        return existingLocation;
      } else {
        // New location - initialize with credits based on plan and trial status
        return createLocationWithTrialEnforcement(
          currentUser,
          location.address
        );
      }
    });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { locations: processedLocations as any },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        plan: true,
        trial: true,
        trialDurationDays: true,
        maxLocations: true,
        locations: true,
        createdAt: true,
      },
    });

    return res.json({ user: updated });
  } catch (err: any) {
    console.error("[auth] update me error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/purchase-plan (protected)
 * Body: { plan }
 * Handles plan purchase and credit refill
 */
router.post("/purchase-plan", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).auth.sub as string;
    const { plan } = req.body || {};

    if (!plan || typeof plan !== "string") {
      return res.status(400).json({ error: "plan is required" });
    }

    // Handle plan purchase
    await handlePlanPurchase(userId, plan);

    // Get updated user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        plan: true,
        trial: true,
        trialDurationDays: true,
        maxLocations: true,
        planStartedAt: true,
        locations: true,
        createdAt: true,
      },
    });

    return res.json({ 
      success: true,
      user,
      message: `Successfully upgraded to ${plan} plan`
    });
  } catch (err: any) {
    console.error("[auth] purchase plan error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/forgot-password
 * Body: { email }
 * Sends password reset email
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true }
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ 
        success: true, 
        message: "If an account with that email exists, a password reset link has been sent." 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    // Send password reset email
    const emailSent = await sendPasswordResetEmail(user.email, resetToken);
    
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send email" });
    }

    return res.json({ 
      success: true, 
      message: "If an account with that email exists, a password reset link has been sent." 
    });
  } catch (err: any) {
    console.error("[auth] forgot password error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/reset-password
 * Body: { token, newPassword }
 * Resets password using reset token
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: "token and newPassword are required" });
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    // Send password change confirmation email
    sendPasswordChangeConfirmationEmail(user.email, user.name).catch((err) => {
      console.error("[auth] Failed to send password change confirmation email:", err);
    });

    return res.json({
      success: true,
      message: "Password has been reset successfully"
    });
  } catch (err: any) {
    console.error("[auth] reset password error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/test-email (for debugging)
 * Body: { email }
 * Sends a test email to verify SMTP configuration
 */
router.post("/test-email", async (req, res) => {
  try {
    const { email } = req.body || {};
    
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }

    console.log('[TEST-EMAIL] Testing email configuration...');
    
    const testHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Test Email from SeatPing</h2>
        <p>This is a test email to verify SMTP configuration.</p>
        <p>If you receive this, email is working correctly!</p>
        <p>Time: ${new Date().toISOString()}</p>
      </div>
    `;

    const emailSent = await sendEmail({
      to: email,
      subject: 'SeatPing Email Test',
      html: testHtml,
    });
    
    if (emailSent) {
      return res.json({ 
        success: true, 
        message: "Test email sent successfully" 
      });
    } else {
      return res.status(500).json({ error: "Failed to send test email" });
    }
  } catch (err: any) {
    console.error("[auth] test email error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /auth/telnyx/webhook
 * Handles Telnyx webhook events for SMS delivery status
 */
router.post("/telnyx/webhook", async (req, res) => {
  try {
    const event = req.body;

    console.log('[TELNYX-WEBHOOK] Received event:', {
      type: event.data?.event_type,
      messageId: event.data?.payload?.id,
      timestamp: new Date().toISOString()
    });

    // Handle different event types
    if (event.data?.event_type === 'message.sent') {
      console.log('[TELNYX-WEBHOOK] Message sent:', {
        messageId: event.data.payload.id,
        to: event.data.payload.to?.[0]?.phone_number,
        from: event.data.payload.from?.phone_number,
      });
    } else if (event.data?.event_type === 'message.delivered') {
      console.log('[TELNYX-WEBHOOK] Message delivered:', {
        messageId: event.data.payload.id,
        to: event.data.payload.to?.[0]?.phone_number,
      });
    } else if (event.data?.event_type === 'message.sending_failed') {
      console.error('[TELNYX-WEBHOOK] Message failed:', {
        messageId: event.data.payload.id,
        to: event.data.payload.to?.[0]?.phone_number,
        errors: event.data.payload.errors,
      });
    } else if (event.data?.event_type === 'message.finalized') {
      console.log('[TELNYX-WEBHOOK] Message finalized:', {
        messageId: event.data.payload.id,
        status: event.data.payload.to?.[0]?.status,
      });
    }

    // Always respond with 200 to acknowledge receipt
    return res.json({ received: true });
  } catch (err: any) {
    console.error('[TELNYX-WEBHOOK] Error processing webhook:', err?.message || err);
    // Still return 200 to prevent retries
    return res.json({ received: true });
  }
});

export default router;

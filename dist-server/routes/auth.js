import twilio from "twilio";
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
  getCreditsForPlan,
  enforceTrialExpiration,
  createLocationWithTrialEnforcement,
  checkAndRefillMonthlyCredits,
  handlePlanPurchase,
} from "../lib/trial.js";
import { sendPasswordResetEmail, sendEmail } from "../lib/email.js";
import crypto from "crypto";
const router = Router();

router.get("/exists", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    if (!username)
      return res.status(400).json({ error: "username is required" });
    const user = await prisma.user.findUnique({ where: { username } });
    return res.json({ exists: Boolean(user) });
  } catch (err) {
    console.error("[auth] exists error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/locations", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const { address } = req.body || {};
    if (!address || typeof address !== "string") {
      return res.status(400).json({ error: "address is required" });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "Not found" });
    const locations = user.locations || [];
    const maxLocations = user.maxLocations ?? 1;
    if (locations.length >= maxLocations) {
      return res
        .status(400)
        .json({ error: `Max locations reached (${maxLocations})` });
    }

    const newLocation = createLocationWithTrialEnforcement(user, address);
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { locations: [...locations, newLocation] },
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
  } catch (err) {
    console.error("[auth] add location error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/signup", async (req, res) => {
  try {
    const parsed = SignUpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.flatten() });
    }
    const { name, username, email, phone, password, plan } = parsed.data;

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
        planStartedAt: null,
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

    console.log("[auth] New user created:", {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
    });
    const token = signJwt({ sub: user.id });
    setAuthCookie(res, token);
    return res.status(201).json({ user });
  } catch (err) {
    console.error("[auth] signup error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

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
        plan: user.plan,
      },
    });
  } catch (err) {
    console.error("[auth] login error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.sub;

    await enforceTrialExpiration(userId);

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
  } catch (err) {
    console.error("[auth] me error:", err?.message || err);
    res.status(500).json({ error: "Server error" });
  }
});

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
    const locations = user.locations || [];
    const addresses = locations.map((location) => ({
      address: location.address,
      businessName: user.name,
    }));
    return res.json({ addresses });
  } catch (err) {
    console.error("[auth] get business addresses error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

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
      waitingPreference,
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
    if (waitingPreference === "wait_anywhere" && !phoneNumber) {
      return res
        .status(400)
        .json({ error: "Phone number is required for Wait Anywhere" });
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
    const locations = user.locations || [];
    const locationIndex = locations.findIndex((loc) => loc.address === address);
    if (locationIndex === -1) {
      return res.status(404).json({ error: "Location not found" });
    }
    const location = locations[locationIndex];

    if (waitingPreference === "wait_anywhere") {
      const locationSmsCredits = location.smsCredits || 0;
      if (locationSmsCredits <= 0) {
        return res.status(400).json({
          error:
            "This location has insufficient SMS credits for Wait Anywhere service",
        });
      }
    }

    const queueToken = crypto.randomBytes(16).toString("hex");
    const customer = {
      firstName,
      lastName,
      numGuests: Number(numGuests),
      phoneNumber: phoneNumber || "",
      waitingPreference,
      joinedAt: new Date().toISOString(),
      position: (location.queue || []).length + 1,
      queueToken,
    };

    location.queue = [...(location.queue || []), customer];

    let smsCreditsToDeduct = 0;

    locations[locationIndex] = location;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        locations: locations,
      },
    });
    return res.json({
      success: true,
      customer,
      position: customer.position,
      businessName: user.name,
      queueToken,
      creditsDeducted: {
        smsCredits: smsCreditsToDeduct,
      },
    });
  } catch (err) {
    console.error("[auth] add to queue error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get(
  "/business/:username/queue/token/:queueToken/status",
  async (req, res) => {
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
      const locations = user.locations || [];
      for (const location of locations) {
        const queue = location.queue || [];
        const customerIndex = queue.findIndex(
          (c) => c.queueToken === queueToken
        );
        if (customerIndex !== -1) {
          const customer = queue[customerIndex];
          return res.json({
            admitted: false,
            removed: false,
            position: customerIndex + 1,
            customer,
            address: location.address,
            businessName: user.name,
            message: "Customer is still waiting in queue",
          });
        }
      }

      for (const location of locations) {
        const admittedCustomers = location.admittedCustomers || [];
        const admittedCustomer = admittedCustomers.find(
          (c) => c.queueToken === queueToken
        );
        if (admittedCustomer) {
          return res.json({
            admitted: true,
            removed: false,
            customer: admittedCustomer,
            address: location.address,
            businessName: user.name,
            message: "Customer has been admitted",
          });
        }

        const removedCustomers = location.removedCustomers || [];
        const removedCustomer = removedCustomers.find(
          (c) => c.queueToken === queueToken
        );
        if (removedCustomer) {
          return res.json({
            admitted: false,
            removed: true,
            status: removedCustomer.status || "removed",
            customer: removedCustomer,
            address: location.address,
            businessName: user.name,
            message:
              removedCustomer.status === "left"
                ? "Customer has left the queue"
                : "Customer has been removed from queue",
          });
        }
      }

      return res.json({
        admitted: false,
        removed: false,
        message: "Queue session not found or expired",
      });
    } catch (err) {
      console.error(
        "[auth] check customer status by token error:",
        err?.message || err
      );
      return res.status(500).json({ error: "Server error" });
    }
  }
);

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
    const locations = user.locations || [];

    let customerFound = false;
    let customerPosition = 0;
    for (const location of locations) {
      const queue = location.queue || [];
      const customerIndex = queue.findIndex(
        (c) => c.firstName + c.lastName + c.joinedAt === customerId
      );
      if (customerIndex !== -1) {
        customerFound = true;
        customerPosition = customerIndex + 1;
        break;
      }
    }
    if (customerFound) {
      return res.json({
        admitted: false,
        removed: false,
        position: customerPosition,
        message: "Customer is still waiting in queue",
      });
    }

    for (const location of locations) {
      const admittedCustomers = location.admittedCustomers || [];
      const admittedCustomer = admittedCustomers.find(
        (c) => c.firstName + c.lastName + c.joinedAt === customerId
      );
      if (admittedCustomer) {
        return res.json({
          admitted: true,
          removed: false,
          message: "Customer has been admitted",
        });
      }

      const removedCustomers = location.removedCustomers || [];
      const removedCustomer = removedCustomers.find(
        (c) => c.firstName + c.lastName + c.joinedAt === customerId
      );
      if (removedCustomer) {
        return res.json({
          admitted: false,
          removed: true,
          status: removedCustomer.status || "removed",
          message:
            removedCustomer.status === "left"
              ? "Customer has left the queue"
              : "Customer has been removed from queue",
        });
      }
    }

    return res.json({
      admitted: false,
      removed: false,
      message: "Customer not found",
    });
  } catch (err) {
    console.error("[auth] check customer status error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post(
  "/business/:username/queue/:customerId/admit",
  requireAuth,
  async (req, res) => {
    try {
      const userId = req.auth.sub;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();
      if (!username || !customerId) {
        return res
          .status(400)
          .json({ error: "username and customerId are required" });
      }

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
      const locations = user.locations || [];
      let customerFound = false;
      let admittedCustomer = null;
      let locationIndex = -1;

      for (let i = 0; i < locations.length; i++) {
        const queue = locations[i].queue || [];
        const customerIndex = queue.findIndex(
          (c) => c.firstName + c.lastName + c.joinedAt === customerId
        );
        if (customerIndex !== -1) {
          admittedCustomer = queue[customerIndex];
          locationIndex = i;

          const locationCustomerCredits = locations[i].customerCredits || 0;
          if (locationCustomerCredits <= 0) {
            return res.status(400).json({
              error:
                "This location has insufficient customer credits. Please upgrade your plan.",
            });
          }

          admittedCustomer.status = "admitted";
          admittedCustomer.admittedAt = new Date().toISOString();

          console.log("Admitting customer:", admittedCustomer);
          console.log("Customer phone number:", admittedCustomer.phoneNumber);

          if (
            admittedCustomer.phoneNumber &&
            admittedCustomer.phoneNumber.trim() !== ""
          ) {
            try {
              const accountSid = process.env.TWILIO_ACCOUNT_SID;
              const authToken = process.env.TWILIO_AUTH_TOKEN;
              const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
              if (!accountSid || !authToken || !twilioPhoneNumber) {
                console.error("Missing Twilio credentials:", {
                  hasAccountSid: !!accountSid,
                  hasAuthToken: !!authToken,
                  hasTwilioPhone: !!twilioPhoneNumber,
                });
                throw new Error("Twilio credentials not configured");
              }
              const client = twilio(accountSid, authToken);

              let formattedPhone = admittedCustomer.phoneNumber.trim();
              if (!formattedPhone.startsWith("+")) {
                formattedPhone = "+1" + formattedPhone.replace(/\D/g, "");
              }
              const businessName = user.name || "The business";
              const message = await client.messages.create({
                body: `Good news! It's your turn at ${businessName}. Please proceed to the host within the next 5 minutes. Thank you for using SeatPing!`,
                from: twilioPhoneNumber,
                to: formattedPhone,
              });
              console.log(
                "SMS notification sent successfully:",
                message.sid,
                "to",
                formattedPhone
              );
            } catch (error) {
              console.error(
                "Failed to send SMS notification:",
                error?.message || error
              );
            }
          } else {
            console.log("No phone number provided - skipping SMS notification");
          }

          if (!locations[i].admittedCustomers) {
            locations[i].admittedCustomers = [];
          }
          locations[i].admittedCustomers.push(admittedCustomer);

          locations[i].queue.splice(customerIndex, 1);
          customerFound = true;
          break;
        }
      }
      if (!customerFound) {
        return res.status(404).json({ error: "Customer not found in queue" });
      }

      let customerCreditsToDeduct = 1;
      let smsCreditsToDeduct = 0;

      const location = locations[locationIndex];
      location.customerCredits = Math.max(
        0,
        (location.customerCredits || 0) - customerCreditsToDeduct
      );
      if (admittedCustomer.waitingPreference === "wait_anywhere") {
        smsCreditsToDeduct = 1;
        location.smsCredits = Math.max(
          0,
          (location.smsCredits || 0) - smsCreditsToDeduct
        );
      }

      locations[locationIndex] = location;

      await prisma.user.update({
        where: { id: userId },
        data: {
          locations: locations,
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
    } catch (err) {
      console.error("[auth] admit customer error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

router.delete(
  "/business/:username/queue/:customerId",
  requireAuth,
  async (req, res) => {
    try {
      const userId = req.auth.sub;
      const username = String(req.params.username || "").trim();
      const customerId = String(req.params.customerId || "").trim();
      if (!username || !customerId) {
        return res
          .status(400)
          .json({ error: "username and customerId are required" });
      }

      const user = await prisma.user.findFirst({
        where: { id: userId, username },
        select: { id: true, name: true, locations: true },
      });
      if (!user) {
        return res
          .status(404)
          .json({ error: "Business not found or access denied" });
      }
      const locations = user.locations || [];
      let customerFound = false;
      let removedCustomer = null;

      for (let i = 0; i < locations.length; i++) {
        const queue = locations[i].queue || [];
        const customerIndex = queue.findIndex(
          (c) => c.firstName + c.lastName + c.joinedAt === customerId
        );
        if (customerIndex !== -1) {
          removedCustomer = queue[customerIndex];

          removedCustomer.status = "removed";
          removedCustomer.removedAt = new Date().toISOString();

          if (!locations[i].removedCustomers) {
            locations[i].removedCustomers = [];
          }
          locations[i].removedCustomers.push(removedCustomer);

          locations[i].queue.splice(customerIndex, 1);
          customerFound = true;
          break;
        }
      }
      if (!customerFound) {
        return res.status(404).json({ error: "Customer not found in queue" });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { locations: locations },
      });
      return res.json({
        success: true,
        customer: removedCustomer,
        message: "Customer has been removed from queue",
      });
    } catch (err) {
      console.error("[auth] remove customer error:", err?.message || err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

router.post("/business/:username/queue/:customerId/leave", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const customerId = String(req.params.customerId || "").trim();
    if (!username || !customerId) {
      return res
        .status(400)
        .json({ error: "username and customerId are required" });
    }

    const user = await prisma.user.findFirst({
      where: { username },
      select: { id: true, name: true, locations: true },
    });
    if (!user) {
      return res.status(404).json({ error: "Business not found" });
    }
    const locations = user.locations || [];
    let customerFound = false;
    let removedCustomer = null;

    for (let i = 0; i < locations.length; i++) {
      const queue = locations[i].queue || [];
      const customerIndex = queue.findIndex(
        (c) => c.firstName + c.lastName + c.joinedAt === customerId
      );
      if (customerIndex !== -1) {
        removedCustomer = queue[customerIndex];

        removedCustomer.status = "left";
        removedCustomer.leftAt = new Date().toISOString();

        if (!locations[i].removedCustomers) {
          locations[i].removedCustomers = [];
        }
        locations[i].removedCustomers.push(removedCustomer);

        locations[i].queue.splice(customerIndex, 1);
        customerFound = true;
        break;
      }
    }
    if (!customerFound) {
      return res.status(404).json({ error: "Customer not found in queue" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { locations: locations },
    });
    return res.json({
      success: true,
      customer: removedCustomer,
      message: "You have left the queue",
    });
  } catch (err) {
    console.error("[auth] customer leave queue error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const { locations } = req.body || {};
    if (!locations || !Array.isArray(locations)) {
      return res.status(400).json({ error: "locations array is required" });
    }

    await enforceTrialExpiration(userId);

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        locations: true,
        trial: true,
        trialDurationDays: true,
        createdAt: true,
      },
    });
    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }
    const currentLocations = currentUser.locations || [];

    const processedLocations = locations.map((location) => {
      const existingLocation = currentLocations.find(
        (loc) => loc.address === location.address
      );
      if (existingLocation) {
        return existingLocation;
      } else {
        return createLocationWithTrialEnforcement(
          currentUser,
          location.address
        );
      }
    });
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { locations: processedLocations },
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
  } catch (err) {
    console.error("[auth] update me error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/purchase-plan", requireAuth, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const { plan } = req.body || {};
    if (!plan || typeof plan !== "string") {
      return res.status(400).json({ error: "plan is required" });
    }
    await handlePlanPurchase(userId, plan);
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
      message: `Successfully upgraded to ${plan} plan`,
    });
  } catch (err) {
    console.error("[auth] purchase plan error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      return res.json({
        success: true,
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });
    const emailSent = await sendPasswordResetEmail(user.email, resetToken);
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send email" });
    }
    return res.json({
      success: true,
      message:
        "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (err) {
    console.error("[auth] forgot password error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ error: "token and newPassword are required" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }
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
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });
    return res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (err) {
    console.error("[auth] reset password error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});
router.post("/test-email", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }
    console.log("[TEST-EMAIL] Testing email configuration...");
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
      subject: "SeatPing Email Test",
      html: testHtml,
    });
    if (emailSent) {
      return res.json({
        success: true,
        message: "Test email sent successfully",
      });
    } else {
      return res.status(500).json({ error: "Failed to send test email" });
    }
  } catch (err) {
    console.error("[auth] test email error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});
export default router;

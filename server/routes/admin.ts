import express from "express";
import { prisma } from "../lib/prisma.js";
import { computeNextRefillDate } from "../lib/trial.js";

const router = express.Router();

// Update business credits
router.post("/update-credits", async (req, res) => {
  try {
    const { username, baseCustomerCredits, baseSMSCredits } = req.body;

    // Validate input
    if (!username || baseCustomerCredits === undefined || baseSMSCredits === undefined) {
      return res.status(400).send("Missing required fields");
    }

    if (typeof baseCustomerCredits !== 'number' || typeof baseSMSCredits !== 'number') {
      return res.status(400).send("Credits must be numbers");
    }

    if (baseCustomerCredits < 0 || baseSMSCredits < 0) {
      return res.status(400).send("Credits cannot be negative");
    }

    // Find and update the user
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      return res.status(404).send("Business user not found");
    }

    const updatedUser = await prisma.user.update({
      where: { username },
      data: {
        baseCustomerCredits,
        baseSMSCredits,
        updatedAt: new Date()
      }
    });

    res.json({
      message: "Credits updated successfully",
      user: {
        username: updatedUser.username,
        baseCustomerCredits: updatedUser.baseCustomerCredits,
        baseSMSCredits: updatedUser.baseSMSCredits
      }
    });

  } catch (error) {
    console.error("Error updating credits:", error);
    res.status(500).send("Internal server error");
  }
});

// Lookup a business/customer account by username
router.get("/customer/:username", async (req, res) => {
  try {
    const { username } = req.params;

    if (!username || !username.trim()) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
      select: {
        name: true,
        username: true,
        email: true,
        phone: true,
        trial: true,
        trialDurationDays: true,
        maxLocations: true,
        baseCustomerCredits: true,
        baseSMSCredits: true,
        planStartedAt: true,
        locations: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "No customer found with this username." });
    }

    const rawLocations = Array.isArray(user.locations) ? (user.locations as any[]) : [];
    const locations = rawLocations.map((loc) => ({
      address: loc?.address ?? "",
      smsCredits: typeof loc?.smsCredits === "number" ? loc.smsCredits : 0,
      customerCredits: typeof loc?.customerCredits === "number" ? loc.customerCredits : 0,
    }));

    res.json({
      customer: {
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        trial: user.trial,
        trialDurationDays: user.trialDurationDays,
        maxLocations: user.maxLocations,
        baseCustomerCredits: user.baseCustomerCredits,
        baseSMSCredits: user.baseSMSCredits,
        planStartedAt: user.planStartedAt,
        locations,
      },
    });
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a business/customer account
router.patch("/customer/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const {
      name,
      username: newUsername,
      email,
      phone,
      trial,
      trialDurationDays,
      maxLocations,
      baseCustomerCredits,
      baseSMSCredits,
      planStartedAt,
      locations,
    } = req.body ?? {};

    if (!username || !username.trim()) {
      return res.status(400).json({ error: "Username is required" });
    }

    const existing = await prisma.user.findUnique({
      where: { username: username.trim() },
    });
    if (!existing) {
      return res.status(404).json({ error: "No customer found with this username." });
    }

    const data: Record<string, unknown> = {};

    const stringFields: Array<[string, unknown]> = [
      ["name", name],
      ["phone", phone],
    ];
    for (const [key, value] of stringFields) {
      if (value === undefined) continue;
      if (typeof value !== "string" || !value.trim()) {
        return res.status(400).json({ error: `${key} must be a non-empty string` });
      }
      data[key] = value.trim();
    }

    if (email !== undefined) {
      if (typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ error: "email must be a non-empty string" });
      }
      const trimmedEmail = email.trim();
      if (trimmedEmail !== existing.email) {
        const dup = await prisma.user.findUnique({ where: { email: trimmedEmail } });
        if (dup) {
          return res.status(409).json({ error: "Email is already in use by another account" });
        }
      }
      data.email = trimmedEmail;
    }

    if (newUsername !== undefined) {
      if (typeof newUsername !== "string" || !newUsername.trim()) {
        return res.status(400).json({ error: "username must be a non-empty string" });
      }
      const trimmedUsername = newUsername.trim();
      if (trimmedUsername !== existing.username) {
        const dup = await prisma.user.findUnique({ where: { username: trimmedUsername } });
        if (dup) {
          return res.status(409).json({ error: "Username is already taken" });
        }
        data.username = trimmedUsername;
      }
    }

    const numericFields: Array<[string, unknown]> = [
      ["trialDurationDays", trialDurationDays],
      ["maxLocations", maxLocations],
      ["baseCustomerCredits", baseCustomerCredits],
      ["baseSMSCredits", baseSMSCredits],
    ];
    for (const [key, value] of numericFields) {
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return res.status(400).json({ error: `${key} must be a non-negative number` });
      }
      data[key] = Math.floor(value);
    }

    if (trial !== undefined) {
      if (typeof trial !== "boolean") {
        return res.status(400).json({ error: "trial must be a boolean" });
      }
      data.trial = trial;
    }

    if (planStartedAt !== undefined) {
      if (planStartedAt === null) {
        data.planStartedAt = null;
      } else if (typeof planStartedAt === "string") {
        const parsed = new Date(planStartedAt);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: "planStartedAt must be a valid date" });
        }
        data.planStartedAt = parsed;
      } else {
        return res.status(400).json({ error: "planStartedAt must be a string or null" });
      }
    }

    if (locations !== undefined) {
      if (!Array.isArray(locations)) {
        return res.status(400).json({ error: "locations must be an array" });
      }
      const existingLocations = Array.isArray(existing.locations)
        ? (existing.locations as any[])
        : [];
      if (locations.length !== existingLocations.length) {
        return res.status(400).json({
          error: "locations length does not match existing locations",
        });
      }
      const merged = existingLocations.map((loc, idx) => {
        const patch = locations[idx] ?? {};
        const sms = patch.smsCredits;
        const cust = patch.customerCredits;
        const addr = patch.address;
        if (sms !== undefined && (typeof sms !== "number" || sms < 0)) {
          throw new Error(`locations[${idx}].smsCredits must be a non-negative number`);
        }
        if (cust !== undefined && (typeof cust !== "number" || cust < 0)) {
          throw new Error(`locations[${idx}].customerCredits must be a non-negative number`);
        }
        if (addr !== undefined && (typeof addr !== "string" || !addr.trim())) {
          throw new Error(`locations[${idx}].address must be a non-empty string`);
        }
        return {
          ...loc,
          address: addr !== undefined ? addr.trim() : loc?.address ?? "",
          smsCredits: sms !== undefined ? Math.floor(sms) : loc?.smsCredits ?? 0,
          customerCredits:
            cust !== undefined ? Math.floor(cust) : loc?.customerCredits ?? 0,
        };
      });
      data.locations = merged;
    }

    // If trial or planStartedAt is being changed, re-derive refill markers.
    // Paid plan + planStartedAt set  -> seed lastCreditRefillAt = now,
    //                                    nextCreditRefillAt = next monthly anchor after now
    // Otherwise (trial=true or no planStartedAt) -> clear both markers.
    const trialChanging = Object.prototype.hasOwnProperty.call(data, "trial");
    const planStartedAtChanging = Object.prototype.hasOwnProperty.call(
      data,
      "planStartedAt",
    );
    if (trialChanging || planStartedAtChanging) {
      const finalTrial = trialChanging
        ? (data.trial as boolean)
        : existing.trial;
      const finalPlanStartedAt = planStartedAtChanging
        ? (data.planStartedAt as Date | null)
        : existing.planStartedAt;

      if (finalTrial === false && finalPlanStartedAt instanceof Date) {
        const now = new Date();
        data.lastCreditRefillAt = now;
        data.nextCreditRefillAt = computeNextRefillDate(finalPlanStartedAt, now);
      } else {
        data.lastCreditRefillAt = null;
        data.nextCreditRefillAt = null;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No editable fields provided" });
    }

    const updated = await prisma.user.update({
      where: { username: username.trim() },
      data,
      select: {
        name: true,
        username: true,
        email: true,
        phone: true,
        trial: true,
        trialDurationDays: true,
        maxLocations: true,
        baseCustomerCredits: true,
        baseSMSCredits: true,
        planStartedAt: true,
        locations: true,
        updatedAt: true,
      },
    });

    const rawLocations = Array.isArray(updated.locations)
      ? (updated.locations as any[])
      : [];
    const sanitizedLocations = rawLocations.map((loc) => ({
      address: loc?.address ?? "",
      smsCredits: typeof loc?.smsCredits === "number" ? loc.smsCredits : 0,
      customerCredits:
        typeof loc?.customerCredits === "number" ? loc.customerCredits : 0,
    }));

    res.json({
      customer: {
        name: updated.name,
        username: updated.username,
        email: updated.email,
        phone: updated.phone,
        trial: updated.trial,
        trialDurationDays: updated.trialDurationDays,
        maxLocations: updated.maxLocations,
        baseCustomerCredits: updated.baseCustomerCredits,
        baseSMSCredits: updated.baseSMSCredits,
        planStartedAt: updated.planStartedAt,
        locations: sanitizedLocations,
      },
      updatedAt: updated.updatedAt,
    });
  } catch (error: any) {
    console.error("Error updating customer:", error);
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

export default router;


// server/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import {
  signJwt,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from "../lib/auth";
import { LoginSchema, SignUpSchema } from "../lib/validation";

const router = Router();

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

    const newLocation = {
      address,
      queue: [],
      smsCredits: 0,
      customerCredits: 0,
    };

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
      select: { name: true, locations: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: "Business not found" });
    }

    const locations = ((user as any).locations as any[]) || [];
    const addresses = locations.map((location: any) => ({
      address: location.address,
      businessName: (user as any).name
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
    
    const { address, firstName, lastName, numGuests, phoneNumber, waitingPreference } = req.body || {};
    
    if (!address || !firstName || !lastName || !numGuests || !waitingPreference) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (waitingPreference === "wait_anywhere" && !phoneNumber) {
      return res.status(400).json({ error: "Phone number is required for Wait Anywhere" });
    }

    const user = await prisma.user.findUnique({ 
      where: { username },
      select: { id: true, name: true, locations: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: "Business not found" });
    }

    const locations = ((user as any).locations as any[]) || [];
    const locationIndex = locations.findIndex((loc: any) => loc.address === address);
    
    if (locationIndex === -1) {
      return res.status(404).json({ error: "Location not found" });
    }

    const customer = {
      firstName,
      lastName,
      numGuests: Number(numGuests),
      phoneNumber: phoneNumber || "",
      waitingPreference,
      joinedAt: new Date().toISOString(),
      position: (locations[locationIndex].queue || []).length + 1
    };

    // Add customer to the queue
    locations[locationIndex].queue = [...(locations[locationIndex].queue || []), customer];

    // Update the business with the new queue
    await prisma.user.update({
      where: { id: (user as any).id },
      data: { locations: locations as any }
    });

    return res.json({ 
      success: true, 
      customer,
      position: customer.position,
      businessName: (user as any).name
    });
  } catch (err: any) {
    console.error("[auth] add to queue error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /auth/business/:username/queue/:customerId/status
 * Returns: { admitted: boolean, position?: number, message?: string }
 * Checks if a specific customer has been admitted
 */
router.get("/business/:username/queue/:customerId/status", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim();
    const customerId = String(req.params.customerId || "").trim();
    
    if (!username || !customerId) {
      return res.status(400).json({ error: "username and customerId are required" });
    }

    const user = await prisma.user.findUnique({ 
      where: { username },
      select: { id: true, name: true, locations: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: "Business not found" });
    }

    const locations = ((user as any).locations as any[]) || [];
    
    // Find the customer in any location's queue
    let customerFound = false;
    let customerPosition = 0;
    let customerLocation = null;
    
    for (const location of locations) {
      const queue = location.queue || [];
      const customerIndex = queue.findIndex((c: any) => 
        c.firstName + c.lastName + c.joinedAt === customerId
      );
      
      if (customerIndex !== -1) {
        customerFound = true;
        customerPosition = customerIndex + 1;
        customerLocation = location;
        break;
      }
    }

    if (!customerFound) {
      return res.json({ 
        admitted: false, 
        message: "Customer not found in queue" 
      });
    }

    // Check if customer is still in queue (not admitted)
    if (customerLocation && (customerLocation as any).queue && 
        (customerLocation as any).queue.some((c: any) => 
          c.firstName + c.lastName + c.joinedAt === customerId
        )) {
      return res.json({ 
        admitted: false, 
        position: customerPosition,
        message: "Customer is still waiting in queue" 
      });
    }

    // Customer has been admitted (removed from queue)
    return res.json({ 
      admitted: true, 
      message: "Customer has been admitted" 
    });

  } catch (err: any) {
    console.error("[auth] check customer status error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

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

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { locations: locations as any },
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

export default router;

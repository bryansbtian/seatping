// server/routes/reservations.ts
//
// Public, account-free reservation endpoints for the customer booking flow.
//   GET  /api/reservations/:businessUsername/:locationId/settings
//   GET  /api/reservations/:businessUsername/:locationId/availability
//   POST /api/reservations/:businessUsername/:locationId          (create)
//   GET  /api/reservations/manage/:manageToken
//   PUT  /api/reservations/manage/:manageToken                    (change)
//   POST /api/reservations/manage/:manageToken/cancel
//
// Reservations + settings live as JSON on the Location model (see
// server/lib/reservations.ts). No customer login is required at any step; a
// secure `manageToken` lets the customer manage the booking later. Confirmations
// are EMAIL ONLY — there is no SMS/WhatsApp path (so reservations never consume
// notification credits).
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import {
  normalizeSettings,
  computeAvailability,
  validateReservationRequest,
  buildReservationDateTime,
  splitDateTime,
  formatTimeLabel,
  serializeReservation,
  syncCustomerReservation,
  type ReservationSettings,
} from "../lib/reservations.js";
import { readSession } from "../lib/auth.js";
import {
  sendReservationConfirmationEmail,
  sendNewReservationBusinessEmail,
} from "../lib/email.js";

const router = Router();

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/** Resolve a (businessUsername, locationId) pair to the business + location. */
async function resolveLocation(businessUsername: string, locationId: string) {
  if (!businessUsername || !OBJECT_ID_RE.test(locationId)) return null;
  const business = await prisma.business.findUnique({
    where: { username: businessUsername },
    select: { id: true, name: true, username: true, email: true },
  });
  if (!business) return null;
  const location = await prisma.location.findFirst({
    where: { id: locationId, businessId: business.id },
  });
  if (!location) return null;
  return { business, location };
}

function readableDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Absolute base URL for manage links, derived from the request. */
function baseUrl(req: any): string {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin) return origin.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${proto}://${req.get("host")}`;
}

/**
 * Send reservation emails (best-effort — email is the only customer channel and
 * no path consumes notification credits):
 *   1. Confirmation/request to the customer (if they gave an email).
 *   2. A heads-up to the business owner that a booking came in.
 * Each send is isolated so one failure never blocks the other or the request.
 */
async function notifyReservation(
  reservation: any,
  business: { name: string | null; email?: string | null },
  location: { address: string; displayName?: string | null; name?: string | null },
  settings: ReservationSettings,
  manageUrl: string,
) {
  const { date, time } = splitDateTime(reservation.reservationDateTime);
  const dateLabel = readableDate(date);
  const timeLabel = formatTimeLabel(time);

  // 1. Customer confirmation.
  if (reservation.email) {
    try {
      await sendReservationConfirmationEmail({
        email: reservation.email,
        firstName: reservation.firstName,
        lastName: reservation.lastName,
        businessName: business.name || "the restaurant",
        address: location.address,
        dateLabel,
        timeLabel,
        partySize: reservation.partySize,
        status: reservation.status,
        manageUrl,
        cancellationPolicy: settings.cancellationPolicy,
      });
    } catch (e: any) {
      console.error("[RESERVATION] customer confirmation email failed:", e?.message || e);
    }
  }

  // 2. Business notification (to the business account email — no per-location
  // email field exists yet; prefer one here if it's added later).
  if (business.email) {
    try {
      await sendNewReservationBusinessEmail({
        to: business.email,
        businessName: business.name || "your restaurant",
        locationName: location.displayName || location.name || location.address,
        customerName: reservation.name || `${reservation.firstName} ${reservation.lastName}`.trim(),
        customerEmail: reservation.email || "",
        customerPhone: reservation.phone || undefined,
        dateLabel,
        timeLabel,
        partySize: reservation.partySize,
        status: reservation.status,
        notes: reservation.notes || undefined,
        dashboardUrl: `${process.env.FRONTEND_URL || "https://www.seatping.biz"}/business`,
      });
    } catch (e: any) {
      console.error("[RESERVATION] business notification email failed:", e?.message || e);
    }
  }
}

/**
 * GET settings — public reservation configuration for a location. Always
 * returns whether reservations are enabled; settings are normalized.
 */
router.get("/:businessUsername/:locationId/settings", async (req, res) => {
  try {
    const resolved = await resolveLocation(
      String(req.params.businessUsername || "").trim(),
      String(req.params.locationId || "").trim(),
    );
    if (!resolved) return res.status(404).json({ error: "Restaurant not found" });
    const { location } = resolved;
    const enabled = location.reservationsEnabled ?? true;
    return res.json({
      reservationsEnabled: enabled,
      settings: enabled ? normalizeSettings(location.reservationSettings) : null,
    });
  } catch (err: any) {
    console.error("[reservations] settings error:", err?.message || err);
    return res.status(500).json({ error: "Failed to load reservation settings." });
  }
});

/**
 * GET availability — bookable 30-minute slots for a date + party size.
 */
router.get("/:businessUsername/:locationId/availability", async (req, res) => {
  try {
    const resolved = await resolveLocation(
      String(req.params.businessUsername || "").trim(),
      String(req.params.locationId || "").trim(),
    );
    if (!resolved) return res.status(404).json({ error: "Restaurant not found" });
    const { location } = resolved;

    if (!(location.reservationsEnabled ?? true)) {
      return res.json({ reservationsEnabled: false, slots: [] });
    }

    const date = String(req.query.date || "").trim();
    const partySize = Number(req.query.partySize || 0);
    const settings = normalizeSettings(location.reservationSettings);
    const reservations = Array.isArray(location.reservations)
      ? (location.reservations as any[])
      : [];

    const { slots, partyTooLarge, outsideWindow } = computeAvailability({
      settings,
      reservations,
      date,
      partySize,
    });

    return res.json({
      reservationsEnabled: true,
      settings,
      date,
      partySize,
      partyTooLarge,
      outsideWindow,
      slots,
    });
  } catch (err: any) {
    console.error("[reservations] availability error:", err?.message || err);
    return res.status(500).json({ error: "Failed to load availability." });
  }
});

/** POST create — account-free, email-only reservation creation. */
router.post("/:businessUsername/:locationId", async (req, res) => {
  try {
    const resolved = await resolveLocation(
      String(req.params.businessUsername || "").trim(),
      String(req.params.locationId || "").trim(),
    );
    if (!resolved) return res.status(404).json({ error: "Restaurant not found" });
    const { business, location } = resolved;

    if (!(location.reservationsEnabled ?? true)) {
      return res.status(400).json({ error: "Reservations are not available at this location." });
    }

    const { firstName, lastName, email, partySize, date, time, notes } =
      req.body || {};

    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First and last name are required." });
    }
    // Reservations are email-only.
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }

    const settings = normalizeSettings(location.reservationSettings);
    const reservations = Array.isArray(location.reservations)
      ? (location.reservations as any[])
      : [];
    const size = Number(partySize);

    const error = validateReservationRequest({
      settings,
      reservations,
      date: String(date || ""),
      time: String(time || ""),
      partySize: size,
    });
    if (error) return res.status(400).json({ error });

    // Link the reservation to the logged-in customer (if any) so it shows up in
    // their profile. Guests book without an account (customerId stays null).
    const session = readSession(req);
    const customerId =
      session?.accountType === "customer" ? session.sub : null;

    const nowIso = new Date().toISOString();
    // Reservations are auto-confirmed for now (the manual-approval option is no
    // longer exposed in the business UI).
    const status = "confirmed";
    const reservation = {
      id: crypto.randomBytes(12).toString("hex"),
      locationId: location.id,
      businessUsername: business.username,
      customerId,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      name: `${String(firstName).trim()} ${String(lastName).trim()}`.trim(),
      contactMethod: "email",
      phone: "",
      countryCode: "",
      email: String(email).trim(),
      partySize: size,
      reservationDateTime: buildReservationDateTime(String(date), String(time)),
      notes: notes ? String(notes).trim().slice(0, 1000) : "",
      status,
      manageToken: crypto.randomBytes(24).toString("hex"),
      source: "seatping_public",
      createdAt: nowIso,
      updatedAt: nowIso,
      cancelledAt: null,
      arrivedAt: null,
      completedAt: null,
      noShowAt: null,
    };

    await prisma.location.update({
      where: { id: location.id },
      data: { reservations: [...reservations, reservation] as any },
    });

    const manageUrl = `${baseUrl(req)}/reservations/manage/${reservation.manageToken}`;
    await notifyReservation(reservation, business, location, settings, manageUrl);
    await syncCustomerReservation(reservation, {
      businessName: business.name,
      locationName: location.displayName || location.name || business.name,
    });

    return res.json({
      success: true,
      reservation: serializeReservation(reservation, { includeToken: true }),
      manageToken: reservation.manageToken,
      manageUrl,
    });
  } catch (err: any) {
    console.error("[reservations] create error:", err?.message || err);
    return res.status(500).json({ error: "Failed to create reservation." });
  }
});

/**
 * Find a reservation + its location by manage token. Reservations are JSON on
 * the Location model, so we scan locations and match in memory. Tokens are
 * 24-byte random hex, so this is effectively a unique lookup.
 */
async function findByManageToken(manageToken: string) {
  if (!manageToken) return null;
  const all = await prisma.location.findMany();
  for (const loc of all) {
    const list = Array.isArray(loc.reservations) ? (loc.reservations as any[]) : [];
    const reservation = list.find((r) => r?.manageToken === manageToken);
    if (reservation) return { location: loc, reservation, list };
  }
  return null;
}

/** GET reservation by manage token (customer self-service view). */
router.get("/manage/:manageToken", async (req, res) => {
  try {
    const found = await findByManageToken(String(req.params.manageToken || "").trim());
    if (!found) return res.status(404).json({ error: "Reservation not found" });
    const { location, reservation } = found;

    const business = await prisma.business.findUnique({
      where: { id: location.businessId },
      select: { name: true, username: true },
    });
    const settings = normalizeSettings(location.reservationSettings);

    // Restaurant display name comes from the location's public profile (same
    // source as the public restaurant page) — NOT the business account name.
    const rp = (location.restaurantProfile || {}) as any;
    const restaurantName =
      rp.displayName ||
      business?.name ||
      location.displayName ||
      location.name ||
      "Restaurant";
    const locationLabel =
      rp.shortAddress ||
      location.displayName ||
      location.name ||
      location.area ||
      location.city ||
      null;

    return res.json({
      reservation: serializeReservation(reservation, { includeToken: true }),
      settings,
      restaurant: {
        businessUsername: business?.username ?? null,
        businessName: business?.name ?? null,
        name: restaurantName,
        locationId: location.id,
        locationName: locationLabel,
        address: location.address || "",
      },
    });
  } catch (err: any) {
    console.error("[reservations] manage get error:", err?.message || err);
    return res.status(500).json({ error: "Failed to load reservation." });
  }
});

/** PUT change date/time/party size by manage token. Re-runs availability. */
router.put("/manage/:manageToken", async (req, res) => {
  try {
    const found = await findByManageToken(String(req.params.manageToken || "").trim());
    if (!found) return res.status(404).json({ error: "Reservation not found" });
    const { location, reservation, list } = found;

    if (["cancelled", "completed", "no_show"].includes(reservation.status)) {
      return res.status(400).json({ error: "This reservation can no longer be changed." });
    }

    const current = splitDateTime(reservation.reservationDateTime);
    const date = String(req.body?.date || current.date);
    const time = String(req.body?.time || current.time);
    const partySize =
      req.body?.partySize !== undefined ? Number(req.body.partySize) : reservation.partySize;

    const settings = normalizeSettings(location.reservationSettings);
    const error = validateReservationRequest({
      settings,
      reservations: list,
      date,
      time,
      partySize,
      excludeId: reservation.id,
    });
    if (error) return res.status(400).json({ error });

    const updated = {
      ...reservation,
      partySize,
      reservationDateTime: buildReservationDateTime(date, time),
      updatedAt: new Date().toISOString(),
    };
    const nextList = list.map((r) => (r.id === reservation.id ? updated : r));
    await prisma.location.update({
      where: { id: location.id },
      data: { reservations: nextList as any },
    });
    await syncManageChange(location, updated);

    return res.json({ reservation: serializeReservation(updated, { includeToken: true }) });
  } catch (err: any) {
    console.error("[reservations] manage update error:", err?.message || err);
    return res.status(500).json({ error: "Failed to update reservation." });
  }
});

/** Re-sync a logged-in customer's profile copy after a manage-link change. */
async function syncManageChange(location: any, reservation: any) {
  if (!reservation?.customerId) return;
  const biz = await prisma.business.findUnique({
    where: { id: location.businessId },
    select: { name: true },
  });
  await syncCustomerReservation(reservation, {
    businessName: biz?.name ?? null,
    locationName: location.displayName || location.name || biz?.name || null,
  });
}

/** POST cancel by manage token. */
router.post("/manage/:manageToken/cancel", async (req, res) => {
  try {
    const found = await findByManageToken(String(req.params.manageToken || "").trim());
    if (!found) return res.status(404).json({ error: "Reservation not found" });
    const { location, reservation, list } = found;

    if (reservation.status === "cancelled") {
      return res.json({ reservation: serializeReservation(reservation, { includeToken: true }) });
    }
    if (["completed", "no_show"].includes(reservation.status)) {
      return res.status(400).json({ error: "This reservation can no longer be cancelled." });
    }

    const now = new Date().toISOString();
    const updated = { ...reservation, status: "cancelled", cancelledAt: now, updatedAt: now };
    const nextList = list.map((r) => (r.id === reservation.id ? updated : r));
    await prisma.location.update({
      where: { id: location.id },
      data: { reservations: nextList as any },
    });
    await syncManageChange(location, updated);

    return res.json({ reservation: serializeReservation(updated, { includeToken: true }) });
  } catch (err: any) {
    console.error("[reservations] manage cancel error:", err?.message || err);
    return res.status(500).json({ error: "Failed to cancel reservation." });
  }
});

export default router;

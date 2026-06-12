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
  syncCustomerReservation,
  type ReservationSettings,
} from "../lib/reservations.js";
import {
  getLocationOpeningHours,
  getLocationTimezone,
} from "../lib/operatingHours.js";
import { readSession } from "../lib/auth.js";
import { reservationRowToLegacy } from "../lib/liveData.js";
import {
  bucketOf,
  tryReserveCapacity,
  releaseCapacity,
  addCapacity,
} from "../lib/reservationCapacity.js";
import { enqueueNotification } from "../lib/notifications.js";
import { limitGuard, clientIp, MINUTES, HOURS } from "../lib/rateLimit.js";
import {
  syncGuestFromReservation,
  touchGuestByReservationId,
} from "../lib/guests.js";
import type { Reservation } from "@prisma/client";

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
 * Hand off reservation emails for background delivery (email is the only
 * customer channel and no path consumes notification credits):
 *   1. Confirmation to the customer (if they gave an email).
 *   2. A heads-up to the business owner.
 * Returns immediately — the request never waits on SMTP.
 */
async function notifyReservation(
  reservation: any,
  business: { name: string | null; email?: string | null },
  location: { address: string; displayName?: string | null; name?: string | null },
  settings: ReservationSettings,
  manageUrl: string,
) {
  const { date, time } = splitDateTime(reservation.reservationDateTime);
  await enqueueNotification({
    type: "reservation_created",
    customerEmail: reservation.email || undefined,
    firstName: reservation.firstName,
    lastName: reservation.lastName,
    businessName: business.name || "the restaurant",
    address: location.address,
    dateLabel: readableDate(date),
    timeLabel: formatTimeLabel(time),
    partySize: reservation.partySize,
    status: reservation.status,
    manageUrl,
    cancellationPolicy: settings.cancellationPolicy,
    businessEmail: business.email || undefined,
    locationName: location.displayName || location.name || location.address,
    customerName:
      reservation.name || `${reservation.firstName} ${reservation.lastName}`.trim(),
    customerPhone: reservation.phone || undefined,
    notes: reservation.notes || undefined,
    dashboardUrl: `${process.env.FRONTEND_URL || "https://www.seatping.biz"}/business`,
  });
}

/** Active reservations for a location as legacy-shaped objects (for validation). */
async function activeReservationsForValidation(locationId: string): Promise<any[]> {
  const rows = await prisma.reservation.findMany({
    where: { locationId, status: { in: ["PENDING", "CONFIRMED", "ARRIVED"] } },
  });
  return rows.map((r) => reservationRowToLegacy(r));
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
    const reservations = await activeReservationsForValidation(location.id);

    const { slots, partyTooLarge, outsideWindow, operatingStatus } =
      computeAvailability({
        settings,
        reservations,
        date,
        partySize,
        timeZone: getLocationTimezone(location),
        openingHours: getLocationOpeningHours(location),
      });

    const availability = operatingStatus.isClosed
      ? {
          status: "closed",
          dayName: operatingStatus.dayName,
          hoursLabel: operatingStatus.hoursLabel,
          message: `This restaurant is closed on ${operatingStatus.dayName || "this date"}.`,
          helper: "Choose another date to view available reservation times.",
        }
      : operatingStatus.configured && slots.length === 0 && !outsideWindow
        ? {
            status: "outside_operating_hours",
            dayName: operatingStatus.dayName,
            hoursLabel: operatingStatus.hoursLabel,
            message:
              "No reservation times are available because the restaurant is closed during reservation hours on this date.",
            helper: "Choose another date to view available reservation times.",
          }
        : {
            status: "available",
            dayName: operatingStatus.dayName,
            hoursLabel: operatingStatus.hoursLabel,
          };

    return res.json({
      reservationsEnabled: true,
      settings,
      date,
      partySize,
      partyTooLarge,
      outsideWindow,
      availability,
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

    // Anti-abuse throttle: this route creates DB rows, holds capacity, and
    // emails the supplied address. We use three layers:
    //
    //  - reservation-create-ip (60/hr): a broad, deliberately loose backstop.
    //    Many legitimate customers share a single source IP (venue/mall/office
    //    WiFi, mobile carrier CGNAT), so this must NOT be tight or it would
    //    block real guests booking from the same network. It only catches an
    //    obviously runaway single source.
    //  - reservation-create-target (3/hr per location+email): the real
    //    anti-abuse control. Keyed on the contact identity, so it stops one
    //    inbox from being bombed and one person from spamming fake bookings,
    //    regardless of how many IPs they rotate through.
    //  - reservation-create-location (150/hr per location): a per-venue
    //    backstop so a single location can't be flooded with bookings faster
    //    than any real restaurant could ever take them. Sits well above
    //    realistic demand; capacity checks below remain the real seat guard.
    if (
      await limitGuard(req, res, [
        {
          name: "reservation-create-ip",
          key: clientIp(req),
          windowMs: HOURS(1),
          max: 60,
        },
        {
          name: "reservation-create-target",
          key: `${location.id}:${String(email).toLowerCase().trim()}`,
          windowMs: HOURS(1),
          max: 3,
        },
        {
          name: "reservation-create-location",
          key: location.id,
          windowMs: HOURS(1),
          max: 150,
        },
      ])
    )
      return;

    const settings = normalizeSettings(location.reservationSettings);
    const reservations = await activeReservationsForValidation(location.id);
    const size = Number(partySize);

    // Non-capacity validation (party size, booking window, notice, hours) against
    // the live model data.
    const error = validateReservationRequest({
      settings,
      reservations,
      date: String(date || ""),
      time: String(time || ""),
      partySize: size,
      timeZone: getLocationTimezone(location),
      openingHours: getLocationOpeningHours(location),
    });
    if (error) return res.status(400).json({ error });

    const reservationDateTime = buildReservationDateTime(String(date), String(time));
    const { dateKey, hour } = bucketOf(reservationDateTime);

    // Atomic overbooking guard: a single guarded counter increment. If it fails,
    // the hour bucket is full — no row is created, so we can never overbook even
    // under simultaneous requests for the last seats.
    const reserved = await tryReserveCapacity(
      location.id,
      dateKey,
      hour,
      size,
      settings.maxReservedGuestsPerHour,
    );
    if (!reserved) {
      return res
        .status(400)
        .json({ error: `${formatTimeLabel(String(time))} is fully booked. Please choose another time.` });
    }

    // Link the reservation to the logged-in customer (if any) so it shows up in
    // their profile. Guests book without an account (customerId stays null).
    const session = readSession(req);
    const customerId =
      session?.accountType === "customer" ? session.sub : null;

    // Reservations are auto-confirmed for now (the manual-approval option is no
    // longer exposed in the business UI).
    const manageToken = crypto.randomBytes(24).toString("hex");
    let row: Reservation;
    try {
      row = await prisma.reservation.create({
        data: {
          manageToken,
          locationId: location.id,
          businessId: business.id,
          businessUsername: business.username,
          customerId,
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          name: `${String(firstName).trim()} ${String(lastName).trim()}`.trim(),
          contactMethod: "email",
          phone: "",
          countryCode: "",
          email: String(email).trim(),
          guestCount: size,
          reservationDateTime,
          notes: notes ? String(notes).trim().slice(0, 1000) : "",
          status: "CONFIRMED",
          source: "seatping_public",
        },
      });
    } catch (createErr) {
      // Release the seats we optimistically reserved if the row couldn't be saved.
      await releaseCapacity(location.id, dateKey, hour, size).catch(() => {});
      throw createErr;
    }

    const reservation = reservationRowToLegacy(row, { includeToken: true });
    const manageUrl = `${baseUrl(req)}/reservations/manage/${manageToken}`;
    await notifyReservation(reservation, business, location, settings, manageUrl);
    await syncCustomerReservation(reservation, {
      businessName: business.name,
      locationName: location.displayName || location.name || business.name,
    });

    // Guest CRM: create/update the guest profile for this booking.
    await syncGuestFromReservation(row, { businessUsername: business.username });

    return res.json({
      success: true,
      reservation,
      manageToken,
      manageUrl,
    });
  } catch (err: any) {
    console.error("[reservations] create error:", err?.message || err);
    return res.status(500).json({ error: "Failed to create reservation." });
  }
});

/**
 * Find a reservation + its location by manage token. Now an indexed O(1) lookup
 * (manageToken is @unique) instead of scanning every location's JSON array.
 */
async function findByManageToken(manageToken: string) {
  if (!manageToken) return null;
  const reservation = await prisma.reservation.findUnique({ where: { manageToken } });
  if (!reservation) return null;
  const location = await prisma.location.findUnique({
    where: { id: reservation.locationId },
  });
  if (!location) return null;
  return { location, reservation };
}

/** Terminal enum statuses that can no longer be changed/cancelled. */
const TERMINAL_ENUM = ["CANCELLED", "COMPLETED", "NO_SHOW"];

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
      reservation: reservationRowToLegacy(reservation, { includeToken: true }),
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
    const manageToken = String(req.params.manageToken || "").trim();
    // Throttle changes (re-runs availability + emails) per IP and per token.
    if (
      await limitGuard(req, res, [
        { name: "reservation-manage-ip", key: clientIp(req), windowMs: MINUTES(10), max: 20 },
        { name: "reservation-manage-token", key: manageToken, windowMs: MINUTES(10), max: 10 },
      ])
    )
      return;

    const found = await findByManageToken(manageToken);
    if (!found) return res.status(404).json({ error: "Reservation not found" });
    const { location, reservation } = found;

    if (TERMINAL_ENUM.includes(reservation.status)) {
      return res.status(400).json({ error: "This reservation can no longer be changed." });
    }

    const current = splitDateTime(reservation.reservationDateTime);
    const date = String(req.body?.date || current.date);
    const time = String(req.body?.time || current.time);
    const partySize =
      req.body?.partySize !== undefined ? Number(req.body.partySize) : reservation.guestCount;

    const settings = normalizeSettings(location.reservationSettings);
    const error = validateReservationRequest({
      settings,
      reservations: await activeReservationsForValidation(location.id),
      date,
      time,
      partySize,
      excludeId: reservation.id,
      timeZone: getLocationTimezone(location),
      openingHours: getLocationOpeningHours(location),
    });
    if (error) return res.status(400).json({ error });

    // Move capacity atomically: free this reservation's current seats, then try
    // to claim the new bucket. If the new bucket is full, restore the old hold.
    const oldBucket = bucketOf(reservation.reservationDateTime);
    const newDateTime = buildReservationDateTime(date, time);
    const newBucket = bucketOf(newDateTime);
    await releaseCapacity(location.id, oldBucket.dateKey, oldBucket.hour, reservation.guestCount);
    const reserved = await tryReserveCapacity(
      location.id,
      newBucket.dateKey,
      newBucket.hour,
      partySize,
      settings.maxReservedGuestsPerHour,
    );
    if (!reserved) {
      // Restore the original hold so we don't lose the seat on a failed change.
      await addCapacity(location.id, oldBucket.dateKey, oldBucket.hour, reservation.guestCount);
      return res
        .status(400)
        .json({ error: `${formatTimeLabel(time)} is fully booked. Please choose another time.` });
    }

    const updated = await prisma.reservation.update({
      where: { id: reservation.id },
      data: { guestCount: partySize, reservationDateTime: newDateTime },
    });
    await syncManageChange(location, updated);
    // Guest CRM: a reschedule/party-size change can move a booking between
    // upcoming and past, so refresh the guest profile.
    await touchGuestByReservationId(updated.id);

    return res.json({ reservation: reservationRowToLegacy(updated, { includeToken: true }) });
  } catch (err: any) {
    console.error("[reservations] manage update error:", err?.message || err);
    return res.status(500).json({ error: "Failed to update reservation." });
  }
});

/** Re-sync a logged-in customer's profile copy after a manage-link change. */
async function syncManageChange(location: any, reservationRow: Reservation) {
  if (!reservationRow?.customerId) return;
  const biz = await prisma.business.findUnique({
    where: { id: location.businessId },
    select: { name: true },
  });
  await syncCustomerReservation(reservationRowToLegacy(reservationRow), {
    businessName: biz?.name ?? null,
    locationName: location.displayName || location.name || biz?.name || null,
  });
}

/** POST cancel by manage token. */
router.post("/manage/:manageToken/cancel", async (req, res) => {
  try {
    const manageToken = String(req.params.manageToken || "").trim();
    // Throttle cancellations (releases capacity + emails) per IP and per token.
    if (
      await limitGuard(req, res, [
        { name: "reservation-manage-ip", key: clientIp(req), windowMs: MINUTES(10), max: 20 },
        { name: "reservation-manage-token", key: manageToken, windowMs: MINUTES(10), max: 10 },
      ])
    )
      return;

    const found = await findByManageToken(manageToken);
    if (!found) return res.status(404).json({ error: "Reservation not found" });
    const { location, reservation } = found;

    if (reservation.status === "CANCELLED") {
      return res.json({ reservation: reservationRowToLegacy(reservation, { includeToken: true }) });
    }
    if (["COMPLETED", "NO_SHOW"].includes(reservation.status)) {
      return res.status(400).json({ error: "This reservation can no longer be cancelled." });
    }

    // Free the seats this reservation was holding.
    const { dateKey, hour } = bucketOf(reservation.reservationDateTime);
    await releaseCapacity(location.id, dateKey, hour, reservation.guestCount);

    const updated = await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await syncManageChange(location, updated);
    // Guest CRM: a cancellation changes the guest's cancelled count.
    await touchGuestByReservationId(updated.id);

    return res.json({ reservation: reservationRowToLegacy(updated, { includeToken: true }) });
  } catch (err: any) {
    console.error("[reservations] manage cancel error:", err?.message || err);
    return res.status(500).json({ error: "Failed to cancel reservation." });
  }
});

export default router;

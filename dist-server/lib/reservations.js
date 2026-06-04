// Reservation helpers shared by the public booking endpoints, the manage-link
// endpoints, and the business dashboard. Reservations + per-location settings
// are stored as JSON on the Location model (same pattern as `queue`), so there
// is no separate Prisma model — these helpers normalize and validate that JSON.
import { prisma } from "./prisma.js";
// Statuses that occupy capacity. cancelled / completed / no_show are released.
export const ACTIVE_STATUSES = [
    "pending",
    "confirmed",
    "arrived",
];
export const DEFAULT_RESERVATION_SETTINGS = {
    reservationStartTime: "11:00",
    reservationEndTime: "22:00",
    maxPartySize: 8,
    maxReservedGuestsPerHour: 40,
    bookingWindowDays: 30,
    minNoticeMinutes: 60,
    confirmationMode: "auto",
    cancellationPolicy: "",
};
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function clampInt(v, min, max, fallback) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, n));
}
function validTime(v, fallback) {
    return typeof v === "string" && TIME_RE.test(v) ? v : fallback;
}
/** Normalize raw JSON settings into a complete, valid settings object. */
export function normalizeSettings(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    const mode = s.confirmationMode === "manual" ? "manual" : "auto";
    return {
        reservationStartTime: validTime(s.reservationStartTime, DEFAULT_RESERVATION_SETTINGS.reservationStartTime),
        reservationEndTime: validTime(s.reservationEndTime, DEFAULT_RESERVATION_SETTINGS.reservationEndTime),
        maxPartySize: clampInt(s.maxPartySize, 1, 100, DEFAULT_RESERVATION_SETTINGS.maxPartySize),
        maxReservedGuestsPerHour: clampInt(s.maxReservedGuestsPerHour, 1, 10000, DEFAULT_RESERVATION_SETTINGS.maxReservedGuestsPerHour),
        bookingWindowDays: clampInt(s.bookingWindowDays, 0, 365, DEFAULT_RESERVATION_SETTINGS.bookingWindowDays),
        minNoticeMinutes: clampInt(s.minNoticeMinutes, 0, 7 * 24 * 60, DEFAULT_RESERVATION_SETTINGS.minNoticeMinutes),
        confirmationMode: mode,
        cancellationPolicy: typeof s.cancellationPolicy === "string" ? s.cancellationPolicy.slice(0, 1000) : "",
    };
}
/** Minutes since midnight for an "HH:MM" string. */
function timeToMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}
function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
/**
 * Minutes that `timeZone` is ahead of UTC at the instant `at` (DST-aware).
 * Negative when the zone is behind UTC.
 */
function tzOffsetMinutes(timeZone, at) {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const map = {};
    for (const p of dtf.formatToParts(at)) {
        if (p.type !== "literal")
            map[p.type] = p.value;
    }
    const hour = map.hour === "24" ? 0 : Number(map.hour);
    const asUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
    return Math.round((asUTC - at.getTime()) / 60000);
}
/**
 * Absolute epoch ms for a wall-clock (`date`, `time`) interpreted in `timeZone`.
 * The restaurant's opening hours and slot times are wall-clock values in its own
 * timezone, so this is how we anchor them to a real instant for "now" comparisons.
 * Falls back to server-local parsing if `timeZone` is missing/invalid.
 */
export function zonedWallTimeToMs(date, time, timeZone) {
    if (!timeZone)
        return new Date(`${date}T${time}:00`).getTime();
    try {
        const [y, mo, d] = date.split("-").map(Number);
        const [h, mi] = time.split(":").map(Number);
        const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
        // Refine once to settle DST/offset transitions.
        const off1 = tzOffsetMinutes(timeZone, new Date(utcGuess));
        let ms = utcGuess - off1 * 60000;
        const off2 = tzOffsetMinutes(timeZone, new Date(ms));
        if (off2 !== off1)
            ms = utcGuess - off2 * 60000;
        return ms;
    }
    catch {
        return new Date(`${date}T${time}:00`).getTime();
    }
}
/** Wall-clock "YYYY-MM-DD" for instant `at` in `timeZone` (server-local fallback). */
export function zonedDateStr(at, timeZone) {
    if (!timeZone) {
        const y = at.getFullYear();
        const m = String(at.getMonth() + 1).padStart(2, "0");
        const d = String(at.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    try {
        // en-CA renders as YYYY-MM-DD.
        return new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(at);
    }
    catch {
        return zonedDateStr(at);
    }
}
/** Whole-day difference between two "YYYY-MM-DD" strings (b - a). */
function daysBetweenDateStr(a, b) {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    const aMs = Date.UTC(ay, am - 1, ad);
    const bMs = Date.UTC(by, bm - 1, bd);
    return Math.round((bMs - aMs) / 86400000);
}
/** 12-hour label, e.g. "7:00 PM". */
export function formatTimeLabel(t) {
    const [hStr, mStr] = t.split(":");
    let h = Number(hStr);
    const m = mStr;
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0)
        h = 12;
    return `${h}:${m} ${ampm}`;
}
/**
 * Reservations are stored as naive local datetimes: `${YYYY-MM-DD}T${HH:MM}`.
 * We never convert timezones — the restaurant's local clock is the source of
 * truth and both the customer and dashboard render the same wall-clock value.
 */
export function buildReservationDateTime(date, time) {
    return `${date}T${time}`;
}
/** Extract the "YYYY-MM-DD" and "HH:MM" parts of a stored reservation datetime. */
export function splitDateTime(dt) {
    const [date, rest] = String(dt || "").split("T");
    const time = (rest || "").slice(0, 5);
    return { date: date || "", time };
}
/**
 * Sum of guests from active reservations that fall in the same clock-hour bucket
 * as `time` on `date`. We bucket per hour to honor "max reserved guests per
 * hour" — a 7:00 and 7:30 booking both consume the 7 PM hour's capacity.
 */
function activeGuestsInHour(reservations, date, hour, excludeId) {
    let total = 0;
    for (const r of reservations) {
        if (!r || (excludeId && r.id === excludeId))
            continue;
        if (!ACTIVE_STATUSES.includes(r.status))
            continue;
        const { date: rDate, time: rTime } = splitDateTime(r.reservationDateTime);
        if (rDate !== date)
            continue;
        const rHour = Number(rTime.split(":")[0]);
        if (rHour !== hour)
            continue;
        total += Number(r.partySize) || 0;
    }
    return total;
}
/**
 * Compute bookable 30-minute slots for a given date + party size.
 * `now` is injectable for testing; defaults to current time.
 */
export function computeAvailability(params) {
    const { settings, reservations, date, partySize, timeZone } = params;
    const now = params.now || new Date();
    const partyTooLarge = partySize > settings.maxPartySize;
    // Booking window check at the date level, in the restaurant's timezone.
    const todayStr = zonedDateStr(now, timeZone);
    const daysAhead = DATE_RE.test(date) ? daysBetweenDateStr(todayStr, date) : 0;
    const outsideWindow = daysAhead < 0 || daysAhead > settings.bookingWindowDays;
    const slots = [];
    if (!DATE_RE.test(date))
        return { slots, partyTooLarge, outsideWindow };
    const startMin = timeToMinutes(settings.reservationStartTime);
    const endMin = timeToMinutes(settings.reservationEndTime);
    const earliestBookableMs = now.getTime() + settings.minNoticeMinutes * 60000;
    for (let m = startMin; m < endMin; m += 30) {
        const time = minutesToTime(m);
        const hour = Math.floor(m / 60);
        const used = activeGuestsInHour(reservations, date, hour, params.excludeId);
        const remaining = Math.max(0, settings.maxReservedGuestsPerHour - used);
        const slotMs = zonedWallTimeToMs(date, time, timeZone);
        let available = true;
        let reason;
        if (partyTooLarge) {
            available = false;
            reason = "party_too_large";
        }
        else if (outsideWindow) {
            available = false;
            reason = "closed";
        }
        else if (slotMs < earliestBookableMs) {
            available = false;
            reason = "too_soon";
        }
        else if (used + partySize > settings.maxReservedGuestsPerHour) {
            available = false;
            reason = "full";
        }
        slots.push({ time, label: formatTimeLabel(time), available, remaining, reason });
    }
    return { slots, partyTooLarge, outsideWindow };
}
/**
 * Validate a requested (date, time, partySize) against settings + existing
 * reservations. Returns null if OK, otherwise an error message. `excludeId`
 * lets an update ignore the reservation being modified when summing capacity.
 */
export function validateReservationRequest(params) {
    const { settings, reservations, date, time, partySize, timeZone } = params;
    const now = params.now || new Date();
    if (!DATE_RE.test(date))
        return "A valid date is required.";
    if (!TIME_RE.test(time))
        return "A valid time is required.";
    if (!Number.isInteger(partySize) || partySize < 1) {
        return "Number of guests must be at least 1.";
    }
    if (partySize > settings.maxPartySize) {
        return `This restaurant accepts parties of up to ${settings.maxPartySize}.`;
    }
    const { slots, outsideWindow } = computeAvailability({
        settings,
        reservations,
        date,
        partySize,
        now,
        excludeId: params.excludeId,
        timeZone,
    });
    if (outsideWindow) {
        return `Reservations can only be made up to ${settings.bookingWindowDays} days in advance.`;
    }
    const slot = slots.find((s) => s.time === time);
    if (!slot)
        return "That time is outside reservation hours.";
    if (slot.available)
        return null;
    switch (slot.reason) {
        case "too_soon":
            return `Reservations require at least ${settings.minNoticeMinutes} minutes notice.`;
        case "full":
            return `${formatTimeLabel(time)} is fully booked. Please choose another time.`;
        case "closed":
            return "That time is not available for reservations.";
        default:
            return "That time is no longer available.";
    }
}
/** Public-facing serialization (no manageToken leak in business lists). */
export function serializeReservation(r, opts = {}) {
    const base = {
        id: r.id,
        locationId: r.locationId ?? null,
        businessUsername: r.businessUsername ?? null,
        firstName: r.firstName ?? "",
        lastName: r.lastName ?? "",
        name: r.name ?? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
        contactMethod: r.contactMethod ?? null,
        phone: r.phone ?? "",
        countryCode: r.countryCode ?? "",
        email: r.email ?? "",
        partySize: Number(r.partySize) || 0,
        reservationDateTime: r.reservationDateTime ?? null,
        notes: r.notes ?? "",
        status: r.status ?? "pending",
        source: r.source ?? "seatping_public",
        createdAt: r.createdAt ?? null,
        updatedAt: r.updatedAt ?? null,
        cancelledAt: r.cancelledAt ?? null,
        arrivedAt: r.arrivedAt ?? null,
        completedAt: r.completedAt ?? null,
        noShowAt: r.noShowAt ?? null,
    };
    if (opts.includeToken)
        return { ...base, manageToken: r.manageToken ?? null };
    return base;
}
/**
 * Keep a logged-in customer's denormalized profile lists in sync with one of
 * their reservations. No-op for guest bookings (no `customerId`). Active
 * reservations land in `upcomingReservations`; terminal ones (cancelled /
 * completed / no_show) move to `pastReservations`. Idempotent — the entry is
 * removed from both lists first, then re-inserted into the right one.
 */
export async function syncCustomerReservation(reservation, opts = {}) {
    if (!reservation?.customerId)
        return;
    const user = await prisma.user.findUnique({
        where: { id: reservation.customerId },
        select: { upcomingReservations: true, pastReservations: true },
    });
    if (!user)
        return;
    const { date, time } = splitDateTime(reservation.reservationDateTime);
    const entry = {
        id: reservation.id,
        manageToken: reservation.manageToken ?? null,
        locationId: reservation.locationId ?? null,
        businessUsername: reservation.businessUsername ?? null,
        businessName: opts.businessName ?? null,
        locationName: opts.locationName ?? null,
        date,
        time,
        people: Number(reservation.partySize) || 0,
        status: reservation.status,
        createdAt: reservation.createdAt ?? null,
    };
    const active = ACTIVE_STATUSES.includes(reservation.status);
    const upcoming = (Array.isArray(user.upcomingReservations)
        ? user.upcomingReservations
        : []).filter((r) => r?.id !== reservation.id);
    const past = (Array.isArray(user.pastReservations)
        ? user.pastReservations
        : []).filter((r) => r?.id !== reservation.id);
    if (active)
        upcoming.unshift(entry);
    else
        past.unshift(entry);
    await prisma.user.update({
        where: { id: reservation.customerId },
        data: {
            upcomingReservations: upcoming,
            pastReservations: past,
        },
    });
}

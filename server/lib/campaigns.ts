// server/lib/campaigns.ts
//
// Guest Campaigns (Phase 3B). Shared, business-agnostic logic for the campaigns
// feature: template variable rendering, per-channel message building, SMS
// segment estimation, smart-audience resolution, recipient eligibility
// (opt-out + contact validity), and the idempotent SeatPing template seed.
//
// Everything here is pure/DB logic and is reused by BOTH the business API
// (preview, send-test, send) and the notification dispatcher (per-recipient
// rendering). All audience queries are scoped by businessId + locationId so a
// campaign can never reach another business's or location's guests.

import type { CampaignTemplate, GuestProfile } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  p,
  calloutBox,
  emailButton,
  esc,
  renderEmail,
} from "./email.js";
import { normalizeEmail, normalizePhone } from "./guests.js";

export type Channel = "EMAIL" | "WHATSAPP" | "SMS";

// Variables that are filled automatically from the guest/restaurant context and
// therefore NOT shown to the business as fillable fields. Names are lowercase
// snake_case because WhatsApp/Meta only accepts {{lowercase_underscore_digits}}
// placeholders, and we keep one consistent convention across all channels.
// `business_name` is kept as a legacy alias of `restaurant_name` so templates
// authored before the rename still render.
export const AUTO_VARIABLES = [
  "first_name",
  "guest_name",
  "restaurant_name",
  "business_name",
  "location_name",
];

/**
 * Normalize a variable name to the Meta-safe form: camelCase is split to
 * snake_case, everything is lowercased, and only [a-z0-9_] survive. So
 * "firstName" -> "first_name", "Order ID" -> "order_id".
 */
export function normalizeVariableName(raw: string): string {
  return String(raw || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Rewrite every {{placeholder}} in a template body to its normalized snake_case
 * form, so a business typing {{firstName}} or {{First Name}} is corrected to
 * {{first_name}} and stays consistent with the declared variable list + Meta.
 */
export function normalizeBodyPlaceholders(body: string): string {
  if (!body) return "";
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, inner: string) => {
    const norm = normalizeVariableName(inner);
    return norm ? `{{${norm}}}` : "";
  });
}

/**
 * WhatsApp/Meta does not allow a body that BEGINS or ENDS with a variable
 * parameter — there must be real text (a word) before the first {{...}} and
 * after the last {{...}}. Trailing punctuation alone is not enough. Returns a
 * human-readable error string, or null when the body is fine.
 */
export function validateBodyParamPositions(body: string): string | null {
  if (!body) return null;
  const firstOpen = body.indexOf("{{");
  if (firstOpen === -1) return null; // no variables at all
  const lastClose = body.lastIndexOf("}}");
  const hasWord = (s: string) => /[a-z0-9]/i.test(s);
  if (!hasWord(body.slice(0, firstOpen))) {
    return "The message can't start with a variable. Add some text before the first {{variable}}.";
  }
  if (lastClose >= 0 && !hasWord(body.slice(lastClose + 2))) {
    return "The message can't end with a variable. Add some text after the last {{variable}}.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Smart audience groups (MVP set). `key` is persisted on the campaign; `needsTag`
// flags the one group that requires a tag value in audienceConfig.
// ---------------------------------------------------------------------------
export const AUDIENCE_GROUPS: Array<{
  key: string;
  label: string;
  description: string;
  needsTag?: boolean;
}> = [
  { key: "all_guests", label: "All Guests", description: "Every guest at this location." },
  { key: "returning", label: "Returning Guests", description: "Guests with two or more visits." },
  { key: "new", label: "New Guests", description: "Guests with fewer than two visits." },
  { key: "with_tag", label: "Guests With Tag", description: "Guests who have a specific tag.", needsTag: true },
  { key: "visited_yesterday", label: "Guests Who Visited Yesterday", description: "Guests whose last visit was yesterday." },
  { key: "not_returned_15d", label: "Guests Who Have Not Returned In 15 Days", description: "Visited before but not in the last 15 days." },
  { key: "not_returned_30d", label: "Guests Who Have Not Returned In 30 Days", description: "Visited before but not in the last 30 days." },
  { key: "not_returned_60d", label: "Guests Who Have Not Returned In 60 Days", description: "Visited before but not in the last 60 days." },
  { key: "upcoming_reservations", label: "Guests With Upcoming Reservations", description: "Guests with at least one upcoming reservation." },
  { key: "no_show_history", label: "Guests With No-Show History", description: "Guests who have at least one no-show." },
];

export const MANUAL_AUDIENCE = "manual";
export const CUSTOM_GROUP_AUDIENCE = "custom_group";

export function isValidAudienceType(type: string): boolean {
  return type === MANUAL_AUDIENCE || type === CUSTOM_GROUP_AUDIENCE || AUDIENCE_GROUPS.some((g) => g.key === type);
}

// ---------------------------------------------------------------------------
// Variable rendering
// ---------------------------------------------------------------------------

/** Replace {{var}} placeholders. Unknown placeholders render as empty string. */
export function renderString(
  template: string,
  values: Record<string, string>,
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = values[key];
    return v == null ? "" : String(v);
  });
}

/** Editable variables = declared variables minus the auto-filled ones. */
export function editableVariables(template: { variables: string[] }): string[] {
  return (template.variables || []).filter((v) => !AUTO_VARIABLES.includes(v));
}

export interface RenderContext {
  businessName: string;
  businessEmail?: string | null;
  locationName: string;
  // Per-recipient identity. Null for preview/test renders (example values used).
  firstName?: string | null;
  guestName?: string | null;
}

/**
 * Merge the campaign-level filled values with the per-recipient/auto context.
 * Auto values always win so a business can't override the guest's real name.
 */
function buildValueMap(
  filled: Record<string, string>,
  ctx: RenderContext,
): Record<string, string> {
  return {
    ...filled,
    first_name: ctx.firstName || "there",
    guest_name: ctx.guestName || ctx.firstName || "there",
    restaurant_name: ctx.businessName,
    business_name: ctx.businessName, // legacy alias for pre-rename templates
    location_name: ctx.locationName,
  };
}

export interface BuiltMessage {
  subject?: string;
  text: string;
  html?: string;
  whatsappTemplateName?: string | null;
  whatsappLanguage?: string;
  whatsappParams?: string[];
}

/**
 * Build the final channel-specific message for a template + filled values +
 * context. Email gets the shared SeatPing HTML shell; SMS/WhatsApp get plain
 * text. Every channel clearly names the business and the "via SeatPing" sender.
 */
export function buildMessage(
  template: CampaignTemplate,
  filled: Record<string, string>,
  ctx: RenderContext,
  channel: Channel,
): BuiltMessage {
  const values = buildValueMap(filled, ctx);
  const bodyText = renderString(template.body, values).trim();
  const offer = template.offerDetails
    ? renderString(template.offerDetails, values).trim()
    : "";
  const ctaText = template.ctaText
    ? renderString(template.ctaText, values).trim()
    : "";
  const ctaUrl = template.ctaUrl ? template.ctaUrl.trim() : "";
  const nameLine = renderString(template.name, values).trim() || "A message";

  if (channel === "EMAIL") {
    const subject = `${ctx.businessName}: ${nameLine}`;
    const html = renderEmail({
      heading: nameLine,
      preheader: bodyText.slice(0, 110),
      tagline: `Sent by SeatPing on behalf of ${ctx.businessName}`,
      bodyHtml: `
        ${p(esc(bodyText).replace(/\n/g, "<br>"))}
        ${offer ? calloutBox(`<strong>${esc(offer)}</strong>`) : ""}
        ${ctaText && ctaUrl ? emailButton(ctaUrl, ctaText) : ""}
        ${p(`<span style="color:#8A8580;font-size:12px;">You are receiving this because you visited ${esc(ctx.businessName)}. Sent by SeatPing on behalf of ${esc(ctx.businessName)}.</span>`)}
      `,
    });
    // Plain-text fallback for the text column / logging.
    const text = [bodyText, offer, ctaText && ctaUrl ? `${ctaText}: ${ctaUrl}` : ""]
      .filter(Boolean)
      .join("\n\n");
    return { subject, text, html };
  }

  // SMS / WhatsApp plain text.
  const lines = [bodyText];
  if (offer) lines.push(offer);
  if (ctaText && ctaUrl) lines.push(`${ctaText}: ${ctaUrl}`);
  lines.push(`— ${ctx.businessName} (via SeatPing)`);
  const text = lines.filter(Boolean).join("\n\n");

  if (channel === "WHATSAPP") {
    return {
      text,
      whatsappTemplateName: template.whatsappProviderTemplateName ?? null,
      whatsappLanguage: template.whatsappLanguage || "en",
      // Simple single-body-variable Meta template convention: the whole rendered
      // message is passed as the one {{1}} body parameter.
      whatsappParams: [text],
    };
  }

  return { text };
}

// ---------------------------------------------------------------------------
// SMS segment estimation (GSM-7 vs UCS-2, very close to carrier behavior)
// ---------------------------------------------------------------------------
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch) || GSM7_EXT.includes(ch)) continue;
    return false;
  }
  return true;
}

export function smsSegments(text: string): { segments: number; characters: number; encoding: "GSM-7" | "UCS-2" } {
  const gsm = isGsm7(text);
  // Extended GSM chars count as 2; UCS-2 counts code units.
  let length = 0;
  if (gsm) {
    for (const ch of text) length += GSM7_EXT.includes(ch) ? 2 : 1;
  } else {
    length = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  }
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const segments = length <= single ? 1 : Math.ceil(length / multi);
  return { segments: Math.max(1, segments), characters: length, encoding: gsm ? "GSM-7" : "UCS-2" };
}

// ---------------------------------------------------------------------------
// Audience resolution
// ---------------------------------------------------------------------------

/** Start/end UTC instants for a calendar day (offset 0 = today) in a timezone. */
function zonedDayRange(timeZone: string, dayOffset: number): { start: Date; end: Date } {
  const now = new Date();
  // Local Y-M-D for `now` in the target timezone.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(now).split("-").map(Number);
  // Midnight (local) of the target day, expressed as a UTC instant: take the
  // naive midnight, then correct by the zone's offset at that moment.
  const naiveStart = Date.UTC(y, m - 1, d + dayOffset, 0, 0, 0);
  const offset = tzOffsetMs(new Date(naiveStart), timeZone);
  const start = new Date(naiveStart - offset);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) if (part.type !== "literal") map[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    map.hour === "24" ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

// ---------------------------------------------------------------------------
// Restaurant identity + scheduling time math (shared by the route + runner)
// ---------------------------------------------------------------------------

/**
 * The public restaurant name for a location — the {{restaurant_name}} value used
 * in campaign messages + the "on behalf of" sender line. The public name lives
 * in the location's restaurant profile under `displayName`; the top-level
 * Location.displayName is only the short location label ("PIK Avenue"). Prefer
 * the profile name, then the location label, then the business account name.
 */
export function restaurantNameForLocation(loc: any, fallback: string): string {
  const profile =
    loc?.restaurantProfile && typeof loc.restaurantProfile === "object"
      ? loc.restaurantProfile
      : {};
  const profileName =
    (typeof profile.displayName === "string" && profile.displayName.trim()) ||
    (typeof profile.name === "string" && profile.name.trim()) ||
    "";
  return profileName || loc?.displayName || loc?.name || fallback;
}

/**
 * Convert a naive local wall-clock "YYYY-MM-DDTHH:MM" (in `timeZone`) to a real
 * UTC instant. Returns null for an unparseable input.
 */
export function wallClockToUtc(
  local: string | null | undefined,
  timeZone: string,
): Date | null {
  if (!local || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  const naive = Date.parse(`${local.slice(0, 16)}:00Z`);
  if (Number.isNaN(naive)) return null;
  const offset = tzOffsetMs(new Date(naive), timeZone);
  return new Date(naive - offset);
}

/** Format a UTC instant as a readable date+time string in the given timezone. */
export function formatInstantInTimezone(
  instant: Date | string | null | undefined,
  timeZone: string,
): string | null {
  if (!instant) return null;
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleString("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

/**
 * Advance a recurring run to its next occurrence, preserving the local
 * wall-clock time of day in `timeZone`. DAILY/WEEKLY add fixed day intervals;
 * MONTHLY advances the local calendar month (clamping day-of-month).
 */
export function advanceRecurrence(
  from: Date,
  frequency: "DAILY" | "WEEKLY" | "MONTHLY",
  timeZone: string,
): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(from);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  
  let year = Number(m.year);
  let month = Number(m.month); // 1-12
  let day = Number(m.day);
  const hour = m.hour === "24" ? 0 : Number(m.hour);
  const minute = Number(m.minute);

  if (frequency === "DAILY") {
    day += 1;
  } else if (frequency === "WEEKLY") {
    day += 7;
  } else if (frequency === "MONTHLY") {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const localDate = new Date(year, month - 1, day);
  const nextYear = localDate.getFullYear();
  const nextMonth = localDate.getMonth() + 1;
  let nextDay = localDate.getDate();

  if (frequency === "MONTHLY") {
    const daysInNextMonth = new Date(nextYear, nextMonth, 0).getDate();
    nextDay = Math.min(Number(m.day), daysInNextMonth);
  }

  const local = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return wallClockToUtc(local, timeZone) ?? new Date(from.getTime() + (frequency === "DAILY" ? 1 : frequency === "WEEKLY" ? 7 : 30) * 24 * 60 * 60 * 1000);
}

export interface AudienceQuery {
  businessId: string;
  locationId: string;
  audienceType: string;
  audienceConfig?: { tag?: string; guestIds?: string[]; savedAudienceId?: string; filters?: any } | null;
  timezone: string;
}

/**
 * Resolve the matching guests for an audience. Always scoped by business +
 * location. Returns the raw GuestProfile rows (eligibility filtering happens
 * separately so the preview can report exclusion reasons).
 */
export async function resolveAudienceGuests(
  q: AudienceQuery,
): Promise<GuestProfile[]> {
  const base = { businessId: q.businessId, locationId: q.locationId } as const;

  if (q.audienceType === MANUAL_AUDIENCE) {
    const ids = (q.audienceConfig?.guestIds || []).filter(Boolean);
    if (!ids.length) return [];
    return prisma.guestProfile.findMany({
      where: { ...base, id: { in: ids } },
    });
  }

  const where: any = { ...base };
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  switch (q.audienceType) {
    case "all_guests":
      break;
    case "returning":
      where.totalVisits = { gte: 2 };
      break;
    case "new":
      where.totalVisits = { lt: 2 };
      break;
    case "with_tag": {
      const tag = (q.audienceConfig?.tag || "").trim();
      if (!tag) return [];
      const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tagsRaw = (await prisma.guestProfile.findRaw({
        filter: {
          businessId: { $oid: q.businessId },
          locationId: { $oid: q.locationId },
          tags: { $regex: `^${escaped}$`, $options: "i" },
        },
      })) as unknown as any[];
      if (!tagsRaw.length) return [];
      where.id = { in: tagsRaw.map((t: any) => t._id.$oid) };
      break;
    }
    case "visited_yesterday": {
      const { start, end } = zonedDayRange(q.timezone, -1);
      where.lastVisitAt = { gte: start, lt: end };
      break;
    }
    case "not_returned_15d":
      where.lastVisitAt = { not: null, lte: daysAgo(15) };
      break;
    case "not_returned_30d":
      where.lastVisitAt = { not: null, lte: daysAgo(30) };
      break;
    case "not_returned_60d":
      where.lastVisitAt = { not: null, lte: daysAgo(60) };
      break;
    case "upcoming_reservations":
      where.upcomingReservationCount = { gt: 0 };
      break;
    case "no_show_history":
      where.noShowCount = { gt: 0 };
      break;
    case "custom_group": {
      let filters = q.audienceConfig?.filters || {};
      if (q.audienceConfig?.savedAudienceId) {
        const saved = await prisma.savedAudience.findUnique({
          where: { id: q.audienceConfig.savedAudienceId },
        });
        if (saved) filters = saved.filters || {};
      }

      // We handle the manual guestIds separately to create a UNION (OR logic)
      const manualGuestIds = (filters.guestIds && Array.isArray(filters.guestIds)) ? filters.guestIds : [];
      
      // Guest tags (case-insensitive regex)
      if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
        // Find IDs that match any of the tags (OR)
        const idSets = await Promise.all(
          filters.tags.map(async (tag: string) => {
            const escaped = tag.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const tagsRaw = (await prisma.guestProfile.findRaw({
              filter: {
                businessId: { $oid: q.businessId },
                locationId: { $oid: q.locationId },
                tags: { $regex: `^${escaped}$`, $options: "i" },
              },
            })) as unknown as any[];
            return tagsRaw.map((t: any) => t._id.$oid as string);
          })
        );
        // Flatten and deduplicate
        const matchedIds = Array.from(new Set(idSets.flat()));
        if (!matchedIds.length) {
          where.id = { in: [] }; // force empty if tags required but none found
        } else {
          where.id = { in: matchedIds };
        }
      }

      // Total visits
      if (filters.totalVisitsMin !== undefined || filters.totalVisitsMax !== undefined) {
        where.totalVisits = { ...where.totalVisits };
        if (filters.totalVisitsMin !== undefined) where.totalVisits.gte = Number(filters.totalVisitsMin);
        if (filters.totalVisitsMax !== undefined) where.totalVisits.lte = Number(filters.totalVisitsMax);
      }

      // Last visit
      if (filters.lastVisitMinDaysAgo !== undefined || filters.lastVisitMaxDaysAgo !== undefined) {
        where.lastVisitAt = { ...where.lastVisitAt, not: null };
        if (filters.lastVisitMinDaysAgo !== undefined) {
          where.lastVisitAt.lte = daysAgo(Number(filters.lastVisitMinDaysAgo));
        }
        if (filters.lastVisitMaxDaysAgo !== undefined) {
          where.lastVisitAt.gte = daysAgo(Number(filters.lastVisitMaxDaysAgo));
        }
      }

      if (filters.hasUpcomingReservation) where.upcomingReservationCount = { gt: 0 };
      if (filters.hasNoShowHistory) where.noShowCount = { gt: 0 };
      if (filters.hasNotes) where.notes = { not: null, notIn: ["", " "] };
      
      // If we forced empty tags match and there are NO manual guests, we can short-circuit
      if (where.id?.in?.length === 0 && manualGuestIds.length === 0) {
        return [];
      }

      // Query 1: Filter-matched guests
      let filterGuests: GuestProfile[] = [];
      if (where.id?.in?.length !== 0) {
        filterGuests = await prisma.guestProfile.findMany({
          where,
          orderBy: { lastVisitAt: "desc" },
          take: 5000,
        });
      }

      // Query 2: Manually selected guests
      let manualGuests: GuestProfile[] = [];
      if (manualGuestIds.length > 0) {
        manualGuests = await prisma.guestProfile.findMany({
          where: { ...base, id: { in: manualGuestIds } },
        });
      }

      // Combine and deduplicate
      const combined = [...filterGuests, ...manualGuests];
      const deduplicated = Array.from(
        new Map(combined.map(g => [g.id, g])).values()
      );

      // Sort by lastVisitAt desc
      deduplicated.sort((a, b) => {
        const timeA = a.lastVisitAt ? a.lastVisitAt.getTime() : 0;
        const timeB = b.lastVisitAt ? b.lastVisitAt.getTime() : 0;
        return timeB - timeA;
      });

      return deduplicated.slice(0, 5000);
    }
    default:
      return [];
  }

  return prisma.guestProfile.findMany({
    where,
    orderBy: { lastVisitAt: "desc" },
    take: 5000,
  });
}

// ---------------------------------------------------------------------------
// Recipient eligibility (opt-out + contact validity for the chosen channel)
// ---------------------------------------------------------------------------

export interface EligibleRecipient {
  guest: GuestProfile;
  email?: string;
  phone?: string; // digits-only incl. country code (E.164 without '+')
}

export interface AudienceResult {
  total: number;
  eligible: EligibleRecipient[];
  exclusions: { noEmail: number; noPhone: number; optedOut: number; invalid: number };
  excludedCount: number;
}

function optedOut(guest: GuestProfile, channel: Channel): boolean {
  if (guest.marketingOptOutAt) return true;
  if (channel === "EMAIL") return !!guest.emailMarketingOptOutAt || guest.emailMarketingOptIn === false;
  if (channel === "WHATSAPP") return !!guest.whatsappMarketingOptOutAt || guest.whatsappMarketingOptIn === false;
  return !!guest.smsMarketingOptOutAt || guest.smsMarketingOptIn === false;
}

/**
 * SMS is sent via a US Telnyx number, so it can only deliver to North American
 * Numbering Plan (+1) destinations — the US and Canada. A NANP E.164 number is
 * "1" + a 10-digit number whose area code starts 2-9. Numbers from any other
 * country are not SMS-deliverable here and are treated as invalid for SMS.
 */
export function isSmsDeliverable(digits: string): boolean {
  return /^1[2-9]\d{9}$/.test(digits);
}

/** Apply channel contact requirements + opt-out rules to a guest set. */
export function filterRecipients(
  guests: GuestProfile[],
  channel: Channel,
): AudienceResult {
  const eligible: EligibleRecipient[] = [];
  const exclusions = { noEmail: 0, noPhone: 0, optedOut: 0, invalid: 0 };

  for (const g of guests) {
    if (optedOut(g, channel)) {
      exclusions.optedOut += 1;
      continue;
    }
    if (channel === "EMAIL") {
      const email = normalizeEmail(g.email);
      if (!email) {
        if (g.email && g.email.trim()) exclusions.invalid += 1;
        else exclusions.noEmail += 1;
        continue;
      }
      eligible.push({ guest: g, email });
    } else {
      const phone = g.normalizedPhone || normalizePhone(g.phone, null);
      if (!phone) {
        if (g.phone && g.phone.trim()) exclusions.invalid += 1;
        else exclusions.noPhone += 1;
        continue;
      }
      // SMS only reaches US/Canada (+1) numbers; anything else is undeliverable.
      if (channel === "SMS" && !isSmsDeliverable(phone)) {
        exclusions.invalid += 1;
        continue;
      }
      eligible.push({ guest: g, phone });
    }
  }

  const excludedCount =
    exclusions.noEmail + exclusions.noPhone + exclusions.optedOut + exclusions.invalid;
  return { total: guests.length, eligible, exclusions, excludedCount };
}

// ---------------------------------------------------------------------------
// Template slug (Meta-safe internal identifier)
// ---------------------------------------------------------------------------
//
// WhatsApp Cloud API requires a template `name` of lowercase letters, digits and
// underscores only (^[a-z0-9_]+$), max 512 chars. The slug derived here is the
// identifier admins use when creating the WhatsApp template in Meta. We keep it
// well under the limit for readability.

const SLUG_MAX_LEN = 64;

/** Normalize a template name into a Meta-safe slug (lowercase, a-z0-9_). */
export function slugifyTemplateName(name: string): string {
  let s = (name || "")
    .normalize("NFKD") // decompose accents so é -> e, ü -> u, etc.
    .replace(/[̀-ͯ]/g, "") // strip the combining diacritical marks
    .toLowerCase()
    .trim()
    .replace(/['"`’]/g, "") // drop quotes/apostrophes outright (don't split words)
    .replace(/[^a-z0-9]+/g, "_") // any other non-alnum run -> single underscore
    .replace(/_+/g, "_") // collapse repeats
    .replace(/^_+|_+$/g, ""); // trim leading/trailing underscores
  if (!s) s = "template";
  return s.slice(0, SLUG_MAX_LEN).replace(/_+$/g, "");
}

/** True if a string is a valid WhatsApp/Meta template name. */
export function isValidMetaTemplateName(value: string): boolean {
  return /^[a-z0-9_]+$/.test(value) && value.length >= 1 && value.length <= 512;
}

/**
 * Generate a slug unique within the relevant scope:
 *   - SeatPing templates (businessId null): globally unique among SEATPING rows.
 *   - Custom templates: unique per business.
 * Appends _2, _3, ... on collision. `ignoreId` lets a row keep its own slug on
 * re-check (used when regenerating a draft's slug in place).
 */
export async function generateUniqueTemplateSlug(
  name: string,
  opts: { businessId?: string | null; ignoreId?: string } = {},
): Promise<string> {
  const base = slugifyTemplateName(name);
  const scope: any = opts.businessId
    ? { businessId: opts.businessId }
    : { templateType: "SEATPING" };

  let candidate = base;
  let n = 1;
  // Bounded loop; in practice a handful of collisions at most.
  for (let i = 0; i < 1000; i++) {
    const clash = await prisma.campaignTemplate.findFirst({
      where: {
        ...scope,
        slug: candidate,
        ...(opts.ignoreId ? { NOT: { id: opts.ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return candidate;
    n += 1;
    candidate = `${base}_${n}`;
  }
  // Extremely unlikely fallback.
  return `${base}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// SeatPing template seed (idempotent)
// ---------------------------------------------------------------------------

type SeedDef = {
  name: string;
  purpose: string;
  body: string;
  offerDetails?: string;
  ctaText?: string;
  variables: string[];
  exampleValues?: Record<string, string>;
  sortOrder: number;
};

export const SEATPING_TEMPLATE_SEEDS: SeedDef[] = [
  {
    name: "We Miss You",
    purpose: "Win back guests who have not visited in a while.",
    body: "Hi {{first_name}}, we miss you at {{restaurant_name}}! It has been a little while since your last visit and we would love to welcome you back.",
    variables: ["first_name"],
    sortOrder: 1,
  },
  {
    name: "Thanks For Visiting",
    purpose: "Thank a guest after a recent visit.",
    body: "Hi {{first_name}}, thank you for visiting {{restaurant_name}}. We hope you had a wonderful time and we would love to see you again soon.",
    variables: ["first_name"],
    sortOrder: 2,
  },
  {
    name: "Special Offer",
    purpose: "Share a limited-time offer with guests.",
    body: "Hi {{first_name}}, here is a special offer just for you from {{restaurant_name}}: {{offer}}. We hope to see you soon!",
    ctaText: "Book a table",
    variables: ["first_name", "offer"],
    exampleValues: { offer: "20% off your next visit this week" },
    sortOrder: 3,
  },
  {
    name: "New Menu Announcement",
    purpose: "Announce new menu items to guests.",
    body: "Hi {{first_name}}, {{restaurant_name}} just launched a new menu. Come in and try {{highlight}} on your next visit!",
    ctaText: "See the menu",
    variables: ["first_name", "highlight"],
    exampleValues: { highlight: "our new seasonal specials" },
    sortOrder: 4,
  },
  {
    name: "Come Back Soon",
    purpose: "A warm nudge to return.",
    body: "Hi {{first_name}}, we would love to welcome you back to {{restaurant_name}}. Come back and see us soon!",
    variables: ["first_name"],
    sortOrder: 5,
  },
  {
    name: "No-Show Follow-Up",
    purpose: "Gently follow up after a missed reservation.",
    body: "Hi {{first_name}}, we missed you at {{restaurant_name}}. No worries at all, we would be happy to help you rebook a table whenever you are ready.",
    ctaText: "Rebook now",
    variables: ["first_name"],
    sortOrder: 6,
  },
];

let seedPromise: Promise<void> | null = null;

/**
 * Insert/refresh the curated SeatPing templates. Idempotent: matched by
 * (templateType=SEATPING, name). Also makes the SeatPing set authoritative by
 * deactivating any SEATPING template not in the seed list (e.g. the retired
 * Reservation Reminder), assigns each a Meta-safe slug + default WhatsApp
 * provider name, and backfills slugs on any template still missing one. Cached
 * per process so concurrent callers share one pass.
 */
export async function seedSeatPingTemplates(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const keepNames = new Set(SEATPING_TEMPLATE_SEEDS.map((d) => d.name));

    for (const def of SEATPING_TEMPLATE_SEEDS) {
      const slug = slugifyTemplateName(def.name);
      const shared = {
        purpose: def.purpose,
        body: def.body,
        offerDetails: def.offerDetails ?? null,
        ctaText: def.ctaText ?? null,
        variables: def.variables,
        exampleValues: def.exampleValues ?? {},
        sortOrder: def.sortOrder,
        slug,
        // Default the Meta template name to the slug; admins can adjust later.
        whatsappProviderTemplateName: slug,
        approvalStatus: "APPROVED" as const,
        isActive: true,
      };
      const existing = await prisma.campaignTemplate.findFirst({
        where: { templateType: "SEATPING", name: def.name },
        select: { id: true },
      });
      if (existing) {
        await prisma.campaignTemplate.update({ where: { id: existing.id }, data: shared });
      } else {
        await prisma.campaignTemplate.create({
          data: { templateType: "SEATPING", name: def.name, ...shared },
        });
      }
    }

    // Retire any curated SeatPing template no longer in the seed list
    // (e.g. Reservation Reminder). Soft-deactivate AND delete so it disappears
    // from the business UI and the picker.
    await prisma.campaignTemplate.deleteMany({
      where: { templateType: "SEATPING", name: { notIn: Array.from(keepNames) } },
    });

    // Backfill slugs for any templates (custom or legacy) still missing one.
    const missing = await prisma.campaignTemplate.findMany({
      where: { OR: [{ slug: null }, { slug: "" }] },
      select: { id: true, name: true, businessId: true, whatsappProviderTemplateName: true },
    });
    for (const t of missing) {
      const slug = await generateUniqueTemplateSlug(t.name, { businessId: t.businessId, ignoreId: t.id });
      await prisma.campaignTemplate.update({
        where: { id: t.id },
        data: {
          slug,
          // Default the provider name to the slug only if an admin hasn't set one.
          ...(t.whatsappProviderTemplateName ? {} : { whatsappProviderTemplateName: slug }),
        },
      });
    }
  })().catch((err) => {
    // Reset so a later call can retry after a transient failure.
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

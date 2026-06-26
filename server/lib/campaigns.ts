
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
import type { WhatsAppBodyParam } from "./whatsapp.js";

export type Channel = "EMAIL" | "WHATSAPP" | "SMS";

export const AUTO_VARIABLES = [
  "first_name",
  "guest_name",
  "restaurant_name",
  "business_name",
  "location_name",
];

export function normalizeVariableName(raw: string): string {
  return String(raw || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeBodyPlaceholders(body: string): string {
  if (!body) return "";
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, inner: string) => {
    const norm = normalizeVariableName(inner);
    return norm ? `{{${norm}}}` : "";
  });
}

export function validateBodyParamPositions(body: string): string | null {
  if (!body) return null;
  const firstOpen = body.indexOf("{{");
  if (firstOpen === -1) return null;
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

export function editableVariables(template: { variables: string[] }): string[] {
  return (template.variables || []).filter((v) => !AUTO_VARIABLES.includes(v));
}

export interface RenderContext {
  businessName: string;
  businessEmail?: string | null;
  locationName: string;
  firstName?: string | null;
  guestName?: string | null;
}

function buildValueMap(
  filled: Record<string, string>,
  ctx: RenderContext,
): Record<string, string> {
  return {
    ...filled,
    first_name: ctx.firstName || "there",
    guest_name: ctx.guestName || ctx.firstName || "there",
    restaurant_name: ctx.businessName,
    restaurant: ctx.businessName,
    business_name: ctx.businessName,
    location_name: ctx.locationName,
  };
}

export function extractBodyPlaceholders(body: string): string[] {
  if (!body) return [];
  const out: string[] = [];
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export interface BuiltMessage {
  subject?: string;
  text: string;
  html?: string;
  whatsappTemplateName?: string | null;
  whatsappLanguage?: string;
  whatsappParams?: WhatsAppBodyParam[];
  whatsappValues?: Record<string, string>;
}

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
        ${p(`<span style="color:#64748B;font-size:12px;">You are receiving this because you visited ${esc(ctx.businessName)}. Sent by SeatPing on behalf of ${esc(ctx.businessName)}.</span>`)}
      `,
    });
    const text = [bodyText, offer, ctaText && ctaUrl ? `${ctaText}: ${ctaUrl}` : ""]
      .filter(Boolean)
      .join("\n\n");
    return { subject, text, html };
  }

  const lines = [bodyText];
  if (offer) lines.push(offer);
  if (ctaText && ctaUrl) lines.push(`${ctaText}: ${ctaUrl}`);
  lines.push(`— ${ctx.businessName} (via SeatPing)`);
  const text = lines.filter(Boolean).join("\n\n");

  if (channel === "WHATSAPP") {
    const placeholders = extractBodyPlaceholders(template.body);
    const isPositional =
      placeholders.length > 0 && placeholders.every((ph) => /^\d+$/.test(ph));

    const waValues: Record<string, string> = { ...values };
    if (!waValues.offer && offer) waValues.offer = offer;

    let whatsappParams: WhatsAppBodyParam[];
    if (isPositional) {
      const maxIndex = Math.max(...placeholders.map((ph) => parseInt(ph, 10)));
      whatsappParams = [];
      for (let i = 1; i <= maxIndex; i++) {
        const v = waValues[String(i)];
        whatsappParams.push({ text: v == null ? "" : String(v) });
      }
    } else {
      whatsappParams = placeholders.map((name) => {
        const v = waValues[name];
        return { name, text: v == null ? "" : String(v) };
      });
    }

    return {
      text,
      whatsappTemplateName: template.whatsappProviderTemplateName ?? null,
      whatsappLanguage: template.whatsappLanguage || "en",
      whatsappParams,
      whatsappValues: waValues,
    };
  }

  return { text };
}

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


function zonedDayRange(timeZone: string, dayOffset: number): { start: Date; end: Date } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(now).split("-").map(Number);
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
  let month = Number(m.month);
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

      const manualGuestIds = (filters.guestIds && Array.isArray(filters.guestIds)) ? filters.guestIds : [];
      
      if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
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
        const matchedIds = Array.from(new Set(idSets.flat()));
        if (!matchedIds.length) {
          where.id = { in: [] };
        } else {
          where.id = { in: matchedIds };
        }
      }

      if (filters.totalVisitsMin !== undefined || filters.totalVisitsMax !== undefined) {
        where.totalVisits = { ...where.totalVisits };
        if (filters.totalVisitsMin !== undefined) where.totalVisits.gte = Number(filters.totalVisitsMin);
        if (filters.totalVisitsMax !== undefined) where.totalVisits.lte = Number(filters.totalVisitsMax);
      }

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
      
      if (where.id?.in?.length === 0 && manualGuestIds.length === 0) {
        return [];
      }

      let filterGuests: GuestProfile[] = [];
      if (where.id?.in?.length !== 0) {
        filterGuests = await prisma.guestProfile.findMany({
          where,
          orderBy: { lastVisitAt: "desc" },
          take: 5000,
        });
      }

      let manualGuests: GuestProfile[] = [];
      if (manualGuestIds.length > 0) {
        manualGuests = await prisma.guestProfile.findMany({
          where: { ...base, id: { in: manualGuestIds } },
        });
      }

      const combined = [...filterGuests, ...manualGuests];
      const deduplicated = Array.from(
        new Map(combined.map(g => [g.id, g])).values()
      );

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


export interface EligibleRecipient {
  guest: GuestProfile;
  email?: string;
  phone?: string;
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

export function isSmsDeliverable(digits: string): boolean {
  return /^1[2-9]\d{9}$/.test(digits);
}

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


const SLUG_MAX_LEN = 64;

export function slugifyTemplateName(name: string): string {
  let s = (name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/['"`’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) s = "template";
  return s.slice(0, SLUG_MAX_LEN).replace(/_+$/g, "");
}

export function isValidMetaTemplateName(value: string): boolean {
  return /^[a-z0-9_]+$/.test(value) && value.length >= 1 && value.length <= 512;
}

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
  return `${base}_${Date.now()}`;
}


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

    await prisma.campaignTemplate.deleteMany({
      where: { templateType: "SEATPING", name: { notIn: Array.from(keepNames) } },
    });

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
          ...(t.whatsappProviderTemplateName ? {} : { whatsappProviderTemplateName: slug }),
        },
      });
    }
  })().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

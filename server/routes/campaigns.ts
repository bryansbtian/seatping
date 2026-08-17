
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBusiness } from "../lib/auth.js";
import { rateLimit, limitGuard, HOURS } from "../lib/rateLimit.js";
import { getLocationTimezone } from "../lib/operatingHours.js";
import { SUGGESTED_GUEST_TAGS } from "../lib/guests.js";
import { rawCampaignSend } from "../lib/notifications.js";
import { sendEmailDetailed, renderEmail, p, esc } from "../lib/email.js";
import {
  AUDIENCE_GROUPS,
  MANUAL_AUDIENCE,
  CUSTOM_GROUP_AUDIENCE,
  isValidAudienceType,
  editableVariables,
  buildMessage,
  filterRecipients,
  resolveAudienceGuests,
  seedSeatPingTemplates,
  generateUniqueTemplateSlug,
  normalizeVariableName,
  normalizeBodyPlaceholders,
  validateBodyParamPositions,
  restaurantNameForLocation,
  wallClockToUtc,
  advanceRecurrence,
  zonedDayOfMonth,
  formatInstantInTimezone,
  smsSegments,
  type Channel,
} from "../lib/campaigns.js";
import {
  executeCampaignRun,
  reconcileCampaign,
} from "../lib/campaignRunner.js";
import type {
  Campaign,
  CampaignTemplate,
  CampaignChannel,
} from "@prisma/client";

const router = Router();

const campaignsLimiter = rateLimit({
  name: "campaigns-api",
  windowMs: 60 * 1000,
  max: 120,
});
router.use(requireBusiness, campaignsLimiter);

const CHANNELS: Channel[] = ["EMAIL", "WHATSAPP", "SMS"];
const MANUAL_GUEST_LIMIT = 1000;

function bizId(req: any): string {
  return String(req.auth?.sub || "");
}

function locationLabel(loc: {
  name: string | null;
  displayName: string | null;
  address: string;
}): string {
  return loc.displayName || loc.name || loc.address || "Location";
}

async function ownedLocation(businessId: string, locationId: string) {
  if (!locationId) {
    return null;
  }
  return prisma.location.findFirst({
    where: { id: locationId, businessId },
    select: {
      id: true,
      name: true,
      displayName: true,
      address: true,
      restaurantProfile: true,
    },
  });
}

async function loadBusiness(businessId: string) {
  return prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, username: true, email: true, phone: true },
  });
}

function isTemplateUsable(t: CampaignTemplate): boolean {
  if (t.templateType === "SEATPING") {
    return t.isActive && t.approvalStatus === "APPROVED";
  }
  return t.approvalStatus === "APPROVED";
}

function serializeTemplate(t: CampaignTemplate) {
  let rejectionReason: string | null;
  if (t.approvalStatus === "REJECTED") {
    rejectionReason = t.rejectionReason;
  } else {
    rejectionReason = null;
  }
  return {
    id: t.id,
    templateType: t.templateType,
    name: t.name,
    slug: t.slug,
    purpose: t.purpose,
    body: t.body,
    offerDetails: t.offerDetails,
    ctaText: t.ctaText,
    ctaUrl: t.ctaUrl,
    variables: t.variables,
    editableVariables: editableVariables(t),
    exampleValues: t.exampleValues ?? {},
    approvalStatus: t.approvalStatus,
    rejectionReason,
    usable: isTemplateUsable(t),
    locationId: t.locationId,
    submittedAt: t.submittedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

async function audienceLabelFor(
  c: Campaign,
  nameCache?: Map<string, string>,
): Promise<string> {
  if (c.audienceType === MANUAL_AUDIENCE) {
    return "Manually Selected Guests";
  }
  if (c.audienceType === CUSTOM_GROUP_AUDIENCE) {
    const sid = (c.audienceConfig as any)?.savedAudienceId as string | undefined;
    if (!sid) {
      return "Custom Group";
    }
    if (nameCache?.has(sid)) {
      return nameCache.get(sid)!;
    }
    const sa = await prisma.savedAudience.findFirst({
      where: { id: sid, businessId: c.businessId },
      select: { name: true },
    });
    const name = sa?.name || "Custom Group";
    nameCache?.set(sid, name);
    return name;
  }
  return (
    AUDIENCE_GROUPS.find((g) => g.key === c.audienceType)?.label || c.audienceType
  );
}

async function serializeCampaign(
  c: Campaign,
  extra?: {
    templateName?: string | null;
    templateType?: string | null;
    locationLabel?: string | null;
    audienceLabel?: string | null;
  },
) {
  let scheduledAtLabel: string | null;
  if (c.timezone) {
    scheduledAtLabel = formatInstantInTimezone(c.scheduledAt, c.timezone);
  } else {
    scheduledAtLabel = null;
  }
  let nextRunAtLabel: string | null;
  if (c.timezone) {
    nextRunAtLabel = formatInstantInTimezone(c.nextRunAt, c.timezone);
  } else {
    nextRunAtLabel = null;
  }
  return {
    id: c.id,
    name: c.name,
    channel: c.channel,
    templateId: c.templateId,
    templateName: extra?.templateName ?? null,
    templateType: extra?.templateType ?? null,
    audienceType: c.audienceType,
    audienceLabel: extra?.audienceLabel ?? (await audienceLabelFor(c)),
    audienceConfig: c.audienceConfig ?? {},
    templateValues: c.templateValues ?? {},
    status: c.status,
    recipientCount: c.recipientCount,
    excludedCount: c.excludedCount,
    sentCount: c.sentCount,
    failedCount: c.failedCount,
    skippedCount: c.skippedCount,
    locationId: c.locationId,
    locationLabel: extra?.locationLabel ?? null,
    sentAt: c.sentAt,
    sendMode: c.sendMode,
    timezone: c.timezone,
    scheduledAt: c.scheduledAt,
    scheduledAtLabel,
    recurrenceFrequency: c.recurrenceFrequency,
    recurrenceStartAt: c.recurrenceStartAt,
    recurrenceEndAt: c.recurrenceEndAt,
    maxSendsPerGuestWindowDays: c.maxSendsPerGuestWindowDays,
    nextRunAt: c.nextRunAt,
    nextRunAtLabel,
    lastRunAt: c.lastRunAt,
    isPaused: c.isPaused,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}


router.get("/meta", async (req, res) => {
  try {
    const businessId = bizId(req);
    const [locations, business] = await Promise.all([
      prisma.location.findMany({
        where: { businessId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          displayName: true,
          address: true,
          restaurantProfile: true,
        },
      }),
      prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      }),
    ]);

    return res.json({
      locations: locations.map((l) => {
        let restaurantName: string;
        if (business) {
          restaurantName = restaurantNameForLocation(l, business.name);
        } else {
          restaurantName = locationLabel(l);
        }
        return {
          id: l.id,
          label: locationLabel(l),
          timezone: getLocationTimezone(l),
          restaurantName,
        };
      }),
      channels: CHANNELS,
      audiences: AUDIENCE_GROUPS,
      suggestedTags: SUGGESTED_GUEST_TAGS,
    });
  } catch (err: any) {
    console.error("[campaigns] meta error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});


router.get("/templates", async (req, res) => {
  try {
    const businessId = bizId(req);
    await seedSeatPingTemplates().catch((e) =>
      console.error("[campaigns] seed error:", e?.message || e),
    );
    const templates = await prisma.campaignTemplate.findMany({
      where: {
        OR: [
          { templateType: "SEATPING", isActive: true },
          { templateType: "CUSTOM", businessId },
        ],
      },
      orderBy: [{ templateType: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return res.json({ templates: templates.map(serializeTemplate) });
  } catch (err: any) {
    console.error("[campaigns] list templates error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/templates/:id", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    const t = await prisma.campaignTemplate.findFirst({
      where: {
        id,
        OR: [{ templateType: "SEATPING" }, { templateType: "CUSTOM", businessId }],
      },
    });
    if (!t) {
      return res.status(404).json({ error: "Template not found" });
    }
    return res.json({ template: serializeTemplate(t) });
  } catch (err: any) {
    console.error("[campaigns] get template error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

function parseTemplateBody(body: any): { data?: any; error?: string } {
  const name = String(body?.name || "").trim();
  if (!name) {
    return { error: "Template name is required" };
  }
  const message = String(body?.body ?? body?.mainMessage ?? "").trim();
  if (!message) {
    return { error: "Main message is required" };
  }

  let variables: string[] = [];
  if (body?.variables !== undefined) {
    if (!Array.isArray(body.variables)) {
      return { error: "variables must be an array" };
    }
    const seen = new Set<string>();
    for (const raw of body.variables) {
      if (typeof raw !== "string") {
        return { error: "variables must be strings" };
      }
      const v = normalizeVariableName(raw);
      if (!v || seen.has(v)) {
        continue;
      }
      seen.add(v);
      variables.push(v);
    }
    variables = variables.slice(0, 20);
  }

  const normalizedBody = normalizeBodyPlaceholders(message.slice(0, 4000));
  let normalizedOffer: string | null;
  if (body?.offerDetails) {
    normalizedOffer = normalizeBodyPlaceholders(String(body.offerDetails).slice(0, 1000));
  } else {
    normalizedOffer = null;
  }

  const posError = validateBodyParamPositions(normalizedBody);
  if (posError) {
    return { error: posError };
  }

  const exampleValues: Record<string, string> = {};
  if (body?.exampleValues !== undefined) {
    if (typeof body.exampleValues !== "object" || Array.isArray(body.exampleValues)) {
      return { error: "exampleValues must be an object" };
    }
    for (const [k, v] of Object.entries(body.exampleValues)) {
      const key = normalizeVariableName(String(k));
      if (key) {
        exampleValues[key] = String(v ?? "").slice(0, 200);
      }
    }
  }

  let purposeValue: string | null = null;
  if (body?.purpose !== undefined) {
    purposeValue = String(body.purpose).slice(0, 300);
  }
  let ctaTextValue: string | null = null;
  if (body?.ctaText) {
    ctaTextValue = String(body.ctaText).slice(0, 120);
  }
  let ctaUrlValue: string | null = null;
  if (body?.ctaUrl) {
    ctaUrlValue = String(body.ctaUrl).slice(0, 500);
  }

  return {
    data: {
      name: name.slice(0, 120),
      purpose: purposeValue,
      body: normalizedBody,
      offerDetails: normalizedOffer,
      ctaText: ctaTextValue,
      ctaUrl: ctaUrlValue,
      variables,
      exampleValues,
    },
  };
}

router.post("/templates", async (req, res) => {
  try {
    const businessId = bizId(req);
    const business = await loadBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const { data, error } = parseTemplateBody(req.body || {});
    if (error) {
      return res.status(400).json({ error });
    }

    let locationId: string | null = null;
    if (req.body?.locationId) {
      const loc = await ownedLocation(businessId, String(req.body.locationId));
      if (!loc) {
        return res.status(404).json({ error: "Location not found or access denied" });
      }
      locationId = loc.id;
    }

    const slug = await generateUniqueTemplateSlug(data.name, { businessId });

    const created = await prisma.campaignTemplate.create({
      data: {
        templateType: "CUSTOM",
        businessId,
        businessUsername: business.username,
        locationId,
        approvalStatus: "DRAFT",
        slug,
        whatsappProviderTemplateName: slug,
        ...data,
      },
    });
    return res.json({ template: serializeTemplate(created) });
  } catch (err: any) {
    console.error("[campaigns] create template error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/templates/:id", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    const t = await prisma.campaignTemplate.findFirst({
      where: { id, templateType: "CUSTOM", businessId },
    });
    if (!t) {
      return res.status(404).json({ error: "Template not found" });
    }
    const { data, error } = parseTemplateBody(req.body || {});
    if (error) {
      return res.status(400).json({ error });
    }

    let statusUpdate: {
      approvalStatus?: "PENDING_SEATPING_REVIEW";
      submittedAt?: Date;
      rejectionReason?: null;
      rejectedAt?: null;
    } = {};
    if (t.approvalStatus === "APPROVED") {
      statusUpdate = {
        approvalStatus: "PENDING_SEATPING_REVIEW",
        submittedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      };
    }

    let locationId = t.locationId;
    if (req.body?.locationId !== undefined) {
      if (!req.body.locationId) {
        locationId = null;
      }
      else {
        const loc = await ownedLocation(businessId, String(req.body.locationId));
        if (!loc) {
          return res.status(404).json({ error: "Location not found or access denied" });
        }
        locationId = loc.id;
      }
    }

    let slugUpdate: { slug?: string; whatsappProviderTemplateName?: string } = {};
    if (t.approvalStatus === "DRAFT") {
      const slug = await generateUniqueTemplateSlug(data.name, {
        businessId,
        ignoreId: t.id,
      });
      slugUpdate = { slug, whatsappProviderTemplateName: slug };
    }

    const updated = await prisma.campaignTemplate.update({
      where: { id: t.id },
      data: { ...data, locationId, ...slugUpdate, ...statusUpdate },
    });
    return res.json({ template: serializeTemplate(updated) });
  } catch (err: any) {
    console.error("[campaigns] patch template error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/templates/:id/submit", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    const t = await prisma.campaignTemplate.findFirst({
      where: { id, templateType: "CUSTOM", businessId },
    });
    if (!t) {
      return res.status(404).json({ error: "Template not found" });
    }
    if (t.approvalStatus === "APPROVED") {
      return res.status(400).json({ error: "This template is already approved" });
    }
    const updated = await prisma.campaignTemplate.update({
      where: { id: t.id },
      data: {
        approvalStatus: "PENDING_SEATPING_REVIEW",
        submittedAt: new Date(),
        rejectionReason: null,
        rejectedAt: null,
      },
    });
    return res.json({ template: serializeTemplate(updated) });
  } catch (err: any) {
    console.error("[campaigns] submit template error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/audiences/preview", async (req, res) => {
  try {
    const businessId = bizId(req);
    const locationId = String(req.query.locationId || "");
    const channel = String(req.query.channel || "").toUpperCase() as Channel;
    const audienceType = String(req.query.audienceType || "");

    if (!CHANNELS.includes(channel)) {
      return res.status(400).json({ error: "Invalid channel" });
    }
    if (!isValidAudienceType(audienceType)) {
      return res.status(400).json({ error: "Invalid audience" });
    }
    const location = await ownedLocation(businessId, locationId);
    if (!location) {
      return res.status(404).json({ error: "Location not found or access denied" });
    }

    const audienceConfig: {
      tag?: string;
      guestIds?: string[];
      savedAudienceId?: string;
      filters?: any;
    } = {};
    if (req.query.tag) {
      audienceConfig.tag = String(req.query.tag);
    }
    if (req.query.guestIds) {
      audienceConfig.guestIds = String(req.query.guestIds)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MANUAL_GUEST_LIMIT);
    }

    let groupLabel: string;
    if (audienceType === CUSTOM_GROUP_AUDIENCE) {
      const sid = String(req.query.savedAudienceId || "");
      if (!sid) {
        return res.status(400).json({ error: "Custom group id is required" });
      }
      const saved = await prisma.savedAudience.findFirst({
        where: { id: sid, businessId, locationId },
        select: { id: true, name: true },
      });
      if (!saved) {
        return res.status(404).json({ error: "Custom group not found" });
      }
      audienceConfig.savedAudienceId = saved.id;
      groupLabel = saved.name;
    } else if (audienceType === MANUAL_AUDIENCE) {
      groupLabel = "Manually Selected Guests";
    } else {
      groupLabel =
        AUDIENCE_GROUPS.find((g) => g.key === audienceType)?.label || audienceType;
    }

    const guests = await resolveAudienceGuests({
      businessId,
      locationId,
      audienceType,
      audienceConfig,
      timezone: getLocationTimezone(location),
    });
    const result = filterRecipients(guests, channel);

    return res.json({
      audienceName: groupLabel,
      location: { id: location.id, label: locationLabel(location) },
      total: result.total,
      recipientCount: result.eligible.length,
      excludedCount: result.excludedCount,
      exclusions: result.exclusions,
    });
  } catch (err: any) {
    console.error("[campaigns] audience preview error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});


router.get("/", async (req, res) => {
  try {
    const businessId = bizId(req);
    const where: any = { businessId };
    if (req.query.locationId) {
      const loc = await ownedLocation(businessId, String(req.query.locationId));
      if (!loc) {
        return res.status(404).json({ error: "Location not found or access denied" });
      }
      where.locationId = loc.id;
    }
    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const RECONCILE = new Set(["SENDING", "RECURRING", "PAUSED"]);
    const reconciled = await Promise.all(
      campaigns.map((c) => {
        if (RECONCILE.has(c.status)) {
          return reconcileCampaign(c);
        }
        return Promise.resolve(c);
      }),
    );

    const [templates, locations] = await Promise.all([
      prisma.campaignTemplate.findMany({
        where: { id: { in: reconciled.map((c) => c.templateId) } },
        select: { id: true, name: true, templateType: true },
      }),
      prisma.location.findMany({
        where: { businessId },
        select: { id: true, name: true, displayName: true, address: true },
      }),
    ]);
    const tMap = new Map(templates.map((t) => [t.id, t]));
    const lMap = new Map(locations.map((l) => [l.id, locationLabel(l)]));
    const nameCache = new Map<string, string>();

    return res.json({
      campaigns: await Promise.all(
        reconciled.map(async (c) =>
          serializeCampaign(c, {
            templateName: tMap.get(c.templateId)?.name ?? null,
            templateType: tMap.get(c.templateId)?.templateType ?? null,
            locationLabel: lMap.get(c.locationId) ?? null,
            audienceLabel: await audienceLabelFor(c, nameCache),
          }),
        ),
      ),
    });
  } catch (err: any) {
    console.error("[campaigns] list error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

async function validateCampaignInput(
  businessId: string,
  body: any,
): Promise<{ error?: string; status?: number; data?: any }> {
  const name = String(body?.name || "").trim();
  if (!name) {
    return { error: "Campaign name is required", status: 400 };
  }

  const loc = await ownedLocation(businessId, String(body?.locationId || ""));
  if (!loc) {
    return { error: "Location not found or access denied", status: 404 };
  }

  const channel = String(body?.channel || "").toUpperCase();
  if (!CHANNELS.includes(channel as Channel)) {
    return { error: "Invalid channel", status: 400 };
  }

  const audienceType = String(body?.audienceType || "");
  if (!isValidAudienceType(audienceType)) {
    return { error: "Invalid audience", status: 400 };
  }
  const audienceConfig: any = {};
  if (audienceType === "with_tag") {
    const tag = String(body?.audienceConfig?.tag || "").trim();
    if (!tag) {
      return { error: "Choose a tag for this audience", status: 400 };
    }
    audienceConfig.tag = tag.slice(0, 60);
  }
  if (audienceType === MANUAL_AUDIENCE) {
    let ids: string[] = [];
    if (Array.isArray(body?.audienceConfig?.guestIds)) {
      ids = body.audienceConfig.guestIds
        .map((x: any) => String(x))
        .filter(Boolean);
    }
    if (!ids.length) {
      return { error: "Select at least one guest", status: 400 };
    }
    audienceConfig.guestIds = ids.slice(0, MANUAL_GUEST_LIMIT);
  }
  if (audienceType === CUSTOM_GROUP_AUDIENCE) {
    const sid = String(body?.audienceConfig?.savedAudienceId || "").trim();
    if (!sid) {
      return { error: "Select a custom group", status: 400 };
    }
    const saved = await prisma.savedAudience.findFirst({
      where: { id: sid, businessId, locationId: loc.id },
      select: { id: true },
    });
    if (!saved) {
      return { error: "Custom group not found", status: 404 };
    }
    audienceConfig.savedAudienceId = saved.id;
  }

  const template = await prisma.campaignTemplate.findFirst({
    where: {
      id: String(body?.templateId || ""),
      OR: [{ templateType: "SEATPING" }, { templateType: "CUSTOM", businessId }],
    },
  });
  if (!template) {
    return { error: "Template not found or access denied", status: 404 };
  }

  const templateValues: Record<string, string> = {};
  if (body?.templateValues && typeof body.templateValues === "object") {
    for (const v of editableVariables(template)) {
      if (body.templateValues[v] !== undefined) {
        templateValues[v] = String(body.templateValues[v]).slice(0, 500);
      }
    }
  }

  const guests = await resolveAudienceGuests({
    businessId,
    locationId: loc.id,
    audienceType,
    audienceConfig,
    timezone: getLocationTimezone(loc),
  });
  const result = filterRecipients(guests, channel as Channel);

  return {
    data: {
      name: name.slice(0, 120),
      locationId: loc.id,
      channel: channel as CampaignChannel,
      templateId: template.id,
      audienceType,
      audienceConfig,
      templateValues,
      recipientCount: result.eligible.length,
    },
  };
}

router.post("/", async (req, res) => {
  try {
    const businessId = bizId(req);
    const business = await loadBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const { error, status, data } = await validateCampaignInput(businessId, req.body || {});
    if (error) {
      return res.status(status || 400).json({ error });
    }

    const created = await prisma.campaign.create({
      data: {
        businessId,
        businessUsername: business.username,
        status: "DRAFT",
        ...data,
      },
    });
    return res.json({ campaign: await serializeCampaign(created) });
  } catch (err: any) {
    console.error("[campaigns] create error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    let campaign = await prisma.campaign.findFirst({ where: { id, businessId } });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    campaign = await reconcileCampaign(campaign);

    const [template, location, logs, runs] = await Promise.all([
      prisma.campaignTemplate.findUnique({ where: { id: campaign.templateId } }),
      prisma.location.findFirst({
        where: { id: campaign.locationId, businessId },
        select: { id: true, name: true, displayName: true, address: true },
      }),
      prisma.campaignDeliveryLog.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.campaignRun.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    let campaignLocationLabel: string | null = null;
    if (location) {
      campaignLocationLabel = locationLabel(location);
    }
    let serializedTemplate = null;
    if (template) {
      serializedTemplate = serializeTemplate(template);
    }
    return res.json({
      campaign: await serializeCampaign(campaign, {
        templateName: template?.name ?? null,
        templateType: template?.templateType ?? null,
        locationLabel: campaignLocationLabel,
      }),
      template: serializedTemplate,
      logs: logs.map((l) => ({
        id: l.id,
        eventType: l.eventType,
        message: l.message,
        providerMessageId: l.providerMessageId,
        createdAt: l.createdAt,
      })),
      runs: runs.map((r) => ({
        id: r.id,
        runType: r.runType,
        status: r.status,
        scheduledFor: r.scheduledFor,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        recipientCount: r.recipientCount,
        sentCount: r.sentCount,
        failedCount: r.failedCount,
        skippedCount: r.skippedCount,
        createdAt: r.createdAt,
      })),
    });
  } catch (err: any) {
    console.error("[campaigns] detail error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    const existing = await prisma.campaign.findFirst({ where: { id, businessId } });
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    if (existing.status !== "DRAFT" && existing.status !== "READY" && existing.status !== "CANCELLED") {
      return res.status(400).json({ error: "Only draft and cancelled campaigns can be edited" });
    }

    const merged = {
      name: req.body?.name ?? existing.name,
      locationId: req.body?.locationId ?? existing.locationId,
      channel: req.body?.channel ?? existing.channel,
      templateId: req.body?.templateId ?? existing.templateId,
      audienceType: req.body?.audienceType ?? existing.audienceType,
      audienceConfig: req.body?.audienceConfig ?? existing.audienceConfig,
      templateValues: req.body?.templateValues ?? existing.templateValues,
    };
    const { error, status, data } = await validateCampaignInput(businessId, merged);
    if (error) {
      return res.status(status || 400).json({ error });
    }

    const updated = await prisma.campaign.update({ where: { id: existing.id }, data });
    return res.json({ campaign: await serializeCampaign(updated) });
  } catch (err: any) {
    console.error("[campaigns] patch error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

async function prepareSend(businessId: string, campaign: Campaign) {
  const [business, location, template] = await Promise.all([
    loadBusiness(businessId),
    prisma.location.findFirst({
      where: { id: campaign.locationId, businessId },
      select: {
        id: true,
        name: true,
        displayName: true,
        address: true,
        restaurantProfile: true,
      },
    }),
    prisma.campaignTemplate.findUnique({ where: { id: campaign.templateId } }),
  ]);
  if (!business) {
    return { error: "Business not found", status: 404 as const };
  }
  if (!location) {
    return { error: "Location not found", status: 404 as const };
  }
  if (!template) {
    return { error: "Template not found", status: 404 as const };
  }
  if (!isTemplateUsable(template)) {
    let templateError = "This template is not available for sending.";
    if (template.approvalStatus === "PENDING_SEATPING_REVIEW") {
      templateError =
        "This template is still pending SeatPing review and cannot be used yet.";
    } else if (template.approvalStatus === "REJECTED") {
      templateError = "This template was rejected and cannot be used.";
    }
    return {
      error: templateError,
      status: 400 as const,
    };
  }
  return { business, location, template };
}

router.post("/:id/send-test", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    if (
      await limitGuard(req, res, [
        { name: "campaign-test", key: businessId, windowMs: HOURS(1), max: 30 },
      ])
    )
      {
        return;
      }

    const campaign = await prisma.campaign.findFirst({ where: { id, businessId } });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const prepared = await prepareSend(businessId, campaign);
    if ("error" in prepared) {
      return res.status(prepared.status).json({ error: prepared.error });
    }
    const { business, location, template } = prepared;

    const channel = campaign.channel as Channel;
    let overrideEmail = "";
    if (req.body?.testEmail) {
      overrideEmail = String(req.body.testEmail).trim();
    }
    let overridePhone = "";
    if (req.body?.testPhone) {
      overridePhone = String(req.body.testPhone).replace(/\D/g, "");
    }

    const restName = restaurantNameForLocation(location, business.name);
    const message = buildMessage(
      template,
      (campaign.templateValues as Record<string, string>) || {},
      {
        businessName: restName,
        businessEmail: business.email,
        locationName: locationLabel(location),
        firstName: business.name?.split(" ")[0] || "there",
        guestName: business.name,
      },
      channel,
    );

    let email: string | undefined;
    let phone: string | undefined;
    if (channel === "EMAIL") {
      email = overrideEmail || business.email;
      if (!email) {
        return res.status(400).json({ error: "No email address to send the test to" });
      }
    } else {
      phone = overridePhone || business.phone?.replace(/\D/g, "");
      if (!phone) {
        return res.status(400).json({ error: "No phone number to send the test to" });
      }
    }

    try {
      await rawCampaignSend({
        channel: channel.toLowerCase() as any,
        businessName: business.name,
        replyTo: business.email || undefined,
        email,
        phone,
        subject: message.subject,
        bodyText: message.text,
        bodyHtml: message.html,
        whatsappTemplateName: message.whatsappTemplateName,
        whatsappLanguage: message.whatsappLanguage,
        whatsappParams: message.whatsappParams,
        whatsappValues: message.whatsappValues,
      });
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(502).json({ error: e?.message || "Test send failed" });
    }
  } catch (err: any) {
    console.error("[campaigns] send-test error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/debug/email-test", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  try {
    let emails: string[] = [];
    if (Array.isArray(req.body?.emails)) {
      emails = req.body.emails
        .map((e: any) => String(e).trim())
        .filter(Boolean)
        .slice(0, 10);
    }
    if (!emails.length) {
      return res.status(400).json({ error: "Provide emails: string[]" });
    }
    const subject = String(req.body?.subject || "SeatPing email delivery test");
    const bodyText = String(
      req.body?.body || "This is a SeatPing email delivery test. If you received it, delivery is working for this address.",
    );
    const html = renderEmail({
      heading: "Email Delivery Test",
      preheader: "SeatPing delivery test",
      bodyHtml: p(esc(bodyText).replace(/\n/g, "<br>")),
    });

    const results = [];
    for (const to of emails) {
      const r = await sendEmailDetailed({ to, subject, html });
      results.push({
        email: to,
        ok: r.ok,
        messageId: r.messageId,
        response: r.response,
        accepted: r.accepted,
        rejected: r.rejected,
        error: r.error ?? null,
      });
    }
    return res.json({ results });
  } catch (err: any) {
    console.error("[campaigns] email-test error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:id/send", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");

    if (
      await limitGuard(req, res, [
        { name: "campaign-send", key: businessId, windowMs: HOURS(1), max: 20 },
      ])
    )
      {
        return;
      }

    const campaign = await prisma.campaign.findFirst({ where: { id, businessId } });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const prepared = await prepareSend(businessId, campaign);
    if ("error" in prepared) {
      return res.status(prepared.status).json({ error: prepared.error });
    }
    const { location } = prepared;
    const timezone = getLocationTimezone(location);

    const sendMode = String(req.body?.sendMode || "NOW").toUpperCase();

    if (sendMode === "SCHEDULED") {
      const when = wallClockToUtc(String(req.body?.scheduledLocal || ""), timezone);
      if (!when) {
        return res.status(400).json({ error: "Pick a valid date and time to schedule." });
      }
      if (when.getTime() <= Date.now() + 30 * 1000) {
        return res.status(400).json({ error: "The scheduled time must be in the future." });
      }
      const claim = await prisma.campaign.updateMany({
        where: { id: campaign.id, businessId, status: { in: ["DRAFT", "READY", "CANCELLED"] } },
        data: {
          status: "SCHEDULED",
          sendMode: "SCHEDULED",
          timezone,
          scheduledAt: when,
          nextRunAt: when,
          isPaused: false,
        },
      });
      if (claim.count === 0) {
        return res.status(409).json({ error: "This campaign can no longer be scheduled." });
      }
      const fresh = await prisma.campaign.findUnique({ where: { id: campaign.id } });
      let serializedFresh = null;
      if (fresh) {
        serializedFresh = await serializeCampaign(fresh);
      }
      return res.json({ campaign: serializedFresh });
    }

    if (sendMode === "RECURRING") {
      const freq = String(req.body?.recurrence?.frequency || "").toUpperCase();
      if (!["DAILY", "WEEKLY", "MONTHLY"].includes(freq)) {
        return res.status(400).json({ error: "Choose a recurrence frequency." });
      }
      const startLocal = String(req.body?.recurrence?.startLocal || "");
      const start = wallClockToUtc(startLocal, timezone);
      if (!start) {
        return res.status(400).json({ error: "Pick a valid start date and time." });
      }
      let endAt: Date | null = null;
      if (req.body?.recurrence?.endLocal) {
        endAt = wallClockToUtc(String(req.body.recurrence.endLocal), timezone);
        if (endAt && endAt.getTime() <= start.getTime()) {
          return res.status(400).json({ error: "The end date must be after the start date." });
        }
      }
      const anchorDay = zonedDayOfMonth(start, timezone);
      let next = start;
      while (next.getTime() <= Date.now()) {
        next = advanceRecurrence(next, freq as any, timezone, anchorDay);
      }
      if (endAt && next.getTime() > endAt.getTime()) {
        return res.status(400).json({ error: "The end date is before the first run." });
      }
      const windowDays = Number(req.body?.maxSendsPerGuestWindowDays);
      let normalizedWindowDays = 30;
      if (Number.isFinite(windowDays) && windowDays > 0) {
        normalizedWindowDays = Math.floor(windowDays);
      }
      const claim = await prisma.campaign.updateMany({
        where: { id: campaign.id, businessId, status: { in: ["DRAFT", "READY", "CANCELLED"] } },
        data: {
          status: "RECURRING",
          sendMode: "RECURRING",
          timezone,
          recurrenceFrequency: freq as any,
          recurrenceStartAt: start,
          recurrenceEndAt: endAt,
          maxSendsPerGuestWindowDays: normalizedWindowDays,
          nextRunAt: next,
          isPaused: false,
        },
      });
      if (claim.count === 0) {
        return res.status(409).json({ error: "This campaign can no longer be made recurring." });
      }
      const fresh = await prisma.campaign.findUnique({ where: { id: campaign.id } });
      let serializedFresh = null;
      if (fresh) {
        serializedFresh = await serializeCampaign(fresh);
      }
      return res.json({ campaign: serializedFresh });
    }

    const claim = await prisma.campaign.updateMany({
      where: { id: campaign.id, businessId, status: { in: ["DRAFT", "READY", "CANCELLED"] } },
      data: { status: "SENDING", sendMode: "NOW", timezone, sentAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(409).json({ error: "This campaign has already been sent or is sending." });
    }

    const result = await executeCampaignRun(campaign.id, "MANUAL");
    if ("error" in result) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "DRAFT", sentAt: null },
      });
      return res.status(400).json({ error: result.error });
    }
    if (result.recipientCount === 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "DRAFT", sentAt: null },
      });
      return res.status(400).json({ error: "No eligible recipients for this campaign." });
    }
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { recipientCount: result.recipientCount, excludedCount: result.excludedCount },
    });

    const fresh = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    let serializedFresh = null;
    if (fresh) {
      serializedFresh = await serializeCampaign(fresh);
    }
    return res.json({
      campaign: serializedFresh,
      recipientCount: result.recipientCount,
      excludedCount: result.excludedCount,
    });
  } catch (err: any) {
    console.error("[campaigns] send error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    const claim = await prisma.campaign.updateMany({
      where: { id, businessId, status: { in: ["SCHEDULED", "RECURRING", "PAUSED"] } },
      data: { status: "CANCELLED", nextRunAt: null, isPaused: false },
    });
    if (claim.count === 0) {
      return res.status(400).json({ error: "This campaign can't be cancelled." });
    }
    const fresh = await prisma.campaign.findFirst({ where: { id, businessId } });
    let serializedFresh = null;
    if (fresh) {
      serializedFresh = await serializeCampaign(fresh);
    }
    return res.json({ campaign: serializedFresh });
  } catch (err: any) {
    console.error("[campaigns] cancel error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    const campaign = await prisma.campaign.findFirst({
      where: { id, businessId },
    });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }
    await prisma.campaign.delete({
      where: { id },
    });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[campaigns] delete error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:id/pause", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    const claim = await prisma.campaign.updateMany({
      where: { id, businessId, status: "RECURRING" },
      data: { status: "PAUSED", isPaused: true },
    });
    if (claim.count === 0) {
      return res.status(400).json({ error: "Only an active recurring campaign can be paused." });
    }
    const fresh = await prisma.campaign.findFirst({ where: { id, businessId } });
    let serializedFresh = null;
    if (fresh) {
      serializedFresh = await serializeCampaign(fresh);
    }
    return res.json({ campaign: serializedFresh });
  } catch (err: any) {
    console.error("[campaigns] pause error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/:id/resume", async (req, res) => {
  try {
    const businessId = bizId(req);
    const id = String(req.params.id || "");
    const campaign = await prisma.campaign.findFirst({
      where: { id, businessId, status: "PAUSED" },
    });
    if (!campaign) {
      return res.status(400).json({ error: "Only a paused campaign can be resumed." });
    }
    const tz = campaign.timezone || "Asia/Jakarta";
    const freq = (campaign.recurrenceFrequency || "WEEKLY") as any;
    const anchorDay = zonedDayOfMonth(campaign.recurrenceStartAt, tz);
    let next = campaign.nextRunAt ?? new Date();
    while (next.getTime() <= Date.now()) {
      next = advanceRecurrence(next, freq, tz, anchorDay);
    }
    let ended = false;
    if (campaign.recurrenceEndAt) {
      ended = next.getTime() > campaign.recurrenceEndAt.getTime();
    }
    let resumeData: {
      status: "SENT" | "RECURRING";
      isPaused: boolean;
      nextRunAt: Date | null;
    };
    if (ended) {
      resumeData = { status: "SENT", isPaused: false, nextRunAt: null };
    } else {
      resumeData = { status: "RECURRING", isPaused: false, nextRunAt: next };
    }
    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: resumeData,
    });
    return res.json({ campaign: await serializeCampaign(updated) });
  } catch (err: any) {
    console.error("[campaigns] resume error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/preview-message", async (req, res) => {
  try {
    const businessId = bizId(req);
    const business = await loadBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const channel = String(req.body?.channel || "").toUpperCase() as Channel;
    if (!CHANNELS.includes(channel)) {
      return res.status(400).json({ error: "Invalid channel" });
    }

    const template = await prisma.campaignTemplate.findFirst({
      where: {
        id: String(req.body?.templateId || ""),
        OR: [{ templateType: "SEATPING" }, { templateType: "CUSTOM", businessId }],
      },
    });
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    let locationLabelStr = "Your Location";
    let restName = business.name;
    if (req.body?.locationId) {
      const loc = await ownedLocation(businessId, String(req.body.locationId));
      if (loc) {
        locationLabelStr = locationLabel(loc);
        restName = restaurantNameForLocation(loc, business.name);
      }
    }

    const filled: Record<string, string> = {
      ...((template.exampleValues as Record<string, string>) || {}),
    };
    if (req.body?.templateValues && typeof req.body.templateValues === "object") {
      for (const v of editableVariables(template)) {
        if (req.body.templateValues[v]) {
          filled[v] = String(req.body.templateValues[v]);
        }
      }
    }

    const message = buildMessage(
      template,
      filled,
      {
        businessName: restName,
        businessEmail: business.email,
        locationName: locationLabelStr,
        firstName: "Alex",
        guestName: "Alex Rivera",
      },
      channel,
    );

    let seg: ReturnType<typeof smsSegments> | null = null;
    if (channel === "SMS") {
      seg = smsSegments(message.text);
    }
    let whatsappReady: boolean | null = null;
    if (channel === "WHATSAPP") {
      whatsappReady = !!message.whatsappTemplateName;
    }
    return res.json({
      subject: message.subject ?? null,
      text: message.text,
      html: message.html ?? null,
      smsSegments: seg?.segments ?? null,
      smsCharacters: seg?.characters ?? null,
      whatsappReady,
    });
  } catch (err: any) {
    console.error("[campaigns] preview-message error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;

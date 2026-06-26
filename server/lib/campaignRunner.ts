
import type { Campaign, CampaignRun } from "@prisma/client";
import { prisma } from "./prisma.js";
import { enqueueNotification } from "./notifications.js";
import { getLocationTimezone } from "./operatingHours.js";
import {
  buildMessage,
  filterRecipients,
  resolveAudienceGuests,
  restaurantNameForLocation,
  advanceRecurrence,
  type Channel,
} from "./campaigns.js";

const MAX_RECIPIENTS_PER_RUN = 2000;
const DEFAULT_GUEST_WINDOW_DAYS = 30;

type RunType = "MANUAL" | "SCHEDULED" | "RECURRING";

export interface RunResult {
  runId: string;
  recipientCount: number;
  excludedCount: number;
  error?: string;
}

export async function executeCampaignRun(
  campaignId: string,
  runType: RunType,
  scheduledFor?: Date | null,
): Promise<RunResult | { error: string }> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { error: "Campaign not found" };

  const [business, location, template] = await Promise.all([
    prisma.business.findUnique({
      where: { id: campaign.businessId },
      select: { id: true, name: true, email: true },
    }),
    prisma.location.findFirst({
      where: { id: campaign.locationId, businessId: campaign.businessId },
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
  if (!business) return { error: "Business not found" };
  if (!location) return { error: "Location not found" };
  if (!template) return { error: "Template not found" };

  const usable =
    template.templateType === "SEATPING"
      ? template.isActive && template.approvalStatus === "APPROVED"
      : template.approvalStatus === "APPROVED";
  if (!usable) return { error: "Template is not available for sending" };

  const channel = campaign.channel as Channel;
  const timezone = getLocationTimezone(location);

  const guests = await resolveAudienceGuests({
    businessId: campaign.businessId,
    locationId: campaign.locationId,
    audienceType: campaign.audienceType,
    audienceConfig: (campaign.audienceConfig as any) || {},
    timezone,
  });
  const filtered = filterRecipients(guests, channel);

  let eligible = filtered.eligible;
  if (runType === "RECURRING") {
    const windowDays =
      campaign.maxSendsPerGuestWindowDays ?? DEFAULT_GUEST_WINDOW_DAYS;
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const recent = await prisma.campaignRecipient.findMany({
      where: {
        campaignId,
        status: { in: ["SENT", "DELIVERED"] },
        sentAt: { gte: cutoff },
      },
      select: { guestProfileId: true },
    });
    const recentSet = new Set(recent.map((r) => r.guestProfileId));
    eligible = eligible.filter((e) => !recentSet.has(e.guest.id));
  }

  if (eligible.length > MAX_RECIPIENTS_PER_RUN) {
    eligible = eligible.slice(0, MAX_RECIPIENTS_PER_RUN);
  }

  const now = new Date();

  if (eligible.length === 0) {
    const run = await prisma.campaignRun.create({
      data: {
        campaignId,
        businessId: campaign.businessId,
        runType,
        scheduledFor: scheduledFor ?? null,
        startedAt: now,
        completedAt: now,
        status: "COMPLETED",
        recipientCount: 0,
      },
    });
    return { runId: run.id, recipientCount: 0, excludedCount: filtered.excludedCount };
  }

  const run = await prisma.campaignRun.create({
    data: {
      campaignId,
      businessId: campaign.businessId,
      runType,
      scheduledFor: scheduledFor ?? null,
      startedAt: now,
      status: "RUNNING",
      recipientCount: eligible.length,
    },
  });

  await prisma.campaignRecipient.createMany({
    data: eligible.map((r) => ({
      campaignId,
      runId: run.id,
      businessId: campaign.businessId,
      guestProfileId: r.guest.id,
      channel: channel as any,
      email: r.email ?? null,
      phone: r.phone ?? null,
      status: "PENDING" as const,
    })),
  });
  const recipients = await prisma.campaignRecipient.findMany({
    where: { runId: run.id },
  });
  const eligibleByGuest = new Map(eligible.map((r) => [r.guest.id, r]));

  await prisma.campaignDeliveryLog.create({
    data: {
      campaignId,
      eventType: "run_started",
      message: `${runType} run sending to ${recipients.length} recipient(s) via ${channel}.`,
    },
  });

  const restName = restaurantNameForLocation(location, business.name);
  for (const recipient of recipients) {
    const guest = eligibleByGuest.get(recipient.guestProfileId)?.guest;
    const message = buildMessage(
      template,
      (campaign.templateValues as Record<string, string>) || {},
      {
        businessName: restName,
        businessEmail: business.email,
        locationName: location.displayName || location.name || "your location",
        firstName: guest?.firstName || null,
        guestName: guest?.fullName || null,
      },
      channel,
    );
    await enqueueNotification({
      type: "campaign_message",
      channel: channel.toLowerCase() as any,
      campaignId,
      recipientId: recipient.id,
      businessName: restName,
      replyTo: business.email || undefined,
      email: recipient.email || undefined,
      phone: recipient.phone || undefined,
      subject: message.subject,
      bodyText: message.text,
      bodyHtml: message.html,
      whatsappTemplateName: message.whatsappTemplateName,
      whatsappLanguage: message.whatsappLanguage,
      whatsappParams: message.whatsappParams,
      whatsappValues: message.whatsappValues,
    });
  }

  return {
    runId: run.id,
    recipientCount: recipients.length,
    excludedCount: filtered.excludedCount,
  };
}

export async function reconcileRun(run: CampaignRun): Promise<CampaignRun> {
  if (run.status !== "RUNNING") return run;
  const grouped = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { runId: run.id },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;
  const sent = (counts.SENT || 0) + (counts.DELIVERED || 0);
  const failed = counts.FAILED || 0;
  const skipped = counts.SKIPPED || 0;
  const pending = counts.PENDING || 0;

  const data: any = { sentCount: sent, failedCount: failed, skippedCount: skipped };
  if (pending === 0) {
    data.status = sent > 0 ? "COMPLETED" : "FAILED";
    data.completedAt = new Date();
  }
  return prisma.campaignRun.update({ where: { id: run.id }, data });
}

export async function reconcileCampaign(c: Campaign): Promise<Campaign> {
  const latest = await prisma.campaignRun.findFirst({
    where: { campaignId: c.id },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return c;
  const fresh = latest.status === "RUNNING" ? await reconcileRun(latest) : latest;

  const data: any = {
    recipientCount: fresh.recipientCount,
    sentCount: fresh.sentCount,
    failedCount: fresh.failedCount,
    skippedCount: fresh.skippedCount,
  };
  if (c.status === "SENDING" && fresh.status !== "RUNNING") {
    data.status = fresh.sentCount > 0 ? "SENT" : "FAILED";
  }
  return prisma.campaign.update({ where: { id: c.id }, data });
}

export async function runDueCampaignsSweep(): Promise<{
  scheduled: number;
  recurring: number;
}> {
  const now = new Date();
  let scheduledFired = 0;
  let recurringFired = 0;

  const dueScheduled = await prisma.campaign.findMany({
    where: { status: "SCHEDULED", isPaused: false, nextRunAt: { lte: now } },
    take: 50,
  });
  for (const c of dueScheduled) {
    const claim = await prisma.campaign.updateMany({
      where: { id: c.id, status: "SCHEDULED" },
      data: { status: "SENDING", sentAt: now, nextRunAt: null, lastRunAt: now },
    });
    if (claim.count === 0) continue;
    try {
      const res = await executeCampaignRun(c.id, "SCHEDULED", c.scheduledAt);
      if ("error" in res) {
        await prisma.campaign.update({
          where: { id: c.id },
          data: { status: "FAILED" },
        });
      } else {
        await prisma.campaign.update({
          where: { id: c.id },
          data: { recipientCount: res.recipientCount, excludedCount: res.excludedCount },
        });
        scheduledFired += 1;
      }
    } catch (err: any) {
      console.error("[campaign-sweep] scheduled run failed:", err?.message || err);
      await prisma.campaign
        .update({ where: { id: c.id }, data: { status: "FAILED" } })
        .catch(() => {});
    }
  }

  const dueRecurring = await prisma.campaign.findMany({
    where: { status: "RECURRING", isPaused: false, nextRunAt: { lte: now } },
    take: 50,
  });
  for (const c of dueRecurring) {
    const tz = c.timezone || "Asia/Jakarta";
    const freq = (c.recurrenceFrequency || "WEEKLY") as
      | "DAILY"
      | "WEEKLY"
      | "MONTHLY";
    let next = advanceRecurrence(c.nextRunAt ?? now, freq, tz);
    while (next.getTime() <= now.getTime()) next = advanceRecurrence(next, freq, tz);
    const ended = c.recurrenceEndAt ? next.getTime() > c.recurrenceEndAt.getTime() : false;

    const claim = await prisma.campaign.updateMany({
      where: { id: c.id, status: "RECURRING", nextRunAt: c.nextRunAt },
      data: {
        lastRunAt: now,
        nextRunAt: ended ? null : next,
        ...(ended ? { status: "SENT" } : {}),
      },
    });
    if (claim.count === 0) continue;
    try {
      const res = await executeCampaignRun(c.id, "RECURRING");
      if (!("error" in res)) recurringFired += 1;
    } catch (err: any) {
      console.error("[campaign-sweep] recurring run failed:", err?.message || err);
    }
  }

  const running = await prisma.campaignRun.findMany({
    where: { status: "RUNNING" },
    take: 100,
  });
  for (const run of running) {
    await reconcileRun(run).catch(() => {});
  }
  const sending = await prisma.campaign.findMany({
    where: { status: "SENDING" },
    take: 100,
  });
  for (const c of sending) {
    await reconcileCampaign(c).catch(() => {});
  }

  return { scheduled: scheduledFired, recurring: recurringFired };
}

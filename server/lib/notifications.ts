// server/lib/notifications.ts
//
// Background notification dispatch. Notifications (SMS via Telnyx, WhatsApp via
// Kapso, email via SMTP) used to be sent synchronously inside request handlers,
// so a slow provider blocked the user's request and could blow the Vercel 10s
// function limit. Now handlers call `enqueueNotification(job)` and return
// immediately; the actual send happens out-of-band.
//
// Delivery strategy:
//   - QStash configured (prod)  -> publish the job to QStash, which POSTs it back
//     to /api/jobs/notify with at-least-once delivery + retries.
//   - QStash NOT configured (dev / before tokens are set) -> run the send inline
//     as fire-and-forget so local development still delivers without an external
//     queue. The caller never waits on the provider either way.
//
// `processNotification` is the single dispatcher used by BOTH the inline path and
// the QStash worker route, so behavior is identical regardless of transport.

import { Client } from "@upstash/qstash";
import Telnyx from "telnyx";
import {
  sendQueueJoinConfirmationEmail,
  sendQueueYourTurnEmail,
  sendReservationConfirmationEmail,
  sendNewReservationBusinessEmail,
  sendReservationReminderEmail,
} from "./email.js";
import {
  sendQueueJoinedWhatsApp,
  sendQueueAdmittedWhatsApp,
  sendCampaignWhatsApp,
} from "./whatsapp.js";
import type { WhatsAppBodyParam } from "./whatsapp.js";
import { sendEmailDetailed } from "./email.js";
import { prisma } from "./prisma.js";
import { consumeQuota, peekQuota, DAYS } from "./rateLimit.js";

export type NotificationChannel = "sms" | "whatsapp" | "email";

export type NotificationJob =
  | {
      type: "queue_join";
      channel: NotificationChannel;
      firstName: string;
      lastName: string;
      countryCode?: string;
      phoneNumber?: string;
      email?: string;
      restaurantName: string;
      address: string;
      position: number;
    }
  | {
      type: "queue_admitted";
      channel: NotificationChannel;
      firstName: string;
      countryCode?: string;
      phoneNumber?: string;
      email?: string;
      restaurantName: string;
    }
  | {
      type: "reservation_created";
      // Customer confirmation (optional — only if an email was given).
      customerEmail?: string;
      firstName: string;
      lastName: string;
      businessName: string;
      address: string;
      dateLabel: string;
      timeLabel: string;
      partySize: number;
      manageUrl: string;
      cancellationPolicy?: string;
      // Business heads-up (optional — only if the business has an email).
      businessEmail?: string;
      locationName: string;
      customerName: string;
      customerPhone?: string;
      notes?: string;
      dashboardUrl: string;
    }
  | {
      type: "reservation_reminder";
      email: string;
      firstName: string;
      businessName: string;
      address: string;
      dateLabel: string;
      timeLabel: string;
      partySize: number;
      manageUrl?: string;
    }
  | {
      // One campaign message to one resolved recipient. The dispatcher sends it
      // and updates the CampaignRecipient row + appends a delivery log, so the
      // same path works inline (dev) and via QStash (prod) with no double-count.
      type: "campaign_message";
      channel: NotificationChannel;
      campaignId: string;
      recipientId: string;
      businessName: string;
      replyTo?: string;
      // Resolved contact (one of these is set for the channel).
      email?: string;
      phone?: string; // digits-only incl. country code (E.164 without '+')
      // Rendered content.
      subject?: string;
      bodyText: string;
      bodyHtml?: string;
      whatsappTemplateName?: string | null;
      whatsappLanguage?: string;
      whatsappParams?: WhatsAppBodyParam[];
      whatsappValues?: Record<string, string>;
    };

const qstashToken = process.env.QSTASH_TOKEN;
// Pin the region endpoint explicitly. The default host (qstash.upstash.io)
// geo-routes to the nearest region, which can land on the wrong one and 404
// ("user not found in this region"). Our account is us-east-1, so set
// QSTASH_URL=https://qstash-us-east-1.upstash.io. Falls back to the SDK default
// when unset.
const qstashBaseUrl = process.env.QSTASH_URL;
// In development, QStash can't POST back to localhost — skip it entirely so
// notifications are dispatched inline (directly calling Telnyx / email / WA).
const isDev = process.env.NODE_ENV !== "production";
let qstash: Client | null = !isDev && qstashToken
  ? new Client({
      token: qstashToken,
      ...(qstashBaseUrl ? { baseUrl: qstashBaseUrl } : {}),
    })
  : null;

// Per-recipient daily cap: defense-in-depth beyond per-location credits and the
// per-request rate limits. Even if those are somehow bypassed across windows, a
// single phone number or email can never receive more than this many messages
// per channel per rolling day. Generous enough that real customers never hit it
// (a normal flow is ~1-2 messages); only sustained abuse does. Backed by Redis
// in prod (cross-instance, survives the whole day), per-process in dev.
const NOTIFY_DAILY_MAX = Number(
  process.env.NOTIFY_DAILY_MAX_PER_RECIPIENT || 20,
);

/** The exact daily-cap key for a (channel, recipient). Single source of truth so
 * the pre-flight peek and the real consume can never key differently. */
function dailyCapKey(
  channel: NotificationChannel,
  recipient: string,
): string {
  return `${channel}:${recipient.toLowerCase()}`;
}

/** Returns true if a message to this recipient/channel is within the daily cap.
 * CONSUMES one unit of quota. */
async function withinDailyRecipientCap(
  channel: NotificationChannel,
  recipient: string | undefined,
): Promise<boolean> {
  if (!recipient) return true;
  return consumeQuota(
    "notify-daily",
    dailyCapKey(channel, recipient),
    DAYS(1),
    NOTIFY_DAILY_MAX,
  );
}

/**
 * Pre-flight check (does NOT consume quota): is this recipient still under the
 * daily cap for this channel right now? Callers use this to gate side effects
 * (e.g. deducting a credit / creating a queue entry) BEFORE the real send, then
 * let enqueueNotification() perform the single quota-consuming check. Returns
 * true for an empty recipient or on a store error (fail open).
 */
export async function canNotifyRecipient(
  channel: NotificationChannel,
  recipient: string | undefined,
): Promise<boolean> {
  if (!recipient) return true;
  return peekQuota(
    "notify-daily",
    dailyCapKey(channel, recipient),
    DAYS(1),
    NOTIFY_DAILY_MAX,
  );
}

/**
 * Enforce the per-recipient daily cap for the customer-facing recipient(s) of a
 * job. Only the abuse-exposed, customer-directed sends are capped:
 *   - queue_join (anonymous, can spend credits / SMS-bomb a number)
 *   - reservation_created customer email (anonymous, can email-bomb an address)
 * queue_admitted and reservation_reminder are business/cron-initiated and must
 * never be suppressed, so they are not capped. Business heads-up emails are not
 * capped either (a busy venue legitimately gets many). Returns the job to send
 * (possibly with an over-cap customer email stripped), or null to drop entirely.
 */
async function applyRecipientCap(
  job: NotificationJob,
): Promise<NotificationJob | null> {
  if (job.type === "queue_join") {
    const recipient = job.channel === "email" ? job.email : job.phoneNumber;
    if (!(await withinDailyRecipientCap(job.channel, recipient))) {
      console.warn(
        `[NOTIFY] daily per-recipient cap reached (${job.channel}) — dropping queue_join notification`,
      );
      return null;
    }
  } else if (job.type === "reservation_created" && job.customerEmail) {
    if (!(await withinDailyRecipientCap("email", job.customerEmail))) {
      console.warn(
        "[NOTIFY] daily cap reached for reservation customer email — sending business heads-up only",
      );
      return { ...job, customerEmail: undefined };
    }
  }
  return job;
}

/** Public base URL QStash uses to call the worker back. */
function workerUrl(): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.FRONTEND_URL ||
    "https://www.seatping.biz";
  return `${base.replace(/\/$/, "")}/api/jobs/notify`;
}

/**
 * Hand a notification off for background delivery. Returns quickly: a QStash
 * publish is a single fast HTTP call; the inline fallback is fire-and-forget.
 * Never throws into the caller — a notification failure must not fail the action.
 */
export async function enqueueNotification(job: NotificationJob): Promise<void> {
  // Enforce the per-recipient daily cap once, here at enqueue time (one count
  // per intended notification). QStash retries hit /api/jobs/notify ->
  // processNotification directly, so they never double-count.
  const capped = await applyRecipientCap(job);
  if (capped === null) return; // recipient over their daily cap — drop silently
  job = capped;

  if (qstash) {
    try {
      await qstash.publishJSON({ url: workerUrl(), body: job, retries: 3 });
      return;
    } catch (err: any) {
      console.error(
        "[NOTIFY] QStash publish failed, falling back to inline send:",
        err?.message || err,
      );
    }
  }
  // Dev / unconfigured / publish-failed: send inline without blocking the caller.
  void processNotification(job).catch((err) =>
    console.error("[NOTIFY] inline send failed:", err?.message || err),
  );
}

// ---------------------------------------------------------------------------
// Senders
// ---------------------------------------------------------------------------

async function sendSms(
  countryCode: string | undefined,
  phoneNumber: string | undefined,
  text: string,
): Promise<string | null> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_PHONE_NUMBER;
  if (!apiKey || !from) {
    console.error("[NOTIFY] Missing Telnyx credentials — cannot send SMS");
    return null;
  }
  if (!phoneNumber) return null;
  const telnyx = new Telnyx({ apiKey });
  const to = (countryCode || "+1") + phoneNumber.trim().replace(/\D/g, "");
  const message = await telnyx.messages.send({ from, to, text });
  const id = (message as any)?.data?.id ?? null;
  console.log("[NOTIFY] SMS sent:", id, "to", to);
  return id ? String(id) : "sent";
}

/** Send an SMS to a full digits-only number (E.164 without '+'). For campaigns. */
async function sendCampaignSms(
  digits: string,
  text: string,
): Promise<string | null> {
  // The normalized number already includes the country code, so prefix a single
  // "+" and pass the rest as the local part (sendSms re-concatenates them).
  return sendSms("+", digits, text);
}

/**
 * Execute one notification job. Called by the inline fallback and by the QStash
 * worker route. Each sub-send is isolated so one failure never blocks another.
 */
export async function processNotification(job: NotificationJob): Promise<void> {
  switch (job.type) {
    case "queue_join": {
      if (job.channel === "sms") {
        await sendSms(
          job.countryCode,
          job.phoneNumber,
          `Hi ${job.firstName}! You've joined the queue at ${job.restaurantName}. You're #${job.position} in line. We'll text you when it's your turn.`,
        );
      } else if (job.channel === "whatsapp") {
        const ok = await sendQueueJoinedWhatsApp({
          countryCode: job.countryCode || "+1",
          phoneNumber: job.phoneNumber || "",
          customerName: job.firstName,
          businessName: job.restaurantName,
          position: job.position,
        });
        // Throw on failure so the QStash worker returns non-2xx and the
        // delivery is retried (a swallowed false meant the customer silently
        // never got their confirmation).
        if (!ok) throw new Error("WhatsApp queue_join send failed");
      } else if (job.channel === "email" && job.email) {
        await sendQueueJoinConfirmationEmail(
          job.email,
          job.firstName,
          job.lastName,
          job.restaurantName,
          job.address,
          job.position,
        );
      }
      return;
    }

    case "queue_admitted": {
      if (job.channel === "sms") {
        await sendSms(
          job.countryCode,
          job.phoneNumber,
          `Good news! It's your turn at ${job.restaurantName}. Please proceed to the host within the next 5 minutes. Thank you for using SeatPing!`,
        );
      } else if (job.channel === "whatsapp") {
        const ok = await sendQueueAdmittedWhatsApp({
          countryCode: job.countryCode || "+1",
          phoneNumber: job.phoneNumber || "",
          businessName: job.restaurantName,
        });
        // "It's your turn" is the one message that must not be lost — throw so
        // QStash retries instead of treating a failed send as delivered.
        if (!ok) throw new Error("WhatsApp queue_admitted send failed");
      } else if (job.channel === "email" && job.email) {
        await sendQueueYourTurnEmail(job.email, job.restaurantName);
      }
      return;
    }

    case "reservation_created": {
      if (job.customerEmail) {
        try {
          await sendReservationConfirmationEmail({
            email: job.customerEmail,
            firstName: job.firstName,
            lastName: job.lastName,
            businessName: job.businessName,
            address: job.address,
            dateLabel: job.dateLabel,
            timeLabel: job.timeLabel,
            partySize: job.partySize,
            manageUrl: job.manageUrl,
            cancellationPolicy: job.cancellationPolicy,
          });
        } catch (e: any) {
          console.error("[NOTIFY] reservation customer email failed:", e?.message || e);
        }
      }
      if (job.businessEmail) {
        try {
          await sendNewReservationBusinessEmail({
            to: job.businessEmail,
            businessName: job.businessName,
            locationName: job.locationName,
            customerName: job.customerName,
            customerEmail: job.customerEmail || "",
            customerPhone: job.customerPhone,
            dateLabel: job.dateLabel,
            timeLabel: job.timeLabel,
            partySize: job.partySize,
            notes: job.notes,
            dashboardUrl: job.dashboardUrl,
          });
        } catch (e: any) {
          console.error("[NOTIFY] reservation business email failed:", e?.message || e);
        }
      }
      return;
    }

    case "reservation_reminder": {
      await sendReservationReminderEmail({
        email: job.email,
        firstName: job.firstName,
        businessName: job.businessName,
        address: job.address,
        dateLabel: job.dateLabel,
        timeLabel: job.timeLabel,
        partySize: job.partySize,
        manageUrl: job.manageUrl,
      });
      return;
    }

    case "campaign_message": {
      await deliverCampaignMessage(job);
      return;
    }
  }
}

/**
 * Send one campaign message and record the outcome on its CampaignRecipient
 * (+ a delivery log). Throws on a hard send failure so QStash retries; the
 * recipient row is flipped to FAILED first so state is never lost even if the
 * retry eventually gives up. A missing/already-sent recipient is a no-op
 * (idempotent against duplicate deliveries).
 */
/** Content shape shared by the campaign dispatcher and the send-test path. */
export interface CampaignSendContent {
  channel: NotificationChannel;
  businessName: string;
  replyTo?: string;
  email?: string;
  phone?: string;
  subject?: string;
  bodyText: string;
  bodyHtml?: string;
  whatsappTemplateName?: string | null;
  whatsappLanguage?: string;
  whatsappParams?: WhatsAppBodyParam[];
  whatsappValues?: Record<string, string>;
}

/**
 * Perform the raw provider send for a campaign message. Returns the provider
 * message id on success; throws on any failure so callers can record + retry.
 * No DB side effects — used by both the recipient dispatcher and send-test.
 */
export async function rawCampaignSend(
  content: CampaignSendContent,
): Promise<string> {
  if (content.channel === "email") {
    if (!content.email) throw new Error("No email address for recipient");
    const result = await sendEmailDetailed({
      to: content.email,
      subject: content.subject || `A message from ${content.businessName}`,
      html: content.bodyHtml || content.bodyText.replace(/\n/g, "<br>"),
      ...(content.replyTo ? { replyTo: content.replyTo } : {}),
    });
    // Only treat as sent when the mail server actually accepted THIS recipient.
    // A rejected/unaccepted address must surface as a failure (not a silent
    // success) so the CampaignRecipient is marked FAILED with the reason.
    if (!result.ok) {
      throw new Error(result.error || "Email provider rejected the recipient");
    }
    console.log(
      `[EMAIL] Sent campaign email to ${content.email}, messageId=${result.messageId}`,
    );
    // Return the real provider message id so it lands in the delivery log.
    return result.messageId || "sent";
  }
  if (content.channel === "sms") {
    if (!content.phone) throw new Error("No phone number for recipient");
    const id = await sendCampaignSms(content.phone, content.bodyText);
    if (!id) throw new Error("SMS provider returned failure");
    return id;
  }
  // WhatsApp — requires an approved Meta template name.
  if (!content.phone) throw new Error("No phone number for recipient");
  if (!content.whatsappTemplateName) {
    throw new Error("WhatsApp template is not available for this message");
  }
  const id = await sendCampaignWhatsApp({
    toDigits: content.phone,
    templateName: content.whatsappTemplateName,
    language: content.whatsappLanguage,
    // Fall back to a single positional param carrying the full rendered text,
    // matching the legacy {{1}} convention, when no structured params were built.
    bodyParams: content.whatsappParams || [{ text: content.bodyText }],
    // Resolved value map lets the send path rebuild params from the live Meta
    // template contract (authoritative over the possibly-drifted stored body).
    bodyValues: content.whatsappValues,
  });
  if (!id) throw new Error("WhatsApp provider returned failure");
  return id;
}

async function deliverCampaignMessage(
  job: Extract<NotificationJob, { type: "campaign_message" }>,
): Promise<void> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: job.recipientId },
  });
  // Already delivered (or gone) — never send twice.
  if (!recipient || recipient.status === "SENT" || recipient.status === "DELIVERED") {
    return;
  }

  const logEvent = async (
    eventType: string,
    message?: string,
    providerMessageId?: string | null,
  ) => {
    try {
      await prisma.campaignDeliveryLog.create({
        data: {
          campaignId: job.campaignId,
          recipientId: job.recipientId,
          eventType,
          message: message ?? null,
          providerMessageId: providerMessageId ?? null,
        },
      });
    } catch {
      /* logging must never break the send */
    }
  };

  try {
    const providerMessageId = await rawCampaignSend(job);

    await prisma.campaignRecipient.update({
      where: { id: job.recipientId },
      data: { status: "SENT", sentAt: new Date(), errorMessage: null },
    });
    await logEvent("sent", undefined, providerMessageId);
  } catch (err: any) {
    const message = err?.message || String(err);
    await prisma.campaignRecipient
      .update({
        where: { id: job.recipientId },
        data: { status: "FAILED", failedAt: new Date(), errorMessage: message.slice(0, 500) },
      })
      .catch(() => {});
    await logEvent("failed", message.slice(0, 500));
    throw err;
  }
}

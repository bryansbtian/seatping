
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
      type: "campaign_message";
      channel: NotificationChannel;
      campaignId: string;
      recipientId: string;
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
    };

const qstashToken = process.env.QSTASH_TOKEN;
const qstashBaseUrl = process.env.QSTASH_URL;
const isDev = process.env.NODE_ENV !== "production";
const qstash: Client | null = !isDev && qstashToken
  ? new Client({
      token: qstashToken,
      ...(qstashBaseUrl ? { baseUrl: qstashBaseUrl } : {}),
    })
  : null;

const NOTIFY_DAILY_MAX = Number(
  process.env.NOTIFY_DAILY_MAX_PER_RECIPIENT || 20,
);

function dailyCapKey(
  channel: NotificationChannel,
  recipient: string,
): string {
  return `${channel}:${recipient.toLowerCase()}`;
}

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

function workerUrl(): string {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.FRONTEND_URL ||
    "https://www.seatping.biz";
  return `${base.replace(/\/$/, "")}/api/jobs/notify`;
}

export async function enqueueNotification(job: NotificationJob): Promise<void> {
  const capped = await applyRecipientCap(job);
  if (capped === null) return;
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
  void processNotification(job).catch((err) =>
    console.error("[NOTIFY] inline send failed:", err?.message || err),
  );
}


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

async function sendCampaignSms(
  digits: string,
  text: string,
): Promise<string | null> {
  return sendSms("+", digits, text);
}

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
    if (!result.ok) {
      throw new Error(result.error || "Email provider rejected the recipient");
    }
    console.log(
      `[EMAIL] Sent campaign email to ${content.email}, messageId=${result.messageId}`,
    );
    return result.messageId || "sent";
  }
  if (content.channel === "sms") {
    if (!content.phone) throw new Error("No phone number for recipient");
    const id = await sendCampaignSms(content.phone, content.bodyText);
    if (!id) throw new Error("SMS provider returned failure");
    return id;
  }
  if (!content.phone) throw new Error("No phone number for recipient");
  if (!content.whatsappTemplateName) {
    throw new Error("WhatsApp template is not available for this message");
  }
  const id = await sendCampaignWhatsApp({
    toDigits: content.phone,
    templateName: content.whatsappTemplateName,
    language: content.whatsappLanguage,
    bodyParams: content.whatsappParams || [{ text: content.bodyText }],
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

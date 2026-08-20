import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { behavior, sinks } from "../setup/externalMocks.js";

const recipientFindUnique = vi.fn();
const recipientUpdate = vi.fn();
const deliveryLogCreate = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      campaignRecipient: {
        findUnique: recipientFindUnique,
        update: recipientUpdate,
      },
      campaignDeliveryLog: { create: deliveryLogCreate },
    },
  };
});

const ORIGINAL_ENV = { ...process.env };

type NotificationsModule = typeof import("../../server/lib/notifications.js");

async function loadNotifications(): Promise<NotificationsModule> {
  vi.resetModules();
  return import("../../server/lib/notifications.js");
}

function configureProviders() {
  process.env.TELNYX_API_KEY = "test-telnyx-key";
  process.env.TELNYX_PHONE_NUMBER = "+15550000000";
  process.env.KAPSO_API_KEY = "test-kapso-key";
  process.env.KAPSO_PHONE_NUMBER_ID = "test-phone-number-id";
}

function queueJoin(overrides: Record<string, unknown> = {}) {
  return {
    type: "queue_join",
    channel: "sms",
    firstName: "Ada",
    lastName: "Lovelace",
    countryCode: "+62",
    phoneNumber: "81234567890",
    restaurantName: "Bistro",
    address: "1 Test Street",
    position: 3,
    ...overrides,
  } as never;
}

function campaignJob(overrides: Record<string, unknown> = {}) {
  return {
    type: "campaign_message",
    channel: "email",
    campaignId: "camp-1",
    recipientId: "rec-1",
    businessName: "Bistro",
    email: "guest@test.invalid",
    bodyText: "Come back soon",
    ...overrides,
  } as never;
}

beforeEach(() => {
  recipientFindUnique.mockReset().mockResolvedValue({
    id: "rec-1",
    status: "QUEUED",
  });
  recipientUpdate.mockReset().mockResolvedValue({});
  deliveryLogCreate.mockReset().mockResolvedValue({});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("queue notifications", () => {
  it("texts a joining guest their position", async () => {
    configureProviders();
    const { processNotification } = await loadNotifications();

    await processNotification(queueJoin());

    expect(sinks().telnyx).toHaveLength(1);
    expect(sinks().telnyx[0].to).toBe("+6281234567890");
    expect(sinks().telnyx[0].text).toContain("#3");
  });

  it("does not text a guest with no phone number", async () => {
    configureProviders();
    const { processNotification } = await loadNotifications();

    await processNotification(queueJoin({ phoneNumber: undefined }));

    expect(sinks().telnyx).toHaveLength(0);
  });

  it("sends the queue_joined WhatsApp template", async () => {
    configureProviders();
    const { processNotification } = await loadNotifications();

    await processNotification(queueJoin({ channel: "whatsapp" }));

    expect(sinks().whatsapp).toHaveLength(1);
    expect((sinks().whatsapp[0] as any).template.name).toBe("queue_joined");
  });

  it("raises when the queue_joined WhatsApp template cannot be sent", async () => {
    const { processNotification } = await loadNotifications();

    await expect(processNotification(queueJoin({ channel: "whatsapp" }))).rejects.toThrow(
      "WhatsApp queue_join send failed",
    );
  });

  it("emails a joining guest their confirmation", async () => {
    const { processNotification } = await loadNotifications();

    await processNotification(queueJoin({ channel: "email", email: "guest@test.invalid" }));

    expect(sinks().email).toHaveLength(1);
    expect(sinks().telnyx).toHaveLength(0);
  });

  it("texts an admitted guest", async () => {
    configureProviders();
    const { processNotification } = await loadNotifications();

    await processNotification({
      type: "queue_admitted",
      channel: "sms",
      firstName: "Ada",
      countryCode: "+62",
      phoneNumber: "81234567890",
      restaurantName: "Bistro",
    } as never);

    expect(sinks().telnyx[0].text).toContain("Bistro");
  });

  it("sends the queue_admitted WhatsApp template", async () => {
    configureProviders();
    const { processNotification } = await loadNotifications();

    await processNotification({
      type: "queue_admitted",
      channel: "whatsapp",
      firstName: "Ada",
      countryCode: "+62",
      phoneNumber: "81234567890",
      restaurantName: "Bistro",
    } as never);

    expect((sinks().whatsapp[0] as any).template.name).toBe("queue_admitted");
  });

  it("raises when the queue_admitted WhatsApp template cannot be sent", async () => {
    const { processNotification } = await loadNotifications();

    await expect(
      processNotification({
        type: "queue_admitted",
        channel: "whatsapp",
        firstName: "Ada",
        countryCode: "+62",
        phoneNumber: "81234567890",
        restaurantName: "Bistro",
      } as never),
    ).rejects.toThrow("WhatsApp queue_admitted send failed");
  });

  it("emails an admitted guest", async () => {
    const { processNotification } = await loadNotifications();

    await processNotification({
      type: "queue_admitted",
      channel: "email",
      firstName: "Ada",
      email: "guest@test.invalid",
      restaurantName: "Bistro",
    } as never);

    expect(sinks().email).toHaveLength(1);
  });
});

describe("reservation notifications", () => {
  function reservation(overrides: Record<string, unknown> = {}) {
    return {
      type: "reservation_created",
      customerEmail: "guest@test.invalid",
      firstName: "Ada",
      lastName: "Lovelace",
      businessName: "Bistro",
      address: "1 Test Street",
      dateLabel: "Wed, 12 Aug",
      timeLabel: "19:30",
      partySize: 2,
      manageUrl: "https://test.invalid/manage",
      businessEmail: "owner@test.invalid",
      locationName: "Downtown",
      customerName: "Ada Lovelace",
      dashboardUrl: "https://test.invalid/dashboard",
      ...overrides,
    } as never;
  }

  it("emails both the guest and the business", async () => {
    const { processNotification } = await loadNotifications();

    await processNotification(reservation());

    expect(sinks().email).toHaveLength(2);
  });

  it("emails only the business when there is no customer email", async () => {
    const { processNotification } = await loadNotifications();

    await processNotification(reservation({ customerEmail: undefined }));

    expect(sinks().email).toHaveLength(1);
    expect(sinks().email[0].to).toBe("owner@test.invalid");
  });

  it("emails only the guest when there is no business email", async () => {
    const { processNotification } = await loadNotifications();

    await processNotification(reservation({ businessEmail: undefined }));

    expect(sinks().email).toHaveLength(1);
    expect(sinks().email[0].to).toBe("guest@test.invalid");
  });

  it("sends a reminder email", async () => {
    const { processNotification } = await loadNotifications();

    await processNotification({
      type: "reservation_reminder",
      email: "guest@test.invalid",
      firstName: "Ada",
      businessName: "Bistro",
      address: "1 Test Street",
      dateLabel: "Wed, 12 Aug",
      timeLabel: "19:30",
      partySize: 2,
    } as never);

    expect(sinks().email).toHaveLength(1);
  });
});

describe("rawCampaignSend", () => {
  it("refuses an email send with no address", async () => {
    const { rawCampaignSend } = await loadNotifications();

    await expect(
      rawCampaignSend({
        channel: "email",
        businessName: "Bistro",
        bodyText: "Hello",
      }),
    ).rejects.toThrow("No email address for recipient");
  });

  it("falls back to a default subject and an html body built from the text", async () => {
    const { rawCampaignSend } = await loadNotifications();

    const id = await rawCampaignSend({
      channel: "email",
      businessName: "Bistro",
      email: "guest@test.invalid",
      bodyText: "Line one\nLine two",
      replyTo: "owner@test.invalid",
    });

    expect(id).toEqual(expect.any(String));
    expect(sinks().email[0].subject).toBe("A message from Bistro");
    expect(sinks().email[0].html).toBe("Line one<br>Line two");
  });

  it("refuses an sms send with no phone number", async () => {
    const { rawCampaignSend } = await loadNotifications();

    await expect(
      rawCampaignSend({
        channel: "sms",
        businessName: "Bistro",
        bodyText: "Hello",
      }),
    ).rejects.toThrow("No phone number for recipient");
  });

  it("raises when the sms provider is unavailable", async () => {
    const { rawCampaignSend } = await loadNotifications();

    await expect(
      rawCampaignSend({
        channel: "sms",
        businessName: "Bistro",
        phone: "6281234567890",
        bodyText: "Hello",
      }),
    ).rejects.toThrow("SMS provider returned failure");
  });

  it("returns the provider id for a campaign sms", async () => {
    configureProviders();
    const { rawCampaignSend } = await loadNotifications();

    const id = await rawCampaignSend({
      channel: "sms",
      businessName: "Bistro",
      phone: "6281234567890",
      bodyText: "Hello",
    });

    expect(id).toBe("test-sms-1");
    expect(sinks().telnyx[0].to).toBe("+6281234567890");
  });

  it("refuses a WhatsApp send with no phone number", async () => {
    const { rawCampaignSend } = await loadNotifications();

    await expect(
      rawCampaignSend({
        channel: "whatsapp",
        businessName: "Bistro",
        bodyText: "Hello",
      }),
    ).rejects.toThrow("No phone number for recipient");
  });

  it("refuses a WhatsApp send with no approved template", async () => {
    const { rawCampaignSend } = await loadNotifications();

    await expect(
      rawCampaignSend({
        channel: "whatsapp",
        businessName: "Bistro",
        phone: "6281234567890",
        bodyText: "Hello",
      }),
    ).rejects.toThrow("WhatsApp template is not available for this message");
  });

  it("raises when the WhatsApp provider is unavailable", async () => {
    const { rawCampaignSend } = await loadNotifications();

    await expect(
      rawCampaignSend({
        channel: "whatsapp",
        businessName: "Bistro",
        phone: "6281234567890",
        bodyText: "Hello",
        whatsappTemplateName: "we_miss_you",
      }),
    ).rejects.toThrow("WhatsApp provider returned failure");
  });

  it("returns the provider id for a campaign WhatsApp message", async () => {
    configureProviders();
    const { rawCampaignSend } = await loadNotifications();

    const id = await rawCampaignSend({
      channel: "whatsapp",
      businessName: "Bistro",
      phone: "6281234567890",
      bodyText: "Hello",
      whatsappTemplateName: "we_miss_you",
      whatsappParams: [{ name: "first_name", text: "Ada" }],
    });

    expect(id).toBe("test-wa-1");
  });
});

describe("campaign delivery", () => {
  it("marks a recipient sent and logs the delivery", async () => {
    const { processNotification } = await loadNotifications();

    await processNotification(campaignJob());

    expect(recipientUpdate.mock.calls[0][0].data.status).toBe("SENT");
    expect(deliveryLogCreate.mock.calls[0][0].data.eventType).toBe("sent");
  });

  it("skips a recipient that no longer exists", async () => {
    recipientFindUnique.mockResolvedValue(null);
    const { processNotification } = await loadNotifications();

    await processNotification(campaignJob());

    expect(recipientUpdate).not.toHaveBeenCalled();
    expect(sinks().email).toHaveLength(0);
  });

  it("skips a recipient that was already sent", async () => {
    recipientFindUnique.mockResolvedValue({ id: "rec-1", status: "SENT" });
    const { processNotification } = await loadNotifications();

    await processNotification(campaignJob());

    expect(sinks().email).toHaveLength(0);
  });

  it("skips a recipient that was already delivered", async () => {
    recipientFindUnique.mockResolvedValue({ id: "rec-1", status: "DELIVERED" });
    const { processNotification } = await loadNotifications();

    await processNotification(campaignJob());

    expect(sinks().email).toHaveLength(0);
  });

  it("marks a recipient failed, logs the reason and rethrows", async () => {
    const { processNotification } = await loadNotifications();

    await expect(
      processNotification(campaignJob({ channel: "sms", phone: undefined })),
    ).rejects.toThrow("No phone number for recipient");

    expect(recipientUpdate.mock.calls[0][0].data.status).toBe("FAILED");
    expect(recipientUpdate.mock.calls[0][0].data.errorMessage).toContain("No phone number");
    expect(deliveryLogCreate.mock.calls[0][0].data.eventType).toBe("failed");
  });

  it("still rethrows when the failure cannot be recorded", async () => {
    recipientUpdate.mockRejectedValue(new Error("db down"));
    deliveryLogCreate.mockRejectedValue(new Error("db down"));
    const { processNotification } = await loadNotifications();

    await expect(
      processNotification(campaignJob({ channel: "sms", phone: undefined })),
    ).rejects.toThrow("No phone number for recipient");
  });
});

describe("enqueueNotification", () => {
  it("sends inline when QStash is not configured", async () => {
    const { enqueueNotification } = await loadNotifications();

    await enqueueNotification(queueJoin({ channel: "email", email: "guest@test.invalid" }));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(sinks().qstash).toHaveLength(0);
    expect(sinks().email).toHaveLength(1);
  });

  it("publishes to QStash when it is configured", async () => {
    process.env.NODE_ENV = "production";
    process.env.QSTASH_TOKEN = "test-qstash-token";
    process.env.QSTASH_URL = "https://qstash.test.invalid";
    process.env.PUBLIC_BASE_URL = "https://app.test.invalid/";
    const { enqueueNotification } = await loadNotifications();

    await enqueueNotification(queueJoin({ channel: "email", email: "guest@test.invalid" }));

    expect(sinks().qstash).toHaveLength(1);
    expect(sinks().qstash[0].url).toBe("https://app.test.invalid/api/jobs/notify");
    expect(sinks().email).toHaveLength(0);
  });

  it("falls back to an inline send when QStash refuses the job", async () => {
    process.env.NODE_ENV = "production";
    process.env.QSTASH_TOKEN = "test-qstash-token";
    const { enqueueNotification } = await loadNotifications();
    behavior().qstashPublishError = "queue unavailable";

    await enqueueNotification(queueJoin({ channel: "email", email: "guest@test.invalid" }));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(sinks().email).toHaveLength(1);
  });

  it("swallows an inline send failure", async () => {
    const { enqueueNotification } = await loadNotifications();

    await expect(enqueueNotification(queueJoin({ channel: "whatsapp" }))).resolves.toBeUndefined();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(console.error).toHaveBeenCalled();
  });
});

describe("daily per-recipient cap", () => {
  it("drops a queue_join once the recipient hits the cap", async () => {
    process.env.NOTIFY_DAILY_MAX_PER_RECIPIENT = "1";
    const { enqueueNotification } = await loadNotifications();
    const job = queueJoin({ channel: "email", email: "capped@test.invalid" });

    await enqueueNotification(job);
    await enqueueNotification(job);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(sinks().email).toHaveLength(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it("keeps the business heads-up when the guest hits the cap", async () => {
    process.env.NOTIFY_DAILY_MAX_PER_RECIPIENT = "1";
    const { enqueueNotification } = await loadNotifications();
    const job = {
      type: "reservation_created",
      customerEmail: "capped-guest@test.invalid",
      firstName: "Ada",
      lastName: "Lovelace",
      businessName: "Bistro",
      address: "1 Test Street",
      dateLabel: "Wed, 12 Aug",
      timeLabel: "19:30",
      partySize: 2,
      manageUrl: "https://test.invalid/manage",
      businessEmail: "owner@test.invalid",
      locationName: "Downtown",
      customerName: "Ada Lovelace",
      dashboardUrl: "https://test.invalid/dashboard",
    } as never;

    await enqueueNotification(job);
    await enqueueNotification(job);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    const recipients = sinks().email.map((e) => {
      return e.to;
    });
    expect(recipients.filter((to) => to === "capped-guest@test.invalid")).toHaveLength(1);
    expect(recipients.filter((to) => to === "owner@test.invalid")).toHaveLength(2);
  });

  it("reports the remaining allowance without consuming it", async () => {
    process.env.NOTIFY_DAILY_MAX_PER_RECIPIENT = "1";
    const { canNotifyRecipient, enqueueNotification } = await loadNotifications();

    await expect(canNotifyRecipient("email", "peek@test.invalid")).resolves.toBe(true);
    await enqueueNotification(queueJoin({ channel: "email", email: "peek@test.invalid" }));

    await expect(canNotifyRecipient("email", "peek@test.invalid")).resolves.toBe(false);
  });

  it("never caps a job with no recipient", async () => {
    const { canNotifyRecipient } = await loadNotifications();

    await expect(canNotifyRecipient("sms", undefined)).resolves.toBe(true);
  });
});

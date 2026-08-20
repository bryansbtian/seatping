import { beforeEach, describe, expect, it } from "vitest";
import {
  SEATPING_TEMPLATE_CONTRACTS,
  formatWhatsAppNumber,
  resolveContractParams,
  sendCampaignWhatsApp,
  sendQueueAdmittedWhatsApp,
  sendQueueJoinedWhatsApp,
} from "../../server/lib/whatsapp.js";
import {
  canNotifyRecipient,
  enqueueNotification,
  processNotification,
} from "../../server/lib/notifications.js";
import { sinks } from "../setup/externalMocks.js";

beforeEach(() => {
  delete process.env.KAPSO_API_KEY;
  delete process.env.KAPSO_PHONE_NUMBER_ID;
  delete process.env.TELNYX_API_KEY;
  delete process.env.TELNYX_PHONE_NUMBER;
});

describe("whatsapp template contracts", () => {
  it("returns named params for a named contract", () => {
    const params = resolveContractParams(
      { mode: "named", names: ["first_name", "business_name"] },
      { first_name: "Ada", business_name: "Bistro" },
    );

    expect(params).toEqual([
      { name: "first_name", text: "Ada" },
      { name: "business_name", text: "Bistro" },
    ]);
  });

  it("drops the names for a positional contract", () => {
    const params = resolveContractParams(
      { mode: "positional", names: ["first_name", "business_name"] },
      { first_name: "Ada", business_name: "Bistro" },
    );

    expect(params).toEqual([{ text: "Ada" }, { text: "Bistro" }]);
  });

  it("substitutes an empty string for a missing value", () => {
    const params = resolveContractParams({ mode: "named", names: ["first_name"] }, {});

    expect(params).toEqual([{ name: "first_name", text: "" }]);
  });

  it("stringifies non-string values", () => {
    const params = resolveContractParams(
      { mode: "named", names: ["count"] },
      { count: 3 as unknown as string },
    );

    expect(params[0].text).toBe("3");
  });

  it("keeps every seeded contract well formed", () => {
    const entries = Object.entries(SEATPING_TEMPLATE_CONTRACTS);
    expect(entries.length).toBeGreaterThan(0);

    for (const [slug, contract] of entries) {
      expect(slug).toEqual(expect.any(String));
      expect(["named", "positional"]).toContain(contract.mode);
      expect(contract.names.length).toBeGreaterThan(0);
    }
  });

  it("builds a dialable number from a country code and local number", () => {
    expect(formatWhatsAppNumber("+62", "0812 3456")).toBe("6208123456");
  });
});

describe("whatsapp sending when the provider is not configured", () => {
  it("reports failure instead of throwing for a queue join", async () => {
    const sent = await sendQueueJoinedWhatsApp({
      countryCode: "+1",
      phoneNumber: "5551234567",
      firstName: "Ada",
      businessName: "Bistro",
      position: 2,
    } as never);

    expect(sent).toBe(false);
    expect(sinks().whatsapp).toHaveLength(0);
  });

  it("reports failure instead of throwing for an admit notice", async () => {
    const sent = await sendQueueAdmittedWhatsApp({
      countryCode: "+1",
      phoneNumber: "5551234567",
      firstName: "Ada",
      businessName: "Bistro",
    } as never);

    expect(sent).toBe(false);
    expect(sinks().whatsapp).toHaveLength(0);
  });

  it("does not attempt a campaign send without provider configuration", async () => {
    const result = await sendCampaignWhatsApp({
      countryCode: "+1",
      phoneNumber: "5551234567",
      templateName: "we_miss_you",
      bodyParams: [{ name: "first_name", text: "Ada" }],
    } as never);

    expect(result).toBeFalsy();
    expect(sinks().whatsapp).toHaveLength(0);
  });
});

describe("notification recipient caps", () => {
  it("allows a notification when there is no recipient to cap", async () => {
    await expect(canNotifyRecipient("email", undefined)).resolves.toBe(true);
  });

  it("allows the first notification to a fresh recipient", async () => {
    const recipient = `fresh-${Date.now()}@test.invalid`;

    await expect(canNotifyRecipient("email", recipient)).resolves.toBe(true);
  });

  it("evaluates each channel independently", async () => {
    const recipient = `channels-${Date.now()}@test.invalid`;

    await expect(canNotifyRecipient("email", recipient)).resolves.toBe(true);
    await expect(canNotifyRecipient("sms", recipient)).resolves.toBe(true);
    await expect(canNotifyRecipient("whatsapp", recipient)).resolves.toBe(true);
  });
});

describe("notification dispatch", () => {
  it("sends a queue join email through the mocked transport", async () => {
    await processNotification({
      type: "queue_join",
      channel: "email",
      email: `queue-join-${Date.now()}@test.invalid`,
      firstName: "Ada",
      businessName: "Bistro",
      position: 3,
    } as never);

    expect(sinks().email.length).toBeGreaterThanOrEqual(1);
    expect(sinks().telnyx).toHaveLength(0);
  });

  it("never reaches a paid provider when the channel is email", async () => {
    await processNotification({
      type: "queue_admitted",
      channel: "email",
      email: `admit-${Date.now()}@test.invalid`,
      firstName: "Ada",
      businessName: "Bistro",
    } as never);

    expect(sinks().telnyx).toHaveLength(0);
    expect(sinks().whatsapp).toHaveLength(0);
  });

  it("does not send an SMS when Telnyx is unconfigured", async () => {
    await processNotification({
      type: "queue_join",
      channel: "sms",
      phoneNumber: "5551234567",
      countryCode: "+1",
      firstName: "Ada",
      businessName: "Bistro",
      position: 1,
    } as never);

    expect(sinks().telnyx).toHaveLength(0);
  });

  it("swallows provider failures rather than propagating them", async () => {
    await expect(
      processNotification({
        type: "queue_join",
        channel: "sms",
        phoneNumber: "",
        countryCode: "",
        firstName: "Ada",
        businessName: "Bistro",
        position: 1,
      } as never),
    ).resolves.not.toThrow();
  });

  it("enqueues inline when QStash is not configured", async () => {
    await expect(
      enqueueNotification({
        type: "queue_join",
        channel: "email",
        email: `enqueue-${Date.now()}@test.invalid`,
        firstName: "Ada",
        businessName: "Bistro",
        position: 1,
      } as never),
    ).resolves.not.toThrow();

    expect(sinks().qstash).toHaveLength(0);
  });
});

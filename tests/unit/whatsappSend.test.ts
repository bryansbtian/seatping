import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { behavior, sinks } from "../setup/externalMocks.js";

const ORIGINAL_ENV = { ...process.env };

type WhatsAppModule = typeof import("../../server/lib/whatsapp.js");

async function loadWhatsApp(): Promise<WhatsAppModule> {
  vi.resetModules();
  return import("../../server/lib/whatsapp.js");
}

function lastSend(): any {
  const store = sinks().whatsapp;
  return store[store.length - 1] as any;
}

function bodyParameters(): any[] {
  const components = lastSend()?.template?.components ?? [];
  const body = components.find((c: any) => {
    return c.type === "body";
  });
  return body?.parameters ?? [];
}

beforeEach(() => {
  process.env.KAPSO_API_KEY = "test-kapso-key";
  process.env.KAPSO_PHONE_NUMBER_ID = "test-phone-number-id";
  delete process.env.KAPSO_WABA_ID;
  delete process.env.KAPSO_BUSINESS_ACCOUNT_ID;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("formatWhatsAppNumber", () => {
  it("keeps only digits from both parts", async () => {
    const { formatWhatsAppNumber } = await loadWhatsApp();

    expect(formatWhatsAppNumber("+1", "(555) 123-4567")).toBe("15551234567");
  });

  it("returns an empty string when both parts are blank", async () => {
    const { formatWhatsAppNumber } = await loadWhatsApp();

    expect(formatWhatsAppNumber("", "")).toBe("");
    expect(formatWhatsAppNumber(null as never, undefined as never)).toBe("");
  });
});

describe("queue templates with the provider configured", () => {
  it("sends the queue_joined template with name, business and position", async () => {
    const { sendQueueJoinedWhatsApp } = await loadWhatsApp();

    const sent = await sendQueueJoinedWhatsApp({
      countryCode: "+62",
      phoneNumber: "81234567890",
      customerName: "Ada",
      businessName: "Bistro",
      position: 4,
    });

    expect(sent).toBe(true);
    expect(lastSend().to).toBe("6281234567890");
    expect(lastSend().template.name).toBe("queue_joined");
    expect(bodyParameters().map((p) => p.text)).toEqual(["Ada", "Bistro", "4"]);
  });

  it("refuses to send queue_joined when the number has no digits", async () => {
    const { sendQueueJoinedWhatsApp } = await loadWhatsApp();

    const sent = await sendQueueJoinedWhatsApp({
      countryCode: "",
      phoneNumber: "",
      customerName: "Ada",
      businessName: "Bistro",
      position: 1,
    });

    expect(sent).toBe(false);
    expect(sinks().whatsapp).toHaveLength(0);
  });

  it("reports failure when the provider rejects queue_joined", async () => {
    const { sendQueueJoinedWhatsApp } = await loadWhatsApp();
    behavior().whatsappSendError = "template paused";

    const sent = await sendQueueJoinedWhatsApp({
      countryCode: "+62",
      phoneNumber: "81234567890",
      customerName: "Ada",
      businessName: "Bistro",
      position: 1,
    });

    expect(sent).toBe(false);
  });

  it("fails closed for queue_joined when the phone number id is missing", async () => {
    delete process.env.KAPSO_PHONE_NUMBER_ID;
    const { sendQueueJoinedWhatsApp } = await loadWhatsApp();

    const sent = await sendQueueJoinedWhatsApp({
      countryCode: "+62",
      phoneNumber: "81234567890",
      customerName: "Ada",
      businessName: "Bistro",
      position: 1,
    });

    expect(sent).toBe(false);
    expect(sinks().whatsapp).toHaveLength(0);
  });

  it("sends the queue_admitted template with the business name", async () => {
    const { sendQueueAdmittedWhatsApp } = await loadWhatsApp();

    const sent = await sendQueueAdmittedWhatsApp({
      countryCode: "+62",
      phoneNumber: "81234567890",
      businessName: "Bistro",
    });

    expect(sent).toBe(true);
    expect(lastSend().template.name).toBe("queue_admitted");
    expect(bodyParameters().map((p) => p.text)).toEqual(["Bistro"]);
  });

  it("refuses to send queue_admitted when the number has no digits", async () => {
    const { sendQueueAdmittedWhatsApp } = await loadWhatsApp();

    const sent = await sendQueueAdmittedWhatsApp({
      countryCode: "",
      phoneNumber: "",
      businessName: "Bistro",
    });

    expect(sent).toBe(false);
    expect(sinks().whatsapp).toHaveLength(0);
  });

  it("reports failure when the provider rejects queue_admitted", async () => {
    const { sendQueueAdmittedWhatsApp } = await loadWhatsApp();
    behavior().whatsappSendError = "rate limited";

    const sent = await sendQueueAdmittedWhatsApp({
      countryCode: "+62",
      phoneNumber: "81234567890",
      businessName: "Bistro",
    });

    expect(sent).toBe(false);
  });

  it("fails closed for queue_admitted when the phone number id is missing", async () => {
    delete process.env.KAPSO_PHONE_NUMBER_ID;
    const { sendQueueAdmittedWhatsApp } = await loadWhatsApp();

    const sent = await sendQueueAdmittedWhatsApp({
      countryCode: "+62",
      phoneNumber: "81234567890",
      businessName: "Bistro",
    });

    expect(sent).toBe(false);
  });
});

describe("campaign sending", () => {
  it("returns null when the recipient has no digits", async () => {
    const { sendCampaignWhatsApp } = await loadWhatsApp();

    const id = await sendCampaignWhatsApp({
      toDigits: "no digits",
      templateName: "we_miss_you",
      bodyParams: [],
    });

    expect(id).toBeNull();
    expect(sinks().whatsapp).toHaveLength(0);
  });

  it("returns null when the template name is missing", async () => {
    const { sendCampaignWhatsApp } = await loadWhatsApp();

    const id = await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "",
      bodyParams: [],
    });

    expect(id).toBeNull();
  });

  it("uses the stored body params when no values are supplied", async () => {
    const { sendCampaignWhatsApp } = await loadWhatsApp();

    const id = await sendCampaignWhatsApp({
      toDigits: "+62 812-3456-7890",
      templateName: "custom_promo",
      bodyParams: [{ text: "Ada" }, { text: "Bistro" }],
    });

    expect(id).toBe("test-wa-1");
    expect(lastSend().to).toBe("6281234567890");
    expect(bodyParameters()).toEqual([
      { type: "text", text: "Ada" },
      { type: "text", text: "Bistro" },
    ]);
  });

  it("omits the body component when there are no params", async () => {
    const { sendCampaignWhatsApp } = await loadWhatsApp();

    await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "static_promo",
      bodyParams: [],
    });

    expect(lastSend().template.components).toEqual([]);
  });

  it("falls back to the SeatPing contract when Meta cannot be consulted", async () => {
    const { sendCampaignWhatsApp } = await loadWhatsApp();

    await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "we_miss_you",
      bodyParams: [{ text: "ignored" }],
      bodyValues: {
        first_name: "Ada",
        business_name: "Bistro",
        restaurant: "Bistro",
      },
    });

    expect(bodyParameters()).toEqual([
      { type: "text", parameter_name: "first_name", text: "Ada" },
      { type: "text", parameter_name: "business_name", text: "Bistro" },
      { type: "text", parameter_name: "restaurant", text: "Bistro" },
    ]);
  });

  it("prefers the live Meta contract over the SeatPing one", async () => {
    process.env.KAPSO_WABA_ID = "waba-1";
    const { sendCampaignWhatsApp } = await loadWhatsApp();
    behavior().templateListData = [
      {
        name: "we_miss_you",
        language: "en",
        components: [{ type: "BODY", text: "Hi {{first_name}} from {{restaurant}}" }],
      },
    ];

    await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "we_miss_you",
      bodyParams: [],
      bodyValues: { first_name: "Ada", restaurant: "Bistro" },
    });

    expect(bodyParameters()).toEqual([
      { type: "text", parameter_name: "first_name", text: "Ada" },
      { type: "text", parameter_name: "restaurant", text: "Bistro" },
    ]);
  });

  it("treats an all-numeric Meta contract as positional", async () => {
    process.env.KAPSO_BUSINESS_ACCOUNT_ID = "waba-2";
    const { sendCampaignWhatsApp } = await loadWhatsApp();
    behavior().templateListData = [
      {
        name: "legacy_promo",
        components: [{ type: "body", text: "Hi {{1}} from {{2}}" }],
      },
    ];

    await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "legacy_promo",
      language: "id",
      bodyParams: [],
      bodyValues: { "1": "Ada", "2": "Bistro" },
    });

    expect(bodyParameters()).toEqual([
      { type: "text", text: "Ada" },
      { type: "text", text: "Bistro" },
    ]);
    expect(lastSend().template.language).toEqual({ code: "id" });
  });

  it("looks the contract up once and reuses the cached answer", async () => {
    process.env.KAPSO_WABA_ID = "waba-1";
    const { sendCampaignWhatsApp } = await loadWhatsApp();
    behavior().templateListData = [
      {
        name: "cached_promo",
        language: "en",
        components: [{ type: "BODY", text: "Hi {{first_name}}" }],
      },
    ];

    await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "cached_promo",
      bodyParams: [],
      bodyValues: { first_name: "Ada" },
    });
    await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "cached_promo",
      bodyParams: [],
      bodyValues: { first_name: "Grace" },
    });

    expect(sinks().templateListCalls).toHaveLength(1);
    expect(sinks().whatsapp).toHaveLength(2);
  });

  it("falls back to the stored body when Meta knows no such template", async () => {
    process.env.KAPSO_WABA_ID = "waba-1";
    const { sendCampaignWhatsApp } = await loadWhatsApp();
    behavior().templateListData = [{ name: "some_other_template" }];

    await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "unknown_promo",
      bodyParams: [{ text: "stored" }],
      bodyValues: { first_name: "Ada" },
    });

    expect(bodyParameters()).toEqual([{ type: "text", text: "stored" }]);
  });

  it("falls back to the stored body when the contract lookup fails", async () => {
    process.env.KAPSO_WABA_ID = "waba-1";
    const { sendCampaignWhatsApp } = await loadWhatsApp();
    behavior().templateListError = "waba unreachable";

    await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "unknown_promo",
      bodyParams: [{ text: "stored" }],
      bodyValues: { first_name: "Ada" },
    });

    expect(bodyParameters()).toEqual([{ type: "text", text: "stored" }]);
  });

  it("reads the message id from a data envelope", async () => {
    const { sendCampaignWhatsApp } = await loadWhatsApp();
    behavior().whatsappSendResult = { data: { id: "wamid-data" } };

    const id = await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "custom_promo",
      bodyParams: [{ text: "Ada" }],
    });

    expect(id).toBe("wamid-data");
  });

  it("reads the message id from a bare id field", async () => {
    const { sendCampaignWhatsApp } = await loadWhatsApp();
    behavior().whatsappSendResult = { id: "wamid-bare" };

    const id = await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "custom_promo",
      bodyParams: [{ text: "Ada" }],
    });

    expect(id).toBe("wamid-bare");
  });

  it("reports a bare success when the provider returns no id", async () => {
    const { sendCampaignWhatsApp } = await loadWhatsApp();
    behavior().whatsappSendResult = {};

    const id = await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "custom_promo",
      bodyParams: [{ text: "Ada" }],
    });

    expect(id).toBe("sent");
  });

  it("returns null when the provider rejects the send", async () => {
    const { sendCampaignWhatsApp } = await loadWhatsApp();
    behavior().whatsappSendError = "template not approved";

    const id = await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "custom_promo",
      bodyParams: [{ text: "Ada" }],
    });

    expect(id).toBeNull();
  });

  it("returns null when the provider is not configured", async () => {
    delete process.env.KAPSO_API_KEY;
    const { sendCampaignWhatsApp } = await loadWhatsApp();

    const id = await sendCampaignWhatsApp({
      toDigits: "6281234567890",
      templateName: "custom_promo",
      bodyParams: [{ text: "Ada" }],
    });

    expect(id).toBeNull();
    expect(sinks().whatsapp).toHaveLength(0);
  });
});

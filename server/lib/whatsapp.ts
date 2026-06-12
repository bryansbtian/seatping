import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";

const KAPSO_BASE_URL = "https://api.kapso.ai/meta/whatsapp";

let cachedClient: WhatsAppClient | null = null;

function getClient(): WhatsAppClient | null {
  const apiKey = process.env.KAPSO_API_KEY;
  if (!apiKey) return null;
  if (!cachedClient) {
    cachedClient = new WhatsAppClient({
      baseUrl: KAPSO_BASE_URL,
      kapsoApiKey: apiKey,
    });
  }
  return cachedClient;
}

/**
 * Normalizes a country code + phone number into the WhatsApp API format
 * (international digits only, no '+' or formatting).
 * Example: "+62" + "8111998669" -> "628111998669"
 */
export function formatWhatsAppNumber(countryCode: string, phoneNumber: string): string {
  const cc = (countryCode || "").replace(/\D/g, "");
  const digits = (phoneNumber || "").replace(/\D/g, "");
  return `${cc}${digits}`;
}

export interface SendQueueJoinedParams {
  countryCode: string;
  phoneNumber: string;
  customerName: string;
  businessName: string;
  position: number | string;
}

export interface SendQueueAdmittedParams {
  countryCode: string;
  phoneNumber: string;
  businessName: string;
}

export async function sendQueueJoinedWhatsApp(params: SendQueueJoinedParams): Promise<boolean> {
  const client = getClient();
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

  if (!client || !phoneNumberId) {
    console.error("[WHATSAPP] Missing KAPSO_API_KEY or KAPSO_PHONE_NUMBER_ID env vars - cannot send queue_joined");
    return false;
  }

  const to = formatWhatsAppNumber(params.countryCode, params.phoneNumber);
  if (!to) {
    console.error("[WHATSAPP] Invalid phone number for queue_joined", { countryCode: params.countryCode });
    return false;
  }

  try {
    await client.messages.sendTemplate({
      phoneNumberId,
      to,
      template: {
        name: "queue_joined",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: String(params.customerName) },
              { type: "text", text: String(params.businessName) },
              { type: "text", text: String(params.position) },
            ],
          },
        ],
      },
    });
    console.log("[WHATSAPP] queue_joined template sent to", to);
    return true;
  } catch (error: any) {
    console.error("[WHATSAPP] Failed to send queue_joined:", error?.message || error);
    return false;
  }
}

export interface SendCampaignWhatsAppParams {
  // Digits-only international number (E.164 without '+'), e.g. "628111998669".
  toDigits: string;
  templateName: string;
  language?: string;
  // Positional body parameters for the approved Meta template ({{1}}, {{2}}, ...).
  bodyParams: string[];
}

/**
 * Send a campaign WhatsApp message through an APPROVED Meta template. Campaign
 * custom templates carry their provider template name (set by admin once Meta
 * approves it); SeatPing templates may map to a curated marketing template. The
 * template MUST already exist + be approved in Meta — we never free-form send.
 * Returns the provider message id on success, or null on failure/misconfig.
 */
export async function sendCampaignWhatsApp(
  params: SendCampaignWhatsAppParams,
): Promise<string | null> {
  const client = getClient();
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  if (!client || !phoneNumberId) {
    console.error("[WHATSAPP] Missing KAPSO creds — cannot send campaign message");
    return null;
  }
  const to = params.toDigits.replace(/\D/g, "");
  if (!to || !params.templateName) {
    console.error("[WHATSAPP] Missing recipient or template name for campaign send");
    return null;
  }
  try {
    const result: any = await client.messages.sendTemplate({
      phoneNumberId,
      to,
      template: {
        name: params.templateName,
        language: { code: params.language || "en" },
        components: params.bodyParams.length
          ? [
              {
                type: "body",
                parameters: params.bodyParams.map((text) => ({
                  type: "text",
                  text: String(text),
                })),
              },
            ]
          : [],
      },
    });
    const id =
      result?.messages?.[0]?.id || result?.data?.id || result?.id || null;
    console.log("[WHATSAPP] campaign template sent to", to);
    return id ? String(id) : "sent";
  } catch (error: any) {
    console.error("[WHATSAPP] campaign send failed:", error?.message || error);
    return null;
  }
}

export async function sendQueueAdmittedWhatsApp(params: SendQueueAdmittedParams): Promise<boolean> {
  const client = getClient();
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

  if (!client || !phoneNumberId) {
    console.error("[WHATSAPP] Missing KAPSO_API_KEY or KAPSO_PHONE_NUMBER_ID env vars - cannot send queue_admitted");
    return false;
  }

  const to = formatWhatsAppNumber(params.countryCode, params.phoneNumber);
  if (!to) {
    console.error("[WHATSAPP] Invalid phone number for queue_admitted", { countryCode: params.countryCode });
    return false;
  }

  try {
    await client.messages.sendTemplate({
      phoneNumberId,
      to,
      template: {
        name: "queue_admitted",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: String(params.businessName) }],
          },
        ],
      },
    });
    console.log("[WHATSAPP] queue_admitted template sent to", to);
    return true;
  } catch (error: any) {
    console.error("[WHATSAPP] Failed to send queue_admitted:", error?.message || error);
    return false;
  }
}

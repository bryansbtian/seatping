import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
const KAPSO_BASE_URL = "https://api.kapso.ai/meta/whatsapp";
let cachedClient = null;
function getClient() {
    const apiKey = process.env.KAPSO_API_KEY;
    if (!apiKey)
        return null;
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
export function formatWhatsAppNumber(countryCode, phoneNumber) {
    const cc = (countryCode || "").replace(/\D/g, "");
    const digits = (phoneNumber || "").replace(/\D/g, "");
    return `${cc}${digits}`;
}
export async function sendQueueJoinedWhatsApp(params) {
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
        const result = await client.messages.sendTemplate({
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
    }
    catch (error) {
        console.error("[WHATSAPP] Failed to send queue_joined:", error?.message || error);
        return false;
    }
}
export async function sendQueueAdmittedWhatsApp(params) {
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
        const result = await client.messages.sendTemplate({
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
    }
    catch (error) {
        console.error("[WHATSAPP] Failed to send queue_admitted:", error?.message || error);
        return false;
    }
}

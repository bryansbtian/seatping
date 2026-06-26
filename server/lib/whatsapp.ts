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

export interface WhatsAppBodyParam {
  name?: string;
  text: string;
}

export interface SendCampaignWhatsAppParams {
  toDigits: string;
  templateName: string;
  language?: string;
  bodyParams: WhatsAppBodyParam[];
  bodyValues?: Record<string, string>;
}

export interface TemplateContract {
  mode: "named" | "positional";
  names: string[];
}

export function resolveContractParams(
  contract: TemplateContract,
  values: Record<string, string>,
): WhatsAppBodyParam[] {
  return contract.names.map((n) => {
    const text = values[n] != null ? String(values[n]) : "";
    return contract.mode === "positional" ? { text } : { name: n, text };
  });
}

const templateContractCache = new Map<string, TemplateContract | null>();

function placeholdersOf(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

async function getTemplateContract(
  templateName: string,
  language: string,
): Promise<TemplateContract | null> {
  const wabaId =
    process.env.KAPSO_WABA_ID || process.env.KAPSO_BUSINESS_ACCOUNT_ID;
  const client = getClient();
  if (!client || !wabaId) return null;

  const key = `${templateName}::${language}`;
  if (templateContractCache.has(key)) return templateContractCache.get(key) ?? null;

  try {
    const resp: any = await client.templates.list({
      businessAccountId: wabaId,
      limit: 200,
    } as any);
    const templates: any[] = resp?.data || [];
    const match =
      templates.find(
        (t) => t?.name === templateName && (t?.language === language || !t?.language),
      ) || templates.find((t) => t?.name === templateName);
    if (!match) {
      templateContractCache.set(key, null);
      return null;
    }
    const components: any[] = match.components || [];
    const body = components.find(
      (c) => String(c?.type || "").toLowerCase() === "body",
    );
    const names = placeholdersOf(String(body?.text || ""));
    const mode: TemplateContract["mode"] =
      names.length > 0 && names.every((n) => /^\d+$/.test(n))
        ? "positional"
        : "named";
    const contract: TemplateContract = { mode, names };
    templateContractCache.set(key, contract);
    return contract;
  } catch (error: any) {
    console.error(
      "[WHATSAPP] template contract lookup failed:",
      error?.message || error,
    );
    return null;
  }
}

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

  const language = params.language || "en";
  const values = params.bodyValues || {};

  const contract = await getTemplateContract(params.templateName, language);
  let bodyParams: WhatsAppBodyParam[];
  let source: "meta-contract" | "stored-body";
  if (contract && params.bodyValues) {
    source = "meta-contract";
    bodyParams = resolveContractParams(contract, values);
  } else {
    source = "stored-body";
    bodyParams = params.bodyParams || [];
  }

  const isNamed = bodyParams.some((p) => p && p.name);

  console.log(
    `[WHATSAPP] campaign send template=${params.templateName} source=${source} mode=${
      isNamed ? "named" : "positional"
    } params=[${bodyParams
      .map((p, i) => (p.name ? p.name : `{{${i + 1}}}`))
      .join(", ")}] count=${bodyParams.length}`,
  );

  try {
    const result: any = await client.messages.sendTemplate({
      phoneNumberId,
      to,
      template: {
        name: params.templateName,
        language: { code: params.language || "en" },
        components: bodyParams.length
          ? [
              {
                type: "body",
                parameters: bodyParams.map((p) =>
                  p.name
                    ? { type: "text", parameter_name: p.name, text: String(p.text) }
                    : { type: "text", text: String(p.text) },
                ),
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

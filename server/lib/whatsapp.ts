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

/**
 * A single body parameter for an approved Meta campaign template.
 * - `name` present  => Meta NAMED-parameter mode (template uses {{first_name}}).
 * - `name` absent   => positional mode (template uses {{1}}, {{2}}, ...).
 * A campaign template is all-named or all-positional, never mixed.
 */
export interface WhatsAppBodyParam {
  name?: string;
  text: string;
}

export interface SendCampaignWhatsAppParams {
  // Digits-only international number (E.164 without '+'), e.g. "628111998669".
  toDigits: string;
  templateName: string;
  language?: string;
  // Body parameters derived from SeatPing's stored template body. Used as the
  // fallback when the live Meta contract cannot be fetched (e.g. no WABA id).
  bodyParams: WhatsAppBodyParam[];
  // Resolved variable map (name -> rendered value) for this recipient. When the
  // live Meta template contract is available, params are rebuilt FROM the
  // contract using this map, so SeatPing always matches the approved template's
  // exact parameter set even if its stored body has drifted.
  bodyValues?: Record<string, string>;
}

/**
 * The authoritative parameter contract of an APPROVED Meta template, read from
 * the live template definition (its BODY component text), not SeatPing's stored
 * body. `names` is the ordered list of {{placeholders}}; `mode` is "positional"
 * when every placeholder is numeric ({{1}}, {{2}}), "named" otherwise.
 */
export interface TemplateContract {
  mode: "named" | "positional";
  names: string[];
}

/**
 * Build the ordered Meta body parameters for a template contract by resolving
 * each expected placeholder against a recipient's value map. Named contracts
 * emit `{ name, text }` (sent with parameter_name); positional emit `{ text }`.
 * Missing values become empty strings. Pure + exported for testing.
 */
export function resolveContractParams(
  contract: TemplateContract,
  values: Record<string, string>,
): WhatsAppBodyParam[] {
  return contract.names.map((n) => {
    const text = values[n] != null ? String(values[n]) : "";
    return contract.mode === "positional" ? { text } : { name: n, text };
  });
}

// In-process cache of template contracts, keyed by `${name}::${language}`. The
// approved definition rarely changes, so caching avoids a Meta lookup on every
// send within a warm function instance.
const templateContractCache = new Map<string, TemplateContract | null>();

/** Ordered, de-duplicated {{placeholder}} names in a template body string. */
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

/**
 * Fetch the live parameter contract for an approved campaign template from Meta
 * (via the Kapso templates API). Returns null when the WABA id is not configured
 * or the template/body cannot be found, so callers fall back to body-derived
 * params. Result (including null) is cached per name+language.
 */
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
    // Prefer an exact name + language match; fall back to name-only.
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
    // Cache the miss briefly is risky (transient errors); do NOT cache failures
    // so a later send can retry. Fall back to body-derived params for now.
    return null;
  }
}

/**
 * Send a campaign WhatsApp message through an APPROVED Meta template. Campaign
 * custom templates carry their provider template name (set by admin once Meta
 * approves it); SeatPing templates may map to a curated marketing template. The
 * template MUST already exist + be approved in Meta — we never free-form send.
 *
 * Supports both Meta parameter formats. Approved marketing templates that use
 * named placeholders ({{first_name}}, {{offer}}, ...) require named parameters
 * (each component carries `parameter_name`); legacy positional templates ({{1}})
 * use bare text components. Sending the wrong format yields Meta error #132018.
 *
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

  const language = params.language || "en";
  const values = params.bodyValues || {};

  // Prefer the LIVE Meta contract (authoritative param set) over SeatPing's
  // stored body, which can drift from the approved template. Resolve each
  // expected placeholder against this recipient's value map.
  const contract = await getTemplateContract(params.templateName, language);
  let bodyParams: WhatsAppBodyParam[];
  let source: "meta-contract" | "stored-body";
  if (contract && params.bodyValues) {
    source = "meta-contract";
    bodyParams = resolveContractParams(contract, values);
  } else {
    // Fallback: params derived from SeatPing's stored body (no WABA id / lookup
    // failed). Backward compatible with the pre-contract behavior.
    source = "stored-body";
    bodyParams = params.bodyParams || [];
  }

  // Named mode if ANY param declares a name. Meta forbids mixing, so a single
  // named param means the whole template is named.
  const isNamed = bodyParams.some((p) => p && p.name);

  // Diagnostic log: never includes the phone number or recipient PII.
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

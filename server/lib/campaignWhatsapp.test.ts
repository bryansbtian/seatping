import assert from "node:assert/strict";
import test from "node:test";
import { buildMessage, extractBodyPlaceholders } from "./campaigns.js";
import { resolveContractParams } from "./whatsapp.js";
import type { CampaignTemplate } from "@prisma/client";

// Minimal CampaignTemplate factory — buildMessage only reads these fields.
function tmpl(overrides: Partial<CampaignTemplate>): CampaignTemplate {
  return {
    name: "Test",
    body: "",
    offerDetails: null,
    ctaText: null,
    ctaUrl: null,
    whatsappProviderTemplateName: null,
    whatsappLanguage: "en",
    ...overrides,
  } as CampaignTemplate;
}

const ctx = {
  businessName: "Bryan's Bistro",
  locationName: "Downtown",
  firstName: "Sam",
  guestName: "Sam Lee",
};

test("extractBodyPlaceholders returns distinct names in body order", () => {
  assert.deepEqual(
    extractBodyPlaceholders(
      "Hi {{first_name}}, {{business_name}} welcomes you. {{offer}} — {{restaurant}}",
    ),
    ["first_name", "business_name", "offer", "restaurant"],
  );
  // Dedupes repeats, keeps first-seen order.
  assert.deepEqual(
    extractBodyPlaceholders("{{first_name}} {{first_name}} {{restaurant}}"),
    ["first_name", "restaurant"],
  );
});

test("lunch_comeback_offer builds 4 NAMED params in body order", () => {
  const t = tmpl({
    whatsappProviderTemplateName: "lunch_comeback_offer",
    body: "Hi {{first_name}}, {{business_name}} would love to welcome you back for lunch. Enjoy {{offer}} on your next weekday visit. — {{restaurant}} (via SeatPing)",
  });
  const msg = buildMessage(t, { offer: "20% off" }, ctx, "WHATSAPP");
  assert.equal(msg.whatsappTemplateName, "lunch_comeback_offer");
  assert.deepEqual(msg.whatsappParams, [
    { name: "first_name", text: "Sam" },
    { name: "business_name", text: "Bryan's Bistro" },
    { name: "offer", text: "20% off" },
    { name: "restaurant", text: "Bryan's Bistro" },
  ]);
});

test("we_miss_you builds 3 NAMED params (restaurant alias resolves)", () => {
  const t = tmpl({
    whatsappProviderTemplateName: "we_miss_you",
    body: "Hi {{first_name}}, we miss you at {{business_name}}! It has been a little while since your last visit and we would love to welcome you back. — {{restaurant}} (via SeatPing)",
  });
  const msg = buildMessage(t, {}, ctx, "WHATSAPP");
  assert.deepEqual(msg.whatsappParams, [
    { name: "first_name", text: "Sam" },
    { name: "business_name", text: "Bryan's Bistro" },
    { name: "restaurant", text: "Bryan's Bistro" },
  ]);
  // No empty params — every named slot resolved.
  assert.ok(msg.whatsappParams!.every((p) => p.text.length > 0));
});

test("offer falls back to rendered offerDetails when not explicitly filled", () => {
  const t = tmpl({
    whatsappProviderTemplateName: "lunch_comeback_offer",
    offerDetails: "a free dessert",
    body: "Hi {{first_name}}, enjoy {{offer}} from {{restaurant}} soon.",
  });
  const msg = buildMessage(t, {}, ctx, "WHATSAPP");
  const offerParam = msg.whatsappParams!.find((p) => p.name === "offer");
  assert.equal(offerParam?.text, "a free dessert");
});

test("legacy POSITIONAL template builds bare text params (no names)", () => {
  const t = tmpl({
    whatsappProviderTemplateName: "legacy_positional",
    body: "Hi {{1}}, your offer at {{2}} is ready.",
  });
  const msg = buildMessage(t, { "1": "Sam", "2": "Bryan's Bistro" }, ctx, "WHATSAPP");
  assert.deepEqual(msg.whatsappParams, [
    { text: "Sam" },
    { text: "Bryan's Bistro" },
  ]);
  // Positional params carry NO name => sendCampaignWhatsApp emits bare text.
  assert.ok(msg.whatsappParams!.every((p) => p.name === undefined));
});

test("template with no variables sends zero body params", () => {
  const t = tmpl({
    whatsappProviderTemplateName: "static_promo",
    body: "Our weekend special is back. Visit us soon.",
  });
  const msg = buildMessage(t, {}, ctx, "WHATSAPP");
  assert.deepEqual(msg.whatsappParams, []);
});

test("buildMessage exposes a resolved value map for live-contract resolution", () => {
  const t = tmpl({
    whatsappProviderTemplateName: "lunch_comeback_offer",
    body: "Hi {{first_name}}, enjoy {{offer}}.",
  });
  const msg = buildMessage(t, { offer: "20% off" }, ctx, "WHATSAPP");
  // The map must resolve every name an approved Meta template might declare,
  // including the footer {{restaurant}} that the stored body omits.
  assert.equal(msg.whatsappValues?.first_name, "Sam");
  assert.equal(msg.whatsappValues?.business_name, "Bryan's Bistro");
  assert.equal(msg.whatsappValues?.restaurant, "Bryan's Bistro");
  assert.equal(msg.whatsappValues?.restaurant_name, "Bryan's Bistro");
  assert.equal(msg.whatsappValues?.offer, "20% off");
});

test("resolveContractParams: lunch_comeback_offer NAMED contract (4 params, incl restaurant footer)", () => {
  // Contract names come from the LIVE Meta template body, NOT SeatPing's stored
  // body — this is what fixes the #132000 count mismatch.
  const contract = {
    mode: "named" as const,
    names: ["first_name", "business_name", "offer", "restaurant"],
  };
  const t = tmpl({
    whatsappProviderTemplateName: "lunch_comeback_offer",
    body: "Hi {{first_name}}, {{business_name}} ... enjoy {{offer}}.", // stored body lacks {{restaurant}}
  });
  const msg = buildMessage(t, { offer: "free dessert" }, ctx, "WHATSAPP");
  assert.deepEqual(resolveContractParams(contract, msg.whatsappValues!), [
    { name: "first_name", text: "Sam" },
    { name: "business_name", text: "Bryan's Bistro" },
    { name: "offer", text: "free dessert" },
    { name: "restaurant", text: "Bryan's Bistro" },
  ]);
});

test("resolveContractParams: we_miss_you NAMED contract (business_name, not restaurant_name)", () => {
  // Meta template uses {{business_name}} where SeatPing's seed body uses
  // {{restaurant_name}}; the contract drives the names, both resolve correctly.
  const contract = {
    mode: "named" as const,
    names: ["first_name", "business_name", "restaurant"],
  };
  const t = tmpl({
    whatsappProviderTemplateName: "we_miss_you",
    body: "Hi {{first_name}}, we miss you at {{restaurant_name}}!",
  });
  const msg = buildMessage(t, {}, ctx, "WHATSAPP");
  assert.deepEqual(resolveContractParams(contract, msg.whatsappValues!), [
    { name: "first_name", text: "Sam" },
    { name: "business_name", text: "Bryan's Bistro" },
    { name: "restaurant", text: "Bryan's Bistro" },
  ]);
});

test("resolveContractParams: POSITIONAL contract emits bare text in index order", () => {
  const contract = { mode: "positional" as const, names: ["1", "2"] };
  const params = resolveContractParams(contract, { "1": "Sam", "2": "Bryan's Bistro" });
  assert.deepEqual(params, [{ text: "Sam" }, { text: "Bryan's Bistro" }]);
  assert.ok(params.every((p) => p.name === undefined));
});

test("EMAIL/SMS channels are unaffected (no whatsappParams)", () => {
  const t = tmpl({ body: "Hi {{first_name}}, thanks for visiting {{restaurant_name}}." });
  const email = buildMessage(t, {}, ctx, "EMAIL");
  assert.equal(email.whatsappParams, undefined);
  assert.ok(email.subject && email.html);
  const sms = buildMessage(t, {}, ctx, "SMS");
  assert.equal(sms.whatsappParams, undefined);
  assert.ok(sms.text.includes("Sam"));
});

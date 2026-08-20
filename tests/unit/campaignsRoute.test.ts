import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { signJwt } from "../../server/lib/auth.js";

const businessFindUnique = vi.fn();
const locationFindMany = vi.fn();
const locationFindFirst = vi.fn();
const templateFindMany = vi.fn();
const templateFindFirst = vi.fn();
const templateFindUnique = vi.fn();
const templateCreate = vi.fn();
const templateUpdate = vi.fn();
const campaignFindMany = vi.fn();
const campaignFindFirst = vi.fn();
const campaignFindUnique = vi.fn();
const campaignCreate = vi.fn();
const campaignUpdate = vi.fn();
const campaignUpdateMany = vi.fn();
const campaignDelete = vi.fn();
const savedAudienceFindFirst = vi.fn();
const runFindMany = vi.fn();
const runFindFirst = vi.fn();
const logFindMany = vi.fn();

const seedSeatPingTemplates = vi.fn();
const resolveAudienceGuests = vi.fn();
const generateUniqueTemplateSlug = vi.fn();
const reconcileCampaign = vi.fn();
const executeCampaignRun = vi.fn();
const rawCampaignSend = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      business: { findUnique: businessFindUnique },
      location: { findMany: locationFindMany, findFirst: locationFindFirst },
      campaignTemplate: {
        findMany: templateFindMany,
        findFirst: templateFindFirst,
        findUnique: templateFindUnique,
        create: templateCreate,
        update: templateUpdate,
      },
      campaign: {
        findMany: campaignFindMany,
        findFirst: campaignFindFirst,
        findUnique: campaignFindUnique,
        create: campaignCreate,
        update: campaignUpdate,
        updateMany: campaignUpdateMany,
        delete: campaignDelete,
      },
      savedAudience: { findFirst: savedAudienceFindFirst },
      campaignRun: { findMany: runFindMany, findFirst: runFindFirst },
      campaignDeliveryLog: { findMany: logFindMany },
    },
  };
});

vi.mock("../../server/lib/campaigns.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/campaigns.js");
  return {
    ...actual,
    seedSeatPingTemplates,
    resolveAudienceGuests,
    generateUniqueTemplateSlug,
  };
});

vi.mock("../../server/lib/campaignRunner.js", () => {
  return { reconcileCampaign, executeCampaignRun };
});

vi.mock("../../server/lib/notifications.js", () => {
  return { rawCampaignSend };
});

const campaignsRouter = (await import("../../server/routes/campaigns.js")).default;

const ORIGINAL_ENV = { ...process.env };
const LOC = "0123456789abcdef01234567";

function app() {
  const server = express();
  server.use(cookieParser());
  server.use(express.json());
  server.use("/api/campaigns", campaignsRouter);
  return supertest(server);
}

function cookie(businessId = "biz-1"): string {
  const token = signJwt({ sub: businessId, accountType: "business" });
  return `sp_auth_business=${token}`;
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: "tmpl-1",
    templateType: "SEATPING",
    name: "We Miss You",
    slug: "we_miss_you",
    purpose: null,
    body: "Hi {{first_name}}, come back to {{business_name}} soon.",
    offerDetails: null,
    ctaText: null,
    ctaUrl: null,
    variables: ["first_name", "business_name"],
    exampleValues: null,
    approvalStatus: "APPROVED",
    rejectionReason: null,
    isActive: true,
    locationId: null,
    submittedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    whatsappProviderTemplateName: "we_miss_you",
    whatsappLanguage: "en",
    ...overrides,
  };
}

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "camp-1",
    businessId: "biz-1",
    businessUsername: "bistro",
    locationId: LOC,
    name: "Winback",
    channel: "EMAIL",
    templateId: "tmpl-1",
    audienceType: "all_guests",
    audienceConfig: null,
    templateValues: null,
    status: "DRAFT",
    recipientCount: 0,
    excludedCount: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    sendMode: "NOW",
    timezone: null,
    scheduledAt: null,
    recurrenceFrequency: null,
    recurrenceStartAt: null,
    recurrenceEndAt: null,
    maxSendsPerGuestWindowDays: null,
    nextRunAt: null,
    lastRunAt: null,
    isPaused: false,
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function locationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LOC,
    name: "Bistro Downtown",
    displayName: "Downtown",
    address: "1 Test Street",
    restaurantProfile: {},
    ...overrides,
  };
}

beforeEach(() => {
  process.env.JWT_SECRET = "unit-test-jwt-secret";
  businessFindUnique.mockReset().mockResolvedValue({
    id: "biz-1",
    name: "Bistro",
    username: "bistro",
    email: "owner@test.invalid",
    phone: "+15550000000",
  });
  locationFindMany.mockReset().mockResolvedValue([locationRow()]);
  locationFindFirst.mockReset().mockResolvedValue(locationRow());
  templateFindMany.mockReset().mockResolvedValue([]);
  templateFindFirst.mockReset().mockResolvedValue(template());
  templateFindUnique.mockReset().mockResolvedValue(template());
  templateCreate.mockReset().mockImplementation(async ({ data }) => {
    return template(data);
  });
  templateUpdate.mockReset().mockImplementation(async ({ data }) => {
    return template(data);
  });
  campaignFindMany.mockReset().mockResolvedValue([]);
  campaignFindFirst.mockReset().mockResolvedValue(campaign());
  campaignFindUnique.mockReset().mockResolvedValue(campaign());
  campaignCreate.mockReset().mockImplementation(async ({ data }) => {
    return campaign(data);
  });
  campaignUpdate.mockReset().mockImplementation(async ({ data }) => {
    return campaign(data);
  });
  campaignUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  campaignDelete.mockReset().mockResolvedValue({});
  savedAudienceFindFirst.mockReset().mockResolvedValue({ id: "aud-1", name: "Regulars" });
  runFindMany.mockReset().mockResolvedValue([]);
  runFindFirst.mockReset().mockResolvedValue(null);
  logFindMany.mockReset().mockResolvedValue([]);
  seedSeatPingTemplates.mockReset().mockResolvedValue(undefined);
  resolveAudienceGuests.mockReset().mockResolvedValue([]);
  generateUniqueTemplateSlug.mockReset().mockResolvedValue("winback");
  reconcileCampaign.mockReset().mockImplementation(async (c: any) => c);
  executeCampaignRun
    .mockReset()
    .mockResolvedValue({ runId: "run-1", recipientCount: 1, excludedCount: 0 });
  rawCampaignSend.mockReset().mockResolvedValue("wamid-1");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("campaign metadata", () => {
  it("falls back to the location label when the business is gone", async () => {
    businessFindUnique.mockResolvedValue(null);

    const res = await app().get("/api/campaigns/meta").set("Cookie", cookie());

    expect(res.status).toBe(200);
    expect(res.body.locations[0].restaurantName).toBe("Downtown");
  });

  it("falls back through the location label fields", async () => {
    locationFindMany.mockResolvedValue([
      locationRow({ displayName: null }),
      locationRow({ displayName: null, name: null }),
      locationRow({ displayName: null, name: null, address: null }),
    ]);
    businessFindUnique.mockResolvedValue(null);

    const res = await app().get("/api/campaigns/meta").set("Cookie", cookie());

    expect(res.body.locations.map((l: any) => l.label)).toEqual([
      "Bistro Downtown",
      "1 Test Street",
      "Location",
    ]);
  });

  it("reports a server error", async () => {
    locationFindMany.mockRejectedValue(new Error("db down"));

    const res = await app().get("/api/campaigns/meta").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });
});

describe("template listing", () => {
  it("keeps going when the seed step fails", async () => {
    seedSeatPingTemplates.mockRejectedValue(new Error("seed down"));

    const res = await app().get("/api/campaigns/templates").set("Cookie", cookie());

    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
  });

  it("hides the rejection reason unless the template was rejected", async () => {
    templateFindMany.mockResolvedValue([
      template({ approvalStatus: "DRAFT", rejectionReason: "old reason" }),
      template({
        id: "t2",
        approvalStatus: "REJECTED",
        rejectionReason: "Too promotional",
      }),
    ]);

    const res = await app().get("/api/campaigns/templates").set("Cookie", cookie());

    expect(res.body.templates[0].rejectionReason).toBeNull();
    expect(res.body.templates[1].rejectionReason).toBe("Too promotional");
  });

  it("defaults the example values", async () => {
    templateFindMany.mockResolvedValue([template({ exampleValues: null })]);

    const res = await app().get("/api/campaigns/templates").set("Cookie", cookie());

    expect(res.body.templates[0].exampleValues).toEqual({});
  });

  it("marks a custom template unusable until it is approved", async () => {
    templateFindMany.mockResolvedValue([
      template({ templateType: "CUSTOM", approvalStatus: "DRAFT" }),
      template({ id: "t2", templateType: "SEATPING", isActive: false }),
    ]);

    const res = await app().get("/api/campaigns/templates").set("Cookie", cookie());

    expect(res.body.templates[0].usable).toBe(false);
    expect(res.body.templates[1].usable).toBe(false);
  });

  it("reports a server error on the list and the detail route", async () => {
    templateFindMany.mockRejectedValue(new Error("db down"));
    templateFindFirst.mockRejectedValue(new Error("db down"));

    const list = await app().get("/api/campaigns/templates").set("Cookie", cookie());
    const detail = await app().get("/api/campaigns/templates/tmpl-1").set("Cookie", cookie());

    expect(list.status).toBe(500);
    expect(detail.status).toBe(500);
  });
});

describe("template writes", () => {
  it("reports an unknown business", async () => {
    businessFindUnique.mockResolvedValue(null);

    const res = await app()
      .post("/api/campaigns/templates")
      .set("Cookie", cookie())
      .send({ name: "Winback", body: "Hi there friends." });

    expect(res.status).toBe(404);
  });

  it("accepts the alternate body field name", async () => {
    const res = await app()
      .post("/api/campaigns/templates")
      .set("Cookie", cookie())
      .send({ name: "Winback", mainMessage: "Hi there friends." });

    expect(res.status).toBe(200);
    expect(templateCreate.mock.calls[0][0].data.body).toBe("Hi there friends.");
  });

  it("truncates the long optional fields", async () => {
    await app()
      .post("/api/campaigns/templates")
      .set("Cookie", cookie())
      .send({
        name: "n".repeat(200),
        body: "b".repeat(5000),
        purpose: "p".repeat(500),
        ctaText: "c".repeat(200),
        ctaUrl: "u".repeat(700),
        offerDetails: "o".repeat(2000),
        exampleValues: { offer: "v".repeat(400) },
      });

    const data = templateCreate.mock.calls[0][0].data;
    expect(data.name).toHaveLength(120);
    expect(data.body).toHaveLength(4000);
    expect(data.purpose).toHaveLength(300);
    expect(data.ctaText).toHaveLength(120);
    expect(data.ctaUrl).toHaveLength(500);
    expect(data.offerDetails).toHaveLength(1000);
    expect(data.exampleValues.offer).toHaveLength(200);
  });

  it("drops blank and duplicate variables and caps the list", async () => {
    await app()
      .post("/api/campaigns/templates")
      .set("Cookie", cookie())
      .send({
        name: "Winback",
        body: "Hi there friends.",
        variables: [
          "firstName",
          "first_name",
          "  ",
          ...Array.from({ length: 30 }, (_, i) => `v${i}`),
        ],
      });

    const variables = templateCreate.mock.calls[0][0].data.variables;
    expect(variables).toHaveLength(20);
    expect(variables[0]).toBe("first_name");
    expect(variables.filter((v: string) => v === "first_name")).toHaveLength(1);
  });

  it("ignores example value keys that normalise to nothing", async () => {
    await app()
      .post("/api/campaigns/templates")
      .set("Cookie", cookie())
      .send({
        name: "Winback",
        body: "Hi there friends.",
        exampleValues: { "!!!": "x", offer: null },
      });

    const values = templateCreate.mock.calls[0][0].data.exampleValues;
    expect(values["!!!"]).toBeUndefined();
    expect(values.offer).toBe("");
  });

  it("reports a failed template write", async () => {
    templateCreate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/api/campaigns/templates")
      .set("Cookie", cookie())
      .send({ name: "Winback", body: "Hi there friends." });

    expect(res.status).toBe(500);
  });

  it("reports a failed template patch", async () => {
    templateUpdate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .patch("/api/campaigns/templates/tmpl-1")
      .set("Cookie", cookie())
      .send({ name: "Winback", body: "Hi there friends." });

    expect(res.status).toBe(500);
  });

  it("reports a failed template submit", async () => {
    templateFindFirst.mockResolvedValue(
      template({ templateType: "CUSTOM", approvalStatus: "DRAFT" }),
    );
    templateUpdate.mockRejectedValue(new Error("db down"));

    const res = await app().post("/api/campaigns/templates/tmpl-1/submit").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });

  it("keeps the slug of a template that is past draft", async () => {
    templateFindFirst.mockResolvedValue(
      template({ templateType: "CUSTOM", approvalStatus: "PENDING_SEATPING_REVIEW" }),
    );

    await app()
      .patch("/api/campaigns/templates/tmpl-1")
      .set("Cookie", cookie())
      .send({ name: "Renamed", body: "Hi there friends." });

    expect(generateUniqueTemplateSlug).not.toHaveBeenCalled();
    expect(templateUpdate.mock.calls[0][0].data.slug).toBeUndefined();
  });
});

describe("campaign listing", () => {
  it("reconciles only the campaigns that are in flight", async () => {
    campaignFindMany.mockResolvedValue([
      campaign({ id: "a", status: "SENDING" }),
      campaign({ id: "b", status: "DRAFT" }),
    ]);

    await app().get("/api/campaigns").set("Cookie", cookie());

    expect(reconcileCampaign).toHaveBeenCalledTimes(1);
  });

  it("labels each audience type", async () => {
    campaignFindMany.mockResolvedValue([
      campaign({ id: "a", audienceType: "manual" }),
      campaign({
        id: "b",
        audienceType: "custom_group",
        audienceConfig: { savedAudienceId: "aud-1" },
      }),
      campaign({ id: "c", audienceType: "custom_group", audienceConfig: {} }),
      campaign({ id: "d", audienceType: "all_guests" }),
      campaign({ id: "e", audienceType: "mystery" }),
    ]);

    const res = await app().get("/api/campaigns").set("Cookie", cookie());

    const labels = res.body.campaigns.map((c: any) => c.audienceLabel);
    expect(labels[0]).toBe("Manually Selected Guests");
    expect(labels[1]).toBe("Regulars");
    expect(labels[2]).toBe("Custom Group");
    expect(labels[3]).toEqual(expect.any(String));
    expect(labels[4]).toBe("mystery");
  });

  it("falls back when a saved audience is gone", async () => {
    savedAudienceFindFirst.mockResolvedValue(null);
    campaignFindMany.mockResolvedValue([
      campaign({
        audienceType: "custom_group",
        audienceConfig: { savedAudienceId: "aud-gone" },
      }),
    ]);

    const res = await app().get("/api/campaigns").set("Cookie", cookie());

    expect(res.body.campaigns[0].audienceLabel).toBe("Custom Group");
  });

  it("labels every campaign that shares a saved audience", async () => {
    campaignFindMany.mockResolvedValue([
      campaign({
        id: "a",
        audienceType: "custom_group",
        audienceConfig: { savedAudienceId: "aud-1" },
      }),
      campaign({
        id: "b",
        audienceType: "custom_group",
        audienceConfig: { savedAudienceId: "aud-1" },
      }),
    ]);

    const res = await app().get("/api/campaigns").set("Cookie", cookie());

    expect(res.body.campaigns.map((c: any) => c.audienceLabel)).toEqual(["Regulars", "Regulars"]);
  });

  it("defaults the campaign json fields", async () => {
    campaignFindMany.mockResolvedValue([campaign()]);

    const res = await app().get("/api/campaigns").set("Cookie", cookie());

    expect(res.body.campaigns[0].audienceConfig).toEqual({});
    expect(res.body.campaigns[0].templateValues).toEqual({});
    expect(res.body.campaigns[0].templateName).toBeNull();
  });

  it("reports a server error", async () => {
    campaignFindMany.mockRejectedValue(new Error("db down"));

    const res = await app().get("/api/campaigns").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });
});

describe("campaign detail and deletion", () => {
  it("reports a server error on the detail route", async () => {
    campaignFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app().get("/api/campaigns/camp-1").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });

  it("reports an unknown campaign on delete", async () => {
    campaignFindFirst.mockResolvedValue(null);

    const res = await app().delete("/api/campaigns/camp-1").set("Cookie", cookie());

    expect(res.status).toBe(404);
  });

  it("reports a failed delete", async () => {
    campaignDelete.mockRejectedValue(new Error("db down"));

    const res = await app().delete("/api/campaigns/camp-1").set("Cookie", cookie());

    expect(res.status).toBe(500);
  });

  it("reports a failed cancel, pause and resume", async () => {
    campaignUpdateMany.mockRejectedValue(new Error("db down"));
    campaignFindFirst.mockRejectedValue(new Error("db down"));

    const cancel = await app().post("/api/campaigns/camp-1/cancel").set("Cookie", cookie());
    const pause = await app().post("/api/campaigns/camp-1/pause").set("Cookie", cookie());
    const resume = await app().post("/api/campaigns/camp-1/resume").set("Cookie", cookie());

    expect(cancel.status).toBe(500);
    expect(pause.status).toBe(500);
    expect(resume.status).toBe(500);
  });

  it("returns nothing when the cancelled campaign cannot be re-read", async () => {
    campaignFindFirst.mockResolvedValue(null);

    const res = await app().post("/api/campaigns/camp-1/cancel").set("Cookie", cookie());

    expect(res.status).toBe(200);
    expect(res.body.campaign).toBeNull();
  });
});

describe("campaign creation and editing", () => {
  it("reports an unknown business", async () => {
    businessFindUnique.mockResolvedValue(null);

    const res = await app().post("/api/campaigns").set("Cookie", cookie()).send({
      name: "Winback",
      locationId: LOC,
      channel: "EMAIL",
      audienceType: "all_guests",
      templateId: "tmpl-1",
    });

    expect(res.status).toBe(404);
  });

  it("caps a manual audience at the guest limit", async () => {
    const guestIds = Array.from({ length: 1200 }, (_, i) => `g${i}`);

    await app().post("/api/campaigns").set("Cookie", cookie()).send({
      name: "Winback",
      locationId: LOC,
      channel: "email",
      audienceType: "manual",
      audienceConfig: { guestIds },
      templateId: "tmpl-1",
    });

    expect(campaignCreate.mock.calls[0][0].data.audienceConfig.guestIds).toHaveLength(1000);
  });

  it("stores only the variables a business may edit", async () => {
    templateFindFirst.mockResolvedValue(template({ variables: ["first_name", "offer"] }));

    await app()
      .post("/api/campaigns")
      .set("Cookie", cookie())
      .send({
        name: "Winback",
        locationId: LOC,
        channel: "EMAIL",
        audienceType: "all_guests",
        templateId: "tmpl-1",
        templateValues: { offer: "20% off", first_name: "ignored", other: "x" },
      });

    const values = campaignCreate.mock.calls[0][0].data.templateValues;
    expect(values).toEqual({ offer: "20% off" });
  });

  it("ignores a template values payload that is not an object", async () => {
    await app().post("/api/campaigns").set("Cookie", cookie()).send({
      name: "Winback",
      locationId: LOC,
      channel: "EMAIL",
      audienceType: "all_guests",
      templateId: "tmpl-1",
      templateValues: "nope",
    });

    expect(campaignCreate.mock.calls[0][0].data.templateValues).toEqual({});
  });

  it("truncates a very long template value", async () => {
    templateFindFirst.mockResolvedValue(template({ variables: ["offer"] }));

    await app()
      .post("/api/campaigns")
      .set("Cookie", cookie())
      .send({
        name: "Winback",
        locationId: LOC,
        channel: "EMAIL",
        audienceType: "all_guests",
        templateId: "tmpl-1",
        templateValues: { offer: "x".repeat(700) },
      });

    expect(campaignCreate.mock.calls[0][0].data.templateValues.offer).toHaveLength(500);
  });

  it("reports a failed create and patch", async () => {
    campaignCreate.mockRejectedValue(new Error("db down"));
    campaignUpdate.mockRejectedValue(new Error("db down"));

    const create = await app().post("/api/campaigns").set("Cookie", cookie()).send({
      name: "Winback",
      locationId: LOC,
      channel: "EMAIL",
      audienceType: "all_guests",
      templateId: "tmpl-1",
    });
    const patch = await app()
      .patch("/api/campaigns/camp-1")
      .set("Cookie", cookie())
      .send({ name: "Renamed" });

    expect(create.status).toBe(500);
    expect(patch.status).toBe(500);
  });
});

describe("test sends", () => {
  it("reports an unknown business behind the campaign", async () => {
    businessFindUnique.mockResolvedValue(null);

    const res = await app()
      .post("/api/campaigns/camp-1/send-test")
      .set("Cookie", cookie())
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Business not found");
  });

  it("reports a missing location behind the campaign", async () => {
    locationFindFirst.mockResolvedValue(null);

    const res = await app()
      .post("/api/campaigns/camp-1/send-test")
      .set("Cookie", cookie())
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Location not found");
  });

  it("falls back to a greeting when the business has no name", async () => {
    businessFindUnique.mockResolvedValue({
      id: "biz-1",
      name: null,
      username: "bistro",
      email: "owner@test.invalid",
      phone: "+15550000000",
    });

    const res = await app()
      .post("/api/campaigns/camp-1/send-test")
      .set("Cookie", cookie())
      .send({});

    expect(res.status).toBe(200);
    expect(rawCampaignSend).toHaveBeenCalled();
  });

  it("reports a server error while preparing the test", async () => {
    campaignFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/api/campaigns/camp-1/send-test")
      .set("Cookie", cookie())
      .send({});

    expect(res.status).toBe(500);
  });

  it("falls back to a generic message when the provider gives none", async () => {
    rawCampaignSend.mockRejectedValue({});

    const res = await app()
      .post("/api/campaigns/camp-1/send-test")
      .set("Cookie", cookie())
      .send({});

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Test send failed");
  });
});

describe("sending", () => {
  it("hides the diagnostics route in production", async () => {
    process.env.NODE_ENV = "production";

    const res = await app()
      .post("/api/campaigns/debug/email-test")
      .set("Cookie", cookie())
      .send({ emails: ["a@test.invalid"] });

    expect(res.status).toBe(404);
  });

  it("returns the campaign to draft when the run reports an error", async () => {
    executeCampaignRun.mockResolvedValue({ error: "Template not found" });

    const res = await app().post("/api/campaigns/camp-1/send").set("Cookie", cookie()).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Template not found");
  });

  it("reports a server error while sending", async () => {
    executeCampaignRun.mockRejectedValue(new Error("runner down"));

    const res = await app().post("/api/campaigns/camp-1/send").set("Cookie", cookie()).send({});

    expect(res.status).toBe(500);
  });

  it("returns nothing when the sent campaign cannot be re-read", async () => {
    campaignFindUnique.mockResolvedValue(null);

    const res = await app().post("/api/campaigns/camp-1/send").set("Cookie", cookie()).send({});

    expect(res.status).toBe(200);
    expect(res.body.campaign).toBeNull();
  });

  it("rejects an unrecognised recurrence frequency", async () => {
    const res = await app()
      .post("/api/campaigns/camp-1/send")
      .set("Cookie", cookie())
      .send({ sendMode: "RECURRING", recurrence: { frequency: "HOURLY" } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("recurrence frequency");
  });
});

describe("message preview", () => {
  it("reports an unknown business", async () => {
    businessFindUnique.mockResolvedValue(null);

    const res = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({ channel: "EMAIL", templateId: "tmpl-1" });

    expect(res.status).toBe(404);
  });

  it("rejects an unsupported channel", async () => {
    const res = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({ channel: "PIGEON", templateId: "tmpl-1" });

    expect(res.status).toBe(400);
  });

  it("reports an unknown template", async () => {
    templateFindFirst.mockResolvedValue(null);

    const res = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({ channel: "EMAIL", templateId: "tmpl-gone" });

    expect(res.status).toBe(404);
  });

  it("uses a generic location label when none is chosen", async () => {
    const res = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({ channel: "EMAIL", templateId: "tmpl-1" });

    expect(res.status).toBe(200);
    expect(res.body.text).toEqual(expect.any(String));
    expect(res.body.smsSegments).toBeNull();
    expect(res.body.whatsappReady).toBeNull();
  });

  it("ignores a location the business does not own", async () => {
    locationFindFirst.mockResolvedValue(null);

    const res = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({ channel: "EMAIL", templateId: "tmpl-1", locationId: LOC });

    expect(res.status).toBe(200);
  });

  it("reports the sms segment count and the whatsapp readiness", async () => {
    const sms = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({ channel: "SMS", templateId: "tmpl-1" });
    expect(sms.body.smsSegments).toEqual(expect.any(Number));

    const wa = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({ channel: "WHATSAPP", templateId: "tmpl-1" });
    expect(wa.body.whatsappReady).toBe(true);

    templateFindFirst.mockResolvedValue(template({ whatsappProviderTemplateName: null }));
    const notReady = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({ channel: "WHATSAPP", templateId: "tmpl-1" });
    expect(notReady.body.whatsappReady).toBe(false);
  });

  it("overlays only the values a business may edit", async () => {
    templateFindFirst.mockResolvedValue(
      template({
        variables: ["first_name", "offer"],
        exampleValues: { offer: "example" },
        body: "Hi {{first_name}}, enjoy {{offer}} on us today.",
      }),
    );

    const res = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({
        channel: "EMAIL",
        templateId: "tmpl-1",
        templateValues: { offer: "20% off", first_name: "ignored" },
      });

    expect(res.body.text).toContain("20% off");
    expect(res.body.text).not.toContain("ignored");
  });

  it("keeps the example value when the override is blank", async () => {
    templateFindFirst.mockResolvedValue(
      template({
        variables: ["offer"],
        exampleValues: { offer: "example offer" },
        body: "Enjoy {{offer}} on us today.",
      }),
    );

    const res = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({
        channel: "EMAIL",
        templateId: "tmpl-1",
        templateValues: { offer: "" },
      });

    expect(res.body.text).toContain("example offer");
  });

  it("reports a server error", async () => {
    businessFindUnique.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post("/api/campaigns/preview-message")
      .set("Cookie", cookie())
      .send({ channel: "EMAIL", templateId: "tmpl-1" });

    expect(res.status).toBe(500);
  });
});

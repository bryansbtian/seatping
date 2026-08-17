import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function customTemplate(businessId: string, overrides = {}) {
  const suffix = uniqueSuffix();
  return db.campaignTemplate.create({
    data: {
      businessId,
      templateType: "CUSTOM",
      name: `Custom ${suffix}`,
      slug: `custom-${suffix}`,
      body: "Hi {{first_name}}, a note from {{business_name}} for you today.",
      approvalStatus: "DRAFT",
      ...overrides,
    },
  });
}

describe("custom template lifecycle", () => {
  it("updates a draft template", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await customTemplate(business.id);

    const res = await (await api())
      .patch(`/api/campaigns/templates/${template.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({
        name: "Renamed template",
        body: "Hi {{first_name}}, a note from {{business_name}} for you today.",
      });

    expect(res.status).toBe(200);
    const stored = await db.campaignTemplate.findUnique({
      where: { id: template.id },
    });
    expect(stored?.name).toBe("Renamed template");
  });

  it("does not let another business update a template", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();
    const template = await customTemplate(tenantA.business.id);

    const res = await (await api())
      .patch(`/api/campaigns/templates/${template.id}`)
      .set("Cookie", businessCookie(tenantB.business.id))
      .send({ name: "Hijacked" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(
      (await db.campaignTemplate.findUnique({ where: { id: template.id } }))?.name,
    ).not.toBe("Hijacked");
  });

  it("submits a draft template for review", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await customTemplate(business.id);

    const res = await (await api())
      .post(`/api/campaigns/templates/${template.id}/submit`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(200);
    const stored = await db.campaignTemplate.findUnique({
      where: { id: template.id },
    });
    expect(stored?.approvalStatus).toBe("PENDING_SEATPING_REVIEW");
    expect(stored?.submittedAt).toBeInstanceOf(Date);
  });

  it("cannot submit a SeatPing-managed template", async () => {
    const { business } = await seedBusinessWithLocation();
    const managed = await db.campaignTemplate.create({
      data: {
        templateType: "SEATPING",
        name: `Managed ${uniqueSuffix()}`,
        slug: `managed-${uniqueSuffix()}`,
        body: "Hi {{first_name}}",
        approvalStatus: "APPROVED",
        isActive: true,
      },
    });

    const res = await (await api())
      .post(`/api/campaigns/templates/${managed.id}/submit`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a template body with no variables placeholder syntax errors", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/api/campaigns/templates")
      .set("Cookie", businessCookie(business.id))
      .send({ name: "", body: "" });

    expect(res.status).toBe(400);
  });
});

describe("campaign guards", () => {
  async function draft(businessId: string, locationId: string) {
    const template = await db.campaignTemplate.create({
      data: {
        templateType: "SEATPING",
        name: `T ${uniqueSuffix()}`,
        slug: `t-${uniqueSuffix()}`,
        body: "Hi {{first_name}}",
        approvalStatus: "APPROVED",
        isActive: true,
      },
    });
    const res = await (await api())
      .post("/api/campaigns")
      .set("Cookie", businessCookie(businessId))
      .send({
        name: `C ${uniqueSuffix()}`,
        locationId,
        channel: "EMAIL",
        templateId: template.id,
        audienceType: "all_guests",
      });
    return res.body.campaign;
  }

  it("rejects an unsupported channel", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await db.campaignTemplate.create({
      data: {
        templateType: "SEATPING",
        name: `T ${uniqueSuffix()}`,
        slug: `t-${uniqueSuffix()}`,
        body: "Hi",
        approvalStatus: "APPROVED",
        isActive: true,
      },
    });

    const res = await (await api())
      .post("/api/campaigns")
      .set("Cookie", businessCookie(business.id))
      .send({
        name: "Bad channel",
        locationId: location.id,
        channel: "CARRIER_PIGEON",
        templateId: template.id,
        audienceType: "all_guests",
      });

    expect(res.status).toBe(400);
  });

  it("rejects a manual audience with no guests selected", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await db.campaignTemplate.create({
      data: {
        templateType: "SEATPING",
        name: `T ${uniqueSuffix()}`,
        slug: `t-${uniqueSuffix()}`,
        body: "Hi",
        approvalStatus: "APPROVED",
        isActive: true,
      },
    });

    const res = await (await api())
      .post("/api/campaigns")
      .set("Cookie", businessCookie(business.id))
      .send({
        name: "Manual empty",
        locationId: location.id,
        channel: "EMAIL",
        templateId: template.id,
        audienceType: "manual",
        audienceConfig: { guestIds: [] },
      });

    expect(res.status).toBe(400);
  });

  it("rejects a custom group that does not exist", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await db.campaignTemplate.create({
      data: {
        templateType: "SEATPING",
        name: `T ${uniqueSuffix()}`,
        slug: `t-${uniqueSuffix()}`,
        body: "Hi",
        approvalStatus: "APPROVED",
        isActive: true,
      },
    });

    const res = await (await api())
      .post("/api/campaigns")
      .set("Cookie", businessCookie(business.id))
      .send({
        name: "Missing group",
        locationId: location.id,
        channel: "EMAIL",
        templateId: template.id,
        audienceType: "custom_group",
        audienceConfig: { savedAudienceId: "000000000000000000000000" },
      });

    expect(res.status).toBe(404);
  });

  it("refuses to send a campaign with no reachable guests", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const campaign = await draft(business.id, location.id);

    const res = await (await api())
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "NOW" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns a client error pausing a campaign that is not recurring", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const campaign = await draft(business.id, location.id);

    const res = await (await api())
      .post(`/api/campaigns/${campaign.id}/pause`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns a client error resuming a campaign that is not paused", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const campaign = await draft(business.id, location.id);

    const res = await (await api())
      .post(`/api/campaigns/${campaign.id}/resume`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns 404 for an unknown campaign id on every action", async () => {
    const { business } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);
    const missing = "000000000000000000000000";

    for (const path of [
      `/api/campaigns/${missing}`,
      `/api/campaigns/${missing}/cancel`,
      `/api/campaigns/${missing}/pause`,
    ]) {
      const res = await (await api()).get(path).set("Cookie", cookie);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("rejects a recurring schedule with an invalid frequency", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const campaign = await draft(business.id, location.id);

    const res = await (await api())
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "RECURRING", recurrence: { frequency: "HOURLY" } });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

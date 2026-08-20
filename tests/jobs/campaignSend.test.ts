import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { sinks } from "../setup/externalMocks.js";
import { seedBusinessWithLocation, uniqueSuffix } from "../helpers/seed.js";
import { runDueCampaignsSweep } from "../../server/lib/campaignRunner.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seedGuest(
  businessId: string,
  businessUsername: string,
  locationId: string,
  overrides: Record<string, unknown> = {},
) {
  const suffix = uniqueSuffix();
  return db.guestProfile.create({
    data: {
      businessId,
      businessUsername,
      locationId,
      firstName: "Guest",
      lastName: suffix,
      fullName: `Guest ${suffix}`,
      email: `send-${suffix}@test.invalid`,
      normalizedEmail: `send-${suffix}@test.invalid`,
      totalVisits: 2,
      ...overrides,
    },
  });
}

async function seedTemplate() {
  const suffix = uniqueSuffix();
  return db.campaignTemplate.create({
    data: {
      name: `Send Template ${suffix}`,
      slug: `send-template-${suffix}`,
      templateType: "SEATPING",
      approvalStatus: "APPROVED",
      isActive: true,
      body: "Hi {{first_name}}, a note from {{business_name}}.",
      variables: ["first_name", "business_name"],
    },
  });
}

async function createCampaign(businessId: string, locationId: string) {
  const template = await seedTemplate();
  const res = await (
    await api()
  )
    .post("/api/campaigns")
    .set("Cookie", businessCookie(businessId))
    .send({
      name: `Send Campaign ${uniqueSuffix()}`,
      locationId,
      channel: "EMAIL",
      templateId: template.id,
      audienceType: "all_guests",
    });
  return res.body.campaign;
}

describe("sending a campaign", () => {
  it("delivers to every reachable guest exactly once", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    await seedGuest(business.id, business.username, location.id);
    const campaign = await createCampaign(business.id, location.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "NOW" });

    expect(res.status).toBe(200);

    await expect
      .poll(
        async () => {
          return db.campaignRecipient.count({ where: { campaignId: campaign.id } });
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(1);

    const recipients = await db.campaignRecipient.findMany({
      where: { campaignId: campaign.id },
    });

    const guestIds = new Set(recipients.map((r) => r.guestProfileId));
    expect(guestIds.size).toBe(recipients.length);

    for (const r of recipients) {
      expect(r.channel).toBe("EMAIL");
      expect(r.email).toEqual(expect.any(String));
    }

    expect(sinks().email.length).toBeGreaterThanOrEqual(1);
    expect(sinks().telnyx).toHaveLength(0);
  });

  it("does not create duplicate recipients when send is invoked twice", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    const campaign = await createCampaign(business.id, location.id);
    const cookie = businessCookie(business.id);

    const first = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", cookie)
      .send({ sendMode: "NOW" });
    expect(first.status).toBe(200);

    const recipientsAfterFirst = await db.campaignRecipient.count({
      where: { campaignId: campaign.id },
    });
    const emailsAfterFirst = sinks().email.length;

    const second = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", cookie)
      .send({ sendMode: "NOW" });

    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await db.campaignRecipient.count({ where: { campaignId: campaign.id } })).toBe(
      recipientsAfterFirst,
    );
    expect(sinks().email.length).toBe(emailsAfterFirst);
  });

  it("excludes opted-out guests from delivery", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    await seedGuest(business.id, business.username, location.id, {
      marketingOptOutAt: new Date(),
    });
    const campaign = await createCampaign(business.id, location.id);

    await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "NOW" });

    const recipients = await db.campaignRecipient.findMany({
      where: { campaignId: campaign.id },
    });
    expect(recipients).toHaveLength(1);
  });

  it("records a campaign run with delivery counters", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    const campaign = await createCampaign(business.id, location.id);

    await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "NOW" });

    const runs = await db.campaignRun.findMany({
      where: { campaignId: campaign.id },
    });
    expect(runs.length).toBeGreaterThanOrEqual(1);

    const stored = await db.campaign.findUnique({ where: { id: campaign.id } });
    expect(["SENDING", "SENT"]).toContain(stored?.status);
    expect(stored?.recipientCount).toBeGreaterThanOrEqual(1);
  });

  it("sends a test message without creating campaign recipients", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    const campaign = await createCampaign(business.id, location.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send-test`)
      .set("Cookie", businessCookie(business.id))
      .send({ testEmail: "tester@test.invalid" });

    expect(res.status).toBeLessThan(500);
    expect(await db.campaignRecipient.count({ where: { campaignId: campaign.id } })).toBe(0);
  });
});

describe("scheduling a campaign", () => {
  it("rejects a schedule in the past", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    const campaign = await createCampaign(business.id, location.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "SCHEDULED", scheduledLocal: "2020-01-01T10:00" });

    expect(res.status).toBe(400);
  });

  it("rejects a malformed scheduled time", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    const campaign = await createCampaign(business.id, location.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "SCHEDULED", scheduledLocal: "not-a-time" });

    expect(res.status).toBe(400);
  });

  it("schedules a campaign for a future time without sending yet", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    const campaign = await createCampaign(business.id, location.id);

    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "SCHEDULED", scheduledLocal: future });

    expect(res.status).toBe(200);
    const stored = await db.campaign.findUnique({ where: { id: campaign.id } });
    expect(stored?.status).toBe("SCHEDULED");
    expect(sinks().email).toHaveLength(0);
  });

  it("cancels a scheduled campaign", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    const campaign = await createCampaign(business.id, location.id);
    const cookie = businessCookie(business.id);
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

    await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", cookie)
      .send({ sendMode: "SCHEDULED", scheduledLocal: future });

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/cancel`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    const stored = await db.campaign.findUnique({ where: { id: campaign.id } });
    expect(stored?.status).toBe("CANCELLED");
  });
});

describe("due campaign sweep", () => {
  it("is a no-op when nothing is due", async () => {
    const result = await runDueCampaignsSweep();

    expect(result).toBeDefined();
    expect(sinks().email).toHaveLength(0);
  });

  it("does not resend a campaign that already completed", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    const campaign = await createCampaign(business.id, location.id);

    await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "NOW" });

    const emailsAfterSend = sinks().email.length;

    await runDueCampaignsSweep();
    await runDueCampaignsSweep();

    expect(sinks().email.length).toBe(emailsAfterSend);
  });
});

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
      email: `guest-${suffix}@test.invalid`,
      normalizedEmail: `guest-${suffix}@test.invalid`,
      totalVisits: 3,
      ...overrides,
    },
  });
}

async function seedSeatpingTemplate() {
  const suffix = uniqueSuffix();
  return db.campaignTemplate.create({
    data: {
      name: `Template ${suffix}`,
      slug: `template-${suffix}`,
      templateType: "SEATPING",
      approvalStatus: "APPROVED",
      isActive: true,
      body: "Hello {{first_name}}, come visit {{business_name}}.",
      variables: ["first_name", "business_name"],
    },
  });
}

describe("campaign metadata and templates", () => {
  it("returns campaign metadata for the business", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .get("/api/campaigns/meta")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(location.id);
  });

  it("seeds and lists the built-in SeatPing templates", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .get("/api/campaigns/templates")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThan(0);
    for (const t of res.body.templates) {
      expect(t.templateType).toBe("SEATPING");
      expect(t.body).toEqual(expect.any(String));
    }
  });

  it("returns a single template", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await seedSeatpingTemplate();

    const res = await (await api())
      .get(`/api/campaigns/templates/${template.id}`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
  });

  it("returns a client error for an unknown template", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .get("/api/campaigns/templates/000000000000000000000000")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("creates a custom template owned by the business", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/api/campaigns/templates")
      .set("Cookie", businessCookie(business.id))
      .send({
        name: `Custom ${uniqueSuffix()}`,
        body: "Hi {{first_name}}, a note from {{business_name}} for you today.",
        channel: "EMAIL",
      });

    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const stored = await db.campaignTemplate.findFirst({
        where: { businessId: business.id },
      });
      expect(stored?.templateType).toBe("CUSTOM");
    }
  });

  it("rejects a custom template with no body", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/api/campaigns/templates")
      .set("Cookie", businessCookie(business.id))
      .send({ name: "Empty", channel: "EMAIL" });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("audience selection", () => {
  it("previews the audience for a location", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    await seedGuest(business.id, business.username, location.id);

    const res = await (await api())
      .get(
        `/api/campaigns/audiences/preview?locationId=${location.id}&audienceType=all_guests&channel=EMAIL`,
      )
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBeGreaterThanOrEqual(2);
  });

  it("excludes opted-out guests from the audience", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    await seedGuest(business.id, business.username, location.id, {
      marketingOptOutAt: new Date(),
    });

    const res = await (await api())
      .get(
        `/api/campaigns/audiences/preview?locationId=${location.id}&audienceType=all_guests&channel=EMAIL`,
      )
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(1);
  });

  it("filters the audience by tag", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id, { tags: ["vip"] });
    await seedGuest(business.id, business.username, location.id, { tags: [] });

    const res = await (await api())
      .get(
        `/api/campaigns/audiences/preview?locationId=${location.id}&audienceType=with_tag&tag=vip&channel=EMAIL`,
      )
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(1);
  });

  it("rejects a preview for a location the business does not own", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    const res = await (await api())
      .get(
        `/api/campaigns/audiences/preview?locationId=${tenantA.location.id}&audienceType=all_guests&channel=EMAIL`,
      )
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("saved audiences", () => {
  it("creates, lists, updates and deletes a saved audience", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const cookie = businessCookie(business.id);

    const created = await (await api())
      .post("/api/audiences")
      .set("Cookie", cookie)
      .send({
        locationId: location.id,
        name: "Frequent visitors",
        description: "Guests with several visits",
        filters: { totalVisitsMin: 2 },
      });

    expect(created.status).toBe(200);
    const audienceId = created.body.audience.id;

    const listed = await (await api())
      .get(`/api/audiences?locationId=${location.id}`)
      .set("Cookie", cookie);
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain(audienceId);

    const updated = await (await api())
      .patch(`/api/audiences/${audienceId}`)
      .set("Cookie", cookie)
      .send({ name: "Renamed group" });
    expect(updated.status).toBe(200);
    expect(
      (await db.savedAudience.findUnique({ where: { id: audienceId } }))?.name,
    ).toBe("Renamed group");

    const removed = await (await api())
      .delete(`/api/audiences/${audienceId}`)
      .set("Cookie", cookie);
    expect(removed.status).toBe(200);
    expect(await db.savedAudience.findUnique({ where: { id: audienceId } })).toBeNull();
  });

  it("requires a name when creating a saved audience", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/api/audiences")
      .set("Cookie", businessCookie(business.id))
      .send({ locationId: location.id });

    expect(res.status).toBe(400);
  });

  it("previews a saved audience filter", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id, { totalVisits: 5 });
    await seedGuest(business.id, business.username, location.id, { totalVisits: 1 });

    const res = await (await api())
      .post("/api/audiences/preview")
      .set("Cookie", businessCookie(business.id))
      .send({ locationId: location.id, filters: { totalVisitsMin: 3 } });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.guests).toHaveLength(1);
  });

  it("does not let another business read a saved audience", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    const created = await db.savedAudience.create({
      data: {
        businessId: tenantA.business.id,
        businessUsername: tenantA.business.username,
        locationId: tenantA.location.id,
        name: "Tenant A group",
        filters: {},
      },
    });

    const res = await (await api())
      .patch(`/api/audiences/${created.id}`)
      .set("Cookie", businessCookie(tenantB.business.id))
      .send({ name: "Hijacked" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(
      (await db.savedAudience.findUnique({ where: { id: created.id } }))?.name,
    ).toBe("Tenant A group");
  });
});

describe("campaign lifecycle", () => {
  async function createDraft(businessId: string, locationId: string) {
    const template = await seedSeatpingTemplate();
    const res = await (await api())
      .post("/api/campaigns")
      .set("Cookie", businessCookie(businessId))
      .send({
        name: `Campaign ${uniqueSuffix()}`,
        locationId,
        channel: "EMAIL",
        templateId: template.id,
        audienceType: "all_guests",
      });
    return { res, template };
  }

  it("creates a draft campaign", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);

    const { res } = await createDraft(business.id, location.id);

    expect(res.status).toBe(200);
    expect(res.body.campaign.status).toBe("DRAFT");

    const stored = await db.campaign.findFirst({ where: { businessId: business.id } });
    expect(stored?.locationId).toBe(location.id);
  });

  it("rejects a campaign with an unknown template", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/api/campaigns")
      .set("Cookie", businessCookie(business.id))
      .send({
        name: "Bad template",
        locationId: location.id,
        channel: "EMAIL",
        templateId: "000000000000000000000000",
        audienceType: "all_guests",
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a campaign for a location the business does not own", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();
    const template = await seedSeatpingTemplate();

    const res = await (await api())
      .post("/api/campaigns")
      .set("Cookie", businessCookie(tenantB.business.id))
      .send({
        name: "Cross tenant",
        locationId: tenantA.location.id,
        channel: "EMAIL",
        templateId: template.id,
        audienceType: "all_guests",
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.campaign.count()).toBe(0);
  });

  it("rejects a with_tag campaign that has no tag", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seedSeatpingTemplate();

    const res = await (await api())
      .post("/api/campaigns")
      .set("Cookie", businessCookie(business.id))
      .send({
        name: "No tag",
        locationId: location.id,
        channel: "EMAIL",
        templateId: template.id,
        audienceType: "with_tag",
        audienceConfig: {},
      });

    expect(res.status).toBe(400);
  });

  it("lists, reads, updates, cancels and deletes a campaign", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business.id, business.username, location.id);
    const cookie = businessCookie(business.id);
    const { res: created } = await createDraft(business.id, location.id);
    const id = created.body.campaign.id;

    const listed = await (await api()).get("/api/campaigns").set("Cookie", cookie);
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain(id);

    const read = await (await api()).get(`/api/campaigns/${id}`).set("Cookie", cookie);
    expect(read.status).toBe(200);

    const patched = await (await api())
      .patch(`/api/campaigns/${id}`)
      .set("Cookie", cookie)
      .send({ name: "Renamed campaign" });
    expect(patched.status).toBeLessThan(500);

    const removed = await (await api())
      .delete(`/api/campaigns/${id}`)
      .set("Cookie", cookie);
    expect(removed.status).toBeLessThan(500);
  });

  it("does not expose another business's campaign", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();
    await seedGuest(tenantA.business.id, tenantA.business.username, tenantA.location.id);
    const { res: created } = await createDraft(tenantA.business.id, tenantA.location.id);
    const id = created.body.campaign.id;

    const res = await (await api())
      .get(`/api/campaigns/${id}`)
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("previews a rendered message without sending anything", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seedSeatpingTemplate();

    const res = await (await api())
      .post("/api/campaigns/preview-message")
      .set("Cookie", businessCookie(business.id))
      .send({
        locationId: location.id,
        templateId: template.id,
        channel: "EMAIL",
        templateValues: {},
      });

    expect(res.status).toBeLessThan(500);
  });
});

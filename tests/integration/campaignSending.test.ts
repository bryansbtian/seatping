import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Business, Location } from "@prisma/client";
import { api } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { seedBusinessWithLocation, uniqueSuffix } from "../helpers/seed.js";
import { sinks } from "../setup/externalMocks.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function seatpingTemplate(overrides: Record<string, unknown> = {}) {
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
      whatsappProviderTemplateName: `template_${suffix.replace(/-/g, "_")}`,
      ...overrides,
    },
  });
}

async function seedGuest(
  business: Business,
  location: Location,
  overrides: Record<string, unknown> = {},
) {
  const suffix = uniqueSuffix();
  return db.guestProfile.create({
    data: {
      businessId: business.id,
      businessUsername: business.username,
      locationId: location.id,
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

async function seedCampaign(
  business: Business,
  location: Location,
  templateId: string,
  overrides: Record<string, unknown> = {},
) {
  return db.campaign.create({
    data: {
      businessId: business.id,
      businessUsername: business.username,
      locationId: location.id,
      name: `Campaign ${uniqueSuffix()}`,
      channel: "EMAIL",
      templateId,
      audienceType: "all_guests",
      audienceConfig: {},
      status: "DRAFT",
      ...overrides,
    },
  });
}

function wallClock(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = String(d.getUTCHours()).padStart(2, "0");
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

async function utcLocation() {
  const seeded = await seedBusinessWithLocation({
    restaurantProfile: {
      openingHours: { timezone: "UTC" },
      details: {},
      isPublished: true,
    } as never,
  });
  return seeded;
}

describe("campaign test sends", () => {
  it("sends an email test to the business address", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send-test`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sinks().email).toHaveLength(1);
    expect(sinks().email[0].to).toBe(business.email);
  });

  it("sends an email test to an override address", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send-test`)
      .set("Cookie", businessCookie(business.id))
      .send({ testEmail: "  owner@test.invalid  " });

    expect(res.status).toBe(200);
    expect(sinks().email[0].to).toBe("owner@test.invalid");
  });

  it("reports a provider failure as a bad gateway", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id, {
      channel: "WHATSAPP",
    });

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send-test`)
      .set("Cookie", businessCookie(business.id))
      .send({ testPhone: "+62 812-3456-7890" });

    expect(res.status).toBe(502);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it("refuses a phone test when there is no number to use", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await db.business.update({
      where: { id: business.id },
      data: { phone: "" },
    });
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id, {
      channel: "SMS",
    });

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send-test`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No phone number to send the test to");
  });

  it("refuses a test for a template still awaiting review", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await db.campaignTemplate.create({
      data: {
        businessId: business.id,
        templateType: "CUSTOM",
        name: `Pending ${uniqueSuffix()}`,
        slug: `pending-${uniqueSuffix()}`,
        body: "Hi {{first_name}}.",
        approvalStatus: "PENDING_SEATPING_REVIEW",
      },
    });
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send-test`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("pending SeatPing review");
  });

  it("refuses a test for a rejected template", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await db.campaignTemplate.create({
      data: {
        businessId: business.id,
        templateType: "CUSTOM",
        name: `Rejected ${uniqueSuffix()}`,
        slug: `rejected-${uniqueSuffix()}`,
        body: "Hi {{first_name}}.",
        approvalStatus: "REJECTED",
      },
    });
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send-test`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("rejected");
  });

  it("refuses a test when the template is gone", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);
    await db.campaignTemplate.delete({ where: { id: template.id } });

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send-test`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Template not found");
  });

  it("reports an unknown campaign", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/api/campaigns/000000000000000000000000/send-test")
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(404);
  });
});

describe("email delivery diagnostics", () => {
  it("requires at least one address", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/api/campaigns/debug/email-test")
      .set("Cookie", businessCookie(business.id))
      .send({ emails: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Provide emails: string[]");
  });

  it("reports a per-address delivery result", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .post("/api/campaigns/debug/email-test")
      .set("Cookie", businessCookie(business.id))
      .send({
        emails: ["one@test.invalid", "two@test.invalid"],
        subject: "Delivery Check",
        body: "Testing delivery.",
      });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].email).toBe("one@test.invalid");
    expect(res.body.results[0].ok).toBe(true);
    expect(sinks().email).toHaveLength(2);
    expect(sinks().email[0].subject).toBe("Delivery Check");
  });

  it("caps the address list at ten", async () => {
    const { business } = await seedBusinessWithLocation();
    const emails = Array.from({ length: 15 }, (_, i) => {
      return `bulk-${i}@test.invalid`;
    });

    const res = await (
      await api()
    )
      .post("/api/campaigns/debug/email-test")
      .set("Cookie", businessCookie(business.id))
      .send({ emails });

    expect(res.body.results).toHaveLength(10);
  });
});

describe("sending a campaign now", () => {
  it("queues a message per eligible guest and reports the counts", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business, location);
    await seedGuest(business, location);
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "NOW" });

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(2);
    expect(res.body.campaign.status).toBe("SENDING");
    const recipients = await db.campaignRecipient.count({
      where: { campaignId: campaign.id },
    });
    expect(recipients).toBe(2);
  });

  it("returns the campaign to draft when nobody is reachable", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business, location, { email: null, normalizedEmail: null });
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No eligible recipients for this campaign.");
    const stored = await db.campaign.findUnique({ where: { id: campaign.id } });
    expect(stored?.status).toBe("DRAFT");
    expect(stored?.sentAt).toBeNull();
  });

  it("refuses to send the same campaign twice", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business, location);
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);
    const cookie = businessCookie(business.id);
    await (await api()).post(`/api/campaigns/${campaign.id}/send`).set("Cookie", cookie).send({});

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", cookie)
      .send({});

    expect(res.status).toBe(409);
  });
});

describe("scheduling a campaign", () => {
  it("rejects a schedule with no usable date", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "SCHEDULED", scheduledLocal: "not a date" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("valid date and time");
  });

  it("rejects a schedule in the past", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "SCHEDULED", scheduledLocal: wallClock(-60) });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("must be in the future");
  });

  it("books a future send", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "SCHEDULED", scheduledLocal: wallClock(120) });

    expect(res.status).toBe(200);
    expect(res.body.campaign.status).toBe("SCHEDULED");
    const stored = await db.campaign.findUnique({ where: { id: campaign.id } });
    expect(stored?.nextRunAt).toBeInstanceOf(Date);
    expect(stored?.sendMode).toBe("SCHEDULED");
  });

  it("refuses to reschedule a campaign that is already sending", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id, {
      status: "SENDING",
    });

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "SCHEDULED", scheduledLocal: wallClock(120) });

    expect(res.status).toBe(409);
  });
});

describe("recurring campaigns", () => {
  it("rejects a recurrence with no start date", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({ sendMode: "RECURRING", recurrence: { frequency: "WEEKLY" } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("valid start date");
  });

  it("rejects an end date before the start date", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({
        sendMode: "RECURRING",
        recurrence: {
          frequency: "DAILY",
          startLocal: wallClock(120),
          endLocal: wallClock(60),
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("after the start date");
  });

  it("rejects an end date that falls before the first run", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({
        sendMode: "RECURRING",
        recurrence: {
          frequency: "MONTHLY",
          startLocal: wallClock(-60 * 24 * 40),
          endLocal: wallClock(60),
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("before the first run");
  });

  it("books a recurring schedule and normalises the guest window", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({
        sendMode: "RECURRING",
        recurrence: { frequency: "WEEKLY", startLocal: wallClock(120) },
        maxSendsPerGuestWindowDays: 14.8,
      });

    expect(res.status).toBe(200);
    expect(res.body.campaign.status).toBe("RECURRING");
    const stored = await db.campaign.findUnique({ where: { id: campaign.id } });
    expect(stored?.maxSendsPerGuestWindowDays).toBe(14);
    expect(stored?.recurrenceFrequency).toBe("WEEKLY");
  });

  it("defaults the guest window when none is supplied", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({
        sendMode: "RECURRING",
        recurrence: { frequency: "DAILY", startLocal: wallClock(120) },
      });

    const stored = await db.campaign.findUnique({ where: { id: campaign.id } });
    expect(stored?.maxSendsPerGuestWindowDays).toBe(30);
  });

  it("advances a start date that has already passed", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({
        sendMode: "RECURRING",
        recurrence: { frequency: "DAILY", startLocal: wallClock(-120) },
      });

    expect(res.status).toBe(200);
    const stored = await db.campaign.findUnique({ where: { id: campaign.id } });
    expect(stored!.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to make a sending campaign recurring", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id, {
      status: "SENDING",
    });

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/send`)
      .set("Cookie", businessCookie(business.id))
      .send({
        sendMode: "RECURRING",
        recurrence: { frequency: "WEEKLY", startLocal: wallClock(120) },
      });

    expect(res.status).toBe(409);
  });
});

describe("pausing and resuming", () => {
  it("pauses and then resumes a recurring campaign", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id, {
      status: "RECURRING",
      recurrenceFrequency: "WEEKLY",
      timezone: "UTC",
      nextRunAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    const cookie = businessCookie(business.id);

    const paused = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/pause`)
      .set("Cookie", cookie);
    const resumed = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/resume`)
      .set("Cookie", cookie);

    expect(paused.status).toBe(200);
    expect(paused.body.campaign.status).toBe("PAUSED");
    expect(resumed.status).toBe(200);
    expect(resumed.body.campaign.status).toBe("RECURRING");
  });

  it("retires a paused campaign whose end date has passed", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id, {
      status: "PAUSED",
      isPaused: true,
      recurrenceFrequency: "DAILY",
      timezone: "UTC",
      nextRunAt: new Date(Date.now() - 60 * 1000),
      recurrenceEndAt: new Date(Date.now() - 30 * 1000),
    });

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/resume`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.campaign.status).toBe("SENT");
    const stored = await db.campaign.findUnique({ where: { id: campaign.id } });
    expect(stored?.nextRunAt).toBeNull();
  });

  it("cancels a scheduled campaign", async () => {
    const { business, location } = await utcLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id, {
      status: "SCHEDULED",
      nextRunAt: new Date(Date.now() + 3600_000),
    });

    const res = await (
      await api()
    )
      .post(`/api/campaigns/${campaign.id}/cancel`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.campaign.status).toBe("CANCELLED");
  });
});

describe("editing a campaign", () => {
  it("refuses to edit a campaign that is already sending", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id, {
      status: "SENDING",
    });

    const res = await (
      await api()
    )
      .patch(`/api/campaigns/${campaign.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ name: "Renamed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Only draft and cancelled");
  });

  it("keeps the untouched fields when only the name changes", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .patch(`/api/campaigns/${campaign.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ name: "Renamed Campaign" });

    expect(res.status).toBe(200);
    expect(res.body.campaign.name).toBe("Renamed Campaign");
    expect(res.body.campaign.channel).toBe("EMAIL");
    expect(res.body.campaign.audienceType).toBe("all_guests");
  });

  it("rejects an edit that would make the campaign invalid", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .patch(`/api/campaigns/${campaign.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ channel: "PIGEON" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid channel");
  });
});

describe("campaign detail", () => {
  it("includes the run history and delivery log", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await seedGuest(business, location);
    const template = await seatpingTemplate();
    const campaign = await seedCampaign(business, location, template.id);
    const cookie = businessCookie(business.id);
    await (await api()).post(`/api/campaigns/${campaign.id}/send`).set("Cookie", cookie).send({});

    const res = await (await api()).get(`/api/campaigns/${campaign.id}`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.campaign.id).toBe(campaign.id);
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeGreaterThan(0);
  });

  it("filters the campaign list by location", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await seatpingTemplate();
    await seedCampaign(business, location, template.id);

    const res = await (
      await api()
    )
      .get(`/api/campaigns?locationId=${location.id}`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.campaigns).toHaveLength(1);
    expect(res.body.campaigns[0].templateName).toBe(template.name);
  });

  it("rejects a list filtered by a location the business does not own", async () => {
    const { business } = await seedBusinessWithLocation();
    const other = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get(`/api/campaigns?locationId=${other.location.id}`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(404);
  });
});

describe("custom template validation", () => {
  async function createTemplate(businessId: string, body: Record<string, unknown>) {
    return (await api())
      .post("/api/campaigns/templates")
      .set("Cookie", businessCookie(businessId))
      .send(body);
  }

  it("rejects a template with no name", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await createTemplate(business.id, { body: "Hi there." });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Template name is required");
  });

  it("rejects variables that are not an array of strings", async () => {
    const { business } = await seedBusinessWithLocation();

    const notArray = await createTemplate(business.id, {
      name: "T",
      body: "Hi.",
      variables: "first_name",
    });
    const notStrings = await createTemplate(business.id, {
      name: "T",
      body: "Hi.",
      variables: [7],
    });

    expect(notArray.body.error).toBe("variables must be an array");
    expect(notStrings.body.error).toBe("variables must be strings");
  });

  it("rejects example values that are not an object", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await createTemplate(business.id, {
      name: "T",
      body: "Hi.",
      exampleValues: ["first_name"],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("exampleValues must be an object");
  });

  it("stores the optional purpose, offer and call to action", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await createTemplate(business.id, {
      name: "Weekend Offer",
      body: "Hi {{first_name}}, enjoy {{offer}} this weekend at our place.",
      purpose: "Bring guests back at the weekend",
      offerDetails: "20% off mains",
      ctaText: "Book now",
      ctaUrl: "https://test.invalid/book",
      exampleValues: { offer: "20% off mains" },
      locationId: location.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.template.purpose).toBe("Bring guests back at the weekend");
    expect(res.body.template.ctaUrl).toBe("https://test.invalid/book");
    expect(res.body.template.locationId).toBe(location.id);
    expect(res.body.template.approvalStatus).toBe("DRAFT");
  });

  it("rejects a template pointing at another business's location", async () => {
    const { business } = await seedBusinessWithLocation();
    const other = await seedBusinessWithLocation();

    const res = await createTemplate(business.id, {
      name: "T",
      body: "Hi.",
      locationId: other.location.id,
    });

    expect(res.status).toBe(404);
  });

  it("sends an approved template back for review when it is edited", async () => {
    const { business } = await seedBusinessWithLocation();
    const template = await db.campaignTemplate.create({
      data: {
        businessId: business.id,
        templateType: "CUSTOM",
        name: `Approved ${uniqueSuffix()}`,
        slug: `approved-${uniqueSuffix()}`,
        body: "Hi {{first_name}}, see you soon.",
        approvalStatus: "APPROVED",
      },
    });

    const res = await (
      await api()
    )
      .patch(`/api/campaigns/templates/${template.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ name: template.name, body: "Hi {{first_name}}, we updated our menu." });

    expect(res.status).toBe(200);
    expect(res.body.template.approvalStatus).toBe("PENDING_SEATPING_REVIEW");
  });

  it("clears the linked location when an empty id is sent", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const template = await db.campaignTemplate.create({
      data: {
        businessId: business.id,
        locationId: location.id,
        templateType: "CUSTOM",
        name: `Linked ${uniqueSuffix()}`,
        slug: `linked-${uniqueSuffix()}`,
        body: "Hi {{first_name}}, see you soon.",
        approvalStatus: "DRAFT",
      },
    });

    const res = await (
      await api()
    )
      .patch(`/api/campaigns/templates/${template.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({ name: template.name, body: template.body, locationId: "" });

    expect(res.status).toBe(200);
    expect(res.body.template.locationId).toBeNull();
  });

  it("rejects an edit pointing at another business's location", async () => {
    const { business } = await seedBusinessWithLocation();
    const other = await seedBusinessWithLocation();
    const template = await db.campaignTemplate.create({
      data: {
        businessId: business.id,
        templateType: "CUSTOM",
        name: `Draft ${uniqueSuffix()}`,
        slug: `draft-${uniqueSuffix()}`,
        body: "Hi {{first_name}}, see you soon.",
        approvalStatus: "DRAFT",
      },
    });

    const res = await (
      await api()
    )
      .patch(`/api/campaigns/templates/${template.id}`)
      .set("Cookie", businessCookie(business.id))
      .send({
        name: template.name,
        body: template.body,
        locationId: other.location.id,
      });

    expect(res.status).toBe(404);
  });
});

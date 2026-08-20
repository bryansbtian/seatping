import { expect, test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";
import { uniqueId } from "./helpers/db.js";
import { openAllDayEveryDay, publishedProfile } from "./helpers/time.js";

const SMS_GUEST_PHONE = "2125550142";

function scheduledLocalWallClock(daysAhead: number): string {
  const at = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const day = String(at.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}T10:00`;
}

test("a business builds a template, audience and scheduled SMS campaign, and paid queue notifications respect the location credit balance", async ({
  page,
  db,
}) => {
  const marker = uniqueId();
  const { business, location } = await db.createBusinessWithLocation({
    credits: 2,
    restaurantProfile: publishedProfile(`Campaign Bistro ${marker}`, openAllDayEveryDay()),
  });

  await signInBusiness(page, business);

  const smsJoin = await page.request.post(`/auth/business/${business.username}/queue`, {
    data: {
      locationId: location.id,
      firstName: "Sam",
      lastName: `Sms${marker}`,
      numGuests: 2,
      phoneNumber: SMS_GUEST_PHONE,
      countryCode: "+1",
      notificationMethod: "sms",
      smsConsent: true,
      smsMarketingConsent: true,
    },
  });
  expect(smsJoin.status()).toBe(200);

  await expect
    .poll(async () => {
      return db.prisma.guestProfile.count({ where: { locationId: location.id } });
    })
    .toBe(1);

  const templateResponse = await page.request.post("/api/campaigns/templates", {
    data: {
      name: `E2E Custom Template ${marker}`,
      purpose: "Win back quiet guests",
      body: "Hello from our test kitchen, we saved you a table this week.",
      locationId: location.id,
    },
  });
  expect(templateResponse.status()).toBe(200);
  const customTemplate = (await templateResponse.json()).template;
  expect(customTemplate.approvalStatus).toBe("DRAFT");
  expect(customTemplate.usable).toBe(false);

  const submitted = await page.request.post(`/api/campaigns/templates/${customTemplate.id}/submit`);
  expect(submitted.status()).toBe(200);
  expect((await submitted.json()).template.approvalStatus).toBe("PENDING_SEATPING_REVIEW");

  const templatesResponse = await page.request.get("/api/campaigns/templates");
  expect(templatesResponse.status()).toBe(200);
  const templates = (await templatesResponse.json()).templates as Array<Record<string, any>>;
  const listedCustom = templates.find((t) => {
    return t.id === customTemplate.id;
  });
  expect(listedCustom?.approvalStatus).toBe("PENDING_SEATPING_REVIEW");
  expect(listedCustom?.usable).toBe(false);

  const seatpingTemplate = templates.find((t) => {
    return t.templateType === "SEATPING" && t.usable === true;
  });
  expect(seatpingTemplate).toBeTruthy();

  const audienceResponse = await page.request.post("/api/audiences", {
    data: {
      locationId: location.id,
      name: `E2E Audience ${marker}`,
      description: "Everyone who has ever visited",
      filters: { totalVisitsMin: 0 },
    },
  });
  expect(audienceResponse.status()).toBe(200);
  const audience = (await audienceResponse.json()).audience;

  const campaignName = `E2E Campaign ${marker}`;
  const campaignResponse = await page.request.post("/api/campaigns", {
    data: {
      name: campaignName,
      locationId: location.id,
      channel: "SMS",
      templateId: seatpingTemplate!.id,
      audienceType: "custom_group",
      audienceConfig: { savedAudienceId: audience.id },
      templateValues: {},
    },
  });
  expect(campaignResponse.status()).toBe(200);
  const campaign = (await campaignResponse.json()).campaign;
  expect(campaign.status).toBe("DRAFT");
  expect(campaign.channel).toBe("SMS");
  expect(campaign.recipientCount).toBe(1);

  const scheduled = await page.request.post(`/api/campaigns/${campaign.id}/send`, {
    data: {
      sendMode: "SCHEDULED",
      scheduledLocal: scheduledLocalWallClock(2),
    },
  });
  expect(scheduled.status()).toBe(200);

  const storedCampaign = await db.prisma.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
  });
  expect(storedCampaign.status).toBe("SCHEDULED");
  expect(storedCampaign.sendMode).toBe("SCHEDULED");
  expect(storedCampaign.channel).toBe("SMS");
  expect(storedCampaign.audienceType).toBe("custom_group");
  expect(storedCampaign.templateId).toBe(seatpingTemplate!.id);
  expect(storedCampaign.timezone).toBe("UTC");
  expect(storedCampaign.scheduledAt).not.toBeNull();
  expect(storedCampaign.nextRunAt?.toISOString()).toBe(storedCampaign.scheduledAt?.toISOString());
  expect(storedCampaign.isPaused).toBe(false);

  expect(await db.prisma.campaignRun.count({ where: { campaignId: campaign.id } })).toBe(0);

  await page.goto("/business/campaigns");
  await expect(page.getByText(campaignName).first()).toBeVisible();
  await expect(page.getByText("Scheduled").first()).toBeVisible();
  await expect(page.getByText("SMS").first()).toBeVisible();

  const afterFirstJoin = await db.prisma.location.findUniqueOrThrow({
    where: { id: location.id },
  });
  expect(afterFirstJoin.credits).toBe(1);

  const secondJoin = await page.request.post(`/auth/business/${business.username}/queue`, {
    data: {
      locationId: location.id,
      firstName: "Cleo",
      lastName: `Credit${marker}`,
      numGuests: 2,
      email: `e2e-credit-${marker}@test.invalid`,
      notificationMethod: "email",
    },
  });
  expect(secondJoin.status()).toBe(200);

  const afterSecondJoin = await db.prisma.location.findUniqueOrThrow({
    where: { id: location.id },
  });
  expect(afterSecondJoin.credits).toBe(0);

  const blockedJoin = await page.request.post(`/auth/business/${business.username}/queue`, {
    data: {
      locationId: location.id,
      firstName: "Nolan",
      lastName: `NoCredit${marker}`,
      numGuests: 2,
      email: `e2e-nocredit-${marker}@test.invalid`,
      notificationMethod: "email",
    },
  });
  expect(blockedJoin.status()).toBe(400);
  expect((await blockedJoin.json()).error).toContain("no credits remaining");

  const afterBlockedJoin = await db.prisma.location.findUniqueOrThrow({
    where: { id: location.id },
  });
  expect(afterBlockedJoin.credits).toBe(0);
  expect(
    await db.prisma.queueEntry.count({
      where: { locationId: location.id, lastName: `NoCredit${marker}` },
    }),
  ).toBe(0);
  expect(await db.prisma.queueEntry.count({ where: { locationId: location.id } })).toBe(2);
});

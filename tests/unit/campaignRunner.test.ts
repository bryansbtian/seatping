import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueNotification = vi.fn();

const campaignFindUnique = vi.fn();
const campaignFindMany = vi.fn();
const campaignUpdate = vi.fn();
const campaignUpdateMany = vi.fn();
const businessFindUnique = vi.fn();
const locationFindFirst = vi.fn();
const templateFindUnique = vi.fn();
const guestProfileFindMany = vi.fn();
const runCreate = vi.fn();
const runFindFirst = vi.fn();
const runFindMany = vi.fn();
const runUpdate = vi.fn();
const recipientCreateMany = vi.fn();
const recipientFindMany = vi.fn();
const recipientGroupBy = vi.fn();
const deliveryLogCreate = vi.fn();

vi.mock("../../server/lib/notifications.js", () => {
  return { enqueueNotification };
});

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      campaign: {
        findUnique: campaignFindUnique,
        findMany: campaignFindMany,
        update: campaignUpdate,
        updateMany: campaignUpdateMany,
      },
      business: { findUnique: businessFindUnique },
      location: { findFirst: locationFindFirst },
      campaignTemplate: { findUnique: templateFindUnique },
      guestProfile: { findMany: guestProfileFindMany },
      campaignRun: {
        create: runCreate,
        findFirst: runFindFirst,
        findMany: runFindMany,
        update: runUpdate,
      },
      campaignRecipient: {
        createMany: recipientCreateMany,
        findMany: recipientFindMany,
        groupBy: recipientGroupBy,
      },
      campaignDeliveryLog: { create: deliveryLogCreate },
    },
  };
});

const {
  executeCampaignRun,
  reconcileCampaign,
  reconcileRun,
  runDueCampaignsSweep,
} = await import("../../server/lib/campaignRunner.js");

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "camp-1",
    businessId: "biz-1",
    locationId: "loc-1",
    templateId: "tmpl-1",
    channel: "EMAIL",
    audienceType: "all_guests",
    audienceConfig: {},
    templateValues: {},
    status: "DRAFT",
    isPaused: false,
    nextRunAt: null,
    scheduledAt: null,
    recurrenceFrequency: null,
    recurrenceEndAt: null,
    timezone: "Asia/Jakarta",
    maxSendsPerGuestWindowDays: null,
    ...overrides,
  } as never;
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: "tmpl-1",
    name: "We Miss You",
    templateType: "SEATPING",
    isActive: true,
    approvalStatus: "APPROVED",
    body: "Hi {{first_name}}, we miss you at {{business_name}}.",
    offerDetails: null,
    ctaText: null,
    ctaUrl: null,
    whatsappProviderTemplateName: null,
    whatsappLanguage: "en",
    ...overrides,
  };
}

function guest(overrides: Record<string, unknown> = {}) {
  return {
    id: "guest-1",
    firstName: "Ada",
    fullName: "Ada Lovelace",
    email: "guest@test.invalid",
    phone: null,
    normalizedPhone: null,
    ...overrides,
  };
}

function readyToRun() {
  campaignFindUnique.mockResolvedValue(campaign());
  businessFindUnique.mockResolvedValue({
    id: "biz-1",
    name: "Bistro",
    email: "owner@test.invalid",
  });
  locationFindFirst.mockResolvedValue({
    id: "loc-1",
    name: "Downtown",
    displayName: "Downtown",
    address: "1 Test Street",
    restaurantProfile: {},
  });
  templateFindUnique.mockResolvedValue(template());
}

beforeEach(() => {
  enqueueNotification.mockReset().mockResolvedValue(undefined);
  campaignFindUnique.mockReset().mockResolvedValue(null);
  campaignFindMany.mockReset().mockResolvedValue([]);
  campaignUpdate.mockReset().mockResolvedValue({});
  campaignUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  businessFindUnique.mockReset().mockResolvedValue(null);
  locationFindFirst.mockReset().mockResolvedValue(null);
  templateFindUnique.mockReset().mockResolvedValue(null);
  guestProfileFindMany.mockReset().mockResolvedValue([]);
  runCreate.mockReset().mockResolvedValue({ id: "run-1" });
  runFindFirst.mockReset().mockResolvedValue(null);
  runFindMany.mockReset().mockResolvedValue([]);
  runUpdate.mockReset().mockImplementation(async ({ data }) => {
    return { id: "run-1", ...data };
  });
  recipientCreateMany.mockReset().mockResolvedValue({ count: 1 });
  recipientFindMany.mockReset().mockResolvedValue([]);
  recipientGroupBy.mockReset().mockResolvedValue([]);
  deliveryLogCreate.mockReset().mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("executeCampaignRun guards", () => {
  it("refuses an unknown campaign", async () => {
    await expect(executeCampaignRun("camp-missing", "MANUAL")).resolves.toEqual({
      error: "Campaign not found",
    });
  });

  it("refuses a campaign whose business is gone", async () => {
    campaignFindUnique.mockResolvedValue(campaign());

    await expect(executeCampaignRun("camp-1", "MANUAL")).resolves.toEqual({
      error: "Business not found",
    });
  });

  it("refuses a campaign whose location is gone", async () => {
    campaignFindUnique.mockResolvedValue(campaign());
    businessFindUnique.mockResolvedValue({ id: "biz-1", name: "Bistro" });

    await expect(executeCampaignRun("camp-1", "MANUAL")).resolves.toEqual({
      error: "Location not found",
    });
  });

  it("refuses a campaign whose template is gone", async () => {
    campaignFindUnique.mockResolvedValue(campaign());
    businessFindUnique.mockResolvedValue({ id: "biz-1", name: "Bistro" });
    locationFindFirst.mockResolvedValue({ id: "loc-1", name: "Downtown" });

    await expect(executeCampaignRun("camp-1", "MANUAL")).resolves.toEqual({
      error: "Template not found",
    });
  });

  it("refuses an inactive SeatPing template", async () => {
    readyToRun();
    templateFindUnique.mockResolvedValue(template({ isActive: false }));

    await expect(executeCampaignRun("camp-1", "MANUAL")).resolves.toEqual({
      error: "Template is not available for sending",
    });
  });

  it("refuses a custom template that is not approved", async () => {
    readyToRun();
    templateFindUnique.mockResolvedValue(
      template({ templateType: "CUSTOM", approvalStatus: "PENDING" }),
    );

    await expect(executeCampaignRun("camp-1", "MANUAL")).resolves.toEqual({
      error: "Template is not available for sending",
    });
  });

  it("accepts an approved custom template", async () => {
    readyToRun();
    templateFindUnique.mockResolvedValue(
      template({ templateType: "CUSTOM", isActive: false }),
    );

    const res = await executeCampaignRun("camp-1", "MANUAL");

    expect(res).toEqual({ runId: "run-1", recipientCount: 0, excludedCount: 0 });
  });
});

describe("executeCampaignRun delivery", () => {
  it("completes an empty run immediately", async () => {
    readyToRun();

    const res = await executeCampaignRun("camp-1", "MANUAL");

    expect(runCreate.mock.calls[0][0].data.status).toBe("COMPLETED");
    expect(res).toEqual({ runId: "run-1", recipientCount: 0, excludedCount: 0 });
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("counts guests that cannot be reached on the channel", async () => {
    readyToRun();
    guestProfileFindMany.mockResolvedValue([guest({ email: null })]);

    const res = await executeCampaignRun("camp-1", "MANUAL");

    expect(res).toEqual({ runId: "run-1", recipientCount: 0, excludedCount: 1 });
  });

  it("queues one message per eligible recipient", async () => {
    readyToRun();
    guestProfileFindMany.mockResolvedValue([guest()]);
    recipientFindMany.mockResolvedValue([
      {
        id: "rec-1",
        guestProfileId: "guest-1",
        email: "guest@test.invalid",
        phone: null,
      },
    ]);

    const res = await executeCampaignRun("camp-1", "MANUAL");

    expect(runCreate.mock.calls[0][0].data.status).toBe("RUNNING");
    expect(deliveryLogCreate.mock.calls[0][0].data.eventType).toBe("run_started");
    expect(enqueueNotification).toHaveBeenCalledTimes(1);
    const job = enqueueNotification.mock.calls[0][0];
    expect(job.type).toBe("campaign_message");
    expect(job.channel).toBe("email");
    expect(job.recipientId).toBe("rec-1");
    expect(job.businessName).toBe("Downtown");
    expect(job.bodyText).toContain("Ada");
    expect(res.recipientCount).toBe(1);
  });

  it("skips guests already reached inside the recurring window", async () => {
    readyToRun();
    guestProfileFindMany.mockResolvedValue([guest()]);
    recipientFindMany.mockResolvedValue([{ guestProfileId: "guest-1" }]);

    const res = await executeCampaignRun("camp-1", "RECURRING");

    expect(res).toEqual({ runId: "run-1", recipientCount: 0, excludedCount: 0 });
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("sends to a guest last reached before the recurring window", async () => {
    readyToRun();
    campaignFindUnique.mockResolvedValue(
      campaign({ maxSendsPerGuestWindowDays: 7 }),
    );
    guestProfileFindMany.mockResolvedValue([guest()]);
    recipientFindMany
      .mockResolvedValueOnce([{ guestProfileId: "guest-9" }])
      .mockResolvedValueOnce([
        {
          id: "rec-1",
          guestProfileId: "guest-1",
          email: "guest@test.invalid",
          phone: null,
        },
      ]);

    const res = await executeCampaignRun("camp-1", "RECURRING");

    expect(res.recipientCount).toBe(1);
  });

  it("caps a very large audience", async () => {
    readyToRun();
    const guests = Array.from({ length: 2100 }, (_, i) => {
      return guest({ id: `guest-${i}`, email: `guest-${i}@test.invalid` });
    });
    guestProfileFindMany.mockResolvedValue(guests);
    recipientFindMany.mockResolvedValue([]);

    await executeCampaignRun("camp-1", "MANUAL");

    expect(runCreate.mock.calls[0][0].data.recipientCount).toBe(2000);
    expect(recipientCreateMany.mock.calls[0][0].data).toHaveLength(2000);
  });
});

describe("reconcileRun", () => {
  it("leaves a run that is not running untouched", async () => {
    const run = { id: "run-1", status: "COMPLETED" } as never;

    await expect(reconcileRun(run)).resolves.toBe(run);
    expect(runUpdate).not.toHaveBeenCalled();
  });

  it("keeps a run open while recipients are still pending", async () => {
    recipientGroupBy.mockResolvedValue([
      { status: "SENT", _count: { _all: 2 } },
      { status: "PENDING", _count: { _all: 1 } },
    ]);

    await reconcileRun({ id: "run-1", status: "RUNNING" } as never);

    const data = runUpdate.mock.calls[0][0].data;
    expect(data.sentCount).toBe(2);
    expect(data.status).toBeUndefined();
    expect(data.completedAt).toBeUndefined();
  });

  it("completes a run once every recipient has been sent", async () => {
    recipientGroupBy.mockResolvedValue([
      { status: "SENT", _count: { _all: 1 } },
      { status: "DELIVERED", _count: { _all: 2 } },
      { status: "SKIPPED", _count: { _all: 1 } },
    ]);

    await reconcileRun({ id: "run-1", status: "RUNNING" } as never);

    const data = runUpdate.mock.calls[0][0].data;
    expect(data.sentCount).toBe(3);
    expect(data.skippedCount).toBe(1);
    expect(data.status).toBe("COMPLETED");
  });

  it("fails a run where nothing was sent", async () => {
    recipientGroupBy.mockResolvedValue([
      { status: "FAILED", _count: { _all: 2 } },
    ]);

    await reconcileRun({ id: "run-1", status: "RUNNING" } as never);

    const data = runUpdate.mock.calls[0][0].data;
    expect(data.failedCount).toBe(2);
    expect(data.status).toBe("FAILED");
  });
});

describe("reconcileCampaign", () => {
  it("leaves a campaign with no runs untouched", async () => {
    const c = { id: "camp-1", status: "SENDING" } as never;

    await expect(reconcileCampaign(c)).resolves.toBe(c);
    expect(campaignUpdate).not.toHaveBeenCalled();
  });

  it("marks a sending campaign sent once its run succeeded", async () => {
    runFindFirst.mockResolvedValue({
      id: "run-1",
      status: "COMPLETED",
      recipientCount: 3,
      sentCount: 3,
      failedCount: 0,
      skippedCount: 0,
    });

    await reconcileCampaign({ id: "camp-1", status: "SENDING" } as never);

    expect(campaignUpdate.mock.calls[0][0].data.status).toBe("SENT");
  });

  it("marks a sending campaign failed when nothing was sent", async () => {
    runFindFirst.mockResolvedValue({
      id: "run-1",
      status: "COMPLETED",
      recipientCount: 3,
      sentCount: 0,
      failedCount: 3,
      skippedCount: 0,
    });

    await reconcileCampaign({ id: "camp-1", status: "SENDING" } as never);

    expect(campaignUpdate.mock.calls[0][0].data.status).toBe("FAILED");
  });

  it("reconciles the latest run before deciding", async () => {
    runFindFirst.mockResolvedValue({
      id: "run-1",
      status: "RUNNING",
      recipientCount: 1,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
    });
    recipientGroupBy.mockResolvedValue([
      { status: "SENT", _count: { _all: 1 } },
    ]);

    await reconcileCampaign({ id: "camp-1", status: "SENDING" } as never);

    expect(runUpdate).toHaveBeenCalled();
    expect(campaignUpdate.mock.calls[0][0].data.status).toBe("SENT");
  });

  it("leaves a campaign that is not sending in its current status", async () => {
    runFindFirst.mockResolvedValue({
      id: "run-1",
      status: "COMPLETED",
      recipientCount: 1,
      sentCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });

    await reconcileCampaign({ id: "camp-1", status: "SENT" } as never);

    expect(campaignUpdate.mock.calls[0][0].data.status).toBeUndefined();
  });
});

describe("runDueCampaignsSweep", () => {
  it("reports nothing to do on an idle sweep", async () => {
    await expect(runDueCampaignsSweep()).resolves.toEqual({
      scheduled: 0,
      recurring: 0,
    });
  });

  it("fires a due scheduled campaign", async () => {
    campaignFindMany
      .mockResolvedValueOnce([campaign({ status: "SCHEDULED" })])
      .mockResolvedValue([]);
    readyToRun();

    const res = await runDueCampaignsSweep();

    expect(res.scheduled).toBe(1);
    expect(campaignUpdateMany.mock.calls[0][0].data.status).toBe("SENDING");
    expect(campaignUpdate.mock.calls[0][0].data.recipientCount).toBe(0);
  });

  it("fails a scheduled campaign that cannot run", async () => {
    campaignFindMany
      .mockResolvedValueOnce([campaign({ status: "SCHEDULED" })])
      .mockResolvedValue([]);

    const res = await runDueCampaignsSweep();

    expect(res.scheduled).toBe(0);
    expect(campaignUpdate.mock.calls[0][0].data.status).toBe("FAILED");
  });

  it("skips a scheduled campaign another worker already claimed", async () => {
    campaignFindMany
      .mockResolvedValueOnce([campaign({ status: "SCHEDULED" })])
      .mockResolvedValue([]);
    campaignUpdateMany.mockResolvedValue({ count: 0 });

    const res = await runDueCampaignsSweep();

    expect(res.scheduled).toBe(0);
    expect(campaignUpdate).not.toHaveBeenCalled();
  });

  it("marks a scheduled campaign failed when the run throws", async () => {
    campaignFindMany
      .mockResolvedValueOnce([campaign({ status: "SCHEDULED" })])
      .mockResolvedValue([]);
    campaignFindUnique.mockRejectedValue(new Error("db down"));

    const res = await runDueCampaignsSweep();

    expect(res.scheduled).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it("fires a due recurring campaign and books the next slot", async () => {
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        campaign({
          status: "RECURRING",
          recurrenceFrequency: "WEEKLY",
          nextRunAt: new Date(Date.now() - 60_000),
        }),
      ])
      .mockResolvedValue([]);
    readyToRun();

    const res = await runDueCampaignsSweep();

    expect(res.recurring).toBe(1);
    const claim = campaignUpdateMany.mock.calls[0][0];
    expect(claim.data.nextRunAt).toBeInstanceOf(Date);
    expect(claim.data.status).toBeUndefined();
  });

  it("retires a recurring campaign past its end date", async () => {
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        campaign({
          status: "RECURRING",
          recurrenceFrequency: "DAILY",
          nextRunAt: new Date(Date.now() - 60_000),
          recurrenceEndAt: new Date(Date.now() - 30_000),
        }),
      ])
      .mockResolvedValue([]);
    readyToRun();

    await runDueCampaignsSweep();

    const claim = campaignUpdateMany.mock.calls[0][0];
    expect(claim.data.nextRunAt).toBeNull();
    expect(claim.data.status).toBe("SENT");
  });

  it("skips a recurring campaign another worker already claimed", async () => {
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        campaign({ status: "RECURRING", nextRunAt: new Date(Date.now() - 60_000) }),
      ])
      .mockResolvedValue([]);
    campaignUpdateMany.mockResolvedValue({ count: 0 });

    const res = await runDueCampaignsSweep();

    expect(res.recurring).toBe(0);
  });

  it("keeps sweeping past a campaign with an invalid timezone", async () => {
    const dueAt = new Date(Date.now() - 60_000);
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        campaign({
          id: "camp-broken",
          status: "RECURRING",
          timezone: "Not/AZone",
          recurrenceFrequency: "WEEKLY",
          nextRunAt: dueAt,
        }),
        campaign({
          id: "camp-healthy",
          status: "RECURRING",
          timezone: "UTC",
          recurrenceFrequency: "WEEKLY",
          nextRunAt: dueAt,
        }),
      ])
      .mockResolvedValue([]);
    readyToRun();

    const res = await runDueCampaignsSweep();

    expect(res.recurring).toBe(1);
    const claimedIds = campaignUpdateMany.mock.calls.map(([arg]) => {
      return arg.where.id;
    });
    expect(claimedIds).toEqual(["camp-healthy"]);
    const ranIds = campaignFindUnique.mock.calls.map(([arg]) => {
      return arg.where.id;
    });
    expect(ranIds).not.toContain("camp-broken");
    expect(console.error).toHaveBeenCalled();
  });

  it("reports the campaign it skipped when a timezone is invalid", async () => {
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        campaign({
          id: "camp-broken",
          status: "RECURRING",
          timezone: "Not/AZone",
          nextRunAt: new Date(Date.now() - 60_000),
        }),
      ])
      .mockResolvedValue([]);

    await expect(runDueCampaignsSweep()).resolves.toEqual({
      scheduled: 0,
      recurring: 0,
    });
    const logged = (console.error as any).mock.calls.map((call: unknown[]) => {
      return String(call[0]);
    });
    expect(logged.some((line: string) => line.includes("camp-broken"))).toBe(
      true,
    );
  });

  it("uses the recurrence start day as the monthly anchor", async () => {
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        campaign({
          id: "camp-monthly",
          status: "RECURRING",
          timezone: "UTC",
          recurrenceFrequency: "MONTHLY",
          recurrenceStartAt: new Date("2027-01-31T09:00:00.000Z"),
          nextRunAt: new Date("2027-02-28T09:00:00.000Z"),
        }),
      ])
      .mockResolvedValue([]);
    readyToRun();

    await runDueCampaignsSweep();

    expect(
      campaignUpdateMany.mock.calls[0][0].data.nextRunAt.toISOString(),
    ).toBe("2027-03-31T09:00:00.000Z");
  });

  it("keeps sweeping when a recurring run throws", async () => {
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        campaign({ status: "RECURRING", nextRunAt: new Date(Date.now() - 60_000) }),
      ])
      .mockResolvedValue([]);
    campaignFindUnique.mockRejectedValue(new Error("db down"));

    const res = await runDueCampaignsSweep();

    expect(res.recurring).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it("keeps sweeping when marking a failed scheduled campaign also fails", async () => {
    campaignFindMany
      .mockResolvedValueOnce([campaign({ status: "SCHEDULED" })])
      .mockResolvedValue([]);
    campaignFindUnique.mockRejectedValue(new Error("db down"));
    campaignUpdate.mockRejectedValue(new Error("db still down"));

    await expect(runDueCampaignsSweep()).resolves.toEqual({
      scheduled: 0,
      recurring: 0,
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("keeps sweeping when reconciling a run fails", async () => {
    runFindMany.mockResolvedValue([{ id: "run-1", status: "RUNNING" }]);
    recipientGroupBy.mockRejectedValue(new Error("db down"));

    await expect(runDueCampaignsSweep()).resolves.toEqual({
      scheduled: 0,
      recurring: 0,
    });
  });

  it("keeps sweeping when reconciling a campaign fails", async () => {
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "camp-1", status: "SENDING" }]);
    runFindFirst.mockRejectedValue(new Error("db down"));

    await expect(runDueCampaignsSweep()).resolves.toEqual({
      scheduled: 0,
      recurring: 0,
    });
  });

  it("defaults the timezone and start point of a recurring campaign", async () => {
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        campaign({
          status: "RECURRING",
          timezone: null,
          recurrenceFrequency: null,
          nextRunAt: null,
        }),
      ])
      .mockResolvedValue([]);
    readyToRun();

    const res = await runDueCampaignsSweep();

    expect(res.recurring).toBe(1);
    expect(campaignUpdateMany.mock.calls[0][0].data.nextRunAt).toBeInstanceOf(
      Date,
    );
  });

  it("reconciles running runs and sending campaigns", async () => {
    campaignFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "camp-1", status: "SENDING" }]);
    runFindMany.mockResolvedValue([{ id: "run-1", status: "RUNNING" }]);
    recipientGroupBy.mockResolvedValue([
      { status: "SENT", _count: { _all: 1 } },
    ]);
    runFindFirst.mockResolvedValue({
      id: "run-1",
      status: "COMPLETED",
      recipientCount: 1,
      sentCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });

    await runDueCampaignsSweep();

    expect(runUpdate).toHaveBeenCalled();
    expect(campaignUpdate.mock.calls[0][0].data.status).toBe("SENT");
  });
});

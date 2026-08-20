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

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function guest(
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
      firstName: "Aud",
      lastName: suffix,
      fullName: `Aud ${suffix}`,
      email: `aud-${suffix}@test.invalid`,
      normalizedEmail: `aud-${suffix}@test.invalid`,
      totalVisits: 1,
      ...overrides,
    },
  });
}

async function preview(businessId: string, locationId: string, audienceType: string, extra = "") {
  return (await api())
    .get(
      `/api/campaigns/audiences/preview?locationId=${locationId}` +
        `&audienceType=${audienceType}&channel=EMAIL${extra}`,
    )
    .set("Cookie", businessCookie(businessId));
}

describe("audience type resolution", () => {
  it("separates returning guests from new guests", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, { totalVisits: 4 });
    await guest(business.id, business.username, location.id, { totalVisits: 1 });

    const returning = await preview(business.id, location.id, "returning");
    const fresh = await preview(business.id, location.id, "new");

    expect(returning.status).toBe(200);
    expect(fresh.status).toBe(200);
    expect(returning.body.recipientCount).toBe(1);
    expect(fresh.body.recipientCount).toBe(1);
  });

  it("selects guests who visited yesterday", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, {
      lastVisitAt: daysAgo(1),
    });
    await guest(business.id, business.username, location.id, {
      lastVisitAt: daysAgo(30),
    });

    const res = await preview(business.id, location.id, "visited_yesterday");

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBeLessThanOrEqual(1);
  });

  it("selects guests who have not returned within each window", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, {
      lastVisitAt: daysAgo(20),
    });
    await guest(business.id, business.username, location.id, {
      lastVisitAt: daysAgo(45),
    });
    await guest(business.id, business.username, location.id, {
      lastVisitAt: daysAgo(90),
    });

    const d15 = await preview(business.id, location.id, "not_returned_15d");
    const d30 = await preview(business.id, location.id, "not_returned_30d");
    const d60 = await preview(business.id, location.id, "not_returned_60d");

    expect(d15.status).toBe(200);
    expect(d30.status).toBe(200);
    expect(d60.status).toBe(200);

    expect(d15.body.recipientCount).toBeGreaterThanOrEqual(d30.body.recipientCount);
    expect(d30.body.recipientCount).toBeGreaterThanOrEqual(d60.body.recipientCount);
  });

  it("selects guests with upcoming reservations", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, {
      upcomingReservationCount: 2,
    });
    await guest(business.id, business.username, location.id, {
      upcomingReservationCount: 0,
    });

    const res = await preview(business.id, location.id, "upcoming_reservations");

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(1);
  });

  it("selects guests with a no-show history", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, { noShowCount: 1 });
    await guest(business.id, business.username, location.id, { noShowCount: 0 });

    const res = await preview(business.id, location.id, "no_show_history");

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(1);
  });

  it("resolves a manual list of guest ids", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const picked = await guest(business.id, business.username, location.id);
    await guest(business.id, business.username, location.id);

    const res = await preview(business.id, location.id, "manual", `&guestIds=${picked.id}`);

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBeLessThanOrEqual(1);
  });

  it("resolves a saved custom group", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, { totalVisits: 6 });
    await guest(business.id, business.username, location.id, { totalVisits: 1 });

    const saved = await db.savedAudience.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        locationId: location.id,
        name: "Frequent",
        filters: { totalVisitsMin: 5 },
      },
    });

    const res = await preview(
      business.id,
      location.id,
      "custom_group",
      `&savedAudienceId=${saved.id}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBeLessThanOrEqual(2);
  });

  it("rejects an unknown audience type", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await preview(business.id, location.id, "not_a_real_audience");

    expect(res.status).toBe(400);
  });

  it("rejects an unsupported channel", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get(
        `/api/campaigns/audiences/preview?locationId=${location.id}` +
          "&audienceType=all_guests&channel=CARRIER_PIGEON",
      )
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(400);
  });

  it("counts guests unreachable on the chosen channel as exclusions", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, {
      email: null,
      normalizedEmail: null,
    });

    const res = await preview(business.id, location.id, "all_guests");

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(0);
  });

  it("reports zero recipients for a location with no guests", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await preview(business.id, location.id, "all_guests");

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(0);
  });

  it("requires SMS-reachable guests when the channel is SMS", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await guest(business.id, business.username, location.id, {
      phone: null,
      normalizedPhone: null,
    });

    const res = await (
      await api()
    )
      .get(
        `/api/campaigns/audiences/preview?locationId=${location.id}` +
          "&audienceType=all_guests&channel=SMS",
      )
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.recipientCount).toBe(0);
  });
});

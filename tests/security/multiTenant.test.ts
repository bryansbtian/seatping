import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { adminCookie, businessCookie, customerCookie } from "../helpers/auth.js";
import {
  seedBusinessWithLocation,
  seedCustomer,
  seedQueueEntry,
  seedReservation,
} from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("unauthenticated access", () => {
  const protectedEndpoints: Array<[string, string]> = [
    ["get", "/api/guests/meta"],
    ["get", "/api/campaigns"],
    ["get", "/auth/business/me"],
  ];

  for (const [method, path] of protectedEndpoints) {
    it(`rejects an anonymous ${method.toUpperCase()} ${path}`, async () => {
      const agent = await api();
      const res = await (
        agent as never as Record<string, (p: string) => Promise<{ status: number }>>
      )[method](path);

      expect(res.status).toBe(401);
    });
  }
});

describe("wrong account type", () => {
  it("refuses customer credentials on a business-only endpoint", async () => {
    const customer = await seedCustomer();

    const res = await (
      await api()
    )
      .get("/api/guests/meta")
      .set("Cookie", customerCookie(customer.id));

    expect(res.status).toBe(401);
  });

  it("refuses business credentials on an admin-only endpoint", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (
      await api()
    )
      .get("/admin/campaign-templates")
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(401);
  });

  it("refuses an admin cookie on a business-only endpoint", async () => {
    const res = await (await api()).get("/api/campaigns").set("Cookie", adminCookie());

    expect(res.status).toBe(401);
  });
});

describe("cross-business isolation", () => {
  it("does not expose another business's guests", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    const guestOfA = await db.guestProfile.create({
      data: {
        businessId: tenantA.business.id,
        businessUsername: tenantA.business.username,
        locationId: tenantA.location.id,
        firstName: "Private",
        lastName: "GuestA",
        fullName: "Private GuestA",
        normalizedEmail: "private-guest-a@test.invalid",
        email: "private-guest-a@test.invalid",
      },
    });

    const res = await (
      await api()
    )
      .get(`/api/guests/${guestOfA.id}`)
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toContain("private-guest-a@test.invalid");

    const stillOwned = await db.guestProfile.findUnique({ where: { id: guestOfA.id } });
    expect(stillOwned?.businessId).toBe(tenantA.business.id);
  });

  it("does not let another business tag a guest it does not own", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    const guestOfA = await db.guestProfile.create({
      data: {
        businessId: tenantA.business.id,
        businessUsername: tenantA.business.username,
        locationId: tenantA.location.id,
        firstName: "Tagged",
        lastName: "GuestA",
        fullName: "Tagged GuestA",
        normalizedEmail: "tagged-guest-a@test.invalid",
        email: "tagged-guest-a@test.invalid",
      },
    });

    const res = await (
      await api()
    )
      .post(`/api/guests/${guestOfA.id}/tags`)
      .set("Cookie", businessCookie(tenantB.business.id))
      .send({ tag: "vip" });

    expect(res.status).toBeGreaterThanOrEqual(400);

    const unchanged = await db.guestProfile.findUnique({ where: { id: guestOfA.id } });
    expect(unchanged?.tags ?? []).not.toContain("vip");
  });

  it("does not let another business admit a queue entry it does not own", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(tenantA.location);

    const res = await (
      await api()
    )
      .post(`/auth/business/${tenantA.business.username}/queue/${entry.legacyKey}/admit`)
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(res.status).toBe(404);

    const unchanged = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(unchanged?.status).toBe("WAITING");
    expect(unchanged?.admittedAt).toBeNull();
  });

  it("does not let another business modify a location it does not own", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();
    const originalAddress = tenantA.location.address;

    const res = await (
      await api()
    )
      .put(`/auth/business/locations/${tenantA.location.id}`)
      .set("Cookie", businessCookie(tenantB.business.id))
      .send({ address: "Hijacked Address" });

    expect(res.status).toBeGreaterThanOrEqual(400);

    const unchanged = await db.location.findUnique({
      where: { id: tenantA.location.id },
    });
    expect(unchanged?.address).toBe(originalAddress);
    expect(unchanged?.businessId).toBe(tenantA.business.id);
  });

  it("scopes the guest list to the authenticated business", async () => {
    const tenantA = await seedBusinessWithLocation();
    const tenantB = await seedBusinessWithLocation();

    await db.guestProfile.create({
      data: {
        businessId: tenantA.business.id,
        businessUsername: tenantA.business.username,
        locationId: tenantA.location.id,
        firstName: "Only",
        lastName: "TenantA",
        fullName: "Only TenantA",
        normalizedEmail: "only-tenant-a@test.invalid",
        email: "only-tenant-a@test.invalid",
      },
    });

    const res = await (
      await api()
    )
      .get(`/api/guests?locationId=${tenantA.location.id}`)
      .set("Cookie", businessCookie(tenantB.business.id));

    expect(JSON.stringify(res.body)).not.toContain("only-tenant-a@test.invalid");
  });

  it("does not expose another business's reservation through the manage token", async () => {
    const tenantA = await seedBusinessWithLocation();
    const reservation = await seedReservation(tenantA.location, {
      email: "private-res@test.invalid",
    });

    const res = await (await api()).get("/api/reservations/manage/not-the-real-token");

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toContain("private-res@test.invalid");

    const stored = await db.reservation.findUnique({ where: { id: reservation.id } });
    expect(stored?.businessId).toBe(tenantA.business.id);
  });
});

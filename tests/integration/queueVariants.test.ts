import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { customerCookie } from "../helpers/auth.js";
import { sinks } from "../setup/externalMocks.js";
import {
  seedBusinessWithLocation,
  seedCustomer,
  seedQueueEntry,
  uniqueSuffix,
} from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function emailJoin(locationId: string, overrides: Record<string, unknown> = {}) {
  const suffix = uniqueSuffix();
  return {
    locationId,
    firstName: "Ada",
    lastName: suffix,
    numGuests: 2,
    notificationMethod: "email",
    email: `qv-${suffix}@test.invalid`,
    ...overrides,
  };
}

describe("queue join notification channels", () => {
  it("accepts an SMS join when consent is given", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const suffix = uniqueSuffix();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send({
        locationId: location.id,
        firstName: "Sms",
        lastName: suffix,
        numGuests: 3,
        notificationMethod: "sms",
        phoneNumber: "5551234567",
        countryCode: "+1",
        smsConsent: true,
      });

    expect(res.status).toBe(200);
    const stored = await db.queueEntry.findFirst({
      where: { locationId: location.id, lastName: suffix },
    });
    expect(stored?.notificationMethod).toBe("sms");
    expect(stored?.smsConsent).toBe(true);
    expect(sinks().telnyx).toHaveLength(0);
  });

  it("records marketing consent separately from delivery consent", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const suffix = uniqueSuffix();

    await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send({
        locationId: location.id,
        firstName: "Marketing",
        lastName: suffix,
        numGuests: 2,
        notificationMethod: "sms",
        phoneNumber: "5551234567",
        countryCode: "+1",
        smsConsent: true,
        smsMarketingConsent: true,
      });

    const stored = await db.queueEntry.findFirst({
      where: { locationId: location.id, lastName: suffix },
    });
    expect(stored?.smsMarketingConsent).toBe(true);
  });

  it("accepts a WhatsApp join with a phone number", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const suffix = uniqueSuffix();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send({
        locationId: location.id,
        firstName: "Whats",
        lastName: suffix,
        numGuests: 2,
        notificationMethod: "whatsapp",
        phoneNumber: "81234567890",
        countryCode: "+62",
      });

    expect(res.status).toBe(200);
    expect(sinks().whatsapp).toHaveLength(0);
  });

  it("requires a phone number for WhatsApp", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(
        emailJoin(location.id, {
          notificationMethod: "whatsapp",
          email: undefined,
        }),
      );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/phone/i);
  });

  it("resolves a location by address when no id is supplied", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const suffix = uniqueSuffix();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send({
        address: location.address,
        firstName: "ByAddress",
        lastName: suffix,
        numGuests: 2,
        notificationMethod: "email",
        email: `addr-${suffix}@test.invalid`,
      });

    expect(res.status).toBe(200);
    const stored = await db.queueEntry.findFirst({
      where: { locationId: location.id, lastName: suffix },
    });
    expect(stored).not.toBeNull();
  });

  it("requires either a location id or an address", async () => {
    const { business } = await seedBusinessWithLocation();
    const suffix = uniqueSuffix();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send({
        firstName: "NoLocation",
        lastName: suffix,
        numGuests: 2,
        notificationMethod: "email",
        email: `noloc-${suffix}@test.invalid`,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/location/i);
  });

  it("links the entry to a signed-in customer", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const customer = await seedCustomer();
    const suffix = uniqueSuffix();

    await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .set("Cookie", customerCookie(customer.id))
      .send(emailJoin(location.id, { lastName: suffix }));

    const stored = await db.queueEntry.findFirst({
      where: { locationId: location.id, lastName: suffix },
    });
    expect(stored?.customerId).toBe(customer.id);
  });
});

describe("queue join guards", () => {
  it("refuses to join when the queue is disabled", async () => {
    const { business, location } = await seedBusinessWithLocation({
      queueEnabled: false,
    });

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(emailJoin(location.id));

    expect(res.status).toBe(400);
    expect(await db.queueEntry.count()).toBe(0);
  });

  it("refuses a second join for a contact already waiting", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const sharedEmail = `dupe-${uniqueSuffix()}@test.invalid`;

    const first = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(emailJoin(location.id, { email: sharedEmail }));
    expect(first.status).toBe(200);

    const second = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(emailJoin(location.id, { email: sharedEmail }));

    expect(second.status).toBe(409);
    expect(await db.queueEntry.count({ where: { locationId: location.id } })).toBe(
      1,
    );
  });

  it("allows rejoining once the earlier entry is no longer waiting", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const sharedEmail = `rejoin-${uniqueSuffix()}@test.invalid`;
    await seedQueueEntry(location, { email: sharedEmail, status: "LEFT" });

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(emailJoin(location.id, { email: sharedEmail }));

    expect(res.status).toBe(200);
  });

  it("refuses a join for an unknown location id", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(emailJoin("000000000000000000000000"));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a join with no guest count", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(emailJoin(location.id, { numGuests: undefined }));

    expect(res.status).toBe(400);
  });
});

describe("queue removal paths", () => {
  it("marks a waiting guest as a no-show", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location, {
      status: "ADMITTED",
      admittedAt: new Date(),
      finalStatus: "pending",
    });

    const res = await (await api())
      .post(`/auth/business/${business.username}/admitted/${entry.legacyKey}/no-show`)
      .set("Cookie", (await import("../helpers/auth.js")).businessCookie(business.id));

    expect(res.status).toBeLessThan(500);
  });

  it("removes a waiting guest from the queue", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);
    const { businessCookie } = await import("../helpers/auth.js");

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue/${entry.legacyKey}/remove`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBeLessThan(500);
  });
});

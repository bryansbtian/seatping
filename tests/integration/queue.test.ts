import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry, uniqueSuffix } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

function joinPayload(locationId: string, overrides: Record<string, unknown> = {}) {
  const suffix = uniqueSuffix();
  return {
    locationId,
    firstName: "Ada",
    lastName: suffix,
    numGuests: 2,
    notificationMethod: "email",
    email: `join-${suffix}@test.invalid`,
    ...overrides,
  };
}

describe("queue join", () => {
  it("creates a real WAITING queue entry and returns a token", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(joinPayload(location.id));

    expect(res.status).toBe(200);
    expect(res.body.queueToken).toEqual(expect.any(String));

    const stored = await db.queueEntry.findUnique({
      where: { queueToken: res.body.queueToken },
    });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("WAITING");
    expect(stored?.locationId).toBe(location.id);
    expect(stored?.businessId).toBe(business.id);
    expect(stored?.guestCount).toBe(2);
    expect(stored?.joinedAt).toBeInstanceOf(Date);
  });

  it("rejects a join that is missing required fields", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send({ locationId: location.id, firstName: "Ada" });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it("rejects an unknown notification method", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(joinPayload(location.id, { notificationMethod: "carrier-pigeon" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/notification method/i);
  });

  it("requires an email when the notification method is email", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(joinPayload(location.id, { email: undefined }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("requires SMS consent before joining by SMS", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue`)
      .send(
        joinPayload(location.id, {
          notificationMethod: "sms",
          phoneNumber: "5551234567",
          countryCode: "+1",
          email: undefined,
          smsConsent: false,
        }),
      );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/consent/i);
  });

  it("rejects a join for an unknown business", async () => {
    const { location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/auth/business/no-such-business/queue")
      .send(joinPayload(location.id));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("queue transitions", () => {
  it("moves a WAITING entry to ADMITTED and rejects a repeat admit", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);
    const cookie = businessCookie(business.id);

    const first = await (await api())
      .post(`/auth/business/${business.username}/queue/${entry.legacyKey}/admit`)
      .set("Cookie", cookie);

    expect(first.status).toBe(200);

    const afterAdmit = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(afterAdmit?.status).toBe("ADMITTED");
    expect(afterAdmit?.admittedAt).toBeInstanceOf(Date);

    const second = await (await api())
      .post(`/auth/business/${business.username}/queue/${entry.legacyKey}/admit`)
      .set("Cookie", cookie);

    expect(second.status).toBe(404);

    const afterRepeat = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(afterRepeat?.status).toBe("ADMITTED");
    expect(afterRepeat?.admittedAt?.getTime()).toBe(afterAdmit?.admittedAt?.getTime());
  });

  it("returns 404 for a queue entry that does not exist", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/auth/business/${business.username}/queue/missing-key/admit`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated admit attempt", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);

    const res = await (await api()).post(
      `/auth/business/${business.username}/queue/${entry.legacyKey}/admit`,
    );

    expect(res.status).toBe(401);

    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("WAITING");
  });
});

describe("queue status lookup", () => {
  it("reports live status for a queue token", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);

    const res = await (await api()).get(
      `/auth/business/${business.username}/queue/token/${entry.queueToken}/status`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("reports an unknown token as an expired session without leaking existence", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api()).get(
      `/auth/business/${business.username}/queue/token/not-a-real-token/status`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ admitted: false, removed: false });
    expect(res.body.message).toMatch(/not found or expired/i);
  });

  it("rejects a status lookup for an unknown business", async () => {
    const res = await (await api()).get(
      "/auth/business/no-such-business/queue/token/whatever/status",
    );

    expect(res.status).toBe(404);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { businessCookie } from "../helpers/auth.js";
import { seedBusinessWithLocation, seedQueueEntry, uniqueSuffix } from "../helpers/seed.js";
import { tryReserveCapacity } from "../../server/lib/reservationCapacity.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("reservation capacity invariant", () => {
  it("never lets concurrent bookings exceed the hourly cap", async () => {
    const { location } = await seedBusinessWithLocation();
    const dateKey = "2026-07-01";
    const hour = 19;
    const cap = 10;

    await db.slotCounter.create({
      data: { locationId: location.id, dateKey, hour, reservedGuests: 8 },
    });

    const results = await Promise.allSettled([
      tryReserveCapacity(location.id, dateKey, hour, 2, cap),
      tryReserveCapacity(location.id, dateKey, hour, 2, cap),
    ]);

    const granted = results.filter((r) => {
      return r.status === "fulfilled" && r.value === true;
    });

    expect(granted).toHaveLength(1);

    const counter = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey, hour },
    });
    expect(counter?.reservedGuests).toBe(10);
    expect(counter?.reservedGuests).toBeLessThanOrEqual(cap);
  });

  it("holds the cap under a larger burst of concurrent requests", async () => {
    const { location } = await seedBusinessWithLocation();
    const dateKey = "2026-07-02";
    const hour = 20;
    const cap = 10;

    const attempts = [];
    for (let i = 0; i < 8; i++) {
      attempts.push(tryReserveCapacity(location.id, dateKey, hour, 3, cap));
    }
    const results = await Promise.allSettled(attempts);

    const granted = results.filter((r) => {
      return r.status === "fulfilled" && r.value === true;
    });

    expect(granted.length).toBe(3);

    const counter = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey, hour },
    });
    expect(counter?.reservedGuests).toBeLessThanOrEqual(cap);
    expect(counter?.reservedGuests).toBe(9);
  });

  it("refuses a single party larger than the cap without mutating the counter", async () => {
    const { location } = await seedBusinessWithLocation();

    const granted = await tryReserveCapacity(location.id, "2026-07-03", 18, 25, 10);

    expect(granted).toBe(false);
    const counter = await db.slotCounter.findFirst({
      where: { locationId: location.id, dateKey: "2026-07-03", hour: 18 },
    });
    expect(counter?.reservedGuests ?? 0).toBe(0);
  });
});

describe("queue admit invariant", () => {
  it("admits a waiting entry exactly once under concurrent attempts", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const entry = await seedQueueEntry(location);
    const cookie = businessCookie(business.id);
    const agent = await api();
    const url = `/auth/business/${business.username}/queue/${entry.legacyKey}/admit`;

    const results = await Promise.allSettled([
      agent.post(url).set("Cookie", cookie),
      agent.post(url).set("Cookie", cookie),
    ]);

    const statuses = results.map((r) => {
      if (r.status === "fulfilled") {
        return r.value.status;
      }
      return 0;
    });

    const successes = statuses.filter((s) => {
      return s === 200;
    });
    expect(successes).toHaveLength(1);

    const stored = await db.queueEntry.findUnique({ where: { id: entry.id } });
    expect(stored?.status).toBe("ADMITTED");
    expect(stored?.admittedAt).toBeInstanceOf(Date);
  });
});

describe("credit accounting invariant", () => {
  it("never drives a location's credit balance below zero", async () => {
    const { business, location } = await seedBusinessWithLocation({ credits: 1 });
    const agent = await api();

    function payload() {
      const suffix = uniqueSuffix();
      return {
        locationId: location.id,
        firstName: "Race",
        lastName: suffix,
        numGuests: 2,
        notificationMethod: "email",
        email: `race-${suffix}@test.invalid`,
      };
    }

    const results = await Promise.allSettled([
      agent.post(`/auth/business/${business.username}/queue`).send(payload()),
      agent.post(`/auth/business/${business.username}/queue`).send(payload()),
      agent.post(`/auth/business/${business.username}/queue`).send(payload()),
    ]);

    const succeeded = results.filter((r) => {
      return r.status === "fulfilled" && r.value.status === 200;
    });

    expect(succeeded).toHaveLength(1);

    const after = await db.location.findUnique({ where: { id: location.id } });
    expect(after?.credits).toBe(0);
    expect(after?.credits).toBeGreaterThanOrEqual(0);
  });

  it("charges exactly one credit per successful join", async () => {
    const { business, location } = await seedBusinessWithLocation({ credits: 5 });
    const agent = await api();

    const joins = [];
    for (let i = 0; i < 3; i++) {
      const suffix = uniqueSuffix();
      joins.push(
        agent.post(`/auth/business/${business.username}/queue`).send({
          locationId: location.id,
          firstName: "Charge",
          lastName: suffix,
          numGuests: 2,
          notificationMethod: "email",
          email: `charge-${suffix}@test.invalid`,
        }),
      );
    }
    const results = await Promise.allSettled(joins);
    const succeeded = results.filter((r) => {
      return r.status === "fulfilled" && r.value.status === 200;
    });

    const after = await db.location.findUnique({ where: { id: location.id } });
    expect(after?.credits).toBe(5 - succeeded.length);
  });
});

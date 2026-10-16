import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import { clearTestDatabase } from "../helpers/db.js";
import { seedBusiness, seedLocation, seedQueueEntry, seedReservation } from "../helpers/seed.js";

beforeEach(clearTestDatabase);

describe("business session credit policy and live data", () => {
  it.each([
    { trial: true, age: 30, expectedCredits: 0 },
    { trial: true, age: 1, expectedCredits: 500 },
    { trial: false, age: 30, expectedCredits: 500 },
  ])(
    "keeps authoritative credits and active operational data: %o",
    async ({ trial, age, expectedCredits }) => {
      const business = await seedBusiness({
        trial,
        createdAt: new Date(Date.now() - age * 86400000),
      });
      const location = await seedLocation(business.id, business.username);
      const cookie = businessCookie(business.id);
      const agent = await api();
      const initial = await agent.get("/auth/business/me").set("Cookie", cookie);
      expect(initial.status).toBe(200);
      expect(initial.body.user.trial).toBe(trial);
      expect(initial.body.user.locations[0].credits).toBe(expectedCredits);
      expect(initial.body.user.locations[0].queue).toHaveLength(0);
      expect(initial.body.user.locations[0].reservations).toHaveLength(0);
      await seedQueueEntry(location);
      await seedReservation(location);
      const refreshed = await agent.get("/auth/business/me").set("Cookie", cookie);
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.user.locations[0].queue).toHaveLength(1);
      expect(refreshed.body.user.locations[0].reservations).toHaveLength(1);
      expect(refreshed.body.user.locations[0].credits).toBe(expectedCredits);
    },
  );
});

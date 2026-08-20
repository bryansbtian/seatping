import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Business, Location } from "@prisma/client";
import { api } from "../helpers/app.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { seedBusinessWithLocation, seedReservation } from "../helpers/seed.js";
import { syncGuestFromReservation } from "../../server/lib/guests.js";

const db = getTestPrisma();

const CANONICAL = "6281234567890";

let ipCounter = 0;

function freshIp(): string {
  ipCounter += 1;
  return `198.18.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

async function joinQueueByWhatsApp(
  business: Business,
  location: Location,
  phoneNumber: string,
  countryCode: string,
) {
  return (await api())
    .post(`/auth/business/${business.username}/queue`)
    .set("X-Forwarded-For", freshIp())
    .send({
      locationId: location.id,
      firstName: "Ada",
      lastName: "Lovelace",
      numGuests: 2,
      notificationMethod: "whatsapp",
      phoneNumber,
      countryCode,
    });
}

async function guestsForLocation(locationId: string) {
  return db.guestProfile.findMany({ where: { locationId } });
}

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("guest deduplication across phone representations", () => {
  it("keeps one profile when the same number is entered with and without the trunk prefix", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const withTrunk = await joinQueueByWhatsApp(business, location, "081234567890", "+62");
    const withoutTrunk = await joinQueueByWhatsApp(business, location, "81234567890", "+62");

    expect(withTrunk.status).toBe(200);
    expect(withoutTrunk.status).toBe(200);

    const guests = await guestsForLocation(location.id);
    expect(guests).toHaveLength(1);
    expect(guests[0].normalizedPhone).toBe(CANONICAL);
    expect(guests[0].sourceQueueEntryIds).toHaveLength(2);
  });

  it("keeps one profile when a queue visit and a reservation use different formats", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const joined = await joinQueueByWhatsApp(business, location, "081234567890", "+62");
    expect(joined.status).toBe(200);

    const reservation = await seedReservation(location, {
      phone: "+6281234567890",
      countryCode: "",
      contactMethod: "whatsapp",
    });
    await syncGuestFromReservation(reservation, {
      businessUsername: business.username,
    });

    const guests = await guestsForLocation(location.id);
    expect(guests).toHaveLength(1);
    expect(guests[0].normalizedPhone).toBe(CANONICAL);
    expect(guests[0].sourceQueueEntryIds).toHaveLength(1);
    expect(guests[0].sourceReservationIds).toEqual([reservation.id]);
  });

  it("keeps one profile for a spaced and a hyphenated entry of the same number", async () => {
    const { business, location } = await seedBusinessWithLocation();

    await joinQueueByWhatsApp(business, location, "0812 3456 7890", "+62");
    await joinQueueByWhatsApp(business, location, "812-3456-7890", "+62");

    const guests = await guestsForLocation(location.id);
    expect(guests).toHaveLength(1);
    expect(guests[0].normalizedPhone).toBe(CANONICAL);
  });

  it("still separates two genuinely different guests", async () => {
    const { business, location } = await seedBusinessWithLocation();

    await joinQueueByWhatsApp(business, location, "081234567890", "+62");
    await joinQueueByWhatsApp(business, location, "081299998888", "+62");

    const guests = await guestsForLocation(location.id);
    expect(guests).toHaveLength(2);
    const stored = guests.map((g) => {
      return g.normalizedPhone;
    });
    expect(stored).toContain(CANONICAL);
    expect(stored).toContain("6281299998888");
  });

  it("keeps guests separate across locations of the same business", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const other = await db.location.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        name: "Second",
        address: "2 Test Street",
        credits: 500,
        queueEnabled: true,
      },
    });

    await joinQueueByWhatsApp(business, location, "081234567890", "+62");
    await joinQueueByWhatsApp(business, other, "81234567890", "+62");

    expect(await guestsForLocation(location.id)).toHaveLength(1);
    expect(await guestsForLocation(other.id)).toHaveLength(1);
  });
});

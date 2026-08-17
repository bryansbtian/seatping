import { beforeEach, describe, expect, it, vi } from "vitest";

const businessFindUnique = vi.fn();
const locationFindMany = vi.fn();
const queueEntryFindMany = vi.fn();
const reservationFindMany = vi.fn();
const guestProfileFindMany = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      business: { findUnique: businessFindUnique },
      location: { findMany: locationFindMany },
      queueEntry: { findMany: queueEntryFindMany },
      reservation: { findMany: reservationFindMany },
      guestProfile: { findMany: guestProfileFindMany },
    },
  };
});

const {
  assembleBusinessMe,
  augmentLocationWithLiveLists,
  loadLocationLiveLists,
  serializeLocation,
  serializePhoto,
} = await import("../../server/lib/business.js");

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `qe-${Math.random()}`,
    queueToken: `qt-${Math.random()}`,
    locationId: "loc-1",
    businessId: "biz-1",
    firstName: "Ada",
    lastName: "Lovelace",
    guestCount: 2,
    notificationMethod: "email",
    email: "ada@test.invalid",
    phone: null,
    countryCode: null,
    status: "WAITING",
    joinedAt: new Date("2026-08-12T18:00:00.000Z"),
    admittedAt: null,
    arrivedAt: null,
    noShowAt: null,
    removedAt: null,
    leftAt: null,
    finalStatus: null,
    customerId: null,
    smsConsent: null,
    smsMarketingConsent: null,
    ...overrides,
  };
}

function reservationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `res-${Math.random()}`,
    manageToken: "mt-1",
    locationId: "loc-1",
    businessId: "biz-1",
    businessUsername: "bistro",
    firstName: "Grace",
    lastName: "Hopper",
    guestCount: 4,
    email: "grace@test.invalid",
    phone: null,
    countryCode: null,
    reservationDateTime: "2026-08-12T19:00",
    status: "CONFIRMED",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function businessRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz-1",
    name: "Bistro",
    email: "owner@test.invalid",
    username: "bistro",
    phone: "+15550000000",
    trial: false,
    trialDurationDays: 7,
    maxLocations: 3,
    baseCredits: 300,
    language: "id",
    lastCreditRefillAt: null,
    nextCreditRefillAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  businessFindUnique.mockReset().mockResolvedValue(businessRow());
  locationFindMany.mockReset().mockResolvedValue([]);
  queueEntryFindMany.mockReset().mockResolvedValue([]);
  reservationFindMany.mockReset().mockResolvedValue([]);
  guestProfileFindMany.mockReset().mockResolvedValue([]);
});

describe("serializePhoto", () => {
  it("exposes the stored fields and defaults the alt text", () => {
    expect(
      serializePhoto({
        id: "p1",
        url: "https://test.invalid/p.jpg",
        publicId: "pid",
        createdAt: null,
      }),
    ).toEqual({
      id: "p1",
      url: "https://test.invalid/p.jpg",
      publicId: "pid",
      altText: null,
      createdAt: null,
    });
  });

  it("keeps alt text when it is set", () => {
    expect(serializePhoto({ altText: "Dining room" }).altText).toBe(
      "Dining room",
    );
  });
});

describe("serializeLocation", () => {
  it("fills in empty live lists when none are supplied", () => {
    const out = serializeLocation({ id: "loc-1" });

    expect(out.queue).toEqual([]);
    expect(out.admittedCustomers).toEqual([]);
    expect(out.removedCustomers).toEqual([]);
    expect(out.reservations).toEqual([]);
  });

  it("uses the live lists it is given", () => {
    const out = serializeLocation(
      { id: "loc-1" },
      {
        queue: [{ id: "q" }],
        admittedCustomers: [{ id: "a" }],
        removedCustomers: [{ id: "r" }],
        reservations: [{ id: "res" }],
      },
    );

    expect(out.queue).toHaveLength(1);
    expect(out.reservations).toHaveLength(1);
  });

  it("defaults every optional field for a bare location", () => {
    const out = serializeLocation({ id: "loc-1" });

    expect(out.name).toBeNull();
    expect(out.displayName).toBeNull();
    expect(out.address).toBe("");
    expect(out.area).toBeNull();
    expect(out.city).toBeNull();
    expect(out.country).toBeNull();
    expect(out.latitude).toBeNull();
    expect(out.longitude).toBeNull();
    expect(out.googlePlaceId).toBeNull();
    expect(out.googleMapsUrl).toBeNull();
    expect(out.credits).toBe(0);
    expect(out.queueEnabled).toBe(true);
    expect(out.reservationsEnabled).toBe(true);
    expect(out.reservationSettings).toEqual({});
    expect(out.restaurantProfile).toEqual({});
    expect(out.bannerImageUrl).toBeNull();
    expect(out.bannerImagePublicId).toBeNull();
    expect(out.photos).toEqual([]);
  });

  it("keeps the stored values when they are present", () => {
    const out = serializeLocation({
      id: "loc-1",
      name: "Bistro Downtown",
      displayName: "Downtown",
      address: "1 Test Street",
      area: "Kemang",
      city: "Jakarta",
      country: "Indonesia",
      latitude: -6.2,
      longitude: 106.8,
      googlePlaceId: "place-1",
      googleMapsUrl: "https://maps.test.invalid/1",
      credits: 120,
      queueEnabled: false,
      reservationsEnabled: false,
      reservationSettings: { maxPartySize: 8 },
      restaurantProfile: { displayName: "Warung" },
      bannerImageUrl: "https://test.invalid/b.jpg",
      bannerImagePublicId: "bid",
      photos: [{ id: "p1", url: "u", publicId: "pid" }],
    });

    expect(out.latitude).toBe(-6.2);
    expect(out.longitude).toBe(106.8);
    expect(out.credits).toBe(120);
    expect(out.queueEnabled).toBe(false);
    expect(out.reservationsEnabled).toBe(false);
    expect(out.reservationSettings).toEqual({ maxPartySize: 8 });
    expect(out.photos).toHaveLength(1);
    expect(out.photos[0].altText).toBeNull();
  });

  it("nulls coordinates and credits that are not numbers", () => {
    const out = serializeLocation({
      id: "loc-1",
      latitude: "-6.2",
      longitude: null,
      credits: "many",
      photos: "not a list",
    });

    expect(out.latitude).toBeNull();
    expect(out.longitude).toBeNull();
    expect(out.credits).toBe(0);
    expect(out.photos).toEqual([]);
  });
});

describe("loadLocationLiveLists", () => {
  it("splits the stored rows into live lists", async () => {
    queueEntryFindMany.mockResolvedValue([
      queueRow({ status: "WAITING" }),
      queueRow({ status: "ADMITTED", admittedAt: new Date() }),
      queueRow({ status: "LEFT", leftAt: new Date() }),
    ]);
    reservationFindMany.mockResolvedValue([reservationRow()]);

    const live = await loadLocationLiveLists("loc-1", "bistro");

    expect(live.queue).toHaveLength(1);
    expect(live.admittedCustomers).toHaveLength(1);
    expect(live.removedCustomers).toHaveLength(1);
    expect(live.reservations).toHaveLength(1);
    expect(live.reservations[0].manageToken).toBe("mt-1");
    expect(live.queue[0].businessUsername).toBe("bistro");
  });

  it("returns empty lists when the location has no activity", async () => {
    const live = await loadLocationLiveLists("loc-1");

    expect(live).toEqual({
      queue: [],
      admittedCustomers: [],
      removedCustomers: [],
      reservations: [],
    });
  });

  it("merges the live lists onto the location it augments", async () => {
    queueEntryFindMany.mockResolvedValue([queueRow()]);

    const out = await augmentLocationWithLiveLists({
      id: "loc-1",
      businessUsername: "bistro",
      name: "Downtown",
    });

    expect(out.name).toBe("Downtown");
    expect(out.queue).toHaveLength(1);
  });
});

describe("assembleBusinessMe", () => {
  it("reports nothing for an unknown business", async () => {
    businessFindUnique.mockResolvedValue(null);

    await expect(assembleBusinessMe("biz-missing")).resolves.toBeNull();
    expect(locationFindMany).not.toHaveBeenCalled();
  });

  it("keeps the stored language", async () => {
    const me = await assembleBusinessMe("biz-1");

    expect(me?.language).toBe("id");
  });

  it("defaults the language to English", async () => {
    businessFindUnique.mockResolvedValue(businessRow({ language: null }));

    const me = await assembleBusinessMe("biz-1");

    expect(me?.language).toBe("en");
  });

  it("serialises a business with no locations", async () => {
    const me = await assembleBusinessMe("biz-1");

    expect(me?.locations).toEqual([]);
    expect(me?.username).toBe("bistro");
  });

  it("groups the queue and reservation rows onto their own locations", async () => {
    locationFindMany.mockResolvedValue([
      { id: "loc-1", name: "Downtown", photos: [] },
      { id: "loc-2", name: "Uptown", photos: [] },
    ]);
    queueEntryFindMany.mockResolvedValue([
      queueRow({ locationId: "loc-1" }),
      queueRow({ locationId: "loc-1" }),
      queueRow({ locationId: "loc-2" }),
    ]);
    reservationFindMany.mockResolvedValue([
      reservationRow({ locationId: "loc-2" }),
    ]);

    const me = await assembleBusinessMe("biz-1");

    expect(me?.locations[0].queue).toHaveLength(2);
    expect(me?.locations[0].reservations).toHaveLength(0);
    expect(me?.locations[1].queue).toHaveLength(1);
    expect(me?.locations[1].reservations).toHaveLength(1);
  });

  it("leaves a location with no rows with empty lists", async () => {
    locationFindMany.mockResolvedValue([
      { id: "loc-1", name: "Downtown", photos: [] },
    ]);
    queueEntryFindMany.mockResolvedValue([queueRow({ locationId: "loc-other" })]);

    const me = await assembleBusinessMe("biz-1");

    expect(me?.locations[0].queue).toEqual([]);
    expect(me?.locations[0].reservations).toEqual([]);
  });

  it("stamps a returning guest badge onto queue entries by email", async () => {
    locationFindMany.mockResolvedValue([
      { id: "loc-1", name: "Downtown", photos: [] },
    ]);
    queueEntryFindMany.mockResolvedValue([
      queueRow({ email: "ada@test.invalid" }),
    ]);
    guestProfileFindMany.mockResolvedValue([
      {
        normalizedPhone: null,
        normalizedEmail: "ada@test.invalid",
        totalVisits: 6,
      },
    ]);

    const me = await assembleBusinessMe("biz-1");

    expect(me?.locations[0].queue[0].guestVisits).toBe(6);
    expect(me?.locations[0].queue[0].isReturning).toBe(true);
  });

  it("stamps a badge onto an admitted entry by phone number", async () => {
    locationFindMany.mockResolvedValue([
      { id: "loc-1", name: "Downtown", photos: [] },
    ]);
    queueEntryFindMany.mockResolvedValue([
      queueRow({
        status: "ADMITTED",
        admittedAt: new Date(),
        email: null,
        phone: "81234567890",
        countryCode: "+62",
      }),
    ]);
    guestProfileFindMany.mockResolvedValue([
      {
        normalizedPhone: "6281234567890",
        normalizedEmail: null,
        totalVisits: 3,
      },
    ]);

    const me = await assembleBusinessMe("biz-1");

    expect(me?.locations[0].admittedCustomers[0].guestVisits).toBe(3);
    expect(me?.locations[0].admittedCustomers[0].isReturning).toBe(true);
  });

  it("stamps a badge onto reservations using the reservation phone field", async () => {
    locationFindMany.mockResolvedValue([
      { id: "loc-1", name: "Downtown", photos: [] },
    ]);
    reservationFindMany.mockResolvedValue([
      reservationRow({ email: "grace@test.invalid" }),
    ]);
    guestProfileFindMany.mockResolvedValue([
      {
        normalizedPhone: null,
        normalizedEmail: "grace@test.invalid",
        totalVisits: 1,
      },
    ]);

    const me = await assembleBusinessMe("biz-1");

    expect(me?.locations[0].reservations[0].guestVisits).toBe(1);
    expect(me?.locations[0].reservations[0].isReturning).toBe(false);
  });

  it("reports no visits for a guest it has never seen", async () => {
    locationFindMany.mockResolvedValue([
      { id: "loc-1", name: "Downtown", photos: [] },
    ]);
    queueEntryFindMany.mockResolvedValue([queueRow()]);
    reservationFindMany.mockResolvedValue([reservationRow()]);

    const me = await assembleBusinessMe("biz-1");

    expect(me?.locations[0].queue[0].guestVisits).toBe(0);
    expect(me?.locations[0].queue[0].isReturning).toBe(false);
    expect(me?.locations[0].reservations[0].guestVisits).toBe(0);
  });

  it("leaves removed customers unbadged", async () => {
    locationFindMany.mockResolvedValue([
      { id: "loc-1", name: "Downtown", photos: [] },
    ]);
    queueEntryFindMany.mockResolvedValue([
      queueRow({ status: "REMOVED", removedAt: new Date() }),
    ]);

    const me = await assembleBusinessMe("biz-1");

    expect(me?.locations[0].removedCustomers[0].guestVisits).toBeUndefined();
  });
});

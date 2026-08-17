import bcrypt from "bcrypt";
import crypto, { randomUUID } from "node:crypto";
import type {
  Business,
  Location,
  PrismaClient,
  QueueEntry,
  Reservation,
  User,
} from "@prisma/client";

export const E2E_PASSWORD = "E2ePassw0rd!";

let cachedHash: string | null = null;

async function passwordHash(): Promise<string> {
  if (!cachedHash) {
    cachedHash = await bcrypt.hash(E2E_PASSWORD, 10);
  }
  return cachedHash;
}

export function uniqueId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

export function legacyKeyOf(
  firstName: string,
  lastName: string,
  joinedAt: Date,
): string {
  return `${firstName}${lastName}${joinedAt.toISOString()}`;
}

export const DEFAULT_RESERVATION_SETTINGS = {
  reservationStartTime: "09:00",
  reservationEndTime: "22:00",
  maxPartySize: 10,
  maxReservedGuestsPerHour: 20,
  bookingWindowDays: 30,
  minNoticeMinutes: 0,
  confirmationMode: "auto",
  cancellationPolicy: "",
};

type Overrides = Record<string, unknown>;

function defaultReservationDateTime(): string {
  const at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const day = String(at.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}T19:00`;
}

export class TestData {
  private readonly businessIds: string[] = [];
  private readonly userIds: string[] = [];

  constructor(readonly prisma: PrismaClient) {}

  async createBusiness(overrides: Overrides = {}): Promise<Business> {
    const id = uniqueId();
    const business = await this.prisma.business.create({
      data: {
        name: `E2E Business ${id}`,
        username: `e2e-business-${id}`,
        email: `e2e-business-${id}@test.invalid`,
        phone: "+15550000000",
        password: await passwordHash(),
        trial: false,
        maxLocations: 5,
        baseCredits: 300,
        ...overrides,
      } as never,
    });
    this.businessIds.push(business.id);
    return business;
  }

  async createCustomer(overrides: Overrides = {}): Promise<User> {
    const id = uniqueId();
    const user = await this.prisma.user.create({
      data: {
        name: `E2E Customer ${id}`,
        username: `e2e-customer-${id}`,
        email: `e2e-customer-${id}@test.invalid`,
        phone: "+15551110000",
        password: await passwordHash(),
        ...overrides,
      } as never,
    });
    this.userIds.push(user.id);
    return user;
  }

  async createLocation(
    business: Pick<Business, "id" | "username">,
    overrides: Overrides = {},
  ): Promise<Location> {
    const id = uniqueId();
    return this.prisma.location.create({
      data: {
        businessId: business.id,
        businessUsername: business.username,
        name: `E2E Location ${id}`,
        displayName: `E2E Location ${id}`,
        address: `${id} Playwright Street, Jakarta`,
        credits: 500,
        queueEnabled: true,
        reservationsEnabled: true,
        isPublished: true,
        reservationSettings: DEFAULT_RESERVATION_SETTINGS,
        restaurantProfile: {},
        ...overrides,
      } as never,
    });
  }

  async createBusinessWithLocation(
    locationOverrides: Overrides = {},
    businessOverrides: Overrides = {},
  ): Promise<{ business: Business; location: Location }> {
    const business = await this.createBusiness(businessOverrides);
    const location = await this.createLocation(business, locationOverrides);
    return { business, location };
  }

  async createQueueEntry(
    location: Pick<Location, "id" | "businessId">,
    overrides: Overrides = {},
  ): Promise<QueueEntry> {
    const id = uniqueId();
    const joinedAt = (overrides.joinedAt as Date) ?? new Date();
    const firstName = (overrides.firstName as string) ?? "Queue";
    const lastName = (overrides.lastName as string) ?? `Guest${id}`;
    return this.prisma.queueEntry.create({
      data: {
        queueToken: crypto.randomBytes(16).toString("hex"),
        legacyKey: legacyKeyOf(firstName, lastName, joinedAt),
        locationId: location.id,
        businessId: location.businessId,
        guestCount: 2,
        notificationMethod: "email",
        email: `e2e-queue-${id}@test.invalid`,
        countryCode: "+1",
        status: "WAITING",
        ...overrides,
        firstName,
        lastName,
        joinedAt,
      } as never,
    });
  }

  async createReservation(
    location: Pick<Location, "id" | "businessId" | "businessUsername">,
    overrides: Overrides = {},
  ): Promise<Reservation> {
    const id = uniqueId();
    return this.prisma.reservation.create({
      data: {
        manageToken: crypto.randomBytes(24).toString("hex"),
        locationId: location.id,
        businessId: location.businessId,
        businessUsername: location.businessUsername,
        firstName: "Res",
        lastName: `Guest${id}`,
        name: `Res Guest${id}`,
        guestCount: 2,
        email: `e2e-reservation-${id}@test.invalid`,
        contactMethod: "email",
        status: "CONFIRMED",
        source: "seatping_public",
        reservationDateTime: defaultReservationDateTime(),
        ...overrides,
      } as never,
    });
  }

  async cleanup(): Promise<void> {
    const db = this.prisma;
    if (this.businessIds.length > 0) {
      const businessId = { in: this.businessIds };
      const locations = await db.location.findMany({
        where: { businessId },
        select: { id: true },
      });
      const locationIds = locations.map((l) => l.id);
      const campaigns = await db.campaign.findMany({
        where: { businessId },
        select: { id: true },
      });
      const campaignIds = campaigns.map((c) => c.id);

      if (campaignIds.length > 0) {
        await db.campaignDeliveryLog.deleteMany({
          where: { campaignId: { in: campaignIds } },
        });
      }
      await db.campaignRecipient.deleteMany({ where: { businessId } });
      await db.campaignRun.deleteMany({ where: { businessId } });
      await db.campaign.deleteMany({ where: { businessId } });
      await db.campaignTemplate.deleteMany({ where: { businessId } });
      await db.savedAudience.deleteMany({ where: { businessId } });
      if (locationIds.length > 0) {
        const locationId = { in: locationIds };
        await db.slotCounter.deleteMany({ where: { locationId } });
        await db.review.deleteMany({ where: { locationId } });
        await db.photo.deleteMany({ where: { locationId } });
      }
      await db.featuredRestaurant.deleteMany({ where: { businessId } });
      await db.reservation.deleteMany({ where: { businessId } });
      await db.queueEntry.deleteMany({ where: { businessId } });
      await db.guestProfile.deleteMany({ where: { businessId } });
      await db.location.deleteMany({ where: { businessId } });
      await db.business.deleteMany({ where: { id: businessId } });
      this.businessIds.length = 0;
    }

    if (this.userIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: this.userIds } } });
      this.userIds.length = 0;
    }
  }
}

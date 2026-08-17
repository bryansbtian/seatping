import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import type { Business, Location, QueueEntry, Reservation, User } from "@prisma/client";
import { getTestPrisma } from "./db.js";

export const TEST_PASSWORD = "TestPassw0rd!";

let hashedPassword: string | null = null;

async function testPasswordHash(): Promise<string> {
  if (!hashedPassword) {
    hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
  }
  return hashedPassword;
}

export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

export async function seedBusiness(
  overrides: Partial<Business> = {},
): Promise<Business> {
  const db = getTestPrisma();
  const suffix = uniqueSuffix();
  return db.business.create({
    data: {
      name: `Test Business ${suffix}`,
      username: `biz-${suffix}`,
      email: `biz-${suffix}@test.invalid`,
      phone: "+15550000000",
      password: await testPasswordHash(),
      trial: false,
      maxLocations: 5,
      baseCredits: 300,
      ...overrides,
    },
  });
}

export async function seedCustomer(overrides: Partial<User> = {}): Promise<User> {
  const db = getTestPrisma();
  const suffix = uniqueSuffix();
  return db.user.create({
    data: {
      name: `Test Customer ${suffix}`,
      username: `cust-${suffix}`,
      email: `cust-${suffix}@test.invalid`,
      phone: "+15551110000",
      password: await testPasswordHash(),
      ...overrides,
    },
  });
}

export type SeedLocationOptions = Partial<Location> & {
  reservationSettings?: Record<string, unknown>;
};

export async function seedLocation(
  businessId: string,
  businessUsername: string,
  overrides: SeedLocationOptions = {},
): Promise<Location> {
  const db = getTestPrisma();
  const suffix = uniqueSuffix();
  const { reservationSettings, ...rest } = overrides;
  return db.location.create({
    data: {
      businessId,
      businessUsername,
      name: `Location ${suffix}`,
      displayName: `Location ${suffix}`,
      address: `${suffix} Test Street`,
      credits: 500,
      queueEnabled: true,
      reservationsEnabled: true,
      isPublished: true,
      reservationSettings: (reservationSettings ?? {
        reservationStartTime: "09:00",
        reservationEndTime: "22:00",
        maxPartySize: 10,
        maxReservedGuestsPerHour: 20,
        bookingWindowDays: 30,
        minNoticeMinutes: 0,
        confirmationMode: "auto",
        cancellationPolicy: "",
      }) as object,
      ...rest,
    },
  });
}

export async function seedQueueEntry(
  location: Pick<Location, "id" | "businessId">,
  overrides: Partial<QueueEntry> = {},
): Promise<QueueEntry> {
  const db = getTestPrisma();
  const suffix = uniqueSuffix();
  return db.queueEntry.create({
    data: {
      queueToken: `qt-${suffix}`,
      legacyKey: `lk-${suffix}`,
      locationId: location.id,
      businessId: location.businessId,
      firstName: "Queue",
      lastName: suffix,
      guestCount: 2,
      notificationMethod: "email",
      email: `queue-${suffix}@test.invalid`,
      joinedAt: new Date(),
      ...overrides,
    },
  });
}

export async function seedReservation(
  location: Pick<Location, "id" | "businessId" | "businessUsername">,
  overrides: Partial<Reservation> = {},
): Promise<Reservation> {
  const db = getTestPrisma();
  const suffix = uniqueSuffix();
  return db.reservation.create({
    data: {
      manageToken: `mt-${suffix}`,
      locationId: location.id,
      businessId: location.businessId,
      businessUsername: location.businessUsername,
      firstName: "Res",
      lastName: suffix,
      guestCount: 2,
      email: `res-${suffix}@test.invalid`,
      reservationDateTime: futureReservationDateTime(),
      ...overrides,
    },
  });
}

export function futureReservationDateTime(hour = 12, daysAhead = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:00`;
}

export async function seedBusinessWithLocation(
  locationOverrides: SeedLocationOptions = {},
): Promise<{ business: Business; location: Location }> {
  const business = await seedBusiness();
  const location = await seedLocation(
    business.id,
    business.username,
    locationOverrides,
  );
  return { business, location };
}

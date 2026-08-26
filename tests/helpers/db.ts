import { PrismaClient } from "@prisma/client";
import { appDatabaseUrlForSafetyCheck } from "./loadTestEnv.js";

const PRODUCTION_HOST_MARKERS = ["mongodb.net", "mongodb+srv", "prod", "production"];

const REQUIRED_TEST_MARKERS = ["test"];

export class UnsafeTestDatabaseError extends Error {}

let approvedUrl: string | null = null;

export function resetApprovedTestDatabaseUrl(): void {
  approvedUrl = null;
}

export function assertSafeTestDatabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl || !rawUrl.trim()) {
    throw new UnsafeTestDatabaseError(
      "TEST_DATABASE_URL is not set. Database-backed tests require an explicit " +
        "test database. They never fall back to DATABASE_URL.",
    );
  }

  const url = rawUrl.trim();

  if (approvedUrl === url) {
    return url;
  }

  const appUrl = appDatabaseUrlForSafetyCheck();
  if (appUrl && url === appUrl.trim()) {
    throw new UnsafeTestDatabaseError(
      "TEST_DATABASE_URL is identical to DATABASE_URL. Refusing to run " +
        "destructive tests against the application database.",
    );
  }

  const lower = url.toLowerCase();
  for (const marker of PRODUCTION_HOST_MARKERS) {
    if (lower.includes(marker)) {
      throw new UnsafeTestDatabaseError(
        `TEST_DATABASE_URL looks like a production target (matched "${marker}"). ` +
          "Use a local or dedicated test MongoDB instead.",
      );
    }
  }

  const dbName = databaseNameFromUrl(url);
  if (!dbName) {
    throw new UnsafeTestDatabaseError("TEST_DATABASE_URL must include an explicit database name.");
  }

  const hasTestMarker = REQUIRED_TEST_MARKERS.some((marker) => {
    return dbName.toLowerCase().includes(marker);
  });
  if (!hasTestMarker) {
    throw new UnsafeTestDatabaseError(
      `TEST_DATABASE_URL database name "${dbName}" must contain "test" so a ` +
        "production database can never be selected by accident.",
    );
  }

  approvedUrl = url;
  return url;
}

export function databaseNameFromUrl(url: string): string | null {
  const withoutQuery = url.split("?")[0];
  const lastSlash = withoutQuery.lastIndexOf("/");
  if (lastSlash === -1) {
    return null;
  }
  const name = withoutQuery.slice(lastSlash + 1);
  if (!name) {
    return null;
  }
  return name;
}

let client: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (client) {
    return client;
  }
  const url = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  client = new PrismaClient({
    datasourceUrl: url,
    log: ["error"],
  });
  return client;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (!client) {
    return;
  }
  await client.$disconnect();
  client = null;
}

const CLEAR_ORDER = [
  "tableAssignment",
  "floorZone",
  "diningTable",
  "floorPlan",
  "campaignDeliveryLog",
  "campaignRecipient",
  "campaignRun",
  "campaign",
  "campaignTemplate",
  "savedAudience",
  "slotCounter",
  "reservation",
  "queueEntry",
  "guestProfile",
  "review",
  "photo",
  "featuredRestaurant",
  "ticket",
  "location",
  "business",
  "user",
] as const;

export async function clearTestDatabase(): Promise<void> {
  const db = getTestPrisma();
  for (const model of CLEAR_ORDER) {
    const delegate = db[model] as { deleteMany: () => Promise<unknown> };
    await delegate.deleteMany();
  }
}

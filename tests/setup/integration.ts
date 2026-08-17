import bcrypt from "bcrypt";
import { afterAll, beforeEach } from "vitest";
import { TEST_ADMIN_PASSWORD } from "../helpers/constants.js";
import { assertSafeTestDatabaseUrl, disconnectTestPrisma } from "../helpers/db.js";
import { loadTestEnv } from "../helpers/loadTestEnv.js";
import { resetExternalMocks } from "./externalMocks.js";

loadTestEnv();

const testUrl = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);

process.env.DATABASE_URL = testUrl;

process.env.VERCEL = "1";
process.env.NODE_ENV = "test";

const NEUTRALISED_PROVIDER_VARS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "QSTASH_TOKEN",
  "QSTASH_URL",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "TELNYX_API_KEY",
  "TELNYX_PHONE_NUMBER",
  "KAPSO_API_KEY",
  "KAPSO_PHONE_NUMBER_ID",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "EMAIL_PASSWORD",
  "GOOGLE_MAPS_API_KEY",
];
for (const key of NEUTRALISED_PROVIDER_VARS) {
  process.env[key] = "";
}

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "integration-test-jwt-secret";
process.env.CRON_SECRET = process.env.CRON_SECRET ?? "integration-test-cron-secret";
process.env.ADMIN_USERNAME = "test-admin";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_ADMIN_PASSWORD, 10);
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:8080";
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:8080";

beforeEach(() => {
  resetExternalMocks();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

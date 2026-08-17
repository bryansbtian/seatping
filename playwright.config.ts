import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./tests/helpers/loadTestEnv.js";
import { assertSafeTestDatabaseUrl } from "./tests/helpers/db.js";

loadTestEnv();

const testDatabaseUrl = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);

const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 8081);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`;

const EXTERNAL_PROVIDER_STUBS = {
  EMAIL_HOST: "127.0.0.1",
  EMAIL_USER: "e2e@test.invalid",
  EMAIL_PASSWORD: "e2e-no-delivery",
  TELNYX_API_KEY: "",
  TELNYX_PHONE_NUMBER: "",
  KAPSO_API_KEY: "",
  KAPSO_PHONE_NUMBER_ID: "",
  KAPSO_WABA_ID: "",
  QSTASH_TOKEN: "",
  QSTASH_URL: "",
  QSTASH_CURRENT_SIGNING_KEY: "",
  QSTASH_NEXT_SIGNING_KEY: "",
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  VITE_GOOGLE_MAPS_API_KEY: "",
};

let retries = 0;
if (process.env.CI) {
  retries = 1;
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries,
  reporter: reporters(),
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: managedServers(),
});

function reporters(): any {
  if (process.env.CI) {
    return [["list"], ["html", { open: "never" }]];
  }
  return [["list"]];
}

function managedServers() {
  if (process.env.E2E_BASE_URL) {
    return undefined;
  }
  return [
    {
      command: "npm run dev:server",
      port: API_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...EXTERNAL_PROVIDER_STUBS,
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: "test",
        PORT: String(API_PORT),
        JWT_SECRET: process.env.JWT_SECRET ?? "e2e-test-jwt-secret",
        JWT_EXPIRES_IN: "1d",
        CRON_SECRET: process.env.CRON_SECRET ?? "e2e-test-cron-secret",
        CLIENT_ORIGIN: baseURL,
        FRONTEND_URL: baseURL,
        PUBLIC_BASE_URL: baseURL,
      },
    },
    {
      command: `npm run dev:vite -- --port ${FRONTEND_PORT} --strictPort`,
      port: FRONTEND_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...EXTERNAL_PROVIDER_STUBS,
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
      },
    },
  ];
}

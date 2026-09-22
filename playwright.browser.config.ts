import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "browser-background.spec.ts",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8082",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev:vite -- --host 127.0.0.1 --port 8082 --strictPort",
    url: "http://127.0.0.1:8082",
    reuseExistingServer: !process.env.CI,
  },
});

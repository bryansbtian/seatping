import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  outputDir: "performance-artifacts/browser-e2e",
  testDir: "./e2e",
  testMatch: [
    "adminPortal.browser.spec.ts",
    "adminBlog.browser.spec.ts",
    "publicBlog.browser.spec.ts",
    "customerHeader.browser.spec.ts",
    "featuredRestaurantsAdmin.browser.spec.ts",
    "designAudit.browser.spec.ts",
    "footer.browser.spec.ts",
    "businessLanding.browser.spec.ts",
    "businessLoadingFill.browser.spec.ts",
    "demoBooking.browser.spec.ts",
    "browser-background.spec.ts",
    "restaurantDiscovery.browser.spec.ts",
    "performanceRoadmap.browser.spec.ts",
  ],
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
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8082 --strictPort",
    url: "http://127.0.0.1:8082",
    reuseExistingServer: !process.env.CI,
  },
});

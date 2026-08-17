import { test as base, expect, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { getTestPrisma, disconnectTestPrisma } from "../../tests/helpers/db.js";
import { TestData } from "../helpers/db.js";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLocalRequest(url: string): boolean {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return true;
  }
  try {
    return LOCAL_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function blockExternalTraffic(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    if (isLocalRequest(route.request().url())) {
      return route.continue();
    }
    return route.abort();
  });
}

function simulatedClientIp(): string {
  const octet = () => {
    return Math.floor(Math.random() * 254) + 1;
  };
  return `10.${octet()}.${octet()}.${octet()}`;
}

type SeatPingFixtures = {
  db: TestData;
  extraPage: Page;
};

type SeatPingWorkerFixtures = {
  prisma: PrismaClient;
};

export const test = base.extend<SeatPingFixtures, SeatPingWorkerFixtures>({
  prisma: [
    async ({}, use) => {
      const client = getTestPrisma();
      await use(client);
      await disconnectTestPrisma();
    },
    { scope: "worker" },
  ],

  contextOptions: async ({ contextOptions }, use) => {
    await use({
      ...contextOptions,
      extraHTTPHeaders: {
        ...contextOptions.extraHTTPHeaders,
        "x-forwarded-for": simulatedClientIp(),
      },
    });
  },

  page: async ({ page }, use) => {
    await blockExternalTraffic(page);
    await use(page);
  },

  extraPage: async ({ browser, contextOptions }, use) => {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await blockExternalTraffic(page);
    await use(page);
    await context.close();
  },

  db: async ({ prisma }, use) => {
    const data = new TestData(prisma);
    await use(data);
    await data.cleanup();
  },
});

export { expect };

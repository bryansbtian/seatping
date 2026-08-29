import type { Page } from "@playwright/test";
import { test } from "./fixtures/seatping.js";
import { signInBusiness } from "./helpers/auth.js";

const PAGES = ["overview"];

async function h1Size(page: Page) {
  return page.evaluate(() => {
    const big = document.querySelector(".text-2xl, .text-xl, .md\\:text-2xl") as HTMLElement | null;
    const stat = document.querySelector(".text-3xl") as HTMLElement | null;
    let bigSize: string | null = null;
    if (big) {
      bigSize = getComputedStyle(big).fontSize;
    }
    let statSize: string | null = null;
    if (stat) {
      statSize = getComputedStyle(stat).fontSize;
    }
    return {
      big: bigSize,
      stat: statSize,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

test("global type scale", async ({ page, db }) => {
  const seed = await db.createBusinessWithLocation();
  await signInBusiness(page, seed.business);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/business/overview");
  await page.waitForTimeout(600);

  for (const p of PAGES) {
    await page.goto(`/business/${p}`);
    await page.waitForTimeout(350);
    console.log("EXPANDED", p, JSON.stringify(await h1Size(page)));
  }

  await page.goto("/business/overview");
  await page.getByRole("button", { name: /collapse sidebar/i }).click();
  await page.waitForTimeout(600);

  for (const p of PAGES) {
    await page.goto(`/business/${p}`);
    await page.waitForTimeout(350);
    console.log("COLLAPSED", p, JSON.stringify(await h1Size(page)));
  }
});

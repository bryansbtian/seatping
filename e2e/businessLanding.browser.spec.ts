import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/api/featured-restaurants", (route) => route.fulfill({ json: [] }));
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`business footer navigation opens the hero at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("No featured restaurants yet.")).toBeVisible();

    const footer = page.getByRole("contentinfo");
    const footerLink = footer.getByRole("link", { name: "SeatPing for Business", exact: true });
    await footer.getByRole("link", { name: "Terms of Service" }).scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await footerLink.click();

    const hero = page.getByRole("heading", {
      name: "Run Your Front of House From One Place",
    });
    await expect(page).toHaveURL(/\/business$/);
    await expect(hero).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const finalCta = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Turn Every Arrival Into Smooth Service" }),
    });
    await expect(finalCta).toHaveCSS("border-bottom-width", "0px");
    await expect(finalCta).toHaveCSS("padding-bottom", "0px");
    let expectedGap = 48;
    if (viewport.width >= 1024) {
      expectedGap = 72;
    } else if (viewport.width >= 768) {
      expectedGap = 64;
    }
    await footer.getByRole("link", { name: "Terms of Service" }).scrollIntoViewIfNeeded();
    await expect(footer).toHaveCSS("padding-top", `${expectedGap}px`);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await footerLink.click();

    await expect(hero).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
}

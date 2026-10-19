import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`customer login preserves header height at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let resolveInitialSession = () => {};
    const initialSession = new Promise<void>((resolve) => {
      resolveInitialSession = resolve;
    });
    let loggedIn = false;
    let firstSession = true;
    const customerName = "Alexandra Very Long Customer Name To Exercise Truncation";
    await page.route("**/auth/session", async (route) => {
      if (firstSession) {
        firstSession = false;
        await initialSession;
      }
      if (loggedIn) {
        await route.fulfill({
          json: { customer: { name: customerName }, customerId: "header-customer", business: null },
        });
        return;
      }
      await route.fulfill({ json: { customer: null, customerId: null, business: null } });
    });
    await page.route("**/auth/login", async (route) => {
      loggedIn = true;
      await route.fulfill({ json: { user: { name: customerName } } });
    });
    await page.route("**/api/featured-restaurants", (route) =>
      route.fulfill({ json: { featured: [] } }),
    );
    try {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      const header = page.getByRole("banner");
      await expect(header).toBeVisible();
      let expectedHeight = "61px";
      if (width >= 640) {
        expectedHeight = "65px";
      }
      await expect(header).toHaveCSS("height", expectedHeight);
      const loadingHeight = await header.evaluate((element) => getComputedStyle(element).height);
      const sessionResponse = page.waitForResponse("**/auth/session");
      resolveInitialSession();
      await sessionResponse;
      await expect(header).toHaveCSS("height", loadingHeight);
      await page.getByLabel("Email or Username", { exact: true }).fill("header-fixture");
      await page.getByLabel("Password", { exact: true }).fill("header-test-password");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(page).toHaveURL("/");
      await expect(
        page.getByRole("heading", { name: "Discover Restaurants and Join the Wait Effortlessly" }),
      ).toBeVisible();
      const profile = page.getByRole("button", { name: "Open profile menu" });
      await expect(profile).toBeVisible();
      await expect(profile).toHaveText("A");
      await expect(profile).toHaveCSS("width", "36px");
      await expect(profile).toHaveCSS("height", "36px");
      await expect(header).toHaveCSS("height", loadingHeight);
      await header.screenshot({
        path: testInfo.outputPath(`customer-header-${width}.png`),
        animations: "disabled",
      });
      const authenticatedBounds = await header.boundingBox();
      const profileBounds = await profile.boundingBox();
      expect(authenticatedBounds).not.toBeNull();
      expect(profileBounds).not.toBeNull();
      expect(profileBounds!.x + profileBounds!.width).toBeLessThanOrEqual(
        authenticatedBounds!.x + authenticatedBounds!.width,
      );
      expect(profileBounds!.y).toBeGreaterThanOrEqual(authenticatedBounds!.y);
      expect(profileBounds!.y + profileBounds!.height).toBeLessThanOrEqual(
        authenticatedBounds!.y + authenticatedBounds!.height,
      );
      await profile.click();
      await expect(page.getByRole("menu")).toBeVisible();
      await expect(page.getByText(`Signed in as ${customerName}`)).toBeVisible();
      await expect(header).toHaveCSS("height", loadingHeight);
    } finally {
      resolveInitialSession();
    }
  });
}

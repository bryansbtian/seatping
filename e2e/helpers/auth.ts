import { expect, type Page } from "@playwright/test";
import type { Business, User } from "@prisma/client";
import { E2E_PASSWORD } from "./db.js";

export async function signInBusiness(page: Page, business: Pick<Business, "email">): Promise<void> {
  const response = await page.request.post("/auth/business/login", {
    data: { emailOrUsername: business.email, password: E2E_PASSWORD },
  });
  expect(response.status()).toBe(200);
}

export async function signInCustomer(page: Page, user: Pick<User, "email">): Promise<void> {
  const response = await page.request.post("/auth/login", {
    data: { emailOrUsername: user.email, password: E2E_PASSWORD },
  });
  expect(response.status()).toBe(200);
}

export async function signInBusinessThroughForm(
  page: Page,
  business: Pick<Business, "email">,
): Promise<void> {
  await page.goto("/business/login");
  await page.getByLabel("Email or Username").fill(business.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
}

export async function signInCustomerThroughForm(
  page: Page,
  user: Pick<User, "email">,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email or Username").fill(user.email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
}

export function queueManagementHeading(page: Page) {
  return page.getByRole("heading", { name: "Queue Management" }).filter({ visible: true });
}

export async function openBusinessDashboard(
  page: Page,
  business: Pick<Business, "email">,
): Promise<void> {
  await signInBusiness(page, business);
  await page.goto("/business/dashboard");
  await expect(queueManagementHeading(page)).toBeVisible();
}

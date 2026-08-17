import { expect, type Locator, type Page } from "@playwright/test";
import { uniqueId } from "./db.js";

export type QueueGuest = {
  firstName: string;
  lastName: string;
  email: string;
  guestCount: number;
};

export function buildGuest(firstName = "Playwright"): QueueGuest {
  const id = uniqueId();
  return {
    firstName,
    lastName: `Guest${id}`,
    email: `e2e-guest-${id}@test.invalid`,
    guestCount: 2,
  };
}

export function fullNameOf(guest: QueueGuest): string {
  return `${guest.firstName} ${guest.lastName}`;
}

export async function openQueuePage(
  page: Page,
  businessUsername: string,
  locationId: string,
): Promise<void> {
  await page.goto(`/queue/${businessUsername}/${locationId}`);
}

export async function fillQueueForm(
  page: Page,
  guest: QueueGuest,
): Promise<void> {
  await expect(page.getByLabel("First Name")).toBeVisible();
  await page.getByLabel("First Name").fill(guest.firstName);
  await page.getByLabel("Last Name").fill(guest.lastName);
  await page.getByLabel("Number of Guests").fill(String(guest.guestCount));
  await page.getByText("Email", { exact: true }).click();
  await page.getByLabel("Email Address").fill(guest.email);
}

export async function joinQueueThroughUi(
  page: Page,
  businessUsername: string,
  locationId: string,
  guest: QueueGuest,
): Promise<void> {
  await openQueuePage(page, businessUsername, locationId);
  await fillQueueForm(page, guest);
  await page.getByRole("button", { name: "Join Queue" }).click();
  await expect(page.getByText("Queue Status")).toBeVisible();
}

export function dashboardCard(page: Page, title: string): Locator {
  return page
    .getByRole("heading", { name: title })
    .filter({ visible: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
}

export function waitingCardFor(page: Page, guest: QueueGuest): Locator {
  return dashboardCard(page, "Queue Management")
    .getByRole("heading", { name: fullNameOf(guest) })
    .locator("xpath=ancestor::div[contains(@class,'bg-gray-50')][1]");
}

import { signJwt } from "../../server/lib/auth.js";

export const COOKIE_NAMES = {
  customer: "sp_auth_customer",
  business: "sp_auth_business",
  admin: "sp_auth_admin",
} as const;

export type TestAccountType = keyof typeof COOKIE_NAMES;

export function sessionCookie(
  accountType: TestAccountType,
  subject: string,
  name = "Test Account",
): string {
  const token = signJwt({ sub: subject, accountType, name });
  return `${COOKIE_NAMES[accountType]}=${token}`;
}

export function businessCookie(businessId: string, name?: string): string {
  return sessionCookie("business", businessId, name);
}

export function customerCookie(customerId: string, name?: string): string {
  return sessionCookie("customer", customerId, name);
}

export function adminCookie(username = "test-admin"): string {
  return sessionCookie("admin", username, username);
}
